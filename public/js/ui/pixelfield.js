// Background pixel field (the owner's portfolio look): one fixed, low-resolution
// canvas behind the page, painted at 15 fps from lib/pixelfield-core.js.
// Colours come from the theme tokens (--surface-0 background, --fx-1/2/3).
// Paused while the tab is hidden or the dashboard is re-rendering; a single
// still frame under prefers-reduced-motion. Decorative only: aria-hidden, no
// pointer events, and never blocks first paint (starts when the page is idle).
import {
  CELL, FPS, SPRITES, SPRITE_ALPHA, BLOB_ALPHA, TRAIL_ALPHA, BACK_BLOB, LIGHT_GAIN,
  placeItems, itemState, blobs, blobPos, blobRadius, bayer, blobDensity,
  TRAIL_STEP, TRAIL_LIFE, TRAIL_MAX, trailAlpha,
} from '../lib/pixelfield-core.js';

const CLICK_LIFE = 0.45;

export function installPixelField() {
  const root = document.documentElement;
  const region = document.createElement('div');
  region.className = 'fx-region';
  region.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  region.appendChild(canvas);
  document.body.prepend(region);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const c = { bg: '#000', c1: '#8fd15a', c2: '#e9a07f', c3: '#a996e0', dark: true };
  const pick = (n) => [c.c1, c.c2, c.c3][n % 3];
  let cols = 0, rows = 0, items = [], raf = 0, last = 0;
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

  function draw(t) {
    const k = c.dark ? 1 : LIGHT_GAIN;
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, cols, rows);
    // Dithered blobs: an ordered-dither pattern of 2x2 cells inside each soft circle.
    blobs(cols, rows).forEach((b, n) => {
      const p = blobPos(b, cols, rows, n, t);
      const r = blobRadius(b, n, t);
      ctx.fillStyle = pick(n);
      ctx.globalAlpha = BLOB_ALPHA * k * (n > 2 ? BACK_BLOB : 1);
      for (let y = Math.max(0, Math.floor((p.y - r) / 2)); y * 2 < Math.min(rows, p.y + r); y++) {
        for (let x = Math.max(0, Math.floor((p.x - r) / 2)); x * 2 < Math.min(cols, p.x + r); x++) {
          if (blobDensity(Math.hypot(x * 2 + 1 - p.x, y * 2 + 1 - p.y), r) > bayer(x, y)) ctx.fillRect(x * 2, y * 2, 2, 2);
        }
      }
    });
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
      SPRITES[it.sprite].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(s.x + x * it.scale, s.y + y * it.scale, it.scale, it.scale);
      });
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
    cols = canvas.width = w;
    rows = canvas.height = h;
    items = placeItems(w, h);
    draw(last / 1000);
  }

  const running = () => !reduce.matches && !document.hidden;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS - 6) return;
    // Sections re-rendering after a filter click get the CPU first.
    if (root.hasAttribute('data-rendering')) return;
    last = now;
    draw(now / 1000);
  }
  function sync() {
    if (running()) { raf ||= requestAnimationFrame(frame); return; }
    cancelAnimationFrame(raf);
    raf = 0;
    draw(last / 1000);
  }

  function start() {
    readColors();
    resize();
    region.dataset.ready = '';
    sync();
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);
    let pending = 0;
    addEventListener('resize', () => { clearTimeout(pending); pending = setTimeout(resize, 150); });
    const recolor = () => { readColors(); draw(last / 1000); };
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
