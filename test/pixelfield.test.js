import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, placeItems, itemState, bayer, blobDensity, blobEdge, hash } from '../public/js/lib/pixelfield-core.js';

test('pixel field: sprites are rectangular, placement is deterministic and on-canvas', () => {
  for (const rows of SPRITES) assert.ok(rows.every((r) => r.length === rows[0].length));
  for (const [w, h] of [[360, 225], [98, 211], [640, 360]]) {
    const a = placeItems(w, h);
    assert.deepEqual(a, placeItems(w, h));
    for (const it of a) { assert.ok(it.x >= 0 && it.x < w); assert.ok(it.y >= 0 && it.y < h); }
  }
  const s = itemState({ x: 10, y: 10 }, 3, 12.3);
  assert.ok(s.alpha >= 0 && s.alpha <= 1 && s.colour >= 0 && s.colour < 3);
  assert.ok(bayer(0, 0) > 0 && bayer(3, 3) < 1);
  assert.equal(blobDensity(10, 10), 0);
  assert.ok(hash(1, 2) >= 0 && hash(1, 2) < 1);
});

test('pixel field: blobEdge is the exact inverse of blobDensity (the paint loop relies on it)', () => {
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const r = 50, edge = r * blobEdge(bayer(i, j));
    assert.ok(blobDensity(edge - 0.01, r) > bayer(i, j));
    assert.ok(blobDensity(edge + 0.01, r) < bayer(i, j));
  }
});
