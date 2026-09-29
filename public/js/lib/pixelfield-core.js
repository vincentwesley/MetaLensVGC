// Pure logic of the background pixel field: soft dithered colour blobs, tiny
// procedural pixel-art motifs drifting slowly, blocky sparkle bursts and a
// cursor trail. Ported from the owner's portfolio (vwesley.dev, restructure
// branch: src/lib/fx-sprites.ts + fx-canvas.ts), trimmed to what the dashboard
// uses and given a Pokémon flavour (Poké Ball, star, heart, game pad...).
// No DOM: js/ui/pixelfield.js paints it.

export const CELL = 4; // CSS pixels per canvas pixel (tiny canvas, scaled up unsmoothed)
export const FPS = 15;
export const SPRITE_ALPHA = 0.09; // strongest sprite, dark theme
export const BLOB_ALPHA = 0.055; // dithered blob, dark theme
export const TRAIL_ALPHA = 0.09;
export const BACK_BLOB = 0.2; // share of BLOB_ALPHA for the backmost extra blobs (index 3+)
export const LIGHT_GAIN = 1.4; // light themes: brighter tints read better on a pale background

/** Sprites: one string per row, `#` is a lit pixel. */
export const SPRITES = [
  ['..###..', '.#...#.', '#.....#', '###.###', '#.....#', '.#...#.', '..###..'], // Poké Ball
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], // heart
  ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], // star
  ['.#######.', '#.#####.#', '###...###', '#.#####.#', '#########', '.##...##.'], // game pad
  ['#####', '#...#', '#.#.#', '#...#', '#.#.#', '#...#', '#####'], // card
  ['..#..', '..#..', '.###.', '#####', '#####', '#####', '.###.'], // drop
  ['#...#', '##.##', '.###.', '.#.#.', '.###.', '..#..'], // little critter
];

/** Small integer hash, 0..1. */
export function hash(a, b = 0) {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export const spriteSize = (i, scale) => {
  const rows = SPRITES[i % SPRITES.length];
  return { w: rows[0].length * scale, h: rows.length * scale };
};

/** How many motifs for a canvas this wide (sparse on purpose). */
export const itemCount = (cols) => (cols >= 200 ? 16 : cols >= 120 ? 11 : 7);
const DRIFT = 6;
const TRAVEL = 70; // canvas pixels a motif glides across during one cycle

/** Dart-throwing placement: boxes never clump. Deterministic (seeded). */
export function placeBoxes(cols, rows, boxes, seed = 23, drift = DRIFT) {
  const margin = drift + 2;
  const out = [];
  let r = 0.62 * Math.sqrt((cols * rows) / Math.max(1, boxes.length));
  let n = 0;
  boxes.forEach((box) => {
    for (let tries = 0; ; tries++) {
      if (tries > 300) { r *= 0.9; tries = 0; }
      const x = Math.floor(margin + hash(seed, n++) * Math.max(1, cols - box.w - 2 * margin));
      const y = Math.floor(margin + hash(seed + 1, n++) * Math.max(1, rows - box.h - 2 * margin));
      const cx = x + box.w / 2;
      const cy = y + box.h / 2;
      const clear = out.every((d, j) => {
        const b = boxes[j];
        const dx = Math.abs(d.x + b.w / 2 - cx);
        const dy = Math.abs(d.y + b.h / 2 - cy);
        const apart = dx >= (b.w + box.w) / 2 + drift || dy >= (b.h + box.h) / 2 + drift;
        return apart && Math.hypot(dx, dy) >= r;
      });
      if (clear || r < 8) { out.push({ x, y }); break; }
    }
  });
  return out;
}

/** Motif kinds spread evenly (every third is a sparkle burst). */
export function placeItems(cols, rows, count = itemCount(cols)) {
  const kinds = Array.from({ length: count }, (_, i) => ({
    sprite: i % SPRITES.length, scale: cols >= 120 && i % 3 === 0 ? 3 : 2, burst: i % 3 === 2,
  }));
  const boxes = kinds.map((k) => (k.burst ? { w: 11, h: 11 } : spriteSize(k.sprite, k.scale)));
  return placeBoxes(cols, rows, boxes).map((p, i) => ({ ...p, ...kinds[i] }));
}

const q = (v, steps) => Math.floor(Math.max(0, Math.min(0.999, v)) * steps) / (steps - 1);

/** Motif `i` at time t: a slow glide (14-24 s a cycle), a gentle bob, a stepped fade in and out; bursts twinkle. */
export function itemState(it, i, t) {
  const period = 14 + ((i * 7) % 11);
  const c = t / period + hash(i, 5);
  const f = c - Math.floor(c);
  const s = Math.sin(Math.PI * f);
  const dir = i % 2 ? -1 : 1;
  return {
    x: it.x + Math.round(dir * (f - 0.5) * TRAVEL + Math.sin(t * 0.5 + i * 1.9) * 3),
    y: it.y - Math.round(f * 12) + Math.round(Math.sin(t * 0.8 + i * 2.3) * 2),
    alpha: q(s * s, 5),
    arm: Math.round(3 + 2 * Math.sin(t * 2.4 + i * 1.3)),
    colour: Math.floor(c + i) % 3,
  };
}

export const blobs = (cols, rows) => {
  const r = Math.round(Math.min(cols, rows * 1.4) * 0.22);
  return [
    { x: 0.14, y: 0.78, r },
    { x: 0.86, y: 0.3, r: Math.round(r * 0.8) },
    { x: 0.55, y: 0.98, r: Math.round(r * 0.9) },
    { x: 0.05, y: 0.2, r: Math.round(r * 1.4) },
    { x: 0.95, y: 0.75, r: Math.round(r * 1.4) },
  ];
};
/** Each blob wanders slowly in a small ellipse. */
export const blobPos = (b, cols, rows, n, t) => ({
  x: b.x * cols + Math.sin(t * 0.1 + n * 2.1) * cols * 0.07,
  y: b.y * rows + Math.cos(t * 0.12 + n * 1.3) * rows * 0.07,
});
/** Radius breathing (about 14 s a cycle, +-14%). */
export const blobRadius = (b, n, t) => b.r * (1 + 0.14 * Math.sin(t * 0.45 + n * 2));

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold 0..1 for dither cell (i, j). */
export const bayer = (i, j) => (BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16;
/** Blob density 0..1 at distance d from the centre (soft edge). */
export const blobDensity = (d, r) => Math.pow(Math.max(0, 1 - d / r), 1.4);

export const TRAIL_STEP = 22; // CSS px the pointer moves per new trail dot
export const TRAIL_LIFE = 1.5; // seconds
export const TRAIL_MAX = 24;
export const trailAlpha = (age) => (age >= TRAIL_LIFE || age < 0 ? 0 : q(1 - age / TRAIL_LIFE, 4));
