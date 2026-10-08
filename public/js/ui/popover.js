// Anchor a native popover under its button, right-aligned and clamped inside the viewport.
export function placePopover(pop, anchor) {
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, m = 8;
  pop.style.left = `${Math.max(m, Math.min(a.right - w, innerWidth - w - m))}px`;
  pop.style.top = `${a.bottom + 6}px`;
}

/** Wire `pop` (popover="auto") to open under `btn`; calls onOpen() just before it shows. */
export function wirePopover(pop, btn, onOpen) {
  btn.setAttribute('popovertarget', pop.id);
  btn.setAttribute('aria-expanded', 'false');
  pop.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') onOpen?.(); });
  pop.addEventListener('toggle', (e) => {
    const open = e.newState === 'open';
    btn.setAttribute('aria-expanded', String(open));
    if (open) placePopover(pop, btn);
  });
  addEventListener('resize', () => { if (pop.matches(':popover-open')) placePopover(pop, btn); });
}
