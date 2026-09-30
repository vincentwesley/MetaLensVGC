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

// Cross-fade a whole-page restyle (skin / theme) where View Transitions exist.
export function crossfade(fn) {
  if (!motionOK() || !document.startViewTransition) { fn(); return; }
  document.startViewTransition(fn);
}
