// Showdown ladder history (v1.9.1): Showdown publishes only CURRENT ratings, so MetaLens keeps its own daily snapshots
// of the top TRACK_TOP players per format and derives each player's peak Elo and best rank from them. Peaks therefore
// only cover the time since tracking began (file.tracking.since); the page says so.
export const TRACK_TOP = 500; // players recorded per snapshot (Showdown's ladder page lists 500)
export const SHOW_TOP = 100; // rows in the page's ladder table
export const HISTORY_MAX = 180; // snapshots kept per player (daily = ~6 months)

const round1 = (x) => Math.round(x * 10) / 10;

/** One ladder toplist entry -> the fields MetaLens keeps. */
export function ladderRow(e, rank) {
  return { rank, userid: e.userid, name: e.username, elo: Math.round(e.elo), gxe: round1(e.gxe), w: e.w, l: e.l, t: e.t || 0 };
}

/**
 * prev: the existing showdown-ladder-<REG>.json (or null), toplist: Showdown's ladder JSON toplist, date: YYYY-MM-DD,
 * manual: hand-recorded observations for this reg (data-manual/showdown-ladder-observations.json: {userid, name, date,
 * rank, elo, source}); they count towards peaks, are kept in `manual` per player with their source, and never become
 * a snapshot date. Returns the new file. A second snapshot on the same day replaces that day's entry. Deterministic.
 */
export function updateLadderHistory(prev, { reg, format, toplist, date, manual = [] }) {
  const players = structuredClone(prev?.players || {});
  const rows = (toplist || []).slice(0, TRACK_TOP).map((e, i) => ladderRow(e, i + 1));
  for (const r of rows) {
    const p = players[r.userid] || { name: r.name, first: date, h: [] };
    p.name = r.name;
    p.last = date;
    p.h = p.h.filter(([d]) => d !== date);
    p.h.push([date, r.rank, r.elo]);
    p.h.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (p.h.length > HISTORY_MAX) p.h = p.h.slice(-HISTORY_MAX);
    // Peaks over every snapshot ever seen (kept even once old history is trimmed).
    if (!(p.peakElo >= r.elo)) { p.peakElo = r.elo; p.peakEloDate = date; }
    if (!(p.bestRank <= r.rank)) { p.bestRank = r.rank; p.bestRankDate = date; }
    players[r.userid] = p;
  }
  for (const o of manual) {
    const p = players[o.userid] || { name: o.name, first: o.date, last: o.date, h: [] };
    p.manual = [...(p.manual || []).filter((m) => m.date !== o.date), { date: o.date, rank: o.rank, elo: o.elo, source: o.source }]
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!(p.peakElo >= o.elo)) { p.peakElo = o.elo; p.peakEloDate = o.date; p.peakEloManual = true; }
    if (!(p.bestRank <= o.rank)) { p.bestRank = o.rank; p.bestRankDate = o.date; p.bestRankManual = true; }
    if (o.date < p.first) p.first = o.date;
    players[o.userid] = p;
  }
  // a snapshot that later beats a manual peak clears its flag
  for (const p of Object.values(players)) {
    if (p.peakEloManual && !p.manual?.some((m) => m.elo === p.peakElo && m.date === p.peakEloDate)) delete p.peakEloManual;
    if (p.bestRankManual && !p.manual?.some((m) => m.rank === p.bestRank && m.date === p.bestRankDate)) delete p.bestRankManual;
  }
  const snapshots = [...new Set([...(prev?.tracking?.dates || []), date])].sort();
  const top = rows.slice(0, SHOW_TOP).map((r) => {
    const p = players[r.userid];
    return { ...r, peakElo: p.peakElo, peakEloDate: p.peakEloDate, bestRank: p.bestRank, bestRankDate: p.bestRankDate,
      ...(p.peakEloManual ? { peakEloManual: true } : {}), ...(p.bestRankManual ? { bestRankManual: true } : {}) };
  });
  return {
    reg, format,
    source: `https://pokemonshowdown.com/ladder/${format}`,
    tracking: { since: snapshots[0], last: date, snapshots: snapshots.length, dates: snapshots.slice(-HISTORY_MAX), top: TRACK_TOP },
    top,
    players: Object.fromEntries(Object.entries(players).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}
