// Section jump strip (in the sticky bar) + how-to strip. Links never touch location.hash
// (it holds the dashboard state); they scroll to the section, which clears the sticky bar
// through html { scroll-padding-top }.

/** Current section = first one (page order) inside the viewport band; keeps `prev` when none is. */
export function pickCurrent(order, inBand, prev) {
  return order.find((id) => inBand.has(id)) ?? prev;
}

// A section whose cards join the main grid (display: contents) has no box, and scrollIntoView on it does nothing:
// jump to its first card instead.
export function jumpTo(id) {
  const el = document.querySelector(`main [data-section="${id}"]`);
  const target = el && getComputedStyle(el).display === 'contents' ? el.querySelector('.card') : el;
  target?.scrollIntoView({ block: 'start' });
}

export function mountSecnav(nav) {
  const links = new Map([...nav.querySelectorAll('a[data-jump]')].map((a) => [a.dataset.jump, a]));
  const order = [...links.keys()];
  let current = null;
  let locked = false; // after a click, keep the clicked link until the user scrolls by hand

  function setCurrent(id) {
    if (id === current) return;
    current = id;
    for (const [k, a] of links) if (k === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    const a = links.get(id);
    if (a) nav.scrollLeft = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2; // horizontal only
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-jump]');
    if (!a) return;
    e.preventDefault();
    if (links.has(a.dataset.jump)) { locked = true; setCurrent(a.dataset.jump); }
    jumpTo(a.dataset.jump);
  });
  for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, () => { locked = false; }, { passive: true });

  // Each section and its cards are observed (a display: contents section only has its cards' boxes); a section is
  // in the band while any of its targets is.
  const hits = new Map(); // section id -> Set of targets in the band
  const inBand = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.closest('[data-section]').dataset.section;
      const set = hits.get(id) || new Set();
      hits.set(id, set);
      if (e.isIntersecting) set.add(e.target); else set.delete(e.target);
      if (set.size) inBand.add(id); else inBand.delete(id);
    }
    if (!locked) setCurrent(pickCurrent(order, inBand, current));
  }, { rootMargin: '-20% 0px -60% 0px' }); // a band 20-40% down the viewport
  const sections = order.map((id) => document.querySelector(`main [data-section="${id}"]`)).filter(Boolean);
  for (const el of sections) io.observe(el);
  // Cards are built when the sections mount, after this runs: main.js calls observeCards() then.
  return { observeCards() { for (const el of sections) for (const card of el.querySelectorAll(':scope > .section__mount > .card')) io.observe(card); } };
}

const HOWTO = 'metalens.howtoDismissed';

export function isDismissed(storage) {
  try { return storage.getItem(HOWTO) === '1'; } catch { return false; }
}

export function dismiss(storage) {
  try { storage.setItem(HOWTO, '1'); } catch { /* storage unavailable: shown again next visit */ }
}

export function undismiss(storage) {
  try { storage.removeItem(HOWTO); } catch { /* ignore */ }
}

export function mountHowto(el) {
  let st = null;
  try { st = localStorage; } catch { /* blocked: the strip just shows every visit */ }
  el.querySelector('.howto__close').addEventListener('click', () => { el.hidden = true; if (st) dismiss(st); });
  el.hidden = !!(st && isDismissed(st));
  document.documentElement.removeAttribute('data-howto-off');
}
