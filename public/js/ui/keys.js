// Keyboard activation for custom clickable elements. Rows and cards made
// focusable with tabIndex = 0 get Enter / Space => click (Shift / Alt carried
// over, so Shift+Enter adds a NOT chip like Shift+click). Elements with their
// own key handling call preventDefault and are left alone; native controls
// already do this themselves.
const NATIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|OPTION|LABEL)$/;

export function installKeyActivation(root = document) {
  root.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
    const t = e.target;
    if (!(t instanceof HTMLElement) || NATIVE.test(t.tagName) || t.isContentEditable) return;
    if (t.getAttribute('tabindex') !== '0') return;
    e.preventDefault();
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: e.shiftKey, altKey: e.altKey }));
  });
}
