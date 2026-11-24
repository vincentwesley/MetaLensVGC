// Research-grade data (v1.7.0, Vin's Atelier): player ids, match context, coverage, rosters, quality.
// Fixtures mirror the real response shapes of play.limitlesstcg.com/api and standings.limitlessvgc.com
// (checked 2026-11-24); player names are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pidOf, idSalt, nsOf, ltKey, lvKey, lvxKey, ID_NS } from '../scripts/lib/ids.js';
import { limitlessMatches, eventPhases, coverageOf } from '../scripts/sources/limitless.js';
import { officialMatches, rosterOf, playerKey } from '../scripts/sources/official.js';
import { assembleTeamsFile, decodeExistingTeamsFile, buildRostersFile } from '../scripts/lib/teams-file.js';
import { newNormStats, countNormalization, qualityFile } from '../scripts/lib/quality.js';
import { decode } from '../public/js/lib/aggregate.js';

const SALT = 'test-salt-0123456789abcdef';

test('pid: salted, deterministic, 16 hex; namespaces; salt rules', () => {
  const a = pidOf(ltKey('Alice'), SALT);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, pidOf('lt:alice', SALT)); // usernames are case-insensitive
  assert.notEqual(a, pidOf(ltKey('alice'), SALT + 'x')); // another salt, another id
  assert.notEqual(pidOf(lvKey(730), SALT), pidOf(ltKey('730'), SALT)); // namespaces never collide
  assert.equal(nsOf(ltKey('x')), ID_NS.lt);
  assert.equal(nsOf(lvKey(1)), ID_NS.lv);
  assert.equal(nsOf(lvxKey('lvgc:1', 3)), ID_NS.lvx);
  assert.equal(idSalt({}), null);
  assert.throws(() => idSalt({ METALENS_ID_SALT: 'short' }));
  assert.equal(idSalt({ METALENS_ID_SALT: SALT }), SALT);
});

// play.limitlesstcg.com/api/tournaments/<id>/details -> phases, /pairings
const PHASES = [{ phase: 1, type: 'SWISS', rounds: 7, mode: 'BO3' }, { phase: 2, type: 'SINGLE_BRACKET', rounds: 1, mode: 'BO3' }];
const PAIRINGS = [
  { round: 1, phase: 1, table: null, winner: -1, games: {}, player1: 'Byeguy' }, // bye
  { round: 1, phase: 1, table: 1, winner: 'alice', games: {}, player1: 'alice', player2: 'bob' },
  { round: 2, phase: 1, table: 1, winner: 0, games: {}, player1: 'alice', player2: 'carol' }, // tie
  { round: 3, phase: 1, table: 1, winner: -1, games: {}, player1: 'bob', player2: 'carol' }, // double loss / unreported
  { phase: 2, round: 8, winner: 'carol', games: { 1: { winner: 'alice' }, 2: { winner: 'carol' }, 3: { winner: 'carol' } }, match: 'T2-1', player1: 'alice', player2: 'carol' },
];

test('limitlessMatches: round, phase, best-of, result codes, games, byes', () => {
  const { matches, pairingStats, cut } = limitlessMatches(PAIRINGS, PHASES);
  assert.deepEqual(matches, [
    ['lt:alice', 'lt:bob', 1, 1, 1, 3],
    ['lt:alice', 'lt:carol', 0, 2, 1, 3],
    ['lt:bob', 'lt:carol', 3, 3, 1, 3],
    ['lt:alice', 'lt:carol', 2, 8, 2, 3, [1, 2]],
  ]);
  assert.deepEqual(pairingStats, { total: 5, byes: 1, decisive: 2, ties: 1, noResult: 1 });
  assert.equal(cut, 2);
  assert.deepEqual(eventPhases(PHASES), [{ phase: 1, type: 'SWISS', rounds: 7, bo: 3 }, { phase: 2, type: 'SINGLE_BRACKET', rounds: 1, bo: 3 }]);
  assert.equal(eventPhases([{ phase: 1, type: 'SWISS', rounds: 5 }])[0].bo, 0); // mode not published
});

test('coverageOf: complete vs published subset', () => {
  assert.deepEqual(coverageOf(77, 77), { players: 77, lists: 77, rate: 1, kind: 'complete' });
  assert.deepEqual(coverageOf(1081, 155), { players: 1081, lists: 155, rate: 0.143, kind: 'published-subset' });
});

// standings.limitlessvgc.com: vgc/standings players and vgc/pairings per round
const PLAYERS = [
  { player_id: 6001, tp_id: 55, name: 'A One', country: 'JP', placement: 1, wins: 6, losses: 0, topcut: 1, day2: 1, drop_round: null, team: 'swampert,archaludon,politoed,incineroar,rillaboom,gengar' },
  { player_id: 3693, tp_id: 616, name: 'B Two', country: 'US', placement: 2, wins: 5, losses: 1, topcut: 1, day2: 1, drop_round: null, team: 'garchomp,delphox,venusaur,kingambit,farigiraf,torkoal' },
  { player_id: 12720, tp_id: 649, name: 'C Three', country: 'BR', placement: 3, wins: 1, losses: 3, topcut: 0, day2: 0, drop_round: 2, team: 'rillaboom,sneasler,incineroar,salamence,gholdengo,floette-eternal' },
];
const ROUNDS = [
  { round: 1, pairings: [{ player1: 55, player2: 649, winner: 55 }, { player1: 616, player2: null, winner: 616 }] },
  { round: 2, pairings: [{ player1: 616, player2: 649, winner: null }] },
  { round: 3, pairings: [{ player1: 55, player2: 616, winner: 616 }] }, // only top-cut players: phase 2
];

test('officialMatches: stable player_id keys, round, phase from top cut, byes, no-result, bo unknown', () => {
  const { matches, pairingStats } = officialMatches(ROUNDS, PLAYERS, 'lvgc:450');
  assert.deepEqual(matches, [
    ['lv:6001', 'lv:12720', 1, 1, 1, 0],
    ['lv:3693', 'lv:12720', 3, 2, 1, 0],
    ['lv:6001', 'lv:3693', 2, 3, 2, 0],
  ]);
  assert.deepEqual(pairingStats, { total: 4, byes: 1, decisive: 2, ties: 0, noResult: 1 });
  assert.equal(playerKey({ tp_id: 9, placement: 40 }, 'lvgc:450'), 'lvx:lvgc:450:40');
});

test('rosterOf: every standings player with a species-only team', () => {
  const r = rosterOf(PLAYERS, 'lvgc:450');
  assert.equal(r.length, 3);
  assert.deepEqual(r[2], { player: 'lv:12720', placing: 3, wins: 1, losses: 3, dropRound: 2, topcut: false, day2: false,
    species: ['Rillaboom', 'Sneasler', 'Incineroar', 'Salamence', 'Gholdengo', 'Floette-Eternal'] });
});

const mon = (species, item = null) => ({ species, item, ability: null, moves: ['Protect'], nature: null, sp: null });
const rawEvent = () => ({
  id: 'lt:abc', key: 'limitless:abc', name: 'Cup', date: '2026-10-01', tier: 'online', source: 'limitless', url: 'u',
  players: 4, cut: 2, rounds: 3, fetched: '2026-11-24', coverage: coverageOf(4, 4), phases: eventPhases(PHASES),
  drops: { noDecklist: 0, emptyTeam: 0, overSix: 0 },
  rows: [
    { player: 'lt:alice', name: 'Sam', country: 'US', placing: 1, wins: 3, losses: 0, ties: 0, mons: [mon('Rillaboom')] },
    { player: 'lt:bob', name: 'Sam', country: 'GB', placing: 2, wins: 2, losses: 1, ties: 0, mons: [mon('Sneasler')] }, // same display name
    { player: 'lt:alice', name: 'Sam', country: 'US', placing: 1, wins: 3, losses: 0, ties: 0, mons: [mon('Kingambit')] }, // duplicate key
    { player: 'lt:carol', name: 'Cee', country: 'FR', placing: 3, wins: 1, losses: 2, ties: 0, mons: [mon('Garchomp')] },
  ],
  matches: [...limitlessMatches(PAIRINGS, PHASES).matches, ['lt:alice', 'lt:nolist', 1, 4, 1, 3]],
  pairingStats: limitlessMatches(PAIRINGS, PHASES).pairingStats,
});

test('assembleTeamsFile: dedupes by source key (same display name kept twice), pids, match context, unlinked count', () => {
  const quality = {};
  const f = assembleTeamsFile('M-C', [rawEvent()], { salt: SALT, quality });
  assert.equal(f.teams.length, 3); // both "Sam"s kept, alice's duplicate dropped
  assert.deepEqual(f.teams.map((t) => t[1]), ['Sam', 'Sam', 'Cee']);
  assert.deepEqual(f.teams.map((t) => t[8]), [pidOf('lt:alice', SALT), pidOf('lt:bob', SALT), pidOf('lt:carol', SALT)]);
  assert.deepEqual(f.teams.map((t) => t[9]), [1, 1, 1]);
  assert.equal(f.idVersion, 1);
  assert.deepEqual(f.matches, [[0, 1, 1, 1, 1, 3], [0, 2, 0, 2, 1, 3], [1, 2, 3, 3, 1, 3], [0, 2, 2, 8, 2, 3, [1, 2]]]);
  assert.deepEqual(quality['lt:abc'].rows, { noDecklist: 0, emptyTeam: 0, overSix: 0, duplicates: 1, kept: 3 });
  assert.equal(quality['lt:abc'].pairings.noTeamRow, 1);
  assert.equal(quality['lt:abc'].pairings.linked, 4);
  assert.deepEqual(f.events[0].coverage, coverageOf(4, 4));
  assert.equal(f.events[0].fetched, '2026-11-24');
  // without a salt: no pid, idVersion 0
  const g = assembleTeamsFile('M-C', [rawEvent()]);
  assert.deepEqual(g.teams.map((t) => t[8]), [null, null, null]);
  assert.equal(g.idVersion, 0);
});

test('decodeExistingTeamsFile -> assembleTeamsFile round trip keeps pids, match context and same-name rows apart', () => {
  const f = JSON.parse(JSON.stringify(assembleTeamsFile('M-C', [rawEvent()], { salt: SALT })));
  const again = assembleTeamsFile('M-C', decodeExistingTeamsFile(f), { salt: 'another-salt-0123456789' });
  assert.deepEqual(again.teams, f.teams); // reused rows keep their pid even with another salt
  assert.deepEqual(again.matches, f.matches);
  assert.deepEqual(again.events, f.events);
});

test('decode: match context fields; same-name players get distinct team ids', () => {
  const f = JSON.parse(JSON.stringify(assembleTeamsFile('M-C', [rawEvent()], { salt: SALT })));
  const dex = { species: {}, items: {}, moves: {} };
  const { teams, matches } = decode(f, dex);
  assert.deepEqual(teams.map((t) => t.id), ['lt:abc:sam', 'lt:abc:sam~2', 'lt:abc:cee']);
  assert.equal(teams[1].pid, pidOf('lt:bob', SALT));
  assert.deepEqual(matches[3], { a: 0, b: 2, result: 2, round: 8, phase: 2, bo: 3, games: [1, 2] });
  assert.deepEqual(decode({ ...f, matches: [[0, 1, 1]] }, dex).matches[0], { a: 0, b: 1, result: 1, round: 0, phase: 0, bo: 0, games: null }); // pre-v1.7 rows
});

test('buildRostersFile: all standings players, links to full team rows, every pairing', () => {
  const ev = {
    id: 'lvgc:450', key: 'lvgc:450', name: 'Regional', date: '2026-10-01', tier: 'regional', source: 'limitlessvgc', url: 'u',
    players: 3, cut: 2, rounds: 3, coverage: coverageOf(3, 1), drops: { noDecklist: 0, emptyTeam: 0, overSix: 0 },
    rows: [{ player: 'lv:6001', name: 'A One', country: 'JP', placing: 1, wins: 6, losses: 0, ties: 0, mons: [mon('Swampert', 'Swampertite')] }],
    roster: rosterOf(PLAYERS, 'lvgc:450'),
    ...(({ matches, pairingStats }) => ({ matches, pairingStats }))(officialMatches(ROUNDS, PLAYERS, 'lvgc:450')),
  };
  const teams = assembleTeamsFile('M-C', [ev], { salt: SALT });
  assert.equal(teams.matches.length, 0); // only one full list: no linked team-vs-team match
  const r = buildRostersFile('M-C', [ev], teams, { salt: SALT });
  assert.equal(r.events.length, 1);
  const [e] = r.events;
  assert.equal(e.players.length, 3);
  assert.equal(e.players[0][0], pidOf('lv:6001', SALT));
  assert.equal(e.players[0][9], 0); // A One's full list is team row 0
  assert.equal(e.players[2][9], -1);
  assert.deepEqual(e.players[2][8].map((i) => r.strings[i]), ['Rillaboom', 'Sneasler', 'Incineroar', 'Salamence', 'Gholdengo', 'Floette-Eternal']);
  assert.deepEqual(e.matches, [[0, 2, 1, 1, 1], [1, 2, 3, 2, 1], [0, 1, 2, 3, 2]]);
});

test('countNormalization and qualityFile totals add up to the teams file', () => {
  const dex = { species: { Rillaboom: {} }, items: { 'Focus Sash': {} }, moves: { Protect: {} } };
  const s = newNormStats();
  countNormalization(s, { species: 'Rillaboom', item: 'focus sash', ability: 'Grassy Surge', moves: ['Protect', 'Fakemove'] },
    { species: 'Rillaboom', item: 'Focus Sash', ability: 'Grassy Surge', moves: ['Protect', 'Fakemove'] }, dex);
  assert.equal(s.species.exact, 1);
  assert.equal(s.item.corrected, 1);
  assert.equal(s.move.exact, 1);
  assert.equal(s.move.unknown, 1);
  assert.deepEqual(s.move.unknownNames, ['Fakemove']);
  const quality = {};
  const f = assembleTeamsFile('M-C', [rawEvent()], { salt: SALT, quality });
  const q = qualityFile('M-C', f, quality);
  assert.equal(q.totals.file.teams, f.teams.length);
  assert.equal(q.totals.file.matches.linked, f.matches.length);
  assert.deepEqual(q.events['lt:abc'].file.matches, { linked: 4, decisive: 2, ties: 1, noResult: 1, withRound: 4 });
  assert.equal(q.totals.events, 1);
  assert.deepEqual(q.totals.eventsByCoverage, { complete: 1 });
});
