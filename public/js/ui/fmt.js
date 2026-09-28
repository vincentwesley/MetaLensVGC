// Small formatting helpers shared by section modules via ctx.fmt.
// Pure, no DOM.

export const fmt = {
  n(x) { return x == null ? '—' : Number(x).toLocaleString('en-US'); },
  pct(x, digits = 1) { return x == null ? '—' : `${(x * 100).toFixed(digits)}%`; },
  signedPct(x, digits = 1) {
    if (x == null) return '—';
    const v = (x * 100).toFixed(digits);
    return x > 0 ? `+${v}%` : `${v}%`;
  },
  date(iso) { return iso ? iso.slice(0, 10) : '—'; },
  compact(x) {
    if (x == null) return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(x);
  },
};
