// Reads the current skin/theme CSS custom properties and exposes them as a plain
// theme object sections can spread into ECharts option objects, plus an
// `echartsBase(theme)` helper with the common option fragments already filled in.
// ctx.chartTheme() / ctx.onTheme(fn) in main.js wrap these.

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartTheme() {
  const root = document.documentElement;
  const explicitTheme = root.getAttribute('data-theme');
  const isDark = explicitTheme === 'dark'
    || (explicitTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  return {
    isDark,
    fontFamily: cssVar('--font-body', 'system-ui'),
    labelFontFamily: cssVar('--font-label', 'system-ui'),
    ink: cssVar('--ink', '#111'),
    inkSecondary: cssVar('--ink-2', '#555'),
    muted: cssVar('--muted', '#888'),
    grid: cssVar('--grid', '#ddd'),
    axis: cssVar('--axis', '#ccc'),
    surface: cssVar('--surface-1', '#fff'),
    tooltipBg: cssVar('--tooltip-bg', '#fff'),
    border: cssVar('--border', 'rgba(0,0,0,.15)'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--series-${i}`)),
    sequential: [1, 2, 3, 4, 5, 6, 7].map((i) => cssVar(`--seq-${i}`)),
    diverging: { neg2: cssVar('--div-neg-2'), neg1: cssVar('--div-neg-1'), mid: cssVar('--div-mid'), pos1: cssVar('--div-pos-1'), pos2: cssVar('--div-pos-2') },
    status: {
      good: cssVar('--status-good'), warning: cssVar('--status-warning'),
      serious: cssVar('--status-serious'), critical: cssVar('--status-critical'),
    },
  };
}

/** Common ECharts option fragments (color, text, tooltip, axes) built from a theme object. */
export function echartsBase(theme) {
  return {
    color: theme.series,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: theme.fontFamily, color: theme.ink },
    tooltip: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.border,
      textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
    },
    legend: { textStyle: { color: theme.inkSecondary, fontFamily: theme.fontFamily } },
    axisLine: { lineStyle: { color: theme.axis } },
    axisLabel: { color: theme.muted, fontFamily: theme.fontFamily },
    splitLine: { lineStyle: { color: theme.grid } },
  };
}

// Every chart's tooltip stays inside its chart (so it never runs off the screen,
// e.g. near the edge on a phone) and wraps long lines instead of growing wider
// than the viewport. ECharts' default tooltip CSS is `white-space: nowrap`.
const TOOLTIP_CSS = 'white-space:normal;width:max-content;max-width:min(320px,calc(100vw - 32px));overflow-wrap:anywhere;';
export function withChartDefaults(opt) {
  if (!opt || typeof opt !== 'object') return opt;
  const fix = (t) => (t && typeof t === 'object'
    ? { confine: true, ...t, extraCssText: TOOLTIP_CSS + (t.extraCssText || '') }
    : t);
  const out = { ...opt };
  if (opt.tooltip) out.tooltip = Array.isArray(opt.tooltip) ? opt.tooltip.map(fix) : fix(opt.tooltip);
  // Screen readers: ECharts generates a text description of the data.
  if (opt.series && !('aria' in opt)) out.aria = { enabled: true };
  return out;
}

const subs = new Set();
export function onTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notifyThemeSubs() { const t = chartTheme(); subs.forEach((fn) => fn(t)); }
