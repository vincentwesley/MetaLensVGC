/** True when the ISO timestamp is more than `days` older than `now` (Date). Missing/invalid -> false. */
export function isStale(generatedISO, now = new Date(), days = 10) {
  const t = Date.parse(generatedISO);
  return Number.isFinite(t) && now.getTime() - t > days * 864e5;
}
