// Pure time helpers for the meta clock (no DOM). The weekly refresh runs Mondays 00:00 UTC (= 08:00 GMT+8).
const DAY = 86400000;

/** Next Monday 00:00 UTC strictly after `now`. */
export function nextRefresh(now) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let t = midnight + ((1 - now.getUTCDay() + 7) % 7) * DAY;
  if (t <= now.getTime()) t += 7 * DAY;
  return new Date(t);
}

/** Whole days until `endISO` (a date, exclusive end), rounded up; <= 0 once it has passed. */
export function daysLeft(endISO, now) {
  const end = Date.parse(endISO);
  return Number.isNaN(end) ? 0 : Math.ceil((end - now.getTime()) / DAY);
}

/** 3d 4h | 5h 12m | 42m */
export function fmtDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
