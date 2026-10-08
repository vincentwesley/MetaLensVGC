import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRefresh, daysLeft, fmtDuration } from '../public/js/lib/clock.js';

const iso = (d) => d.toISOString();

test('nextRefresh: next Monday 00:00 UTC, strictly after now', () => {
  assert.equal(iso(nextRefresh(new Date('2026-10-07T12:00:00Z'))), '2026-10-12T00:00:00.000Z'); // Wed
  assert.equal(iso(nextRefresh(new Date('2026-10-11T23:59:59Z'))), '2026-10-12T00:00:00.000Z'); // Sun
  assert.equal(iso(nextRefresh(new Date('2026-10-12T00:00:00Z'))), '2026-10-19T00:00:00.000Z'); // exactly Monday 00:00
  assert.equal(iso(nextRefresh(new Date('2026-10-12T00:00:01Z'))), '2026-10-19T00:00:00.000Z');
  assert.equal(iso(nextRefresh(new Date('2026-12-30T10:00:00Z'))), '2027-01-04T00:00:00.000Z'); // year rollover
});

test('daysLeft rounds up and goes <= 0 once past', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert.equal(daysLeft('2026-12-02', now), 55);
  assert.equal(daysLeft('2026-10-09', now), 1);
  assert.ok(daysLeft('2026-10-01', now) <= 0);
  assert.equal(daysLeft('nope', now), 0);
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(((3 * 24 + 4) * 60 + 7) * 60000), '3d 4h');
  assert.equal(fmtDuration((5 * 60 + 12) * 60000), '5h 12m');
  assert.equal(fmtDuration(42 * 60000), '42m');
  assert.equal(fmtDuration(-5), '0m');
});
