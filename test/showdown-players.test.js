// Showdown ladder history + replay records (v1.9.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReplay, aggregateReplays, toUserId } from '../public/js/lib/replays.js';
import { updateLadderHistory, TRACK_TOP, SHOW_TOP } from '../scripts/lib/showdown-ladder.js';
import { keepWindow } from '../scripts/showdown-players.js';

const LOG = [
  '|player|p1|Alice A|1|1500', '|player|p2|bob|2|1480', '|gametype|doubles', '|rated|',
  '|poke|p1|Charizard, M|', '|poke|p1|Incineroar, M|', '|poke|p1|Urshifu-*, M|', '|poke|p1|Amoonguss|',
  '|poke|p2|Tapu Fini|', '|poke|p2|Rillaboom, M|', '|poke|p2|Kingdra|', '|poke|p2|Pelipper|',
  '|teampreview', '|start',
  '|switch|p1a: Zard|Charizard, M|100/100', '|switch|p1b: Cat|Incineroar, M|100/100',
  '|switch|p2a: Fini|Tapu Fini|100/100', '|switch|p2b: Rilla|Rillaboom, M|100/100',
  '|turn|1', '|detailschange|p1a: Zard|Charizard-Mega-Y, M', '|-mega|p1a: Zard|Charizard|Charizardite Y',
  '|switch|p1b: Fish|Urshifu-Rapid-Strike, M|100/100', '|-terastallize|p2b: Rilla|Fire',
  '|turn|2', '|win|Alice A',
].join('\n');

test('parseReplay: team preview, Pokémon sent out (hidden forms matched), leads, Mega, Tera, winner', () => {
  const r = parseReplay({ id: 'gen9nationaldexdoubles-1', formatid: 'gen9nationaldexdoubles', uploadtime: 1795573386, rating: 1500, log: LOG });
  assert.equal(r.date, '2026-11-25');
  assert.deepEqual(r.p[0].six, ['Charizard', 'Incineroar', 'Urshifu', 'Amoonguss']);
  assert.deepEqual(r.p[0].brought, ['Charizard', 'Incineroar', 'Urshifu']);
  assert.deepEqual(r.p[0].lead, ['Charizard', 'Incineroar']);
  assert.deepEqual(r.p[0].mega, { species: 'Charizard', form: 'Charizard-Mega-Y' });
  assert.deepEqual(r.p[1].tera, { species: 'Rillaboom', type: 'Fire' });
  assert.equal(r.p[0].u, 'alicea');
  assert.equal(r.w, 0);
  assert.equal(parseReplay({ id: 'x', log: '|player|p1|a\n|win|a' }), null, 'no team preview: no record');
  assert.equal(toUserId('Alice A!'), 'alicea');
});

test('aggregateReplays: per-Pokémon games, wins with Wilson CI, used-in-battle and lead rates, lead pairs, side filter', () => {
  const r = parseReplay({ id: '1', formatid: 'gen9nationaldexdoubles', uploadtime: 1795573386, rating: 1500, log: LOG });
  const a = aggregateReplays([r, { ...r, id: '2', w: 1 }]);
  const zard = a.mons.find((m) => m.key === 'Charizard');
  assert.deepEqual([zard.games, zard.wins, zard.losses, zard.brought, zard.led, zard.mega], [2, 1, 1, 2, 2, 2]);
  assert.equal(zard.winPct, 0.5);
  assert.ok(zard.ci[0] < 0.5 && zard.ci[1] > 0.5);
  assert.equal(a.mons.find((m) => m.key === 'Amoonguss').broughtPct, 0);
  assert.deepEqual(a.leads.find((l) => l.pair === 'Charizard + Incineroar'), { pair: 'Charizard + Incineroar', games: 2, wins: 1, winPct: 0.5 });
  const alice = aggregateReplays([r], { side: (g, i) => g.p[i].u === 'alicea' });
  assert.equal(alice.sides, 1);
  assert.ok(!alice.mons.some((m) => m.key === 'Tapu Fini'));
});

test('ladder history: peaks and best rank since tracking began, same-day snapshot replaced, top 100 shown', () => {
  const top = (elos) => elos.map((elo, i) => ({ userid: `u${i}`, username: `U${i}`, elo, gxe: 80.04, w: 10, l: 5 }));
  let f = updateLadderHistory(null, { reg: 'NDD', format: 'gen9nationaldexdoubles', toplist: top([1900, 1800]), date: '2026-11-25' });
  f = updateLadderHistory(f, { reg: 'NDD', format: 'gen9nationaldexdoubles', toplist: top([1850, 1820]).reverse(), date: '2026-11-26' });
  // u1 now first with 1820: best rank 1 on 11-26, peak elo 1820; u0 peak stays 1900 (11-25), best rank 1 (11-25)
  assert.deepEqual([f.players.u1.peakElo, f.players.u1.bestRank, f.players.u1.bestRankDate], [1820, 1, '2026-11-26']);
  assert.deepEqual([f.players.u0.peakElo, f.players.u0.peakEloDate, f.players.u0.bestRank], [1900, '2026-11-25', 1]);
  assert.deepEqual(f.tracking, { since: '2026-11-25', last: '2026-11-26', snapshots: 2, dates: ['2026-11-25', '2026-11-26'], top: TRACK_TOP });
  const again = updateLadderHistory(f, { reg: 'NDD', format: 'gen9nationaldexdoubles', toplist: top([1860, 1820]).reverse(), date: '2026-11-26' });
  assert.equal(again.players.u0.h.length, 2, 'same day replaced, not appended');
  assert.equal(again.players.u0.h.at(-1)[2], 1860);
  assert.equal(f.top.length, 2);
  assert.ok(SHOW_TOP <= TRACK_TOP);
});

test('keepWindow: last N days, newest first, de-duplicated, capped', () => {
  const g = (id, date) => ({ id, date });
  const kept = keepWindow([g('a', '2026-10-01'), g('b', '2026-11-20'), g('c', '2026-11-24'), g('b', '2026-11-20')], '2026-11-25', 30, 10);
  assert.deepEqual(kept.map((x) => x.id), ['c', 'b']);
  assert.equal(keepWindow([g('x', '2026-11-25'), g('y', '2026-11-25')], '2026-11-25', 30, 1).length, 1);
});

test('manual ladder observations: count towards peaks with their source, never become snapshots, lose the flag when beaten', () => {
  const top = (elos) => elos.map((elo, i) => ({ userid: `u${i}`, username: `U${i}`, elo, gxe: 80, w: 1, l: 1 }));
  const manual = [{ userid: 'u1', name: 'U1', date: '2026-11-13', rank: 7, elo: 1724, source: 'screenshot' }];
  let f = updateLadderHistory(null, { reg: 'NDD', format: 'f', toplist: top([1900, 1700]), date: '2026-11-25', manual });
  assert.deepEqual([f.players.u1.peakElo, f.players.u1.peakEloDate, f.players.u1.bestRank, f.players.u1.bestRankDate], [1724, '2026-11-13', 2, '2026-11-25']);
  assert.equal(f.players.u1.peakEloManual, true);
  assert.equal(f.players.u1.bestRankManual, undefined, 'rank 2 today beats the manual rank 7');
  assert.deepEqual(f.players.u1.manual, [{ date: '2026-11-13', rank: 7, elo: 1724, source: 'screenshot' }]);
  assert.equal(f.players.u1.first, '2026-11-13');
  assert.deepEqual(f.tracking.dates, ['2026-11-25'], 'manual dates are not snapshots');
  assert.equal(f.top[1].peakEloManual, true);
  f = updateLadderHistory(f, { reg: 'NDD', format: 'f', toplist: top([1900, 1750]), date: '2026-11-26', manual });
  assert.equal(f.players.u1.peakElo, 1750);
  assert.equal(f.players.u1.peakEloManual, undefined);
  // a player only seen by hand (not in today's top list) still has a record
  const g = updateLadderHistory(null, { reg: 'NDD', format: 'f', toplist: top([1900]), date: '2026-11-25', manual: [{ ...manual[0], userid: 'zz', name: 'ZZ' }] });
  assert.equal(g.players.zz.bestRank, 7);
});

test('replayPage: 50 per page, the 51st row means more (before = the 50th uploadtime)', async () => {
  const { replayPage } = await import('../public/js/lib/replays.js');
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, uploadtime: 1000 - i }));
  const full = replayPage(rows(51));
  assert.equal(full.rows.length, 50);
  assert.equal(full.before, 951);
  assert.equal(replayPage(rows(50)).before, null);
  assert.deepEqual(replayPage(null), { rows: [], before: null });
});
