import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGULATIONS, REG_IDS, VGC_IDS, SHOWDOWN_IDS, inWindow, regForDate, listedRegs, pickCurrent, MIN_CURRENT_TEAMS } from '../scripts/lib/regs.js';
import { trimMon, rollingMonths } from '../scripts/sources/ladder.js';

test('showdown regs have no window and never match a date', () => {
  assert.deepEqual(SHOWDOWN_IDS, ['ND', 'NDD']);
  assert.deepEqual(VGC_IDS, ['M-A', 'M-B', 'M-C', 'M-D']);
  assert.equal(REG_IDS.length, 6);
  for (const id of SHOWDOWN_IDS) {
    assert.equal(REGULATIONS[id].start, undefined);
    assert.equal(REGULATIONS[id].level, 100);
    assert.equal(inWindow('2026-10-01', id), false);
  }
  for (const d of ['2026-04-08', '2026-07-01', '2026-10-01', '2030-01-01']) assert.notEqual(regForDate(d), 'ND');
  assert.equal(regForDate('2026-10-01'), 'M-C');
});

test('M-D: open-ended window starting the day M-C ends', () => {
  assert.equal(regForDate('2026-12-01'), 'M-C');
  assert.equal(regForDate('2026-12-02'), 'M-D');
  assert.equal(regForDate('2027-06-30'), 'M-D'); // end not announced: open-ended
  assert.equal(inWindow('2026-12-01', 'M-D'), false);
});

test('listedRegs: a VGC regulation is listed from its start date; Showdown regs always', () => {
  assert.deepEqual(listedRegs('2026-11-24'), ['M-A', 'M-B', 'M-C', 'ND', 'NDD']);
  assert.deepEqual(listedRegs('2026-12-02'), ['M-A', 'M-B', 'M-C', 'M-D', 'ND', 'NDD']);
});

test('pickCurrent: a new regulation becomes the default only once it has MIN_CURRENT_TEAMS teams', () => {
  const regs = (md) => [{ id: 'M-B', family: 'vgc', teams: 900 }, { id: 'M-C', family: 'vgc', teams: 15000 }, { id: 'ND', family: 'showdown', teams: 0 },
    ...(md == null ? [] : [{ id: 'M-D', family: 'vgc', teams: md }])];
  assert.equal(pickCurrent(regs(null)), 'M-C'); // before M-D starts
  assert.equal(pickCurrent(regs(0)), 'M-C'); // first days, no results yet
  assert.equal(pickCurrent(regs(MIN_CURRENT_TEAMS - 1)), 'M-C');
  assert.equal(pickCurrent(regs(MIN_CURRENT_TEAMS)), 'M-D');
  assert.equal(pickCurrent([{ id: 'M-A', family: 'vgc', teams: 0 }]), 'M-A');
  assert.equal(pickCurrent([]), null);
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

test('trimMon counters: object, array, empty shapes; n<30 dropped', () => {
  const c = (o) => trimMon({ 'Checks and Counters': o }, null).counters;
  assert.deepEqual(c({ Incineroar: { n: 100, p: 0.6, d: 0.05 }, Rare: { n: 5, p: 0.9, d: 0.1 } }), { Incineroar: [0.6, 0.05, 100] });
  assert.deepEqual(c({ Incineroar: [0.6, 0.05] }), { Incineroar: [0.6, 0.05, undefined] });
  assert.deepEqual(c({}), {});
});
