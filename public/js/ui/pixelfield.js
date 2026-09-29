// Background pixel field (the owner's portfolio look): one fixed, low-resolution
// canvas behind the page, painted at 10 fps (6 on weak devices) from lib/pixelfield-core.js.
// The slow blob layer is cached and repainted every quarter second (half a second on
// weak devices, which also run at 6 fps): only motifs, sparkles and the trail move per frame.
// Colours come from the theme tokens (--surface-0 background, --fx-1/2/3).
// Paused while the tab is hidden or the dashboard is re-rendering; a single
// still frame under prefers-reduced-motion. Decorative only: aria-hidden, no
// pointer events, and never blocks first paint (starts when the page is idle).
import {
  CELL, FPS, SPRITES, SPRITE_ALPHA, BLOB_ALPHA, TRAIL_ALPHA, BACK_BLOB, LIGHT_GAIN,
  placeItems, itemState, blobs, blobPos, blobRadius, bayer, blobEdge,
  TRAIL_STEP, TRAIL_LIFE, TRAIL_MAX, trailAlpha,
} from '../lib/pixelfield-core.js';

const CLICK_LIFE = 0.45;
// Weak devices (<= 4 cores, or touch-first phones) get a slower loop.
const WEAK = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia('(pointer: coarse)').matches;
const FRAME_MS = 1000 / (WEAK ? 6 : FPS);
const BLOB_STEP = WEAK ? 0.5 : 0.25; // seconds between blob repaints

// The Credits card's CSS animations only run while it is on screen.
function watchCredits() {
  const card = document.querySelector('.creator');
  if (!card) return;
  if (!window.IntersectionObserver) { card.classList.add('is-live'); return; }
  new IntersectionObserver(([e]) => card.classList.toggle('is-live', e.isIntersecting)).observe(card);
}

export function installPixelField() {
  watchCredits();
  const root = document.documentElement;
  const region = document.createElement('div');
  region.className = 'fx-region';
  region.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  region.appendChild(canvas);
  document.body.prepend(region);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const layer = document.createElement('canvas'); // cached background + blobs
  const lctx = layer.getContext('2d', { alpha: false });
  let blobT = -1e9;
  const lim = new Float64Array(16);
  let scrollUntil = 0;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const c = { bg: '#000', c1: '#8fd15a', c2: '#e9a07f', c3: '#a996e0', dark: true };
  const pick = (n) => [c.c1, c.c2, c.c3][n % 3];
  let cols = 0, rows = 0, items = [], timer = 0, last = 0;
  const trail = [];
  const clicks = [];

  function readColors() {
    const cs = getComputedStyle(root);
    const get = (n, d) => cs.getPropertyValue(n).trim() || d;
    c.bg = get('--surface-0', c.bg);
    c.c1 = get('--fx-1', get('--accent', c.c1));
    c.c2 = get('--fx-2', c.c1);
    c.c3 = get('--fx-3', c.c1);
    c.dark = cs.colorScheme.includes('dark');
  }

  function paintBlobs(t, k) {
    lctx.globalAlpha = 1;
    lctx.fillStyle = c.bg;
    lctx.fillRect(0, 0, cols, rows);
    // Dithered blobs: an ordered-dither pattern of 2x2 cells inside each soft circle.
    blobs(cols, rows).forEach((b, n) => {
      const p = blobPos(b, cols, rows, n, t);
      const r = blobRadius(b, n, t);
      lctx.fillStyle = pick(n);
      lctx.globalAlpha = BLOB_ALPHA * k * (n > 2 ? BACK_BLOB : 1);
      lctx.beginPath(); // one path per blob: thousands of separate fillRect calls cost far more
      for (let i = 0; i < 16; i++) lim[i] = (r * blobEdge(bayer(i & 3, i >> 2))) ** 2; // squared reach per dither cell
      for (let y = Math.max(0, Math.floor((p.y - r) / 2)); y * 2 < Math.min(rows, p.y + r); y++) {
        const dy2 = (y * 2 + 1 - p.y) ** 2;
        for (let x = Math.max(0, Math.floor((p.x - r) / 2)); x * 2 < Math.min(cols, p.x + r); x++) {
          const dx = x * 2 + 1 - p.x;
          if (dx * dx + dy2 < lim[(y & 3) * 4 + (x & 3)]) lctx.rect(x * 2, y * 2, 2, 2);
        }
      }
      lctx.fill();
    });
    blobT = t;
  }

  function draw(t) {
    const k = c.dark ? 1 : LIGHT_GAIN;
    if (t - blobT >= BLOB_STEP || t < blobT) paintBlobs(t, k);
    ctx.globalAlpha = 1;
    ctx.drawImage(layer, 0, 0);
    // Motifs and sparkle bursts.
    items.forEach((it, i) => {
      const s = itemState(it, i, t);
      if (!s.alpha) return;
      ctx.fillStyle = pick(s.colour);
      ctx.globalAlpha = s.alpha * SPRITE_ALPHA * k;
      if (it.burst) {
        const a = s.arm;
        ctx.fillRect(s.x + 5 - a, s.y + 5, 2 * a + 1, 1);
        ctx.fillRect(s.x + 5, s.y + 5 - a, 1, 2 * a + 1);
        ctx.fillRect(s.x + 4, s.y + 4, 3, 3);
        return;
      }
      ctx.beginPath();
      SPRITES[it.sprite].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.rect(s.x + x * it.scale, s.y + y * it.scale, it.scale, it.scale);
      });
      ctx.fill();
    });
    // Cursor trail.
    const now = performance.now() / 1000;
    while (trail.length && now - trail[0].born >= TRAIL_LIFE) trail.shift();
    for (const d of trail) {
      ctx.fillStyle = pick(d.c);
      ctx.globalAlpha = trailAlpha(now - d.born) * TRAIL_ALPHA * k;
      ctx.fillRect(d.x, d.y, 2, 2);
    }
    // Click bursts: a bigger, brighter blocky sparkle at each recent tap.
    for (let i = clicks.length - 1; i >= 0; i--) {
      const cl = clicks[i];
      const age = t - cl.born;
      if (age < 0 || age >= CLICK_LIFE) { clicks.splice(i, 1); continue; }
      const p = age / CLICK_LIFE;
      const a = Math.round(1 + 7 * p);
      ctx.fillStyle = pick(cl.c);
      ctx.globalAlpha = (1 - p) * SPRITE_ALPHA * 2.5 * k;
      ctx.fillRect(cl.x - a, cl.y, 2 * a + 1, 1);
      ctx.fillRect(cl.x, cl.y - a, 1, 2 * a + 1);
      ctx.fillRect(cl.x - 1, cl.y - 1, 3, 3);
    }
  }

  function resize() {
    const w = Math.max(1, Math.ceil(innerWidth / CELL));
    const h = Math.max(1, Math.ceil(innerHeight / CELL));
    if (w === cols && h === rows) return;
    cols = canvas.width = layer.width = w;
    rows = canvas.height = layer.height = h;
    blobT = -1e9;
    items = placeItems(w, h);
    draw(last / 1000);
  }

  const running = () => !reduce.matches && !document.hidden;
  // A timer, not a rAF loop: an always-scheduled rAF keeps the browser producing 60 frames a second
  // even when the canvas only changes 8-15 times.
  function frame() {
    timer = setTimeout(frame, FRAME_MS);
    // Sections re-rendering after a filter click get the CPU first.
    if (root.hasAttribute('data-rendering')) return;
    if (performance.now() < scrollUntil) return; // keep the main thread free while the page scrolls
    last = performance.now();
    draw(last / 1000);
  }
  function sync() {
    clearTimeout(timer);
    timer = 0;
    if (running()) { timer = setTimeout(frame, FRAME_MS); return; }
    draw(last / 1000);
  }

  function start() {
    readColors();
    resize();
    region.dataset.ready = '';
    sync();
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);
    addEventListener('scroll', () => { scrollUntil = performance.now() + 150; }, { passive: true });
    let pending = 0;
    addEventListener('resize', () => { clearTimeout(pending); pending = setTimeout(resize, 150); });
    const recolor = () => { readColors(); blobT = -1e9; draw(last / 1000); };
    new MutationObserver(recolor).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let lx = -999, ly = -999;
      addEventListener('pointermove', (e) => {
        if (!running() || e.pointerType !== 'mouse' || Math.hypot(e.clientX - lx, e.clientY - ly) < TRAIL_STEP) return;
        lx = e.clientX; ly = e.clientY;
        trail.push({ x: Math.floor(e.clientX / CELL), y: Math.floor(e.clientY / CELL), born: performance.now() / 1000, c: trail.length });
        if (trail.length > TRAIL_MAX) trail.shift();
      }, { passive: true });
    }
    document.addEventListener('pointerdown', (e) => {
      if (!running()) return;
      clicks.push({ x: Math.floor(e.clientX / CELL), y: Math.floor(e.clientY / CELL), born: last / 1000, c: clicks.length });
      if (clicks.length > 4) clicks.shift();
    });
  }
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 300));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}
