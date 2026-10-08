import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dexList } from '../public/js/lib/pokedex.js';

const dex = { species: {
  Aaa: { num: 3, types: ['Fire'], bs: [1, 1, 1, 1, 1, 50] },
  Bbb: { num: 1, types: ['Fire', 'Flying'], bs: [1, 1, 1, 1, 1, 100] },
  Ccc: { num: 2, types: ['Water'], bs: [1, 1, 1, 1, 1, 70] },
} };
const keys = ['Aaa', 'Bbb', 'Ccc'];
const use = new Map([['Ccc', 9], ['Aaa', 2]]);

test('dexList sorts and filters', () => {
  assert.deepEqual(dexList(keys, dex, use), ['Ccc', 'Aaa', 'Bbb']); // no-usage last
  assert.deepEqual(dexList(keys, dex, use, { sort: 'name' }), keys);
  assert.deepEqual(dexList(keys, dex, use, { sort: 'dex' }), ['Bbb', 'Ccc', 'Aaa']);
  assert.deepEqual(dexList(keys, dex, use, { sort: 'speed' }), ['Bbb', 'Ccc', 'Aaa']);
  assert.deepEqual(dexList(keys, dex, use, { q: 'cc' }), ['Ccc']);
  assert.deepEqual(dexList(keys, dex, use, { types: ['Fire'], sort: 'name' }), ['Aaa', 'Bbb']);
  assert.deepEqual(dexList(keys, dex, use, { types: ['Fire', 'Water'] }), []);
});
