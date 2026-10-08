// Pure Pokédex logic (roster rows, filters, sorts, search suggestions). No DOM.
import { nameMatcher, toID } from './names.js';
import { TYPES } from './types.js';

export const USAGE_TIERS = ['Top 12', 'Common', 'Uncommon', 'Rare', 'Unused'];
export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export function usageTier(rank, pct) {
  if (rank != null && rank <= 12) return 'Top 12';
  // ranked data has ranks, never a usage %: place by rank so only unranked species read 'Unused'
  if (pct == null) return rank == null ? 'Unused' : rank <= 30 ? 'Common' : rank <= 60 ? 'Uncommon' : 'Rare';
  if (pct >= 4.5) return 'Common';
  if (pct >= 1) return 'Uncommon';
  if (pct > 0) return 'Rare';
  return 'Unused';
}

const WHOLE = new Set(['porygonz']); // real species whose pre-hyphen part is also a species

/** 'Charizard-Mega-Y' -> {base:'Charizard', suffix:'Mega-Y'}; names whose pre-hyphen part isn't a roster species stay whole. */
export function splitForme(name, roster) {
  const i = name.indexOf('-');
  const base = i < 0 ? name : name.slice(0, i);
  if (i < 0 || WHOLE.has(toID(name)) || !(roster?.species && base in roster.species)) return { base: name, suffix: '' };
  return { base, suffix: name.slice(i + 1) };
}

// Learnset for a species, falling back to its base forme.
function learnOf(learnsets, name, roster) {
  return learnsets.learn[toID(name)] || learnsets.learn[toID(splitForme(name, roster).base)];
}

const az = (a, b) => a.name.localeCompare(b.name);

export function dexRows(roster, { usage = new Map(), tierMode = 'official', filters = {}, learnsets = null, sort = 'tier' } = {}) {
  const { types = [], abilities = [], moves = [] } = filters;
  const needsLearnsets = moves.length > 0 && !learnsets;
  const wantAbs = abilities.map(toID);
  const rows = Object.entries(roster.species).map(([name, s]) => {
    const u = usage.get(name);
    return {
      name, num: s.num, types: s.types, bs: s.bs, bst: s.bs.reduce((a, b) => a + b, 0),
      abilities: s.abilities || {},
      tier: tierMode === 'usage' ? usageTier(u?.rank, u ? u.pct : 0) : s.tier || 'Untiered',
      use: u || null,
    };
  }).filter((r) => {
    if (!types.every((t) => r.types.includes(t))) return false;
    if (wantAbs.length) {
      const have = Object.values(r.abilities).map(toID);
      if (!wantAbs.every((a) => have.includes(a))) return false;
    }
    if (moves.length && learnsets) {
      const l = learnOf(learnsets, r.name, roster);
      if (!l || !moves.every((m) => l.includes(m))) return false;
    }
    return true;
  });

  const groups = [];
  if (sort === 'tier') {
    const order = tierMode === 'usage' ? USAGE_TIERS : [...roster.tierOrder, 'Untiered'];
    const idx = (r) => { const i = order.indexOf(r.tier); return i < 0 ? order.length : i; };
    rows.sort((a, b) => idx(a) - idx(b) || az(a, b));
    rows.forEach((r, i) => {
      const g = groups[groups.length - 1];
      if (g && g.tier === r.tier) g.to = i; else groups.push({ tier: r.tier, from: i, to: i });
    });
  } else if (sort === 'name') rows.sort(az);
  else {
    const k = STATS.indexOf(sort);
    const val = (r) => (sort === 'bst' ? r.bst : r.bs[k]);
    rows.sort((a, b) => val(b) - val(a) || az(a, b));
  }
  return { rows, groups, needsLearnsets };
}

const abilCache = new WeakMap(); // roster -> sorted unique ability names
const moveCache = new WeakMap(); // learnsets -> [{id, name}]

/** Prefix matches first, then other substring matches (nameMatcher semantics); stops once `limit` prefix hits exist. */
function pick(items, key, has, id, limit) {
  const pre = [], sub = [];
  for (const x of items) {
    const k = key(x);
    if (!has(k)) continue;
    (toID(k).startsWith(id) ? pre : sub).push(x);
    if (pre.length >= limit) break;
  }
  return [...pre, ...sub].slice(0, limit);
}

export function suggest(q, roster, learnsets, { limit = 6 } = {}) {
  const id = toID(q);
  const out = { pokemon: [], types: [], abilities: [], moves: [] };
  if (!id) return out;
  const has = nameMatcher(q);
  let abil = abilCache.get(roster);
  if (!abil) {
    const set = new Set();
    for (const s of Object.values(roster.species)) Object.values(s.abilities || {}).forEach((a) => a && set.add(a));
    abilCache.set(roster, abil = [...set].sort());
  }
  out.pokemon = pick(Object.keys(roster.species), (x) => x, has, id, limit);
  out.types = pick(TYPES, (x) => x, has, id, Infinity);
  out.abilities = pick(abil, (x) => x, has, id, limit);
  if (learnsets) {
    let mv = moveCache.get(learnsets);
    if (!mv) moveCache.set(learnsets, mv = Object.entries(learnsets.moves).map(([i, name]) => ({ id: i, name })));
    out.moves = pick(mv, (m) => m.name, has, id, limit);
  }
  return out;
}

/** Usage rows `[{key, pct}]` (any order) -> Map(name -> {pct, rank}); rank = position by pct, 1-based. Ranked sources pass `ranking` names (pct null). */
export function usageMap(rows, ranking = null) {
  const m = new Map();
  if (ranking) ranking.forEach((k, i) => m.set(k, { pct: null, rank: i + 1 }));
  else [...rows].sort((a, b) => b.pct - a.pct).forEach((r, i) => m.set(r.key, { pct: r.pct, rank: i + 1 }));
  return m;
}
