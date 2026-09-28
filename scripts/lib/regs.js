// Regulation windows (verified, see data-raw/recon/format-facts.md). `end` is exclusive.
export const REGULATIONS = {
  'M-A': { start: '2026-04-08', end: '2026-06-17' },
  'M-B': { start: '2026-06-17', end: '2026-09-09' },
  'M-C': { start: '2026-09-09', end: '2026-12-02' },
};

export const REG_IDS = Object.keys(REGULATIONS);

/** date: "YYYY-MM-DD" (UTC). Returns true if date falls in [start, end). */
export function inWindow(date, reg) {
  const w = REGULATIONS[reg];
  if (!w) return false;
  return date >= w.start && date < w.end;
}

export function regForDate(date) {
  for (const reg of REG_IDS) if (inWindow(date, reg)) return reg;
  return null;
}
