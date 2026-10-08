import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dexRows, usageTier, USAGE_TIERS, suggest, splitForme } from '../public/js/lib/pokedex.js';

const sp = (num, types, bs, abilities, tier) => ({ num, types, bs, abilities, tier });
const roster = { tierOrder: ['OU', 'UU'], species: {
  Zed: sp(1, ['Fire'], [10, 20, 30, 40, 50, 60], { 0: 'Blaze', H: 'Solar Power' }, 'UU'),
  Amy: sp(2, ['Fire', 'Flying'], [10, 20, 30, 40, 50, 60], { 0: 'Blaze' }, 'OU'),
  Bob: sp(3, ['Water'], [99, 1, 1, 1, 1, 1], { 0: 'Torrent' }),
  Porygon: sp(137, ['Normal'], [1, 1, 1, 1, 1, 1], { 0: 'Trace' }, 'UU'),
  'Porygon-Z': sp(474, ['Normal'], [1, 1, 1, 1, 1, 1], { 0: 'Adaptability' }, 'UU'),
  'Ho-Oh': sp(250, ['Fire'], [1, 1, 1, 1, 1, 1], { 0: 'Pressure' }),
  'Zed-Mega': sp(1, ['Fire'], [10, 20, 30, 40, 50, 70], { 0: 'Blaze' }, 'OU'),
} };
const ls = { moves: { flamethrower: 'Flamethrower', surf: 'Surf' }, learn: { zed: ['flamethrower'], amy: ['flamethrower', 'surf'], bob: ['surf'] } };
const names = (r) => r.rows.map((x) => x.name);

test('usageTier places ranked species (rank only, no %) by rank, never all Unused', () => {
  assert.equal(usageTier(12, null), 'Top 12');
  assert.equal(usageTier(13, null), 'Common');
  assert.equal(usageTier(31, null), 'Uncommon');
  assert.equal(usageTier(61, null), 'Rare');
  assert.equal(usageTier(undefined, 0), 'Unused');
});

test('usageTier thresholds', () => {
  assert.deepEqual(USAGE_TIERS, ['Top 12', 'Common', 'Uncommon', 'Rare', 'Unused']);
  assert.equal(usageTier(12, 0.1), 'Top 12');
  assert.equal(usageTier(13, 4.5), 'Common');
  assert.equal(usageTier(13, 4.49), 'Uncommon');
  assert.equal(usageTier(13, 1), 'Uncommon');
  assert.equal(usageTier(13, 0.99), 'Rare');
  assert.equal(usageTier(13, 0), 'Unused');
});

test('dexRows tier ordering, both modes', () => {
  const o = dexRows(roster, {});
  assert.deepEqual(names(o).slice(0, 3), ['Amy', 'Zed-Mega', 'Porygon']);
  assert.equal(o.rows.at(-1).tier, 'Untiered');
  assert.deepEqual(o.groups.map((g) => g.tier), ['OU', 'UU', 'Untiered']);
  assert.deepEqual(o.groups[0], { tier: 'OU', from: 0, to: 1 });
  const usage = new Map([['Bob', { pct: 30, rank: 1 }], ['Amy', { pct: 5, rank: 20 }], ['Zed', { pct: 0.5, rank: 40 }]]);
  const u = dexRows(roster, { tierMode: 'usage', usage });
  assert.deepEqual(u.groups.map((g) => g.tier), ['Top 12', 'Common', 'Rare', 'Unused']);
  assert.deepEqual(names(u).slice(0, 3), ['Bob', 'Amy', 'Zed']);
  assert.deepEqual(dexRows(roster, { sort: 'name' }).groups, []);
});

test('dexRows stat sort, bst, tie-break', () => {
  const r = dexRows(roster, { sort: 'hp' });
  assert.equal(r.rows[0].name, 'Bob');
  assert.deepEqual(names(r).slice(1, 4), ['Amy', 'Zed', 'Zed-Mega']);
  assert.equal(r.rows.find((x) => x.name === 'Zed').bst, 210);
  assert.equal(dexRows(roster, { sort: 'bst' }).rows[0].name, 'Zed-Mega');
  assert.equal(dexRows(roster, { sort: 'spe' }).rows[0].name, 'Zed-Mega');
});

test('dexRows AND filters + needsLearnsets', () => {
  const f = (filters, learnsets) => dexRows(roster, { filters, learnsets, sort: 'name' });
  assert.deepEqual(names(f({ types: ['Fire', 'Flying'] })), ['Amy']);
  assert.deepEqual(names(f({ types: ['Water', 'Fire'] })), []);
  assert.deepEqual(names(f({ abilities: ['solar power'] })), ['Zed']);
  assert.deepEqual(names(f({ abilities: ['Blaze', 'Solar Power'] })), ['Zed']);
  assert.deepEqual(names(f({ moves: ['flamethrower', 'surf'] }, ls)), ['Amy']);
  assert.deepEqual(names(f({ moves: ['surf'], types: ['Water'] }, ls)), ['Bob']);
  assert.deepEqual(names(f({ moves: ['surf'] }, ls)), ['Amy', 'Bob']);
  const n = f({ moves: ['surf'] }, null);
  assert.equal(n.needsLearnsets, true);
  assert.equal(n.rows.length, Object.keys(roster.species).length);
  assert.equal(f({}, null).needsLearnsets, false);
  assert.deepEqual(names(f({ moves: ['flamethrower'] }, ls)), ['Amy', 'Zed', 'Zed-Mega']); // forme -> base learnset
});

test('suggest groups', () => {
  const s = suggest('f', roster, ls);
  assert.equal(s.types[0], 'Fire');
  assert.ok(s.types.includes('Flying'));
  assert.deepEqual(s.moves.map((m) => m.id), ['flamethrower', 'surf']); // prefix first
  assert.deepEqual(suggest('z', roster, null).moves, []);
  assert.deepEqual(suggest('', roster, ls).pokemon, []);
  assert.deepEqual(suggest('torr', roster, ls).abilities, ['Torrent']);
  assert.equal(suggest('o', roster, ls, { limit: 2 }).pokemon.length, 2);
  assert.equal(suggest('zed', roster, ls).pokemon[0], 'Zed');
  assert.equal(suggest('oh', roster, ls).pokemon[0], 'Ho-Oh');
});

test('splitForme', () => {
  const r = { species: { Charizard: 1, Urshifu: 1, Porygon: 1, 'Porygon-Z': 1, 'Ho-Oh': 1, 'Jangmo-o': 1, 'Kommo-o': 1, 'Type: Null': 1 } };
  assert.deepEqual(splitForme('Charizard-Mega-Y', r), { base: 'Charizard', suffix: 'Mega-Y' });
  assert.deepEqual(splitForme('Urshifu-Rapid-Strike', r), { base: 'Urshifu', suffix: 'Rapid-Strike' });
  for (const n of ['Ho-Oh', 'Porygon-Z', 'Jangmo-o', 'Kommo-o', 'Type: Null', 'Charizard'])
    assert.deepEqual(splitForme(n, r), { base: n, suffix: '' });
});

const natdex = new URL('../public/data/pokedex-natdex.json', import.meta.url);
test('natdex roster file is well-formed', { skip: !fs.existsSync(natdex) }, () => {
  const r = dexRows(JSON.parse(fs.readFileSync(natdex, 'utf8')), {});
  assert.ok(r.rows.length > 500);
  assert.ok(r.rows.every((x) => x.bs.length === 6 && x.types.length >= 1));
});

import { usageMap } from '../public/js/lib/pokedex.js';
test('usageMap ranks by pct, or by ranking order', () => {
  const m = usageMap([{ key: 'A', pct: 1 }, { key: 'B', pct: 9 }]);
  assert.deepEqual(m.get('B'), { pct: 9, rank: 1 });
  assert.deepEqual(m.get('A'), { pct: 1, rank: 2 });
  assert.deepEqual(usageMap([], ['X', 'Y']).get('Y'), { pct: null, rank: 2 });
});
