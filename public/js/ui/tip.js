// One shared tooltip for every [data-tip] element (help labels, disabled source
// buttons, KPI tiles). Positioned in JS so it wraps and stays on screen: above
// the element when there is room, below otherwise, clamped to the viewport's
// sides. Shown on hover and on keyboard focus / tap; Escape hides it.

const MARGIN = 8;

export function clampTip(anchor, tip, vw, vh) {
  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(MARGIN, Math.min(left, vw - MARGIN - tip.width));
  let top = anchor.top - tip.height - 6;
  if (top < MARGIN) top = anchor.bottom + 6;
  if (top + tip.height > vh - MARGIN) top = Math.max(MARGIN, vh - MARGIN - tip.height);
  return { left: Math.round(left), top: Math.round(top) };
}

export function installTips(root = document) {
  const el = document.createElement('div');
  el.className = 'tip';
  el.id = 'tip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  let current = null;

  function show(target) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    current = target;
    el.textContent = text;
    el.hidden = false;
    target.setAttribute('aria-describedby', 'tip');
    place();
  }
  function place() {
    if (!current) return;
    const pos = clampTip(current.getBoundingClientRect(), el.getBoundingClientRect(), innerWidth, innerHeight);
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
  }
  function hide() {
    if (current?.getAttribute('aria-describedby') === 'tip') current.removeAttribute('aria-describedby');
    current = null;
    el.hidden = true;
  }
  const find = (e) => e.target instanceof Element && e.target.closest('[data-tip]');

  root.addEventListener('pointerover', (e) => {
    const t = find(e);
    if (t && t !== current) show(t); else if (!t && current) hide();
  });
  root.addEventListener('pointerout', (e) => { if (!e.relatedTarget && current) hide(); });
  root.addEventListener('focusin', (e) => { const t = find(e); if (t) show(t); else hide(); });
  root.addEventListener('focusout', hide);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  // Keyboard focus scrolls the page after focusin: follow the element then.
  // Scrolls of unrelated containers (e.g. the section nav following the page)
  // don't move the anchor, so they leave the tip alone; a still-hovered or
  // focused anchor is followed while it stays on screen.
  const onMove = (e) => {
    if (!current) return;
    const src = e?.target;
    if (e?.type === 'scroll' && src instanceof Element && !src.contains(current)) return;
    const r = current.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    if (onScreen && (document.activeElement === current || current.matches(':hover'))) place(); else hide();
  };
  window.addEventListener('scroll', onMove, { passive: true, capture: true });
  window.addEventListener('resize', onMove);
}
