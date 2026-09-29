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
  skin: 'retro',
  theme: 'auto',
  anim: false,
};

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
    if (key === 'chips') continue;
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
      if (!(key in defaults)) continue;
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
