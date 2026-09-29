// types.js — Type landscape: (a) type usage, (b) best attacking types right
// now, (c) most common weaknesses in the field. Tournament-only (the ladder
// payload has no per-team mon lists to derive type slots from).
import { typeUsage, attackingTypes, weaknesses } from '../lib/aggregate.js';
import { TYPE_COLORS } from '../lib/types.js';
import { RANKED_NA, rankedSource } from '../ui/meta.js';

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

function makePanel(titleText) {
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
  body.appendChild(chartEl);
  card.append(head, body);
  return { card, meta, body, chartEl };
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
    const usagePanel = makePanel('Type Usage');
    const atkPanel = makePanel('Best Attacking Types Right Now');
    const weakPanel = makePanel('Most Common Weaknesses in the Field');
    el.append(usagePanel.card, atkPanel.card, weakPanel.card);

    const usageChart = initChart(ctx, usagePanel.chartEl);
    const atkChart = initChart(ctx, atkPanel.chartEl);
    const weakChart = initChart(ctx, weakPanel.chartEl);

    usageChart.on('click', (p) => p.data && ctx.chip('type', p.data.type, p.event?.event));
    atkChart.on('click', (p) => p.data && ctx.chip('type', p.data.type, p.event?.event));
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
          formatter: (p) => `${p.data.type}<br/>usage: ${(p.data.pct * 100).toFixed(1)}% (${p.data.n} slots)`,
        },
        xAxis: { type: 'value', ...baseAxis(theme), axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => `${(v * 100).toFixed(0)}%` } },
        yAxis: { type: 'category', data: sorted.map((r) => r.type).reverse(), ...baseAxis(theme), axisTick: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, interval: 0 } },
        series: [{
          type: 'bar', barMaxWidth: 16, itemStyle: { borderRadius: [0, 4, 4, 0] },
          data: sorted.map((r) => ({ value: r.pct, type: r.type, n: r.n, itemStyle: { color: TYPE_COLORS[r.type] } })).reverse(),
        }],
      }, { notMerge: true });
    }

    function drawAttacking(rows, theme) {
      const sorted = rows.slice().sort((a, b) => b.score - a.score);
      atkChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 90, right: 24, top: 8, bottom: 24 },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink },
          formatter: (p) => `${p.data.type}<br/>mean effectiveness: ${p.data.score.toFixed(2)}×<br/>hits ${(p.data.se * 100).toFixed(0)}% of field super-effectively`,
        },
        xAxis: { type: 'value', min: 0, ...baseAxis(theme) },
        yAxis: { type: 'category', data: sorted.map((r) => r.type).reverse(), ...baseAxis(theme), axisTick: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, interval: 0 } },
        series: [{
          type: 'bar', barMaxWidth: 16, itemStyle: { borderRadius: [0, 4, 4, 0] },
          data: sorted.map((r) => ({ value: r.score, type: r.type, se: r.se, itemStyle: { color: TYPE_COLORS[r.type] } })).reverse(),
        }],
      }, { notMerge: true });
    }

    function drawWeak(rows, theme) {
      const sorted = rows.slice().sort((a, b) => b.weak - a.weak);
      weakChart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 90, right: 24, top: 40, bottom: 24 },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink },
          formatter: (params) => {
            const type = params[0].data.type;
            const w = rows.find((r) => r.type === type);
            return `${type}<br/>weak: ${(w.weak * 100).toFixed(0)}%<br/>resist: ${(w.resist * 100).toFixed(0)}%<br/>immune: ${(w.immune * 100).toFixed(0)}%`;
          },
        },
        legend: { data: ['Weak to', 'Resists/immune'], textStyle: { color: theme.inkSecondary }, top: 4, left: 'center', itemGap: 20 },
        xAxis: {
          type: 'value', ...baseAxis(theme),
          axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => `${Math.abs(v * 100).toFixed(0)}%` },
        },
        yAxis: { type: 'category', data: sorted.map((r) => r.type).reverse(), ...baseAxis(theme), axisTick: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, interval: 0 } },
        series: [
          {
            name: 'Weak to', type: 'bar', stack: 'w', barMaxWidth: 16,
            itemStyle: { color: theme.diverging.pos1, borderRadius: [0, 4, 4, 0] },
            data: sorted.map((r) => ({ value: r.weak, type: r.type })).reverse(),
          },
          {
            name: 'Resists/immune', type: 'bar', stack: 'w', barMaxWidth: 16,
            itemStyle: { color: theme.diverging.neg1, borderRadius: [4, 0, 0, 4] },
            data: sorted.map((r) => ({ value: -(r.resist + r.immune), type: r.type })).reverse(),
          },
        ],
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
        for (const p of [usagePanel, atkPanel, weakPanel]) {
          ctx.meta(p.meta, ranked ? { source: rankedSource(null) } : { source: 'Ladder (Smogon)', n: 0, unit: 'battles' });
          emptyState(p.body, ranked ? RANKED_NA : 'Tournament-only view — switch Source to Tournaments');
        }
        lastRows = null;
        return;
      }

      const teams = view.teams;
      const n = teams.length;
      for (const p of [usagePanel, atkPanel, weakPanel]) {
        ctx.meta(p.meta, { source: 'Tournaments', n, unit: 'teams' });
        p.body.querySelector('.empty-state')?.remove();
        if (!p.body.contains(p.chartEl)) p.body.appendChild(p.chartEl);
      }
      if (!n) {
        for (const p of [usagePanel, atkPanel, weakPanel]) emptyState(p.body, 'Insufficient data');
        lastRows = null;
        return;
      }

      const rows = { usage: typeUsage(teams, view.dex), atk: attackingTypes(teams, view.dex), weak: weaknesses(teams, view.dex) };
      lastRows = rows;
      drawUsage(rows.usage, theme);
      drawAttacking(rows.atk, theme);
      drawWeak(rows.weak, theme);
    }

    ctx.onTheme((theme) => {
      if (!lastRows) return;
      drawUsage(lastRows.usage, theme);
      drawAttacking(lastRows.atk, theme);
      drawWeak(lastRows.weak, theme);
    });

    return {
      update(view) { lastView = view; render(); },
      highlight() { /* type panels have no per-species marks to emphasize */ },
    };
  },
};
