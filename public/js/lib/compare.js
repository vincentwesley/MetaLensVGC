// Pure logic for the Compare Periods section: two Smogon ladder months side by side.
import { changeDir } from './aggregate.js';
import { displayName } from './names.js';

/** Most used item of a ladder mon as a display name, or null when it lists none. */
export function topItem(mon, dex) {
  let best = null;
  for (const [id, v] of Object.entries(mon?.items || {})) if (!best || v > best[1]) best = [id, v];
  return best ? displayName(best[0], dex) : null;
}

const FLOOR = 0.01; // risers/fallers: species under 1% in both months are noise

/**
 * months: raw ladder months. a/b: month ids (a may be null = single month).
 * rows: top `top` species by B usage. isNew = absent from A. pts = change in points.
 * risers/fallers cover every species (also those that dropped out of B: b = 0, gone = true).
 */
export function compareMonths(months, a, b, { top = 20, dex } = {}) {
  const mb = (months || []).find((m) => m.month === b);
  const ma = a && a !== b ? months.find((m) => m.month === a) : null;
  if (!mb) return { a: ma?.month ?? null, b: null, rows: [], risers: [], fallers: [] };
  const mk = (key) => {
    const ua = ma ? (ma.mons[key]?.usage ?? null) : null;
    const ub = mb.mons[key]?.usage ?? 0;
    const change = { isNew: !!ma && ua == null, pts: ma && ua != null ? (ub - ua) * 100 : null };
    const itemA = ma ? topItem(ma.mons[key], dex) : null;
    const itemB = topItem(mb.mons[key], dex);
    return {
      key, a: ua, b: ub, isNew: change.isNew, pts: change.pts, dir: ma ? changeDir(change) : null,
      gone: !!ma && ua != null && ub === 0, itemA, itemB,
      itemChanged: !!(ma && itemA && itemB && itemA !== itemB),
    };
  };
  const rows = Object.keys(mb.mons).map(mk).sort((x, y) => y.b - x.b).slice(0, top);
  if (!ma) return { a: null, b: mb.month, rows, risers: [], fallers: [] };
  const all = [...new Set([...Object.keys(ma.mons), ...Object.keys(mb.mons)])].map(mk)
    .filter((r) => Math.max(r.a ?? 0, r.b) >= FLOOR)
    .map((r) => ({ ...r, delta: r.b - (r.a ?? 0) }));
  return {
    a: ma.month, b: mb.month, rows,
    risers: all.filter((r) => r.delta > 0).sort((x, y) => y.delta - x.delta),
    fallers: all.filter((r) => r.delta < 0).sort((x, y) => x.delta - y.delta),
  };
}
