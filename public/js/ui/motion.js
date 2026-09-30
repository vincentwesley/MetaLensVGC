// ui/motion.js — the page's small motion helpers (styles in the "motion" and "fireflies" blocks of app.css).
// Rules: opacity/transform only, nothing waits on an animation (content is in the DOM
// before any of it runs), all of it off under prefers-reduced-motion, and one signal per
// user action (see the motion budget in CLAUDE.md).

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionOK = () => !reduced.matches;

// Decorative CSS loops (fireflies) run only while their host is on screen: .is-live
// sets animation-play-state: running (see the firefly rules in app.css).
export function liveWhenVisible(el) {
  if (!el) return;
  if (!window.IntersectionObserver) { el.classList.add('is-live'); return; }
  new IntersectionObserver(([e]) => el.classList.toggle('is-live', e.isIntersecting)).observe(el);
}

// A few firefly <i>s for a .ff-layer; each gets its own spot, drift and blink.
// spots: [x%, y%] pairs; the rest is varied deterministically so renders don't jump around.
export function fireflies(spots) {
  const layer = document.createElement('span');
  layer.className = 'ff-layer';
  layer.setAttribute('aria-hidden', 'true');
  spots.forEach(([x, y], i) => {
    const f = document.createElement('i');
    const k = (i * 37) % 11;
    f.style.cssText = `--x:${x}%;--y:${y}%;--s:${i % 3 ? 3 : 4}px;--dx:${(k - 5) * 3}px;--dy:${-8 - k * 2}px;`
      + `--d:${5 + k * 0.6}s;--b:${3.2 + (k % 4) * 0.7}s;--delay:${-k * 0.9}s`;
    layer.appendChild(f);
  });
  return layer;
}

// Cross-fade a whole-page restyle (skin / theme) where View Transitions exist.
export function crossfade(fn) {
  if (!motionOK() || !document.startViewTransition) { fn(); return; }
  document.startViewTransition(fn);
}
