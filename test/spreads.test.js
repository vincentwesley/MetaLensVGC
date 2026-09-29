import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPREAD_ARCHETYPES, spreadArchetype, rankedSpreadRows, smogonSpreadRows, archetypeShares,
  speedBenchmarks, nearestSpread, metaSpeedField,
} from '../public/js/lib/spreads.js';
import { calcStats } from '../public/js/lib/stats.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const dex = load('dex.json');
const rilla = load('ranked-M-C.json').seasons[0].mons.Rillaboom;
const bs = dex.species.Rillaboom.bs;

test('spreadArchetype: first match wins in the documented order', () => {
  assert.deepEqual(SPREAD_ARCHETYPES.map((a) => a.id), ['nospeed', 'maxspeed', 'bulk', 'offense', 'other']);
  assert.equal(spreadArchetype([32, 32, 0, 0, 2, 0]), 'nospeed'); // Spe 0 beats Offense
  assert.equal(spreadArchetype([2, 0, 0, 0, 0, 32]), 'maxspeed');
  assert.equal(spreadArchetype([32, 32, 0, 0, 0, 30]), 'maxspeed'); // Spe >= 30 beats Offense
  assert.equal(spreadArchetype([32, 0, 4, 0, 26, 4]), 'bulk'); // 62 bulk
  assert.equal(spreadArchetype([20, 0, 12, 0, 12, 1]), 'bulk'); // exactly 44
  assert.equal(spreadArchetype([32, 32, 0, 0, 0, 2]), 'offense');
  assert.equal(spreadArchetype([10, 20, 10, 20, 5, 1]), 'other');
});

test('rankedSpreadRows: real Rillaboom rows, stats from calcStats with the top nature, SP sums valid', () => {
  const rows = rankedSpreadRows(rilla, bs);
  assert.ok(rows.length >= 3);
  const topNature = Object.entries(rilla.natures).sort((a, b) => b[1] - a[1])[0];
  for (const r of rows) {
    assert.equal(r.sp.length, 6);
    assert.ok(r.sp.reduce((a, b) => a + b, 0) <= 66 && r.sp.every((v) => v >= 0 && v <= 32));
    assert.equal(r.natureJoint, false);
    assert.equal(r.nature, topNature[0]);
    assert.equal(r.natureShare, topNature[1]);
    assert.deepEqual(r.stats, calcStats(bs, r.sp, topNature[0]));
    assert.equal(r.arch, spreadArchetype(r.sp));
  }
  assert.deepEqual(rows.map((r) => r.share), rows.map((r) => r.share).sort((a, b) => b - a));
  assert.equal(rows[0].sp.join('/'), Object.entries(rilla.spreads).sort((a, b) => b[1] - a[1])[0][0]);
});

test('rankedSpreadRows: empty / malformed inputs', () => {
  assert.deepEqual(rankedSpreadRows(null, bs), []);
  assert.deepEqual(rankedSpreadRows(rilla, null), []);
  assert.deepEqual(rankedSpreadRows({ spreads: {} }, bs), []);
  const r = rankedSpreadRows({ spreads: { '1/2/3': 0.5, '0/0/0/0/0/33': 0.3, '0/0/0/0/0/32': 0.2 } }, bs);
  assert.equal(r.length, 1);
  assert.equal(r[0].nature, null); // no natures: neutral stats, no invented nature
  assert.deepEqual(r[0].stats, calcStats(bs, [0, 0, 0, 0, 0, 32], null));
});

test('smogonSpreadRows: joint nature', () => {
  const rows = smogonSpreadRows({ spreads: [{ name: 'Jolly:0/32/0/0/2/32', pct: 0.3 }, { name: 'bad', pct: 0.2 }, { name: 'Adamant:32/32/0/0/2/0', pct: 0.1 }] }, bs);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nature, 'Jolly');
  assert.equal(rows[0].natureJoint, true);
  assert.deepEqual(rows[0].stats, calcStats(bs, [0, 32, 0, 0, 2, 32], 'Jolly'));
  assert.equal(rows[0].arch, 'maxspeed');
  assert.equal(rows[1].arch, 'nospeed');
  assert.deepEqual(smogonSpreadRows(null, bs), []);
});

test('archetypeShares: sums the listed rows', () => {
  const rows = [{ arch: 'maxspeed', share: 0.3 }, { arch: 'bulk', share: 0.2 }, { arch: 'maxspeed', share: 0.1 }];
  const { byArch, covered } = archetypeShares(rows);
  assert.ok(Math.abs(byArch.maxspeed - 0.4) < 1e-9 && byArch.bulk === 0.2 && !('other' in byArch));
  assert.ok(Math.abs(covered - 0.6) < 1e-9);
  assert.deepEqual(archetypeShares([]), { byArch: {}, covered: 0 });
  const real = archetypeShares(rankedSpreadRows(rilla, bs));
  assert.ok(real.covered > 0.3 && real.covered <= 1);
});

test('speedBenchmarks: outspeeds / ties / underspeeds and neighbours', () => {
  const field = [{ key: 'A', spe: 100 }, { key: 'B', spe: 120 }, { key: 'C', spe: 150 }, { key: 'D', spe: 120 }, { key: 'E', spe: 90 }, { key: 'X', spe: null }];
  const b = speedBenchmarks(120, field);
  assert.deepEqual(b, { outspeeds: 2, ties: 2, underspeeds: 1, nextFaster: { key: 'C', spe: 150 }, nextSlower: { key: 'A', spe: 100 } });
  const top = speedBenchmarks(200, field);
  assert.equal(top.outspeeds, 5);
  assert.equal(top.nextFaster, null);
  const slow = speedBenchmarks(10, field);
  assert.equal(slow.nextSlower, null);
  assert.deepEqual(slow.nextFaster, { key: 'E', spe: 90 });
  assert.deepEqual(speedBenchmarks(100, []), { outspeeds: 0, ties: 0, underspeeds: 0, nextFaster: null, nextSlower: null });
});

test('nearestSpread: L1 distance, first wins ties, empty -> null', () => {
  const rows = [{ sp: [32, 32, 0, 0, 0, 2] }, { sp: [32, 32, 0, 0, 2, 0] }, { sp: [0, 0, 0, 0, 0, 32] }];
  assert.deepEqual(nearestSpread([32, 32, 0, 0, 0, 2], rows), { row: rows[0], dist: 0 });
  const n = nearestSpread([32, 30, 0, 0, 0, 2], rows);
  assert.equal(n.row, rows[0]);
  assert.equal(n.dist, 2);
  assert.equal(nearestSpread([32, 32, 0, 0, 1, 1], rows).row, rows[0]); // tie (2 vs 2) -> first
  assert.equal(nearestSpread([0, 0, 0, 0, 0, 30], rows).row, rows[2]);
  assert.equal(nearestSpread([0, 0, 0, 0, 0, 0], []), null);
});

test('metaSpeedField: real ranked speeds through metaSpeed, drops species without one', () => {
  const season = load('ranked-M-C.json').seasons[0];
  const f = metaSpeedField([{ key: 'Rillaboom' }, { key: 'Sneasler' }, { key: 'NotAMon' }], { season, merged: null }, dex);
  assert.deepEqual(f.map((x) => x.key), ['Rillaboom', 'Sneasler']);
  assert.ok(f.every((x) => Number.isInteger(x.spe) && x.spe > 0));
});
