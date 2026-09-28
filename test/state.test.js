import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, toHash, fromHash } from '../public/js/lib/state-core.js';

test('DEFAULT_STATE: reg defaults to M-C', () => {
  assert.equal(DEFAULT_STATE.reg, 'M-C');
});

test('toHash: all-default state -> empty string', () => {
  assert.equal(toHash(DEFAULT_STATE), '');
});

test('toHash/fromHash round-trip: simple non-default fields', () => {
  const state = { ...DEFAULT_STATE, reg: 'M-B', place: 'topcut', minN: 50, chips: [] };
  const hash = toHash(state);
  const back = fromHash(hash);
  assert.equal(back.reg, 'M-B');
  assert.equal(back.place, 'topcut');
  assert.equal(back.minN, 50);
});

test('toHash/fromHash round-trip: chips incl. spaces, special chars, negation, core array', () => {
  const state = {
    ...DEFAULT_STATE,
    chips: [
      { kind: 'species', value: 'Garchomp', neg: false },
      { kind: 'item', value: 'Life Orb', neg: true },
      { kind: 'core', value: ['Garchomp', 'Kingambit', 'Whimsicott'], neg: false },
    ],
  };
  const hash = toHash(state);
  assert.ok(hash.includes('chips='));
  const back = fromHash(hash);
  assert.deepEqual(back.chips, state.chips);
});

test('fromHash: tolerant of garbage / unknown keys', () => {
  const back = fromHash('bogus&&reg=M-A&unknownKey=whatever&minN=notanumber');
  assert.equal(back.reg, 'M-A');
  assert.equal(back.minN, DEFAULT_STATE.minN); // invalid number ignored, default kept
});

test('fromHash: empty/undefined hash -> defaults', () => {
  assert.deepEqual(fromHash(''), { ...DEFAULT_STATE, chips: [] });
  assert.deepEqual(fromHash(undefined), { ...DEFAULT_STATE, chips: [] });
});

test('toHash: tiers array compared order-independently', () => {
  const state = { ...DEFAULT_STATE, tiers: [...DEFAULT_STATE.tiers].reverse() };
  assert.equal(toHash(state), '');
});
