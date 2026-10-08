import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGULATIONS, REG_IDS, VGC_IDS, SHOWDOWN_IDS, inWindow, regForDate } from '../scripts/lib/regs.js';
import { trimMon, rollingMonths } from '../scripts/sources/ladder.js';

test('showdown regs have no window and never match a date', () => {
  assert.deepEqual(SHOWDOWN_IDS, ['ND', 'NDD']);
  assert.deepEqual(VGC_IDS, ['M-A', 'M-B', 'M-C']);
  assert.equal(REG_IDS.length, 5);
  for (const id of SHOWDOWN_IDS) {
    assert.equal(REGULATIONS[id].start, undefined);
    assert.equal(REGULATIONS[id].level, 100);
    assert.equal(inWindow('2026-10-01', id), false);
  }
  for (const d of ['2026-04-08', '2026-07-01', '2026-10-01', '2030-01-01']) assert.notEqual(regForDate(d), 'ND');
  assert.equal(regForDate('2026-10-01'), 'M-C');
});

test('trimMon keeps top 12 Tera Types as fractions; empty for Champions', () => {
  const raw = { usage: 0.1, 'Raw count': 5, 'Tera Types': { Fire: 3, Water: 1 } };
  assert.deepEqual(trimMon(raw, null).teraTypes, { Fire: 0.75, Water: 0.25 });
  const many = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`T${i}`, i + 1]));
  assert.equal(Object.keys(trimMon({ usage: 1, 'Tera Types': many }, null).teraTypes).length, 12);
  assert.deepEqual(trimMon({ usage: 1 }, null).teraTypes, {});
});

test('rollingMonths = current + 2 before, across year boundary', () => {
  assert.deepEqual(rollingMonths(new Date('2027-01-15T00:00:00Z')), ['2026-11', '2026-12', '2027-01']);
});
