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

import { test as t2 } from 'node:test';
import { RULES, calcStat as cs, parsePoints, rulesFor } from '../public/js/lib/stats.js';
import { parsePaste as pp, toPaste as tp } from '../public/js/lib/paste.js';
import { statRange as sr } from '../public/js/lib/species-info.js';

const GC = [108, 130, 95, 80, 85, 102];
t2('EV rules: Garchomp Lv100', () => {
  assert.equal(cs(GC[0], 252, 0, null, RULES.ev), 420);
  assert.equal(cs(GC[5], 252, 5, 'Jolly', RULES.ev), 333);
  assert.equal(cs(GC[5], 32, 5, 'Jolly'), 169); // SP default unchanged
  assert.equal(sr(GC, RULES.ev)[5].max, 333);
  assert.equal(rulesFor({ level: 100 }), RULES.ev);
  assert.equal(rulesFor({ family: 'showdown' }), RULES.ev);
  assert.equal(rulesFor({ family: 'vgc', level: 50 }), RULES.sp);
});
t2('parsePoints respects rules.max', () => {
  assert.deepEqual(parsePoints('0/252/0/0/4/252', RULES.ev), [0, 252, 0, 0, 4, 252]);
  assert.equal(parsePoints('0/253/0/0/0/0', RULES.ev), null);
  assert.equal(parsePoints('0/252/0/0/4/252'), null);
});
t2('paste: Tera Type parsed, EV export in ev mode', () => {
  const dex = { species: {}, items: {} };
  const [m] = pp('Garchomp @ Scarf\nTera Type: Steel\nEVs: 252 Atk / 252 Spe\nJolly Nature\n- Earthquake', dex, RULES.ev);
  assert.equal(m.tera, 'Steel');
  assert.deepEqual(m.sp, [0, 252, 0, 0, 0, 252]);
  const out = tp({ mons: [m] }, dex, RULES.ev);
  assert.match(out, /Level: 100/);
  assert.match(out, /Tera Type: Steel/);
  assert.match(out, /EVs: 252 Atk \/ 252 Spe/);
});
