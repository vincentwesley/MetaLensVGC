import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Owner rule (CLAUDE.md "Real data only"): an empty state is titled with what is missing, never "Insufficient data".
test('no section titles an empty state "Insufficient data"', () => {
  const dir = new URL('../public/js/sections/', import.meta.url);
  const hits = readdirSync(dir).filter((f) => f.endsWith('.js') && readFileSync(new URL(f, dir), 'utf8').includes('Insufficient data'));
  assert.deepEqual(hits, []);
});
