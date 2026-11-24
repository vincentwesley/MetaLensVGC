// Regulation windows (verified, see data-raw/recon/format-facts.md). `end` is exclusive; `end: null` = open-ended (the
// newest regulation before its end date is announced).
// family 'vgc' = Champions regs with a date window; 'showdown' = Smogon-ladder-only formats
// (no window, no tournaments/ranked, rolling last 3 months of stats).
export const REGULATIONS = {
  'M-A': { family: 'vgc', format: 'gen9championsvgc2026regma', level: 50, label: 'Reg M-A', start: '2026-04-08', end: '2026-06-17' },
  'M-B': { family: 'vgc', format: 'gen9championsvgc2026regmb', level: 50, label: 'Reg M-B', start: '2026-06-17', end: '2026-09-09' },
  'M-C': { family: 'vgc', format: 'gen9championsvgc2026regmc', level: 50, label: 'Reg M-C', start: '2026-09-09', end: '2026-12-02' },
  // M-D: format id follows the M-A..M-C pattern (Showdown had not published it on 2026-11-24); set `end` once announced.
  'M-D': { family: 'vgc', format: 'gen9championsvgc2026regmd', level: 50, label: 'Reg M-D', start: '2026-12-02', end: null },
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
  return date >= w.start && (w.end == null || date < w.end);
}

/** Regulation ids the site lists on `today` ("YYYY-MM-DD"): every Showdown reg, and VGC regs that have started. */
export function listedRegs(today) {
  return REG_IDS.filter((r) => REGULATIONS[r].family !== 'vgc' || REGULATIONS[r].start <= today);
}

export const MIN_CURRENT_TEAMS = 50; // a new regulation becomes the default view once it has this many tournament teams

/**
 * The default VGC regulation: the newest listed one with MIN_CURRENT_TEAMS+ tournament teams, else the newest listed one
 * before it (so the first days of a new regulation, with no results yet, keep showing the previous one).
 * entries: manifest regs ({id, family, teams}).
 */
export function pickCurrent(entries) {
  const vgc = entries.filter((e) => e.family === 'vgc').sort((a, b) => VGC_IDS.indexOf(a.id) - VGC_IDS.indexOf(b.id));
  if (!vgc.length) return null;
  const last = vgc[vgc.length - 1];
  if (last.teams >= MIN_CURRENT_TEAMS || vgc.length === 1) return last.id;
  return vgc[vgc.length - 2].id;
}

export function regForDate(date) {
  for (const reg of VGC_IDS) if (inWindow(date, reg)) return reg;
  return null;
}
