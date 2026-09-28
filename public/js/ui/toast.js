// Minimal toast notifications. Appends into #toast-region.

function region() {
  let el = document.getElementById('toast-region');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-region';
    el.className = 'toast-region';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, { type = 'info', duration = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  el.textContent = message;
  region().appendChild(el);
  if (duration > 0) {
    setTimeout(() => el.remove(), duration);
  }
  return el;
}
