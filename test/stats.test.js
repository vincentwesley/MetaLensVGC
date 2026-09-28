import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NATURES, natureMult, calcStat, calcStats, parseSP, wilson, effectiveSpecies } from '../public/js/lib/stats.js';

test('natureMult: boosted/hindered/neutral', () => {
  assert.equal(natureMult('Jolly', 5), 1.1); // +Spe
  assert.equal(natureMult('Jolly', 3), 0.9); // -SpA
  assert.equal(natureMult('Jolly', 1), 1.0); // untouched
  assert.equal(natureMult('Hardy', 1), 1.0); // fully neutral nature
  assert.equal(natureMult('Jolly', 0), 1); // HP never affected
});

test('calcStat: Jolly Garchomp 32 Speed SP (base 102) -> 169', () => {
  assert.equal(calcStat(102, 32, 5, 'Jolly'), Math.floor(154 * 1.1));
  assert.equal(calcStat(102, 32, 5, 'Jolly'), 169);
});

test('calcStat: HP Garchomp base 108, 0 SP -> 183', () => {
  assert.equal(calcStat(108, 0, 0, 'Jolly'), 183);
});

test('calcStat: hindered stat rounds down', () => {
  // Jolly hinders SpA (-10%): base 80, 0 SP -> floor(100*0.9) = 90
  assert.equal(calcStat(80, 0, 3, 'Jolly'), 90);
});

test('calcStats: full spread for Jolly Garchomp', () => {
  const bs = [108, 130, 95, 80, 85, 102];
  const sp = [0, 0, 0, 0, 0, 32];
  const stats = calcStats(bs, sp, 'Jolly');
  assert.deepEqual(stats, [183, 150, 115, 90, 105, 169]);
});

test('parseSP: valid spread', () => {
  assert.deepEqual(parseSP('0/32/0/0/2/32'), [0, 32, 0, 0, 2, 32]);
});

test('parseSP: rejects out-of-range, malformed, or non-string', () => {
  assert.equal(parseSP('0/252/0/0/2/32'), null); // classic EV value, not SP
  assert.equal(parseSP('0/32/0/0/2'), null); // wrong length
  assert.equal(parseSP('a/b/c/d/e/f'), null);
  assert.equal(parseSP(0), null);
  assert.equal(parseSP(null), null);
});

test('wilson: k=0,n=0 -> [0,0]', () => {
  assert.deepEqual(wilson(0, 0), [0, 0]);
});

test('wilson: k=50,n=100 approx [0.404, 0.596]', () => {
  const [lo, hi] = wilson(50, 100);
  assert.ok(Math.abs(lo - 0.404) < 0.005, `lo=${lo}`);
  assert.ok(Math.abs(hi - 0.596) < 0.005, `hi=${hi}`);
});

test('wilson: bounds always within [0,1] and lo <= hi', () => {
  const [lo, hi] = wilson(3, 5);
  assert.ok(lo >= 0 && hi <= 1 && lo <= hi);
});

test('effectiveSpecies: single species -> 1', () => {
  assert.equal(effectiveSpecies([10]), 1);
});

test('effectiveSpecies: even split over k species -> k', () => {
  assert.ok(Math.abs(effectiveSpecies([5, 5, 5, 5]) - 4) < 1e-9);
});

test('effectiveSpecies: empty/zero -> 0', () => {
  assert.equal(effectiveSpecies([]), 0);
  assert.equal(effectiveSpecies([0, 0]), 0);
});

test('NATURES: 25 entries, plus/minus keys make sense', () => {
  assert.equal(Object.keys(NATURES).length, 25);
  assert.equal(NATURES.Adamant.plus, 1);
  assert.equal(NATURES.Adamant.minus, 3);
  assert.equal(NATURES.Hardy.plus, null);
});
