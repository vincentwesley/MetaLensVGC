import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStale } from '../public/js/lib/stale.js';

test('isStale: older than 10 days only', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  assert.equal(isStale('2026-10-09T00:00:00Z', now), true);
  assert.equal(isStale('2026-10-10T00:00:00Z', now), false); // exactly 10 days
  assert.equal(isStale('2026-10-19T00:00:00Z', now), false);
  assert.equal(isStale('2026-10-01T00:00:00Z', now, 30), false);
  assert.equal(isStale(undefined, now), false);
  assert.equal(isStale('garbage', now), false);
});
