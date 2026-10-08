import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defensiveBuckets, statRange, allSpecies, topSetMon } from '../public/js/lib/species-info.js';
import { toPaste } from '../public/js/lib/paste.js';

test('statRange: Garchomp', () => {
  const r = statRange([108, 130, 95, 80, 85, 102]);
  assert.equal(r.length, 6);
  assert.deepEqual(r[0], { min: 183, max: 215 });
  assert.equal(r[5].max, 169); // 32 SP + Jolly
  assert.equal(r[5].min, Math.floor(122 * 0.9)); // 0 SP, -Spe
  for (const x of r) assert.ok(x.min < x.max);
});

test('defensiveBuckets: Garchomp is 4x Ice, 0x Electric; mono Steel has no 4x', () => {
  const g = defensiveBuckets(['Dragon', 'Ground']);
  assert.deepEqual(g[4], ['Ice']);
  assert.deepEqual(g[0], ['Electric']);
  assert.ok(g[2].includes('Dragon') && g[2].includes('Fairy'));
  assert.deepEqual(defensiveBuckets(['Steel'])[4], []);
});

test('allSpecies: union of teams, ranked, ladder; filtered by dex', () => {
  const dex = { species: { A: {}, B: {}, C: {}, D: {} }, items: {} };
  const base = [{ keys: ['A', 'B'] }, { keys: ['B'] }];
  const ranked = { seasons: [{ mons: { C: { items: {} } } }, { mons: { A: {} } }] };
  const ladder = { months: [{ mons: { D: {}, Ghost: {} } }] };
  assert.deepEqual(allSpecies(base, ranked, ladder, dex), ['A', 'B', 'C', 'D']);
  assert.deepEqual(allSpecies(base, null, null), ['A', 'B']);
  assert.deepEqual(allSpecies(null, undefined, undefined), []);
});

test('topSetMon: most common move set with its item/ability, pastes with the species', () => {
  const mk = (item, moves) => ({ s: 'Garchomp', k: 'Garchomp', item, ability: 'Rough Skin', moves });
  const teams = [{ mons: [mk('Life Orb', ['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'])] },
    { mons: [mk('Life Orb', ['Protect', 'Earthquake', 'Dragon Claw', 'Rock Slide'])] },
    { mons: [mk('Sitrus Berry', ['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'])] },
    { mons: [mk('Focus Sash', ['Earthquake', 'Protect'])] }];
  const m = topSetMon(teams, 'Garchomp');
  assert.equal(m.item, 'Life Orb');
  const p = toPaste({ mons: [m] }, { items: {} });
  assert.ok(p.startsWith('Garchomp @ Life Orb') && p.includes('- Earthquake'));
  assert.equal(topSetMon([], 'Garchomp'), null);
});
