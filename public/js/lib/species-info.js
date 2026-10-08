// Pure helpers for the Pokémon deep dive (and the Pokédex grid): defensive buckets, Lv50 stat range,
// the regulation's full species list, the most common set as a Mon. No DOM.
import { TYPES, effectiveness } from './types.js';
import { NATURES, calcStat } from './stats.js';
import { rankedMegaKey } from './aggregate.js';

export const MATCHUP_BUCKETS = [
  { mult: 4, label: '4×' }, { mult: 2, label: '2×' }, { mult: 0.5, label: '½×' }, { mult: 0.25, label: '¼×' }, { mult: 0, label: '0×' },
];

/** Attacking types by multiplier against `defTypes`: { 4: [...], 2: [...], 0.5: [...], 0.25: [...], 0: [...] }. Abilities ignored. */
export function defensiveBuckets(defTypes) {
  const out = { 4: [], 2: [], 0.5: [], 0.25: [], 0: [] };
  for (const t of TYPES) out[effectiveness(t, defTypes)]?.push(t);
  return out;
}

const natureWith = (field, idx) => Object.keys(NATURES).find((n) => NATURES[n][field] === idx);

/** Lv50 [{min, max}] x6: min = 0 SP + a nature that hinders the stat, max = 32 SP + a nature that boosts it (HP: no nature). */
export function statRange(bs) {
  return bs.map((b, i) => (i === 0
    ? { min: calcStat(b, 0, 0), max: calcStat(b, 32, 0) }
    : { min: calcStat(b, 0, i, natureWith('minus', i)), max: calcStat(b, 32, i, natureWith('plus', i)) }));
}

/** Every species known for a regulation, as sorted display keys: tournament teams ∪ ranked seasons ∪ Smogon ladder months.
 *  `dex` (optional) adds ranked Mega keys and drops names the dex doesn't know. */
export function allSpecies(base, ranked, ladder, dex = null) {
  const out = new Set(extraSpecies(ranked, ladder, dex));
  for (const t of base || []) for (const k of t.keys || []) out.add(k);
  return [...out].filter((k) => !dex || dex.species?.[k]).sort();
}

// The ranked + ladder part is the costly one and only changes with those objects (rebuilt on species chips), so cache it by identity.
let xCache = { ranked: null, ladder: null, dex: null, set: null };
function extraSpecies(ranked, ladder, dex) {
  if (xCache.set && xCache.ranked === ranked && xCache.ladder === ladder && xCache.dex === dex) return xCache.set;
  const out = new Set();
  for (const s of ranked?.seasons || []) {
    for (const [name, mon] of Object.entries(s.mons || {})) {
      out.add(name);
      const mk = dex && rankedMegaKey(name, mon, dex);
      if (mk) out.add(mk);
    }
  }
  for (const m of ladder?.months || []) for (const k of Object.keys(m.mons || {})) out.add(k);
  xCache = { ranked, ladder, dex, set: out };
  return out;
}

/** The most common exact 4-move set of `key` with its most common item and ability, as a Mon for toPaste; null if none. */
export function topSetMon(teams, key) {
  const groups = new Map();
  for (const t of teams) {
    for (const m of t.mons) {
      if (m.k !== key || !m.moves?.length) continue;
      const id = [...m.moves].sort().join(' / ');
      (groups.get(id) || groups.set(id, []).get(id)).push(m);
    }
  }
  let best = null;
  for (const g of groups.values()) if (!best || g.length > best.length) best = g;
  if (!best) return null;
  const mode = (f) => {
    const c = new Map();
    for (const m of best) if (m[f]) c.set(m[f], (c.get(m[f]) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return { s: best[0].s, k: key, item: mode('item'), ability: mode('ability'), moves: best[0].moves.slice(0, 4), nature: null, sp: null };
}
