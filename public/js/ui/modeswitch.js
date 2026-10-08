// Header "VGC | Showdown" switch. The mode is derived from state.reg's family, so it round-trips
// through the URL; switching jumps to that family's default regulation and clears the chips.
import { regFamily } from '../lib/state-core.js';

export function mountModeSwitch(host, store, manifest) {
  const defaults = { vgc: manifest.current || 'M-C', showdown: manifest.currentShowdown || 'ND' };
  const wrap = document.createElement('div');
  wrap.className = 'segmented modeswitch';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Mode');
  const btns = {};
  for (const [fam, label] of [['vgc', 'VGC'], ['showdown', 'Showdown']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.mode = fam;
    b.addEventListener('click', () => {
      if (regFamily(store.get().reg) === fam) return;
      store.set({ reg: defaults[fam], source: fam === 'vgc' ? 'tournaments' : 'ladder', chips: [], from: '', to: '' });
    });
    btns[fam] = b;
    wrap.appendChild(b);
  }
  function sync(s) {
    const fam = regFamily(s.reg);
    document.documentElement.dataset.family = fam;
    for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === fam));
  }
  sync(store.get());
  store.subscribe(sync);
  host.appendChild(wrap);
}
