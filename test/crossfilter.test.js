import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decode, filterTeams, projectTeams, usage, typeUsage, attackingTypes, weaknesses, itemUsage, archetypeSplit, coUsage,
} from '../public/js/lib/aggregate.js';
import { effectiveness } from '../public/js/lib/types.js';

// Cross-filter rule, checked on real data: a click filters to what the clicked
// mark stands for, so the chart it came from then shows that selection at 100%.
// (Type clicks are always plain type filters, from any of the three type charts.)
const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const dex = read('dex.json');
const { teams: all } = decode(read('teams-M-C.json'), dex);
const bar = { tiers: ['worlds', 'international', 'regional', 'online'], place: 'all', from: '', to: '', minN: 20 };
function view(chip) {
  const chips = [{ ...chip, neg: false }];
  const teams = filterTeams(all, bar, chips, dex);
  return { teams, mon: projectTeams(teams, chips, dex) };
}
const pct = (rows, key, k, f) => rows.find((r) => r[key] === k)?.[f];
const slotsOf = (v) => v.mon.flatMap((t) => t.mons);
const typesOf = (m) => (dex.species[m.k] || dex.species[m.s]).types;

test('type usage click (type chip): that type is 100% of the Pokémon in view', () => {
  for (const type of ['Ground', 'Fairy', 'Water', 'Steel']) {
    const v = view({ kind: 'type', value: type });
    assert.ok(v.teams.length > 0);
    assert.equal(pct(typeUsage(v.mon, dex), 'type', type, 'pct'), 1, type);
  }
});

test('weak-to chip: every Pokémon in view is weak to the type, which then tops the multiplier chart', () => {
  for (const type of ['Ground', 'Ice', 'Fighting']) {
    const v = view({ kind: 'weak', value: type });
    assert.ok(slotsOf(v).every((m) => effectiveness(type, typesOf(m)) > 1));
    assert.equal(pct(weaknesses(v.mon, dex), 'type', type, 'weak'), 1);
    const atk = attackingTypes(v.mon, dex).sort((x, y) => y.score - x.score);
    assert.ok(atk.find((r) => r.type === type).score >= 2);
  }
});

test('item / species / archetype / core clicks: the clicked mark is 100% of its own chart', () => {
  const item = itemUsage(all).rows?.[0]?.name || itemUsage(all)[0].name;
  const vi = view({ kind: 'item', value: item });
  assert.ok(slotsOf(vi).every((m) => m.item === item));
  const sp = usage(all)[0].key;
  const vs = view({ kind: 'species', value: sp });
  assert.deepEqual(usage(vs.mon).map((r) => [r.key, r.pct]), [[sp, 1]]);
  const arch = archetypeSplit(all)[0].id;
  const va = view({ kind: 'archetype', value: arch });
  assert.deepEqual(archetypeSplit(va.teams).map((r) => [r.id, r.pct]), [[arch, 1]]);
  const [a, b] = usage(all).slice(0, 2).map((r) => r.key);
  const vc = view({ kind: 'core', value: [a, b] });
  assert.deepEqual(usage(vc.mon).map((r) => r.pct), [1, 1]);
  assert.ok(vc.teams.every((t) => t.species.has(a) && t.species.has(b)));
  assert.ok(coUsage);
});

test('weakness chart buckets: only real multipliers (4, 2, 1, 1/2, 1/4, 0), summing to the whole field', () => {
  const v = view({ kind: 'type', value: 'Ground' });
  for (const r of weaknesses(v.mon, dex)) {
    const sum = r.x4 + r.x2 + r.x1 + r.x05 + r.x025 + r.x0;
    assert.ok(Math.abs(sum - 1) < 1e-9, `${r.type}: ${sum}`);
    assert.ok(Math.abs(r.x4 + r.x2 - r.weak) < 1e-9);
    assert.ok(Math.abs(r.x05 + r.x025 - r.resist) < 1e-9);
  }
  // With the Ground filter, Water hits every pure Ground / Ground-Steel / Ground-Rock 2x and never 1.69x.
  const water = weaknesses(v.mon, dex).find((r) => r.type === 'Water');
  const expect2 = slotsOf(v).filter((m) => effectiveness('Water', typesOf(m)) === 2).length / slotsOf(v).length;
  assert.ok(Math.abs(water.x2 - expect2) < 1e-9);
});
