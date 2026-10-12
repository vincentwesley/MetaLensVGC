import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldMoves, fieldTera } from '../public/js/lib/moves-field.js';

const mons = [
  { key: 'A', usage: 0.3, moves: [{ name: 'Surf', pct: 1 }, { name: 'Protect', pct: 0.5 }], tera: [{ name: 'fire', pct: 0.5 }, { name: 'nothing', pct: 0.5 }] },
  { key: 'B', usage: 0.1, moves: [{ name: 'Surf', pct: 0.2 }], tera: [{ name: 'nothing', pct: 1 }] },
  { key: 'C', usage: 0.5, moves: [], tera: [] }, // no data: ignored, not counted as zero
];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('moves weighted by usage, species without moves skipped', () => {
  const r = fieldMoves(mons);
  assert.equal(r.species, 2);
  assert.equal(r.rows[0].name, 'Surf');
  near(r.rows[0].pct, (0.3 + 0.02) / 0.4);
  near(r.rows[1].pct, 0.15 / 0.4);
});
test('limit and empty input', () => {
  assert.equal(fieldMoves(mons, 1).rows.length, 1);
  assert.deepEqual(fieldMoves([]).rows, []);
  assert.deepEqual(fieldMoves(null).rows, []);
});
test('tera drops Nothing, capitalises, shares of whole field', () => {
  const r = fieldTera(mons);
  assert.deepEqual(r.rows.map((x) => x.name), ['Fire']);
  near(r.rows[0].pct, 0.15 / 0.4);
});
test('banned tera (only Nothing) gives no rows', () => {
  assert.deepEqual(fieldTera([{ key: 'A', usage: 1, tera: [{ name: 'nothing', pct: 1 }] }]).rows, []);
});
