import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  decode, filterTeams, previousPeriod, usage, kpis, typeUsage, attackingTypes,
  weaknesses, archetypeSplit, archetypeMatrix, coUsage, cores, speciesDetail,
  weekly, movers, speedTiers, closestTeams, toCSV, toJSONRows,
} from '../public/js/lib/aggregate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = JSON.parse(readFileSync(join(__dirname, 'fixtures/teams-sample.json'), 'utf8'));
const dex = JSON.parse(readFileSync(join(__dirname, 'fixtures/dex-sample.json'), 'utf8'));
const { teams, events, matches } = decode(file, dex);

test('decode: shape, ids, keys, topCut', () => {
  assert.equal(teams.length, 143);
  assert.equal(events.length, 1);
  assert.ok(matches.length > 0);
  const t0 = teams[0];
  assert.equal(t0.id, `${events[0].id}:${t0.player.toLowerCase().replace(/[^a-z0-9]+/g, '')}`);
  assert.equal(new Set(teams.map((t) => t.id)).size, teams.length);
  assert.equal(t0.keys.length, 6);
  assert.ok(t0.species instanceof Set);
  assert.ok(Array.isArray(t0.arch) && t0.arch.length >= 1);
  // placing 1 -> definitely top cut
  const winner = teams.find((t) => t.placing === 1);
  assert.ok(winner.topCut);
});

test('decode: Mega form key derived from held stone matching megaOf', () => {
  const t0 = teams[0];
  assert.ok(t0.keys.includes('Swampert-Mega'));
  const swampert = t0.mons.find((m) => m.s === 'Swampert');
  assert.equal(swampert.k, 'Swampert-Mega');
  assert.equal(swampert.mega, true);
});

test('usage: pct sums are consistent with n/teams.length, sorted desc by n', () => {
  const rows = usage(teams);
  for (const r of rows) assert.ok(Math.abs(r.pct - r.n / teams.length) < 1e-9);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].n >= rows[i].n);
  // every row's win% games count matches w+l, CI bounds sane
  for (const r of rows) {
    if (r.winPct != null) {
      assert.ok(r.ci[0] <= r.winPct && r.winPct <= r.ci[1] + 1e-9);
    } else {
      assert.equal(r.w + r.l, 0);
    }
  }
});

test('filterTeams: species chip, then negated species chip flips the count', () => {
  const withGarchomp = filterTeams(teams, {}, [{ kind: 'species', value: 'Garchomp', neg: false }], dex);
  const withoutGarchomp = filterTeams(teams, {}, [{ kind: 'species', value: 'Garchomp', neg: true }], dex);
  assert.ok(withGarchomp.length > 0);
  assert.equal(withGarchomp.length + withoutGarchomp.length, teams.length);
  for (const t of withGarchomp) assert.ok(t.keys.includes('Garchomp'));
  for (const t of withoutGarchomp) assert.ok(!t.keys.includes('Garchomp'));
});

test('filterTeams: chips AND together (species + item)', () => {
  const rows = usage(teams);
  const commonKey = rows[0].key;
  const withSpecies = filterTeams(teams, {}, [{ kind: 'species', value: commonKey, neg: false }], dex);
  const item = withSpecies[0].mons.find((m) => m.k === commonKey).item;
  const combo = filterTeams(teams, {}, [
    { kind: 'species', value: commonKey, neg: false },
    { kind: 'item', value: item, neg: false },
  ], dex);
  assert.ok(combo.length <= withSpecies.length);
  for (const t of combo) {
    assert.ok(t.keys.includes(commonKey));
    assert.ok(t.mons.some((m) => m.item === item));
  }
});

test('filterTeams: place=topcut and tiers filter', () => {
  const topcut = filterTeams(teams, { place: 'topcut' }, [], dex);
  for (const t of topcut) assert.ok(t.topCut);
  const onlineOnly = filterTeams(teams, { tiers: ['online'] }, [], dex);
  assert.equal(onlineOnly.length, 0); // fixture event's tier is "regional"
  const regionalOnly = filterTeams(teams, { tiers: ['regional'] }, [], dex);
  assert.equal(regionalOnly.length, teams.length);
});

test('filterTeams: core chip requires all keys present', () => {
  const rows = usage(teams);
  const [a, b] = [rows[0].key, rows[1].key];
  const core = filterTeams(teams, {}, [{ kind: 'core', value: [a, b], neg: false }], dex);
  for (const t of core) {
    assert.ok(t.keys.includes(a));
    assert.ok(t.keys.includes(b));
  }
});

test('kpis: sane totals', () => {
  const k = kpis(teams);
  assert.equal(k.teams, teams.length);
  assert.ok(k.species > 0);
  assert.ok(k.diversity > 0);
  assert.ok(k.megaShare >= 0 && k.megaShare <= 1);
});

test('typeUsage: pct sums, all 18 types represented', () => {
  const rows = typeUsage(teams, dex);
  assert.equal(rows.length, 18);
  const totalSlots = teams.length * 6;
  for (const r of rows) assert.ok(Math.abs(r.pct - r.n / totalSlots) < 1e-9);
  const sumN = rows.reduce((s, r) => s + r.n, 0);
  assert.ok(sumN >= totalSlots); // dual types double-count
});

test('attackingTypes and weaknesses: bucket shares are between 0 and 1', () => {
  const atk = attackingTypes(teams, dex);
  for (const r of atk) assert.ok(r.score >= 0 && r.se >= 0 && r.se <= 1);
  const weak = weaknesses(teams, dex);
  for (const r of weak) {
    assert.ok(r.weak >= 0 && r.resist >= 0 && r.immune >= 0);
    assert.ok(r.weak + r.resist + r.immune <= 1 + 1e-9);
  }
});

test('archetypeSplit: n sums to teams.length, pct consistent', () => {
  const rows = archetypeSplit(teams);
  assert.equal(rows.reduce((s, r) => s + r.n, 0), teams.length);
  for (const r of rows) assert.ok(Math.abs(r.pct - r.n / teams.length) < 1e-9);
});

test('archetypeMatrix: null with no matches, populated otherwise', () => {
  assert.equal(archetypeMatrix(teams, []), null);
  assert.equal(archetypeMatrix(teams, null), null);
  const m = archetypeMatrix(teams, matches);
  assert.ok(m === null || (Array.isArray(m.ids) && Array.isArray(m.cells)));
  if (m) for (const c of m.cells) assert.ok(c.n >= c.w + c.l); // n also counts ties/unresolved
});

test('coUsage: n/pct/lift matrices, lift is symmetric', () => {
  const rows = usage(teams).slice(0, 5);
  const keys = rows.map((r) => r.key);
  const co = coUsage(teams, keys);
  assert.equal(co.n.length, keys.length);
  for (let i = 0; i < keys.length; i++) {
    // a species always co-occurs with itself in all of its own teams
    assert.equal(co.n[i][i], rows[i].n);
    for (let j = 0; j < keys.length; j++) {
      assert.ok(Math.abs(co.lift[i][j] - co.lift[j][i]) < 1e-9);
      assert.ok(Math.abs(co.n[i][j] - co.n[j][i]) < 1e-9);
    }
  }
});

test('cores: top-N most common k-subsets, respecting minN and size', () => {
  const c3 = cores(teams, 3, 10, 1);
  assert.ok(c3.length <= 10);
  for (const row of c3) {
    assert.equal(row.keys.length, 3);
    assert.ok(row.n >= 1);
    assert.ok(Math.abs(row.pct - row.n / teams.length) < 1e-9);
  }
  for (let i = 1; i < c3.length; i++) assert.ok(c3[i - 1].n >= c3[i].n);
});

test('speciesDetail: distributions sum sensibly, megaPct in range', () => {
  const key = usage(teams)[0].key;
  const detail = speciesDetail(teams, key, dex);
  assert.ok(detail.n > 0);
  assert.ok(Math.abs(detail.pct - detail.n / teams.length) < 1e-9);
  for (const list of [detail.items, detail.abilities, detail.moves, detail.natures, detail.sets, detail.teammates]) {
    assert.ok(list.length <= 12);
    for (const row of list) assert.ok(row.n > 0 && row.pct > 0);
  }
  assert.ok(detail.megaPct >= 0 && detail.megaPct <= 1);
});

test('weekly: totals length matches weeks, series pct in range', () => {
  const rows = usage(teams).slice(0, 3);
  const keys = rows.map((r) => r.key);
  const w = weekly(teams, keys);
  assert.equal(w.totals.length, w.weeks.length);
  for (const key of keys) {
    assert.equal(w.series[key].length, w.weeks.length);
    for (const p of w.series[key]) assert.ok(p >= 0 && p <= 1);
  }
});

test('movers: risers/fallers arrays, respects minN', () => {
  const m = movers(teams, 0);
  assert.ok(Array.isArray(m.risers) && Array.isArray(m.fallers));
  for (const r of m.risers) assert.ok(r.delta > 0);
  for (const r of m.fallers) assert.ok(r.delta < 0);
});

// Minimal synthetic Team-shape rows: usage()/weekly()/movers() only touch
// .date, .keys, .w, .l — no need for a full decode() here.
function fakeTeam(date, keys, w = 1, l = 0) {
  return { date, keys, w, l };
}

test('weekly: drops a partial/small week (< max(100, 25% of median week))', () => {
  const mkWeek = (date, n) => Array.from({ length: n }, () => fakeTeam(date, ['Y']));
  const wk1 = mkWeek('2026-01-05', 100);
  const wk2 = mkWeek('2026-01-12', 100);
  const wk3 = mkWeek('2026-01-19', 5); // partial: median of [100,100,5]=100, threshold=100, 5 fails
  const rows = weekly([...wk1, ...wk2, ...wk3], ['Y']);
  assert.deepEqual(rows.weeks, ['2026-01-05', '2026-01-12']);
  assert.deepEqual(rows.totals, [100, 100]);
});

test('movers: requires n >= minN in BOTH compared weeks (not just the max)', () => {
  const mkWeek = (date, nWithX) => Array.from({ length: 100 }, (_, i) => fakeTeam(date, i < nWithX ? ['X', 'Z'] : ['Z']));
  const prevWeek = mkWeek('2026-02-02', 0); // X: n=0 in the earlier qualifying week
  const lastWeek = mkWeek('2026-02-09', 25); // X: n=25 in the latest qualifying week
  const m = movers([...prevWeek, ...lastWeek], 20);
  assert.equal(m.weekPrev, '2026-02-02');
  assert.equal(m.weekLast, '2026-02-09');
  // 0 -> 25 looks like a huge riser by raw pct delta, but n=0 in the prior
  // week fails minN there, so it must not be reported as a mover at all.
  assert.ok(!m.risers.some((r) => r.key === 'X'));
  assert.ok(!m.fallers.some((r) => r.key === 'X'));
  // Z clears minN (n=100) in both weeks with zero delta: computable, not a mover.
  assert.ok(!m.risers.some((r) => r.key === 'Z'));
  assert.ok(!m.fallers.some((r) => r.key === 'Z'));
});

test('speedTiers: top species get a real speed stat or explicit nulls', () => {
  const rows = speedTiers(teams, dex, 20);
  assert.ok(rows.length <= 20);
  for (const r of rows) {
    if (r.spe == null) {
      assert.equal(r.nature, null);
      assert.equal(r.sp, null);
    } else {
      assert.ok(r.spe > 0);
      assert.ok(r.sp >= 0 && r.sp <= 32);
    }
  }
});

test('closestTeams: sorted by similarity desc, similarity in [0,1]', () => {
  const query = teams[0].keys;
  const closest = closestTeams(query, teams, 5);
  assert.equal(closest.length, 5);
  for (let i = 1; i < closest.length; i++) assert.ok(closest[i - 1].sim >= closest[i].sim);
  for (const c of closest) assert.ok(c.sim >= 0 && c.sim <= 1);
  // the team itself should be its own closest match
  assert.equal(closest[0].team.id, teams[0].id);
});

test('previousPeriod: falls back to prevRegTeams when window predates reg start', () => {
  const fallback = [teams[0]];
  const result = previousPeriod(teams, { from: '2020-01-01', to: '2020-01-02' }, fallback);
  assert.equal(result, fallback);
});

test('toCSV / toJSONRows: header row + one row per team, values escaped', () => {
  const rows = toJSONRows(teams);
  assert.equal(rows.length, teams.length);
  const csv = toCSV(teams);
  const lines = csv.split('\n');
  assert.equal(lines.length, teams.length + 1);
  assert.ok(lines[0].startsWith('id,player,country'));
});

test('ladderMerge weights months by battles and filters by date', async () => {
  const { ladderMerge } = await import('../public/js/lib/aggregate.js');
  const ladder = { cutoff: 1760, months: [
    { month: '2026-07', battles: 100, url: 'a', mons: { A: { usage: 0.5, raw: 50, items: { X: 1 } } } },
    { month: '2026-08', battles: 300, url: 'b', mons: { A: { usage: 0.1, raw: 30, items: { Y: 1 } }, B: { usage: 0.2, raw: 60 } } },
  ] };
  const all = ladderMerge(ladder);
  assert.equal(all.battles, 400);
  const a = all.mons.find((m) => m.key === 'A');
  assert.ok(Math.abs(a.usage - (0.5 * 0.25 + 0.1 * 0.75)) < 1e-9);
  assert.ok(Math.abs(a.items.find((i) => i.name === 'X').pct - 0.125 / 0.2) < 1e-9);
  assert.equal(ladderMerge(ladder, '2026-08-01').mons[0].key, 'B');
  assert.equal(ladderMerge(ladder, '2026-09-01'), null);
});

// --- ranked helpers ---
import { rankedSeason, rankedEntries, rankedMon, rankedMegaKey, rankedSpeed } from '../public/js/lib/aggregate.js';
import { calcStat } from '../public/js/lib/stats.js';

const RANKED = { seasons: [
  { season: 'M3', snapshot: '2026-07-08', ranking: null, mons: {} },
  { season: 'M5', snapshot: '2026-09-10', ranking: null, mons: {} },
  { season: 'M4', snapshot: '2026-08-05', ranking: null, mons: {} },
] };

test('rankedSeason: latest season, or latest whose snapshot is within from/to', () => {
  assert.equal(rankedSeason(RANKED).season, 'M5');
  assert.equal(rankedSeason(RANKED, '', '2026-09-09').season, 'M4');
  assert.equal(rankedSeason(RANKED, '2026-07-01', '2026-07-31').season, 'M3');
  assert.equal(rankedSeason(RANKED, '2026-07-09', '2026-08-04'), null);
  assert.equal(rankedSeason({ seasons: [] }), null);
  assert.equal(rankedSeason(null), null);
});

test('rankedMon / rankedMegaKey / rankedSpeed', () => {
  const dex = {
    species: { 'Salamence-Mega': { megaOf: 'Salamence' }, Salamence: {} },
    items: { Salamencite: { mega: 'Salamence-Mega', megaOf: 'Salamence' } },
  };
  const mon = {
    items: { 'Life Orb': 0.01, Salamencite: 0.977 },
    natures: { Modest: 0.3, Timid: 0.6 },
    spreads: { '2/0/0/32/0/32': 0.4, '32/0/0/32/2/0': 0.1 },
  };
  const season = { mons: { Salamence: mon } };
  assert.deepEqual(rankedEntries(mon.items).map((e) => e.name), ['Salamencite', 'Life Orb']);
  assert.equal(rankedMon(season, 'Salamence-Mega', dex).name, 'Salamence');
  assert.equal(rankedMon(season, 'Salamence', dex).mon, mon);
  assert.equal(rankedMon(season, 'Garchomp', dex), null);
  assert.equal(rankedMegaKey('Salamence', mon, dex), 'Salamence-Mega');
  assert.equal(rankedMegaKey('Salamence', { items: { Salamencite: 0.4, 'Life Orb': 0.35 } }, dex), null);
  const bs = [95, 145, 130, 120, 90, 120];
  const s = rankedSpeed(mon, bs);
  assert.equal(s.nature, 'Timid');
  assert.equal(s.sp, 32);
  assert.equal(s.spe, calcStat(120, 32, 5, 'Timid'));
  assert.equal(rankedSpeed({ spreads: {}, natures: {} }, bs), null);
});
