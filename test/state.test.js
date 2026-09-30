import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, toHash, fromHash, sanitizeState } from '../public/js/lib/state-core.js';

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

test('toHash/fromHash round-trip: source=ranked', () => {
  const back = fromHash(toHash({ ...DEFAULT_STATE, source: 'ranked', chips: [] }));
  assert.equal(back.source, 'ranked');
});

test('sanitizeState: hand-edited hashes become a valid state', () => {
  const regs = ['M-A', 'M-B', 'M-C'];
  const s = sanitizeState(fromHash('reg=M-Z&source=x&place=q&skin=a&theme=b&tiers=foo,online,online&from=2026-13-45&to=abc&minN=-5'
    + '&chips=species:A,species:A,bogus:x,type:,core:Solo,item:Life%20Orb,!core:A+B'), { regs });
  assert.equal(s.reg, 'M-C');
  assert.equal(s.source, 'tournaments');
  assert.equal(s.place, 'all');
  assert.equal(s.skin, 'pro');
  assert.equal(s.theme, 'dark');
  assert.deepEqual(s.tiers, ['online']);
  assert.equal(s.from, '');
  assert.equal(s.to, '');
  assert.equal(s.minN, 0);
  assert.deepEqual(s.chips, [
    { kind: 'species', value: 'A', neg: false },
    { kind: 'species', value: 'Solo', neg: false }, // a one-key core is a species chip
    { kind: 'item', value: 'Life Orb', neg: false },
    { kind: 'core', value: ['A', 'B'], neg: true },
  ]);
});

test('sanitizeState: reversed date range is swapped, minN clamped, valid state untouched', () => {
  const s = sanitizeState({ ...DEFAULT_STATE, from: '2026-09-20', to: '2026-09-10', minN: 9999 });
  assert.equal(s.from, '2026-09-10');
  assert.equal(s.to, '2026-09-20');
  assert.equal(s.minN, 200);
  assert.equal(sanitizeState({ ...DEFAULT_STATE, from: '2026-02-30' }).from, '');
  const ok = { ...DEFAULT_STATE, reg: 'M-B', chips: [{ kind: 'core', value: ['A', 'B'], neg: false }] };
  assert.deepEqual(sanitizeState(ok, { regs: ['M-A', 'M-B', 'M-C'] }), ok);
  // A regulation id that is not known yet (manifest not loaded) is kept.
  assert.equal(sanitizeState({ ...DEFAULT_STATE, reg: 'M-D' }).reg, 'M-D');
});

test('sanitizeState: country chips are ISO-2 codes (uppercased); anything else is dropped; they round-trip the hash', () => {
  const s = sanitizeState({ ...DEFAULT_STATE, chips: [{ kind: 'country', value: 'br' }, { kind: 'country', value: 'Brazil' }, { kind: 'country', value: 'U1' }] }, {});
  assert.deepEqual(s.chips, [{ kind: 'country', value: 'BR', neg: false }]);
  const back = sanitizeState(fromHash(toHash(s), DEFAULT_STATE), {});
  assert.deepEqual(back.chips, s.chips);
});
