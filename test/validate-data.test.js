import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAll } from '../scripts/validate.js';

// The weekly refresh runs this validator and commits nothing on any error, so committed data must always pass it
// (v1.5.5 changed the Pokédex roster without the validator and broke two refreshes).
test('committed public/data passes the pipeline validator', async () => {
  const errors = await validateAll(new URL('../public/data', import.meta.url).pathname);
  assert.deepEqual(errors, []);
});
