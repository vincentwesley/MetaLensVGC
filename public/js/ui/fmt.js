// Small formatting helpers shared by section modules via ctx.fmt.
// Pure, no DOM.

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryNames = new Map();

export const fmt = {
  n(x) { return x == null ? '—' : Number(x).toLocaleString('en-US'); },
  // A real (nonzero) share never reads as 0: it shows as "<0.1%" instead.
  pct(x, digits = 1) {
    if (x == null) return '—';
    const v = (x * 100).toFixed(digits);
    return x > 0 && Number(v) === 0 ? `<${(10 ** -digits).toFixed(digits)}%` : `${v}%`;
  },
  signedPct(x, digits = 1) {
    if (x == null) return '—';
    const v = (x * 100).toFixed(digits);
    return x > 0 ? `+${v}%` : `${v}%`;
  },
  date(iso) { return iso ? iso.slice(0, 10) : '—'; },
  // ISO-2 region code -> English name ("BR" -> "Brazil"); the code itself if unknown.
  country(code) {
    if (!countryNames.has(code)) {
      let name = code;
      try { name = regionNames.of(code) || code; } catch { /* not a region code: show it as is */ }
      countryNames.set(code, name);
    }
    return countryNames.get(code);
  },
  compact(x) {
    if (x == null) return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(x);
  },
};
