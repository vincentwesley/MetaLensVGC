// Deep-dive drawer shell: open/close, focus trap, Esc to close, backdrop click.
// The deepdive section module owns rendering; it mounts into el.querySelector('.drawer__body')
// and listens for a `deepdive:open` CustomEvent (detail: { key }) dispatched on that body element.

export function mountDrawer(el) {
  const backdrop = el.querySelector('[data-drawer-backdrop]');
  const closeBtn = el.querySelector('[data-drawer-close]');
  const panel = el.querySelector('.drawer__panel');
  const body = el.querySelector('.drawer__body');
  let lastFocused = null;

  function focusables() {
    return [...panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(key) {
    lastFocused = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', onKeydown);
    (closeBtn || panel).focus();
    body.dispatchEvent(new CustomEvent('deepdive:open', { detail: { key }, bubbles: true }));
  }

  function close() {
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onKeydown);
    if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
    body.dispatchEvent(new CustomEvent('deepdive:close', { bubbles: true }));
  }

  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  return { open, close, body };
}
