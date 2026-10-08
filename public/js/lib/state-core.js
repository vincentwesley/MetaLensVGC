// Pure state <-> location.hash codec. State shape documented in CLAUDE.md.

export const DEFAULT_STATE = {
  reg: 'M-C',
  source: 'tournaments', // 'tournaments' | 'ladder' | 'ranked'
  tiers: ['worlds', 'international', 'regional', 'online'],
  place: 'all',
  from: '',
  to: '',
  minN: 20,
  chips: [],
  skin: 'pro',
  theme: 'dark',
  anim: false,
  palette: 'grass',
};

// Showdown-ladder regulations (the "Showdown" mode); every other reg is VGC. Mirrors scripts/lib/regs.js.
export const SHOWDOWN_REGS = ['ND', 'NDD'];
export const regFamily = (id) => (SHOWDOWN_REGS.includes(id) ? 'showdown' : 'vgc');

// Look prefs live in localStorage, not the URL.
export const PREF_KEYS = ['skin', 'theme', 'anim', 'palette'];

function sameArray(a, b) {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

function encodeChip(c) {
  const val = Array.isArray(c.value) ? c.value.map(encodeURIComponent).join('+') : encodeURIComponent(c.value);
  return `${c.neg ? '!' : ''}${c.kind}:${val}`;
}

// A chip's value is either a plain string, or (for "core") an array of keys
// joined by "+" inside the chip token; chips themselves are comma-joined.
function decodeChip(token) {
  let t = token;
  let neg = false;
  if (t.startsWith('!')) { neg = true; t = t.slice(1); }
  const ci = t.indexOf(':');
  if (ci === -1) return null;
  const kind = decodeURIComponent(t.slice(0, ci));
  const raw = t.slice(ci + 1);
  const value = raw.includes('+') ? raw.split('+').map(decodeURIComponent) : decodeURIComponent(raw);
  return { kind, value, neg };
}

export function toHash(state, defaults = DEFAULT_STATE) {
  const parts = [];
  for (const key of Object.keys(defaults)) {
    if (key === 'chips' || PREF_KEYS.includes(key)) continue;
    const v = state[key];
    const d = defaults[key];
    if (Array.isArray(d)) {
      if (!sameArray(v || [], d)) parts.push(`${key}=${v.map(encodeURIComponent).join(',')}`);
    } else if (v !== d) {
      parts.push(`${key}=${encodeURIComponent(String(v))}`);
    }
  }
  if (state.chips && state.chips.length) {
    parts.push(`chips=${state.chips.map(encodeChip).join(',')}`);
  }
  return parts.join('&');
}

export const CHIP_KINDS = ['species', 'mega', 'core', 'type', 'weak', 'item', 'move', 'movetype', 'archetype', 'team', 'country'];
const ENUMS = {
  source: ['tournaments', 'ladder', 'ranked'],
  place: ['all', 'topcut', 'top8', 'winner'],
  skin: ['pro', 'retro', 'glass', 'paper', 'terminal', 'soft'],
  theme: ['dark', 'light', 'auto'],
  palette: ['grass', 'ghost', 'water', 'fire', 'fairy', 'electric', 'steel'],
};
const TIER_IDS = DEFAULT_STATE.tiers;
export const MIN_N_MAX = 200;

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Coerces a (possibly hand-edited) state into a valid one: unknown enum values
 * fall back to the default, dates must be real YYYY-MM-DD days (a reversed
 * range is swapped), minN is an integer in [0, MIN_N_MAX], tiers are known ids,
 * and chips have a known kind, a non-empty value (an array of 2+ keys only for
 * "core") and are unique. `regs` (optional): the regulation ids that exist.
 */
export function sanitizeState(state, { regs } = {}, defaults = DEFAULT_STATE) {
  const s = { ...state };
  for (const [key, allowed] of Object.entries(ENUMS)) if (!allowed.includes(s[key])) s[key] = defaults[key];
  if (regs?.length && !regs.includes(s.reg)) s.reg = regs.includes(defaults.reg) ? defaults.reg : regs[regs.length - 1];
  if (typeof s.reg !== 'string') s.reg = defaults.reg;
  if (regFamily(s.reg) === 'showdown') s.source = 'ladder'; // Smogon ladder is the only source there
  s.tiers = TIER_IDS.filter((t) => Array.isArray(state.tiers) && state.tiers.includes(t));
  s.from = validDate(s.from) ? s.from : '';
  s.to = validDate(s.to) ? s.to : '';
  if (s.from && s.to && s.from > s.to) [s.from, s.to] = [s.to, s.from];
  const n = Math.round(Number(s.minN));
  s.minN = Number.isFinite(n) ? Math.max(0, Math.min(MIN_N_MAX, n)) : defaults.minN;
  s.anim = s.anim === true;
  const seen = new Set();
  s.chips = (Array.isArray(state.chips) ? state.chips : []).flatMap((c) => {
    if (!c || !CHIP_KINDS.includes(c.kind)) return [];
    let value = c.value;
    if (c.kind === 'core') {
      value = [...new Set([].concat(value).filter((v) => typeof v === 'string' && v))];
      if (value.length < 2) return value.length === 1 ? [{ kind: 'species', value: value[0], neg: !!c.neg }] : [];
    } else if (Array.isArray(value)) {
      return [];
    } else if (typeof value !== 'string' || !value) {
      return [];
    } else if (c.kind === 'country') {
      value = value.toUpperCase();
      if (!/^[A-Z]{2}$/.test(value)) return []; // ISO-2, as on the team sheets
    }
    return [{ kind: c.kind, value, neg: !!c.neg }];
  }).filter((c) => {
    const id = `${c.kind}:${[].concat(c.value).join('+')}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return s;
}

export function fromHash(hash, defaults = DEFAULT_STATE) {
  const state = { ...defaults, chips: [] };
  const str = (hash || '').replace(/^#/, '');
  if (!str) return state;
  for (const part of str.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    try {
      const key = decodeURIComponent(part.slice(0, eq));
      const raw = part.slice(eq + 1);
      if (!(key in defaults) || key === 'anim' || key === 'palette') continue; // legacy links only carry skin/theme
      if (key === 'chips') {
        state.chips = raw.split(',').filter(Boolean).map(decodeChip).filter(Boolean);
      } else if (Array.isArray(defaults[key])) {
        state[key] = raw.split(',').filter(Boolean).map(decodeURIComponent);
      } else if (typeof defaults[key] === 'number') {
        const n = Number(decodeURIComponent(raw));
        if (!Number.isNaN(n)) state[key] = n;
      } else if (typeof defaults[key] === 'boolean') {
        state[key] = decodeURIComponent(raw) === 'true';
      } else {
        state[key] = decodeURIComponent(raw);
      }
    } catch {
      // tolerant: ignore malformed hash component
    }
  }
  return state;
}
