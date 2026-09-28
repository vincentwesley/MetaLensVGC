// Central state store. Round-trips through location.hash via js/lib/state-core.js.
// See CLAUDE.md "State" contract.

import { DEFAULT_STATE, toHash, fromHash } from './lib/state-core.js';

let state = fromHash(location.hash.slice(1), DEFAULT_STATE);
const subs = new Set();

function applyDom(s) {
  const root = document.documentElement;
  root.setAttribute('data-skin', s.skin);
  root.setAttribute('data-theme', s.theme);
  root.setAttribute('data-anim', s.anim ? 'on' : 'off');
}

function pushHash(replace) {
  const hash = `#${toHash(state)}`;
  if (hash === location.hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

function sameChipValue(a, b) {
  return Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]) : a === b;
}

export const store = {
  get() { return state; },

  /** Merge `patch` into state, sync the hash, notify subscribers.
   *  opts.replace: use history.replaceState instead of pushState (for
   *  high-frequency changes, e.g. the min-sample slider). */
  set(patch, opts = {}) {
    state = { ...state, ...patch };
    applyDom(state);
    pushHash(!!opts.replace);
    subs.forEach((fn) => fn(state));
  },

  addChip(chip, opts = {}) {
    const chips = state.chips.slice();
    const idx = chips.findIndex((c) => c.kind === chip.kind && sameChipValue(c.value, chip.value));
    if (idx >= 0) {
      if (chips[idx].neg === !!chip.neg) chips.splice(idx, 1); // identical chip clicked again -> remove
      else chips[idx] = { ...chips[idx], neg: !!chip.neg };
    } else {
      chips.push({ kind: chip.kind, value: chip.value, neg: !!chip.neg });
    }
    store.set({ chips }, opts);
  },

  removeChip(i) {
    const chips = state.chips.slice();
    chips.splice(i, 1);
    store.set({ chips });
  },

  clearChips() { store.set({ chips: [] }); },

  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

window.addEventListener('hashchange', () => {
  state = fromHash(location.hash.slice(1), DEFAULT_STATE);
  applyDom(state);
  subs.forEach((fn) => fn(state));
});

applyDom(state);
