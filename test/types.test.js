import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, TYPE_COLORS, effectiveness } from '../public/js/lib/types.js';

test('TYPES: 18 standard Gen 9 types incl. Fairy', () => {
  assert.equal(TYPES.length, 18);
  assert.ok(TYPES.includes('Fairy'));
});

test('TYPE_COLORS: hex color for every type', () => {
  for (const t of TYPES) assert.match(TYPE_COLORS[t], /^#[0-9A-Fa-f]{6}$/);
});

test('Ground vs Charizard (Fire/Flying) = 0 (immune)', () => {
  assert.equal(effectiveness('Ground', ['Fire', 'Flying']), 0);
});

test('Ice vs Garchomp (Dragon/Ground) = 4 (double weak)', () => {
  assert.equal(effectiveness('Ice', ['Dragon', 'Ground']), 4);
});

test('Fighting vs Kingambit (Dark/Steel) = 4 (double weak)', () => {
  assert.equal(effectiveness('Fighting', ['Dark', 'Steel']), 4);
});

test('Electric vs Ground-type = 0 (immune)', () => {
  assert.equal(effectiveness('Electric', ['Ground']), 0);
});

test('Normal vs Ghost = 0, vs Rock = 0.5', () => {
  assert.equal(effectiveness('Normal', ['Ghost']), 0);
  assert.equal(effectiveness('Normal', ['Rock']), 0.5);
});

test('Fire vs Fairy = 1 (neutral, no interaction)', () => {
  assert.equal(effectiveness('Fire', ['Fairy']), 1);
});

test('Water vs Fire/Rock = 4', () => {
  assert.equal(effectiveness('Water', ['Fire', 'Rock']), 4);
});
