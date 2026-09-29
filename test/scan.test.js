import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, verdict, teamArchetype, sharedCounts, similarTeams, similarGames, speciesMatchups,
  archetypeMatchups, itemSuggestions, sharedWeaknesses, teammatePicks, weakestLink, scanTeam,
} from '../public/js/lib/scan.js';

const dex = {
  species: {
    A: { types: ['Fire'], bs: [1, 1, 1, 1, 1, 100] }, B: { types: ['Water'], bs: [1, 1, 1, 1, 1, 50] },
    C: { types: ['Grass'], bs: [1, 1, 1, 1, 1, 50] }, D: { types: ['Rock'], bs: [1, 1, 1, 1, 1, 50] },
    E: { types: ['Normal'], bs: [1, 1, 1, 1, 1, 50] }, F: { types: ['Ground'], bs: [1, 1, 1, 1, 1, 50] },
    G: { types: ['Steel'], bs: [1, 1, 1, 1, 1, 50] }, H: { types: ['Water'], bs: [1, 1, 1, 1, 1, 50] },
    X: { types: ['Dragon'], bs: [1, 1, 1, 1, 1, 50] },
  },
  moves: {}, items: {},
};

function mon(k, item = null, moves = [], ability = null) {
  return { s: k, k, item, ability, moves, nature: null, sp: null, mega: false };
}
function team(i, keys, w, l, arch = 'other', items = {}) {
  return { i, mons: keys.map((k) => mon(k, items[k] || null)), keys, species: new Set(keys), w, l, arch: [arch] };
}

const mine = ['A', 'B', 'C', 'D', 'E', 'F'];

test('verdict: CI vs 50%', () => {
  assert.equal(verdict(0, 0).call, 'none');
  assert.equal(verdict(60, 20).call, 'good');
  assert.equal(verdict(20, 60).call, 'bad');
  assert.equal(verdict(6, 4).call, 'unclear');
  const v = verdict(30, 10);
  assert.equal(v.n, 40);
  assert.equal(v.winPct, 0.75);
});

test('teamArchetype builds a classify()-able team', () => {
  const mons = [mon('A', null, ['Tailwind']), mon('B')];
  const r = teamArchetype(mons, dex);
  assert.equal(r.id, 'tailwind');
  assert.equal(r.label, 'Tailwind');
  assert.equal(teamArchetype([mon('A'), mon('B')], dex).label, 'Other');
});

test('similarTeams: threshold 4, falls back to 3 under 30 teams', () => {
  const base = [];
  for (let i = 0; i < 5; i++) base.push(team(i, ['A', 'B', 'C', 'D', 'X', 'G'], 1, 1));
  for (let i = 5; i < 20; i++) base.push(team(i, ['A', 'B', 'C', 'G', 'H', 'X'], 1, 1));
  base.push(team(20, ['A', 'G', 'H', 'X', 'E', 'F'], 1, 1));
  const keys = new Set(mine);
  assert.deepEqual(Array.from(sharedCounts(base, keys).slice(0, 1)), [4]);
  const s = similarTeams(base, keys);
  assert.equal(s.threshold, 3);
  assert.equal(s.fellBack, true);
  assert.equal(s.teams.length, 21);
  for (let i = 30; i < 60; i++) base.push(team(i, ['A', 'B', 'C', 'D', 'H', 'X'], 1, 1));
  const s2 = similarTeams(base, keys);
  assert.equal(s2.threshold, 4);
  assert.equal(s2.fellBack, false);
  assert.equal(s2.teams.length, 35);
  assert.equal(sharedCounts(base, keys)[20], 3);
  assert.equal(similarTeams(base, new Set(['A', 'B'])), null);
});

// Similar teams 0..1 play 30 games each against opponents holding X (they lose) or H (they win).
function matchFixture() {
  const sim = [team(0, ['A', 'B', 'C', 'D', 'G', 'H'], 5, 5, 'tailwind'), team(1, ['A', 'B', 'C', 'D', 'X', 'E'], 5, 5, 'tailwind')];
  const opX = team(2, ['X', 'G', 'H', 'E', 'F', 'D'], 5, 5, 'sun');
  const opH = team(3, ['E', 'F', 'G', 'H', 'X', 'C'], 5, 5, 'rain');
  const base = [...sim, opX, opH];
  const matches = [];
  for (let n = 0; n < 24; n++) matches.push({ a: 0, b: 2, result: n < 6 ? 1 : 2 }); // 6-18 vs sun
  for (let n = 0; n < 30; n++) matches.push({ a: 3, b: 1, result: n < 6 ? 1 : 2 }); // sim team is b: 24-6 vs rain
  matches.push({ a: 0, b: 1, result: 1 }); // mirror: skipped
  matches.push({ a: 0, b: 3, result: 0 }); // unknown: skipped
  return { sim, base, matches };
}

test('similarGames: both orientations, mirror and unknown skipped', () => {
  const { sim, base, matches } = matchFixture();
  const g = similarGames(sim, base, matches);
  assert.equal(g.w + g.l, 54);
  assert.equal(g.w, 30);
  assert.deepEqual(g.byArch.get('sun'), { w: 6, l: 18 });
  assert.deepEqual(g.byArch.get('rain'), { w: 24, l: 6 });
  assert.deepEqual(g.bySpecies.get('H'), { w: 30, l: 24 }); // both opponents hold H
  assert.equal(g.bySpecies.has('A'), false);
});

test('speciesMatchups: min games, best/worst by CI, no overlap', () => {
  const { sim, base, matches } = matchFixture();
  const g = similarGames(sim, base, matches);
  const r = speciesMatchups(g, base, 1);
  const keys = r.rows.map((x) => x.key);
  assert.ok(keys.includes('X') && keys.includes('H'));
  assert.ok(r.best.every((b) => !r.worst.includes(b)));
  const x = r.rows.find((y) => y.key === 'X');
  assert.equal(x.n, 54);
  const short = speciesMatchups({ bySpecies: new Map([['X', { w: 5, l: 5 }]]) }, base, 1);
  assert.equal(short.rows.length, 0);
});

test('archetypeMatchups: similar games, fallback to matrix row, insufficient', () => {
  const { sim, base, matches } = matchFixture();
  const g = similarGames(sim, base, matches);
  // total games 54 < 100 -> falls back to the matrix (all teams' games, both orientations)
  const m = archetypeMatchups(g, base, matches, 'tailwind');
  assert.equal(m.source, 'matrix');
  const sun = m.rows.find((r) => r.id === 'sun');
  assert.equal(sun.l, 18);
  assert.equal(sun.call, 'bad');
  const big = { w: 100, l: 60, bySpecies: new Map(), byArch: new Map([['sun', { w: 20, l: 30 }], ['rain', { w: 5, l: 5 }]]) };
  const s = archetypeMatchups(big, base, matches, 'tailwind');
  assert.equal(s.source, 'similar');
  assert.deepEqual(s.rows.map((r) => r.id), ['sun']); // rain has < 20 games
  const none = archetypeMatchups(null, base, [], 'tailwind');
  assert.equal(none.source, null);
});

test('itemSuggestions: top-3 check, item clause, blocked items, win rate gating', () => {
  const base = [];
  for (let i = 0; i < 40; i++) base.push(team(i, ['A', 'B', 'X', 'C', 'D', 'E'], 6, 4, 'other', { A: i < 20 ? 'Life Orb' : i < 30 ? 'Focus Sash' : i < 36 ? 'Choice Band' : 'Leftovers' }));
  const mons = [mon('A', 'Leftovers'), mon('B', 'Focus Sash'), mon('C', 'Focus Sash'), mon('X')];
  const r = itemSuggestions(mons, base);
  assert.deepEqual(r.duplicates.map((d) => [d.item, d.keys]), [['Focus Sash', ['B', 'C']]]);
  const a = r.mons[0];
  assert.equal(a.status, 'suggest'); // Leftovers is 4th of 4
  assert.deepEqual(a.top.map((t) => t.name), ['Life Orb', 'Focus Sash', 'Choice Band']);
  assert.equal(a.top[1].blockedBy, 'B'); // held by another member
  assert.equal(a.top[0].blockedBy, null);
  assert.equal(a.top[0].pct, 0.5);
  assert.equal(a.top[0].winPct, 0.6); // 20 teams x 10 games
  assert.equal(a.current.games, 40); // 4 teams x 10 games >= 30, so it has a rate
  assert.equal(a.current.winPct, 0.6);

  // species with no items recorded: insufficient / missing species
  assert.equal(r.mons[3].status, 'insufficient');
  assert.equal(r.mons[2].status, 'insufficient'); // C has 40 slots but no recorded item at all
});

test('sharedWeaknesses: >= 3 members weak', () => {
  const mons = [mon('C'), mon('C'), mon('C'), mon('B')]; // 3x Grass, 1x Water
  const w = sharedWeaknesses(mons, dex, ['Fire', 'Water', 'Grass']);
  assert.equal(w.find((x) => x.type === 'Fire').n, 3);
  assert.equal(w.some((x) => x.type === 'Water'), false); // Water hits only Fire/Rock/Ground
});

test('teammatePicks: pool, thresholds, coverage tags', () => {
  const base = [];
  for (let i = 0; i < 30; i++) base.push(team(i, ['A', 'B', 'C', 'X', 'G', 'H'], 7, 3));
  for (let i = 30; i < 35; i++) base.push(team(i, ['A', 'B', 'C', 'E', 'F', 'D'], 1, 9));
  const keys = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
  const r = teammatePicks(keys, base, dex, sharedCounts(base, keys), { weakTypes: ['Ground'], worstKeys: ['A'] });
  assert.equal(r.poolTeams, 35);
  const x = r.picks.find((p) => p.key === 'X');
  assert.equal(x.n, 30);
  assert.equal(x.winPct, 0.7);
  assert.ok(x.share > 0.85);
  assert.equal(r.picks.find((p) => p.key === 'E'), undefined); // in the scanned team
  const h = r.picks.find((p) => p.key === 'H'); // Water resists Fire, the STAB of worst opponent A
  assert.deepEqual(h.resists, []);
  assert.deepEqual(h.answers, ['A']);
  assert.deepEqual(r.picks.find((p) => p.key === 'G').answers, []); // Steel is weak to Fire
  assert.equal(r.picks[0].answers.length + r.picks[0].resists.length > 0, true); // covering picks first
  assert.equal(teammatePicks(new Set(['A', 'B']), base, dex), null);
});

test('weakestLink: with/without, gating and replacement', () => {
  const base = [];
  // teams containing D lose, teams with X instead of D win; all share A,B,C,E,F (>= 3 of the others)
  for (let i = 0; i < 30; i++) base.push(team(i, ['A', 'B', 'C', 'D', 'E', 'F'], 3, 7));
  for (let i = 30; i < 60; i++) base.push(team(i, ['A', 'B', 'C', 'X', 'E', 'F'], 7, 3));
  const keys = new Set(mine);
  const { rows } = weakestLink(keys, base);
  const d = rows.find((r) => r.key === 'D');
  assert.ok(d);
  assert.equal(rows[0].key, 'D');
  assert.ok(d.diff > 0.39);
  assert.equal(d.clear, true);
  assert.equal(d.replacement.key, 'X');
  assert.equal(d.with.teams, 30);
  // too few games -> no rows
  assert.equal(weakestLink(keys, base.slice(0, 5)).rows.length, 0);
  assert.equal(weakestLink(new Set(['A', 'B', 'C']), base).rows.length, 0);
});

test('scanTeam: end to end on a small fixture, no NaN', () => {
  const { base, matches } = matchFixture();
  const mons = mine.map((k) => mon(k));
  const r = scanTeam({ mons, base, matches, dex, minN: 1, types: ['Fire', 'Water', 'Grass', 'Rock', 'Ground'] });
  assert.equal(r.arch.id, 'other');
  assert.equal(r.sim.teams.length, 4); // shares of D/E/F or A-D
  assert.equal(r.sim.threshold, 3);
  assert.doesNotMatch(JSON.stringify(r), /NaN|Infinity|undefined/);
  assert.ok(LIMITS.matchGames > 0);
});

// --- spCheck (scanner SP check) ---
import { readFileSync } from 'node:fs';
import { spCheck, RARE_NATURE } from '../public/js/lib/scan.js';
import { calcStat } from '../public/js/lib/stats.js';
import { rankedMon } from '../public/js/lib/aggregate.js';

test('spCheck: exact / near / assumed / insufficient / rare nature, real Rillaboom', () => {
  const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const rdex = load('dex.json');
  const season = load('ranked-M-C.json').seasons[0];
  const entry = rankedMon(season, 'Rillaboom', rdex);
  const field = [{ key: 'Rillaboom', spe: 1 }, { key: 'Slow', spe: 100 }, { key: 'Mid', spe: 110 }, { key: 'Fast', spe: 200 }];
  const m = (sp, nature = null) => ({ s: 'Rillaboom', k: 'Rillaboom', nature, sp, moves: [] });

  const exact = spCheck(m([32, 32, 0, 0, 0, 2]), entry, rdex, field);
  assert.equal(exact.kind, 'exact');
  assert.equal(exact.rank, 1);
  assert.equal(exact.rarity, null);

  const near = spCheck(m([32, 32, 0, 0, 0, 0], 'Adamant'), entry, rdex, field);
  assert.equal(near.kind, 'near');
  assert.equal(near.dist, 2);
  assert.deepEqual(near.diff, [0, 0, 0, 0, 0, -2]);
  assert.equal(near.mySpe, calcStat(rdex.species.Rillaboom.bs[5], 0, 5, 'Adamant'));
  assert.equal(near.commonSpe, near.row.stats[5]);
  assert.ok(near.mySpe < near.commonSpe);
  for (const c of near.changes) assert.notEqual(c.mine, c.common);
  assert.ok(!near.changes.some((c) => c.key === 'Rillaboom')); // own species is not its own benchmark

  const rare = spCheck(m(null, 'Relaxed'), entry, rdex, field);
  assert.equal(rare.kind, 'assumed');
  assert.deepEqual(rare.rarity, { nature: 'Relaxed', share: entry.mon.natures.Relaxed });
  assert.ok(entry.mon.natures.Relaxed < RARE_NATURE);
  assert.equal(spCheck(m(null, 'Adamant'), entry, rdex, field).rarity, null);
  assert.equal(spCheck(m(null, 'Serious'), entry, rdex, field).rarity.share, null); // not reported at all

  assert.equal(spCheck(m([1, 2, 3, 4, 5, 6]), null, rdex, field).kind, 'insufficient');
  assert.equal(spCheck({ ...m(null), k: 'Nope', s: 'Nope' }, entry, rdex, field).kind, 'insufficient');
  assert.doesNotMatch(JSON.stringify([exact, near, rare]), /NaN|Infinity|undefined/);
});
