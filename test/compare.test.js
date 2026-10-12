import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMonths, topItem } from '../public/js/lib/compare.js';

const months = [
  { month: '2026-08', mons: { A: { usage: 0.4, items: { lifeorb: 0.6, leftovers: 0.2 } }, B: { usage: 0.2, items: { leftovers: 0.5 } }, Z: { usage: 0.001 } } },
  { month: '2026-09', mons: { A: { usage: 0.3, items: { sitrusberry: 0.5, lifeorb: 0.1 } }, C: { usage: 0.15, items: { focussash: 0.9 } }, Z: { usage: 0.002 } } },
];

test('diff, NEW, drop-out, item change', () => {
  const r = compareMonths(months, '2026-08', '2026-09');
  assert.deepEqual(r.rows.map((x) => x.key), ['A', 'C', 'Z']);
  const [a, c] = r.rows;
  assert.ok(Math.abs(a.pts + 10) < 1e-9);
  assert.equal(a.dir, 'down');
  assert.equal(a.itemA, 'lifeorb'); assert.equal(a.itemB, 'sitrusberry'); assert.ok(a.itemChanged);
  assert.ok(c.isNew && c.pts === null && c.dir === 'up');
  assert.equal(r.fallers[0].key, 'B');
  const b = r.fallers.find((x) => x.key === 'B');
  assert.ok(b.gone && b.b === 0);
  assert.ok(!r.risers.some((x) => x.key === 'Z')); // under the 1% floor
  assert.equal(r.risers[0].key, 'C');
});

test('single month: no change columns, never blank', () => {
  const r = compareMonths(months, null, '2026-09');
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x.dir === null && !x.isNew && !x.itemChanged));
  assert.deepEqual(r.risers, []);
  assert.equal(compareMonths(months, '2026-09', '2026-09').a, null);
});

test('unknown month / no data', () => {
  assert.equal(compareMonths(months, '2026-08', 'nope').rows.length, 0);
  assert.equal(compareMonths([], null, null).b, null);
  assert.equal(topItem({}, null), null);
});
