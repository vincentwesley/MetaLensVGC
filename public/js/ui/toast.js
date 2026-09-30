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

// action: optional { label, onClick } rendered as a button inside the toast (it closes the toast).
export function toast(message, { type = 'info', duration = 4000, action = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  el.textContent = message;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { el.remove(); action.onClick(); });
    el.appendChild(btn);
  }
  region().appendChild(el);
  if (duration > 0) {
    setTimeout(() => el.remove(), duration);
  }
  return el;
}
