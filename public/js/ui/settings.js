// Settings: gear button + native popover (light dismiss, Esc and focus return come from popover="auto").
// Look prefs live in the store (localStorage metalens.prefs); clock and tips use their own keys.
import { store } from '../state.js';
import { crossfade } from './motion.js';
import { wirePopover } from './popover.js';
import { VERSION } from '../lib/changelog.js';
import { openChangelog, hasUnseen } from './changelog-dialog.js';

const CLOCK = 'metalens.clock';
const PALETTES = [['grass', 'Grass'], ['ghost', 'Ghost (Purple)'], ['water', 'Water (Blue)'], ['fire', 'Fire'], ['fairy', 'Fairy (Pink)'], ['electric', 'Electric'], ['steel', 'Steel']];

function clockOn() {
  try { return localStorage.getItem(CLOCK) !== '0'; } catch { return true; }
}
function setClock(on) {
  try { localStorage.setItem(CLOCK, on ? '1' : '0'); } catch { /* not saved */ }
  document.documentElement.setAttribute('data-clock', on ? 'on' : 'off');
}

function segToggle(label, options, get, set) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  const btns = new Map();
  for (const [value, text] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => set(value));
    wrap.appendChild(b);
    btns.set(value, b);
  }
  const sync = (s) => { for (const [v, b] of btns) b.setAttribute('aria-pressed', String(get(s) === v)); };
  sync(store.get());
  store.subscribe(sync);
  return wrap;
}

function toggle(text, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const track = document.createElement('span');
  track.className = 'toggle__track';
  label.append(input, track, document.createTextNode(text));
  return { label, input };
}

function row(title, control) {
  const r = document.createElement('div');
  r.className = 'settings__row';
  const h = document.createElement('span');
  h.className = 'settings__label';
  h.textContent = title;
  r.append(h, control);
  return r;
}

export function mountSettings(host, { howto } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gear';
  btn.setAttribute('aria-label', 'Settings');
  btn.setAttribute('data-tip', 'Settings');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg><span class="gear__dot" hidden></span>';
  const dot = btn.querySelector('.gear__dot');
  const syncDot = () => { dot.hidden = !hasUnseen(); };
  syncDot();

  const pop = document.createElement('div');
  pop.id = 'settings-panel';
  pop.className = 'settings';
  pop.setAttribute('popover', 'auto');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Settings');

  const look = (patch) => crossfade(() => store.set(patch));
  pop.append(
    row('Mode', segToggle('Mode', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], (s) => s.theme, (v) => look({ theme: v }))),
    row('Style', segToggle('Style', [['pro', 'Pro'], ['retro', 'Retro']], (s) => s.skin, (v) => look({ skin: v }))),
  );

  // Palette swatches: each colour is that palette's own --accent, read from the CSS tokens.
  const sw = document.createElement('div');
  sw.className = 'swatches';
  sw.setAttribute('role', 'group');
  sw.setAttribute('aria-label', 'Palette');
  const swBtns = new Map();
  for (const [id, name] of PALETTES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('aria-label', name);
    b.setAttribute('data-tip', name);
    b.addEventListener('click', () => look({ palette: id }));
    sw.appendChild(b);
    swBtns.set(id, b);
  }
  const root = document.documentElement;
  function paintSwatches() {
    const cur = root.getAttribute('data-palette');
    for (const [id, b] of swBtns) { // tokens are scoped to :root, so read each palette by switching the attribute synchronously
      root.setAttribute('data-palette', id);
      b.style.setProperty('--sw', getComputedStyle(root).getPropertyValue('--accent'));
    }
    root.setAttribute('data-palette', cur);
  }
  const syncSwatches = (s) => { for (const [id, b] of swBtns) b.setAttribute('aria-pressed', String(s.palette === id)); };
  syncSwatches(store.get());
  store.subscribe((s) => { syncSwatches(s); if (pop.matches(':popover-open')) paintSwatches(); });
  pop.appendChild(row('Palette', sw));

  const anim = toggle('Animated sprites', store.get().anim, (v) => store.set({ anim: v }));
  store.subscribe((s) => { anim.input.checked = s.anim; });
  const clock = toggle('Show clock', clockOn(), setClock);
  setClock(clockOn());
  const tips = document.createElement('button');
  tips.type = 'button';
  tips.className = 'settings__link';
  tips.textContent = 'Show tips again';
  tips.addEventListener('click', () => {
    try { localStorage.removeItem('metalens.howtoDismissed'); } catch { /* ignore */ }
    if (howto) howto.hidden = false;
    pop.hidePopover();
  });
  const foot = document.createElement('div');
  foot.className = 'settings__foot';
  const whatsNew = document.createElement('button');
  whatsNew.type = 'button';
  whatsNew.className = 'settings__link';
  whatsNew.textContent = 'What’s new';
  whatsNew.addEventListener('click', () => { pop.hidePopover(); openChangelog(btn, syncDot); });
  foot.append(`v${VERSION} · `, whatsNew);
  pop.append(anim.label, clock.label, tips, foot);

  wirePopover(pop, btn, () => { paintSwatches(); syncSwatches(store.get()); });
  host.appendChild(btn);
  document.body.appendChild(pop);
}
