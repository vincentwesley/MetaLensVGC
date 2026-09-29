// Section jump strip (in the sticky bar) + how-to strip. Links never touch location.hash
// (it holds the dashboard state); they scroll to the section, which clears the sticky bar
// through html { scroll-padding-top }.

/** Current section = first one (page order) inside the viewport band; keeps `prev` when none is. */
export function pickCurrent(order, inBand, prev) {
  return order.find((id) => inBand.has(id)) ?? prev;
}

export function jumpTo(id) {
  document.querySelector(`main [data-section="${id}"]`)?.scrollIntoView({ block: 'start' });
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

  const inBand = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? inBand.add(e.target.dataset.section) : inBand.delete(e.target.dataset.section);
    if (!locked) setCurrent(pickCurrent(order, inBand, current));
  }, { rootMargin: '-20% 0px -60% 0px' }); // a band 20-40% down the viewport
  for (const id of order) { const el = document.querySelector(`main [data-section="${id}"]`); if (el) io.observe(el); }
}

const HOWTO = 'metalens.howtoDismissed';

export function isDismissed(storage) {
  try { return storage.getItem(HOWTO) === '1'; } catch { return false; }
}

export function dismiss(storage) {
  try { storage.setItem(HOWTO, '1'); } catch { /* storage unavailable: shown again next visit */ }
}

export function mountHowto(el) {
  let st = null;
  try { st = localStorage; } catch { /* blocked: the strip just shows every visit */ }
  if (st && isDismissed(st)) return;
  el.hidden = false;
  el.querySelector('.howto__close').addEventListener('click', () => { el.hidden = true; if (st) dismiss(st); });
}
