// types.js — Type landscape: (a) type usage, (b) move types the field is weak
// to: for each attacking type, the share of the Pokémon in view that take each
// real multiplier (4×, 2×, ½×, ¼×, 0×). No averages: an averaged multiplier
// (e.g. "1.69×") is not a value the type chart can produce and read as one. Tournament-only (the ladder
// payload has no per-team mon lists to derive type slots from).
import { typeUsage, weaknesses } from '../lib/aggregate.js';
import { TYPE_COLORS } from '../lib/types.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

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

function makePanel(titleText, hint) {
  const card = document.createElement('div');
  card.className = 'card types-panel';
  const head = document.createElement('div');
  head.className = 'card__head';
  const h = document.createElement('h3');
  h.textContent = titleText;
  const meta = document.createElement('span');
  head.append(h, meta);
  const body = document.createElement('div');
  body.className = 'card__body';
  const chartEl = document.createElement('div');
  chartEl.className = 'types-panel__chart';
  const hintEl = clickHint(hint);
  body.append(hintEl, chartEl);
  card.append(head, body);
  return { card, meta, body, chartEl, hintEl };
}

function initChart(ctx, chartEl) {
  const inst = ctx.echarts.init(chartEl);
  new ResizeObserver(() => inst.resize()).observe(chartEl);
  return inst;
}

export default {
  id: 'types',
  title: 'Type Landscape',
  mount(el, ctx) {
    el.innerHTML = '';
    el.className = 'types-grid';
    // Each chart's click filters to exactly the Pokémon its bar counts.
    const usagePanel = makePanel('Type Usage', 'Share of the Pokémon in view that have each type. Click a type: only Pokémon of that type.');
    const weakPanel = makePanel('Move Types the Field Is Weak To', 'For a move of each type: the share of the Pokémon in view it hits for 4× or 2× (right) and ½×, ¼× or 0× (left); the rest take 1×. Click a type: only Pokémon of that type.');
    el.append(usagePanel.card, weakPanel.card);

    const usageChart = initChart(ctx, usagePanel.chartEl);
    const weakChart = initChart(ctx, weakPanel.chartEl);

    usageChart.on('click', (p) => p.data && ctx.chip('type', p.data.type, p.event?.event));
    // Each chart adds the chip that matches what it plots: the Pokémon's own type,
    // Pokémon carrying a move of that type, Pokémon weak to that type.
    // Owner's call: a type click is always a plain type filter, whichever chart.
    weakChart.on('click', (p) => p.data && ctx.chip('type', p.data.type, p.event?.event));

    let lastView = null;

    function baseAxis(theme) {
      return {
        axisLine: { lineStyle: { color: theme.axis } },
        axisLabel: { color: theme.muted, fontFamily: theme.fontFamily },
        splitLine: { lineStyle: { color: theme.grid } },
      };
    }

    function drawUsage(rows, theme) {
      const sorted = rows.slice().sort((a, b) => b.pct - a.pct);
      usageChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 90, right: 24, top: 8, bottom: 24 },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink },
          formatter: (p) => `${p.data.type}<br/>${(Number(p.value) * 100).toFixed(1)}% of Pokémon in view (${p.data.n})<br/><i>click: only ${p.data.type}-type Pokémon</i>`,
        },
        xAxis: { type: 'value', ...baseAxis(theme), axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => `${(v * 100).toFixed(0)}%` } },
        yAxis: { type: 'category', data: sorted.map((r) => r.type).reverse(), ...baseAxis(theme), axisTick: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, interval: 0 } },
        series: [{
          type: 'bar', barMaxWidth: 16, itemStyle: { borderRadius: [0, 4, 4, 0] },
          data: sorted.map((r) => ({ value: r.pct, type: r.type, n: r.n, itemStyle: { color: TYPE_COLORS[r.type] } })).reverse(),
        }],
      }, { notMerge: true });
    }

    const BUCKETS = [ // right of 0: weak; left: resisted (negative values)
      ['x2', '2×', 1], ['x4', '4×', 1], ['x05', '½×', -1], ['x025', '¼×', -1], ['x0', 'Immune (0×)', -1],
    ];
    const pctTxt = (v) => `${(v * 100).toFixed(0)}%`;
    function drawWeak(rows, theme) {
      const sorted = rows.slice().sort((a, b) => (b.x2 + b.x4) - (a.x2 + a.x4) || b.x4 - a.x4);
      const bound = Math.min(1, Math.ceil(Math.max(0.1, ...rows.map((r) => Math.max(r.weak, r.resist + r.immune))) * 5) / 5);
      const colors = { x2: theme.diverging.pos1, x4: theme.diverging.pos2, x05: theme.diverging.neg1, x025: theme.diverging.neg2, x0: theme.inkSecondary };
      weakChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 90, right: 24, top: 40, bottom: 24 },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink },
          formatter: (params) => {
            // item tooltips pass one object; axis tooltips pass an array
            const p0 = Array.isArray(params) ? params[0] : params;
            const type = p0?.data?.type;
            const w = rows.find((r) => r.type === type);
            if (!w) return '';
            const line = (k, label) => `${label}: ${pctTxt(w[k])}`;
            return `<b>${type} moves</b> vs the Pokémon in view<br/>${line('x4', '4×')} · ${line('x2', '2×')}<br/>${line('x1', '1×')}<br/>${line('x05', '½×')} · ${line('x025', '¼×')} · ${line('x0', '0×')}<br/><i>click: only ${type}-type Pokémon</i>`;
          },
        },
        legend: { data: BUCKETS.map((b) => b[1]), textStyle: { color: theme.inkSecondary }, top: 4, left: 'center', itemGap: 12 },
        // Symmetric around 0 and never past 100%: shares of the field, not magnitudes.
        xAxis: {
          type: 'value', ...baseAxis(theme), min: -bound, max: bound,
          axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => `${Math.abs(v * 100).toFixed(0)}%` },
        },
        yAxis: { type: 'category', data: sorted.map((r) => r.type).reverse(), ...baseAxis(theme), axisTick: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, interval: 0 } },
        series: BUCKETS.map(([k, name, sign]) => ({
          name, type: 'bar', stack: 'w', barMaxWidth: 16,
          itemStyle: { color: colors[k] },
          data: sorted.map((r) => ({ value: sign * r[k], type: r.type })).reverse(),
        })),
      }, { notMerge: true });
    }

    let lastRows = null;

    function render() {
      const view = lastView;
      if (!view) return;
      const state = view.state;
      const theme = ctx.chartTheme();

      if (state.source !== 'tournaments') {
        const ranked = state.source === 'ranked';
        for (const p of [usagePanel, weakPanel]) {
          ctx.meta(p.meta, ranked ? { source: rankedSource(null) } : { source: 'Ladder (Smogon)', n: 0, unit: 'battles' });
          emptyState(p.body, ranked ? RANKED_NA : 'Tournament-only view — switch Source to Tournaments');
        }
        lastRows = null;
        return;
      }

      const teams = view.monTeams;
      const n = teams.length;
      for (const p of [usagePanel, weakPanel]) {
        ctx.meta(p.meta, { source: 'Tournaments', n, unit: 'teams' });
        p.body.querySelector('.empty-state')?.remove();
        if (!p.body.contains(p.chartEl)) p.body.append(p.hintEl, p.chartEl);
      }
      if (!n) {
        for (const p of [usagePanel, weakPanel]) emptyState(p.body, 'Insufficient data');
        lastRows = null;
        return;
      }

      const rows = { usage: typeUsage(teams, view.dex), weak: weaknesses(teams, view.dex) };
      lastRows = rows;
      drawUsage(rows.usage, theme);
      drawWeak(rows.weak, theme);
    }

    ctx.onTheme((theme) => {
      if (!lastRows) return;
      drawUsage(lastRows.usage, theme);
      drawWeak(lastRows.weak, theme);
    });

    return {
      update(view) { lastView = view; render(); },
      highlight() { /* type panels have no per-species marks to emphasize */ },
    };
  },
};
