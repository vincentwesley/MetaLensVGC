// Central state store. Round-trips through location.hash via js/lib/state-core.js.
// See CLAUDE.md "State" contract.

import { DEFAULT_STATE, PREF_KEYS, toHash, fromHash, sanitizeState } from './lib/state-core.js';

// Known regulation ids, once the manifest has loaded (store.setRegs).
let regs = null;
// Every state (hand-edited hash, back/forward, UI) goes through sanitizeState,
// so sections only ever see valid values.
const clean = (s) => sanitizeState(s, { regs });
const PREFS_KEY = 'metalens.prefs';

function loadPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { /* storage off or corrupt */ }
  return clean({ ...DEFAULT_STATE, ...saved });
}

function savePrefs(s) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])))); } catch { /* ignore */ }
}

// Hash gives filters (+ legacy skin/theme); look prefs come from `base` unless the hash has a legacy value.
function parseHash(base) {
  const h = location.hash.slice(1);
  const parsed = fromHash(h, DEFAULT_STATE);
  const legacy = ['skin', 'theme'].filter((k) => new RegExp(`(^|&)${k}=`).test(h));
  for (const k of PREF_KEYS) if (!legacy.includes(k)) parsed[k] = base[k];
  const next = clean(parsed);
  if (legacy.length) savePrefs(next);
  return next;
}

let state = parseHash(loadPrefs());
const subs = new Set();

function applyDom(s) {
  const root = document.documentElement;
  root.setAttribute('data-skin', s.skin);
  root.setAttribute('data-theme', s.theme);
  root.setAttribute('data-palette', s.palette);
  root.setAttribute('data-anim', s.anim ? 'on' : 'off');
}

function pushHash(replace) {
  const h = toHash(state);
  if (h === location.hash.replace(/^#/, '')) return;
  const hash = h ? `#${h}` : location.pathname + location.search;
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
    state = clean({ ...state, ...patch });
    applyDom(state);
    if (PREF_KEYS.some((k) => k in patch)) savePrefs(state);
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

  /** Called once the manifest is known: an unknown regulation in the URL falls back to a real one. */
  setRegs(ids) {
    regs = ids;
    const next = clean(state);
    if (next.reg !== state.reg) { state = next; pushHash(true); subs.forEach((fn) => fn(state)); }
  },
};

window.addEventListener('hashchange', () => {
  state = parseHash(state);
  applyDom(state);
  pushHash(true); // canonical form of a hand-edited hash
  subs.forEach((fn) => fn(state));
});

applyDom(state);
pushHash(true);
