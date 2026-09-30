// ui/motion.js — the page's small transition layer (styles in the "motion" block of app.css).
// Rules: opacity/transform only, nothing waits on an animation (content is in the DOM
// before any of it runs), and all of it is off under prefers-reduced-motion.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionOK = () => !reduced.matches;

// Sections below the fold fade + rise the first time they scroll into view.
// Sections already on screen at load are never hidden (no flash on first paint).
export function installReveal(els) {
  if (!motionOK() || !('IntersectionObserver' in window)) return;
  const pending = els.filter((el) => el && el.getBoundingClientRect().top > innerHeight);
  if (!pending.length) return;
  const show = (el) => { el.dataset.reveal = 'in'; io.unobserve(el); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(e.target);
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of pending) { el.dataset.reveal = 'pending'; io.observe(el); }
  // Motion turned off mid-visit: show everything now (printing is handled in css).
  reduced.addEventListener?.('change', () => pending.forEach((el) => { if (el.dataset.reveal === 'pending') show(el); }));
}

// A section redrawn on screen: its new content eases up from a lower opacity.
// Web Animations, so there is no class to restart and no forced reflow.
export function settle(el) {
  if (!el || !motionOK() || !el.animate) return;
  el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.7,.3,1)' });
}

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
