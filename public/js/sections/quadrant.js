// quadrant.js — Usage vs win-rate scatter: sprite markers, split lines at
// median usage / 50% win, four quadrant labels. Tournament-only (ladder has
// no win rate, so a win axis isn't meaningful there).
import { usage } from '../lib/aggregate.js';
import { RANKED_NA, rankedSource } from '../ui/meta.js';

const QUADRANTS = [
  { id: 'pillars', label: 'Meta Pillars', xHigh: true, yHigh: true },
  { id: 'gems', label: 'Hidden Gems', xHigh: false, yHigh: true },
  { id: 'overhyped', label: 'Overhyped', xHigh: true, yHigh: false },
  { id: 'fringe', label: 'Fringe', xHigh: false, yHigh: false },
];

function emptyState(el, title) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state';
  const h = document.createElement('div');
  h.className = 'empty-state__title';
  h.textContent = title;
  box.appendChild(h);
  el.appendChild(box);
}

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default {
  id: 'quadrant',
  title: 'Usage × Win Rate Quadrant',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card__head';
    const h = document.createElement('h3');
    h.textContent = 'Usage × Win Rate Quadrant';
    const meta = document.createElement('span');
    head.append(h, meta);
    const body = document.createElement('div');
    body.className = 'card__body';
    const chartEl = document.createElement('div');
    chartEl.className = 'quadrant__chart';
    body.appendChild(chartEl);
    card.append(head, body);
    el.appendChild(card);

    const chart = ctx.echarts.init(chartEl);
    new ResizeObserver(() => { chart.resize(); positionLabels(); }).observe(chartEl);

    let lastRows = null;
    let lastBounds = null;

    chart.on('click', (p) => { if (p.data?.key) ctx.chip('species', p.data.key, p.event?.event); });
    chart.on('mouseover', (p) => { if (p.data?.key) ctx.hover(p.data.key); });
    chart.on('mouseout', () => ctx.hover(null));

    function positionLabels() {
      if (!lastBounds) return;
      const { xMedian, yMin, yMax, xMin, xMax } = lastBounds;
      // x is a log axis: the midpoint between two bounds on a log scale is
      // their geometric mean, not their arithmetic mean.
      const geoMid = (a, b) => Math.sqrt(Math.max(a, 1e-6) * Math.max(b, 1e-6));
      const graphics = QUADRANTS.map((q) => {
        const x = q.xHigh ? geoMid(xMedian, xMax) : geoMid(xMin, xMedian);
        const y = q.yHigh ? (50 + yMax) / 2 : (yMin + 50) / 2;
        const px = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y]);
        if (!px) return null;
        return {
          id: q.id, type: 'text', left: px[0], top: px[1],
          style: { text: q.label, fill: ctx.chartTheme().muted, fontFamily: ctx.chartTheme().labelFontFamily, fontSize: 11, opacity: 0.75 },
          z: 5, silent: true,
        };
      }).filter(Boolean);
      chart.setOption({ graphic: graphics });
    }

    function draw(rows, theme) {
      // Round axis bounds to whole percent: ECharts places a label at the
      // exact configured min/max (in addition to its "nice" interior ticks),
      // so a raw float here renders as a long unrounded string that overflows
      // the chart edge.
      const xVals = rows.map((r) => r.pct * 100);
      const xMax = Math.ceil((Math.max(...xVals) * 1.15 || 10));
      // Usage %% spans orders of magnitude (a handful of teams up to a majority
      // of them), which crams everything into the left edge on a linear axis.
      // Log scale needs a positive min: round the smallest data point down to
      // its power of ten (e.g. 0.4% -> 0.1%) so every point stays on-chart.
      const xMin = Math.pow(10, Math.floor(Math.log10(Math.max(Math.min(...xVals), 0.01))));
      const yVals = rows.map((r) => r.winPct * 100);
      const yMin = Math.floor(Math.max(0, Math.min(...yVals) - 5));
      const yMax = Math.ceil(Math.min(100, Math.max(...yVals) + 5));
      const xMedian = median(xVals);
      lastBounds = { xMedian, yMin, yMax: Math.max(yMax, 55), xMin, xMax };

      chart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 56, right: 24, top: 16, bottom: 40 },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border, textStyle: { color: theme.ink },
          formatter: (p) => `<b>${p.data.key}</b><br/>usage: ${(p.data.value[0]).toFixed(1)}%<br/>win: ${(p.data.value[1]).toFixed(1)}%<br/>n=${p.data.n}`,
        },
        xAxis: {
          type: 'log', logBase: 10, name: 'Usage % (log scale)', nameLocation: 'middle', nameGap: 28,
          min: lastBounds.xMin, max: lastBounds.xMax,
          axisLine: { lineStyle: { color: theme.axis } },
          axisLabel: { color: theme.muted, formatter: (v) => (v < 1 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`) },
          splitLine: { lineStyle: { color: theme.grid } },
        },
        yAxis: {
          type: 'value', name: 'Win %', min: lastBounds.yMin, max: lastBounds.yMax,
          axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, formatter: (v) => `${Math.round(v)}%` },
          splitLine: { lineStyle: { color: theme.grid } },
        },
        series: [{
          type: 'scatter',
          symbol: (v, p) => `image://${ctx.spriteUrl(p.data.key)}`,
          symbolSize: 30,
          data: rows.map((r) => ({ value: [r.pct * 100, r.winPct * 100], key: r.key, n: r.n })),
          markLine: {
            symbol: 'none', silent: true,
            lineStyle: { color: theme.axis, type: 'dashed', width: 2 },
            label: { show: false },
            data: [{ xAxis: xMedian }, { yAxis: 50 }],
          },
        }],
      }, { notMerge: true });
      positionLabels();
    }

    let lastView = null;
    function render() {
      const view = lastView;
      if (!view) return;
      const state = view.state;
      if (state.source !== 'tournaments') {
        const ranked = state.source === 'ranked';
        ctx.meta(meta, ranked ? { source: rankedSource(null) } : { source: 'Ladder (Smogon)', n: 0, unit: 'battles' });
        emptyState(body, ranked ? RANKED_NA : 'Tournament-only view — switch Source to Tournaments');
        lastRows = null;
        return;
      }
      const rows = usage(view.teams).filter((r) => r.n >= state.minN && r.winPct != null);
      ctx.meta(meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams' });
      body.querySelector('.empty-state')?.remove();
      if (!body.contains(chartEl)) body.appendChild(chartEl);
      if (rows.length < 2) {
        emptyState(body, 'Insufficient data');
        lastRows = null;
        return;
      }
      lastRows = rows;
      draw(rows, ctx.chartTheme());
    }

    ctx.onTheme((theme) => { if (lastRows) draw(lastRows, theme); });

    return {
      update(view) { lastView = view; render(); },
      highlight(key) {
        if (!lastRows) return;
        const idx = key ? lastRows.findIndex((r) => r.key === key) : -1;
        chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
        if (idx >= 0) chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
      },
    };
  },
};
