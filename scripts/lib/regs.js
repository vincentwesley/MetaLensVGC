// Regulation windows (verified, see data-raw/recon/format-facts.md). `end` is exclusive.
// family 'vgc' = Champions regs with a date window; 'showdown' = Smogon-ladder-only formats
// (no window, no tournaments/ranked, rolling last 3 months of stats).
export const REGULATIONS = {
  'M-A': { family: 'vgc', format: 'gen9championsvgc2026regma', level: 50, label: 'Reg M-A', start: '2026-04-08', end: '2026-06-17' },
  'M-B': { family: 'vgc', format: 'gen9championsvgc2026regmb', level: 50, label: 'Reg M-B', start: '2026-06-17', end: '2026-09-09' },
  'M-C': { family: 'vgc', format: 'gen9championsvgc2026regmc', level: 50, label: 'Reg M-C', start: '2026-09-09', end: '2026-12-02' },
  ND: { family: 'showdown', format: 'gen9nationaldex', level: 100, label: 'National Dex' },
  NDD: { family: 'showdown', format: 'gen9nationaldexdoubles', level: 100, label: 'NatDex Doubles' },
};

export const REG_IDS = Object.keys(REGULATIONS);
export const VGC_IDS = REG_IDS.filter((r) => REGULATIONS[r].family === 'vgc');
export const SHOWDOWN_IDS = REG_IDS.filter((r) => REGULATIONS[r].family === 'showdown');

/** date: "YYYY-MM-DD" (UTC). Returns true if date falls in [start, end). Regs without a window never match. */
export function inWindow(date, reg) {
  const w = REGULATIONS[reg];
  if (!w || !w.start) return false;
  return date >= w.start && date < w.end;
}

export function regForDate(date) {
  for (const reg of VGC_IDS) if (inWindow(date, reg)) return reg;
  return null;
}
