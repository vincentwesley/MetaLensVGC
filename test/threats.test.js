import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threatScores } from '../public/js/lib/threats.js';

const c = (name, score) => ({ name, score, dev: 0 });

test('ranks by usage-weighted score and counts checks', () => {
  const mons = [
    { key: 'A', usage: 0.5, counters: [c('X', 0.4), c('Y', 0.1)] },
    { key: 'B', usage: 0.2, counters: [c('X', 0.5)] },
  ];
  const { total, rows } = threatScores(mons);
  assert.equal(total, 2);
  assert.deepEqual(rows.map((r) => [r.name, r.checks]), [['X', 2], ['Y', 1]]);
  assert.ok(Math.abs(rows[0].score - 0.3) < 1e-9);
});

test('only top N by usage count; ties break on checks then name', () => {
  const mons = [
    { key: 'A', usage: 0.5, counters: [c('Z', 0.2), c('B', 0.2)] },
    { key: 'C', usage: 0.1, counters: [c('Q', 1)] },
  ];
  const { rows } = threatScores(mons, 1);
  assert.deepEqual(rows.map((r) => r.name), ['B', 'Z']);
});

test('missing counters, NaN and empty input never yield NaN', () => {
  assert.deepEqual(threatScores(null), { total: 0, rows: [] });
  const { rows } = threatScores([{ key: 'A', usage: 0.3 }, { key: 'B', usage: 0.2, counters: [c('X', NaN), c('Y', 0.3)] }]);
  assert.deepEqual(rows.map((r) => r.name), ['Y']);
  assert.ok(rows.every((r) => Number.isFinite(r.score)));
});
