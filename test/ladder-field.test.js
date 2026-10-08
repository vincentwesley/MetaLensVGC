import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladderTypeUsage, ladderWeaknesses, ladderSeries, ladderMovers } from '../public/js/lib/ladder-field.js';

const dex = { species: { Garchomp: { types: ['Dragon', 'Ground'] }, Gholdengo: { types: ['Steel', 'Ghost'] } } };
const mons = [{ key: 'Garchomp', usage: 0.3 }, { key: 'Gholdengo', usage: 0.1 }, { key: 'Unknown', usage: 0.5 }];

test('type usage is usage-weighted, unknown species skipped', () => {
  const r = Object.fromEntries(ladderTypeUsage(mons, dex).map((x) => [x.type, x.pct]));
  assert.ok(Math.abs(r.Dragon - 0.75) < 1e-9);
  assert.ok(Math.abs(r.Ghost - 0.25) < 1e-9);
});

test('weaknesses: Ice 4x on Garchomp = 75% of field, buckets sum to 1', () => {
  const w = ladderWeaknesses(mons, dex);
  const ice = w.find((x) => x.type === 'Ice');
  assert.ok(Math.abs(ice.x4 - 0.75) < 1e-9);
  assert.ok(Math.abs(ice.x4 + ice.x2 + ice.x1 + ice.x05 + ice.x025 + ice.x0 - 1) < 1e-9);
});

const ladder = { months: [
  { month: '2026-08', mons: { A: { usage: 0.3 }, B: { usage: 0.2 } } },
  { month: '2026-09', mons: { A: { usage: 0.4 }, C: { usage: 0.15 }, D: { usage: 0.001 } } },
] };

test('series: null for absent months', () => {
  const s = ladderSeries(ladder, ['B']);
  assert.deepEqual(s.months, ['2026-08', '2026-09']);
  assert.deepEqual(s.series.B, [0.2, null]);
});

test('movers: NEW when absent previously, floor drops noise, fallers incl. vanished', () => {
  const m = ladderMovers(ladder);
  assert.equal(m.monthLast, '2026-09');
  assert.deepEqual(m.risers.map((r) => r.key), ['C', 'A']);
  assert.equal(m.risers[0].isNew, true);
  assert.equal(m.risers[1].isNew, false);
  assert.deepEqual(m.fallers.map((r) => r.key), ['B']);
  assert.equal(ladderMovers({ months: [ladder.months[0]] }), null);
});
