import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladderQuadrant } from '../public/js/lib/ladder-field.js';

const mons = [
  { key: 'A', usage: 0.2, raw: 300 }, { key: 'B', usage: 0.4, raw: 100 },
  { key: 'C', usage: 0.1, raw: 0 }, { key: 'D', usage: 0.3 }, { key: 'E', usage: 0.1, raw: 600 },
];

test('expected = raw share x total usage; ordered by usage; missing raw skipped', () => {
  const r = ladderQuadrant(mons);
  assert.deepEqual(r.map((x) => x.key), ['B', 'A', 'E']);
  const sumUse = 0.7; // A+B+E
  assert.ok(Math.abs(r[0].expected - (100 / 1000) * sumUse) < 1e-9);
  assert.ok(r[0].lean > 1 && r[2].lean < 1); // B rated-up, E low-rated
  assert.ok(Math.abs(r.reduce((a, x) => a + x.expected, 0) - sumUse) < 1e-9);
});

test('top-n cap and nothing plottable', () => {
  assert.equal(ladderQuadrant(mons, 2).length, 2);
  assert.equal(ladderQuadrant([{ key: 'X', usage: 0.5 }]), null);
  assert.equal(ladderQuadrant(null), null);
});
