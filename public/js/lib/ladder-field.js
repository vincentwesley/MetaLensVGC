// Ladder field maths (pure): type landscape weighted by species usage, monthly trend lines and
// month-over-month movers. Input is a raw ladder file ({months:[{month, battles, mons}]}) or,
// for the type helpers, ladderMerge().mons rows ({key, usage}).
import { TYPES, effectiveness } from './types.js';

const inRange = (ladder, from = '', to = '') =>
  (ladder?.months || []).filter((m) => (!from || m.month >= from.slice(0, 7)) && (!to || m.month <= to.slice(0, 7)))
    .slice().sort((a, b) => a.month.localeCompare(b.month));

// Species with a dex entry, weighted by usage. Species the dex lacks are skipped (not guessed).
function weighted(mons, dex) {
  const out = [];
  let total = 0;
  for (const m of mons) {
    const sp = dex.species[m.key];
    if (!sp || !(m.usage > 0)) continue;
    out.push({ types: sp.types, w: m.usage });
    total += m.usage;
  }
  return { rows: out, total };
}

/** Same row shape as aggregate.typeUsage: {type, n (species), pct (usage-weighted share)}. */
export function ladderTypeUsage(mons, dex) {
  const { rows, total } = weighted(mons, dex);
  return TYPES.map((type) => {
    const hit = rows.filter((r) => r.types.includes(type));
    return { type, n: hit.length, pct: total ? hit.reduce((a, r) => a + r.w, 0) / total : 0 };
  }).sort((a, b) => b.pct - a.pct);
}

/** Same row shape as aggregate.weaknesses, each species weighted by its usage. */
export function ladderWeaknesses(mons, dex) {
  const { rows, total } = weighted(mons, dex);
  return TYPES.map((atk) => {
    const by = { x4: 0, x2: 0, x1: 0, x05: 0, x025: 0, x0: 0 };
    for (const r of rows) {
      const mult = effectiveness(atk, r.types);
      by[mult >= 4 ? 'x4' : mult >= 2 ? 'x2' : mult === 1 ? 'x1' : mult >= 0.5 ? 'x05' : mult > 0 ? 'x025' : 'x0'] += r.w;
    }
    const s = (v) => (total ? v / total : 0);
    return {
      type: atk, weak: s(by.x4 + by.x2), resist: s(by.x05 + by.x025), immune: s(by.x0),
      x4: s(by.x4), x2: s(by.x2), x1: s(by.x1), x05: s(by.x05), x025: s(by.x025), x0: s(by.x0),
    };
  });
}

/** Monthly usage for `keys`: {months:[YYYY-MM], series:{key:[usage|null]}} (null = absent that month). */
export function ladderSeries(ladder, keys, from = '', to = '') {
  const ms = inRange(ladder, from, to);
  return { months: ms.map((m) => m.month), series: Object.fromEntries(keys.map((k) => [k, ms.map((m) => m.mons[k]?.usage ?? null)])) };
}

/**
 * Risers/fallers between the last two months in range. Only species with usage >= floor in one of the
 * two months are compared (tiny shares are noise). isNew = absent from the previous month.
 * delta is a fraction (pctLast - pctPrev). null when fewer than two months.
 */
export function ladderMovers(ladder, from = '', to = '', floor = 0.01) {
  const ms = inRange(ladder, from, to);
  if (ms.length < 2) return null;
  const [prev, last] = ms.slice(-2);
  const rows = [];
  for (const key of new Set([...Object.keys(prev.mons), ...Object.keys(last.mons)])) {
    const a = prev.mons[key]?.usage ?? null;
    const b = last.mons[key]?.usage ?? 0;
    if (Math.max(a ?? 0, b) < floor) continue;
    rows.push({ key, pctPrev: a ?? 0, pctLast: b, delta: b - (a ?? 0), isNew: a == null });
  }
  return {
    monthPrev: prev.month, monthLast: last.month,
    risers: rows.filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta),
    fallers: rows.filter((r) => r.delta < 0).sort((x, y) => x.delta - y.delta),
  };
}

/** Top-N species by usage plus teammate-share matrix: m[r][c] = share of keys[r]'s teammates that is keys[c] (null if not in its listed top teammates). */
export function ladderCoMatrix(mons, n = 15) {
  const top = [...mons].filter((m) => m.usage > 0).sort((a, b) => b.usage - a.usage).slice(0, n);
  const keys = top.map((m) => m.key);
  const m = top.map((a) => keys.map((k) => (k === a.key ? null : (a.teammates || []).find((t) => t.name === k)?.pct ?? null)));
  return { keys, m };
}

/** Pairs ranked by usage(A)*share(B|A), averaged over both directions when both are listed. [{keys:[a,b] sorted, score}] */
export function ladderPairs(mons, limit = 15) {
  const by = new Map();
  for (const a of mons) {
    if (!(a.usage > 0)) continue;
    for (const t of a.teammates || []) {
      if (t.name === a.key || !(t.pct > 0)) continue;
      const keys = [a.key, t.name].sort();
      const id = keys.join('\u0000');
      const e = by.get(id) || { keys, scores: [] };
      e.scores.push(a.usage * t.pct);
      by.set(id, e);
    }
  }
  return [...by.values()]
    .map((e) => ({ keys: e.keys, score: e.scores.reduce((x, y) => x + y, 0) / e.scores.length }))
    .sort((x, y) => y.score - x.score || x.keys.join().localeCompare(y.keys.join()))
    .slice(0, limit);
}
