// Archetypes section: primary-archetype split donut, archetype-vs-archetype
// win-rate heatmap (real match results only), and a classification disclosure.
import { archetypeSplit, archetypeMatrix } from '../lib/aggregate.js';
import { ARCHETYPES } from '../lib/archetypes.js';
import { RANKED_NA, rankedSource } from '../ui/meta.js';

function card(title) {
  const el = document.createElement('div');
  el.className = 'card';
  const head = document.createElement('div');
  head.className = 'card__head';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  const meta = document.createElement('div');
  meta.className = 'meta-line';
  head.append(h3, meta);
  const body = document.createElement('div');
  body.className = 'card__body';
  el.append(head, body);
  return { el, body, meta };
}

function emptyState(msg, title = 'Insufficient data') {
  const div = document.createElement('div');
  div.className = 'empty-state';
  const t = document.createElement('div');
  t.className = 'empty-state__title';
  t.textContent = title;
  const p = document.createElement('div');
  p.textContent = msg;
  div.append(t, p);
  return div;
}

function labelOf(id) {
  if (id === 'other') return 'Other';
  return ARCHETYPES.find((a) => a.id === id)?.label || id;
}

// Short forms for the heatmap's own axes only — tooltips, the legend table
// and the donut always use the full labelOf() name. Without this, long
// labels like "Psychic Terrain Trick Room" get clipped against the grid.
const SHORT_AXIS = {
  'sala-fakeout': 'Mence+FO',
  'psy-tr': 'Psychic TR',
};
function axisLabelOf(id) {
  return SHORT_AXIS[id] || labelOf(id);
}

// Luminance-aware cell text: compute the *actual* rendered background colour
// at this cell (interpolated across the diverging ramp, the same way
// ECharts' visualMap does it) and pick ink/white off its real luminance,
// plus a thin halo of the opposite so text stays legible even near the
// ramp's pale middle where a hard norm<0.25/>0.75 cutoff washes out.
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function mixRgb(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function relLuminance([r, g, b]) {
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function divergingColorAt(div, norm) {
  const stops = [div.neg2, div.neg1, div.mid, div.pos1, div.pos2].map(hexToRgb);
  const t = Math.min(1, Math.max(0, norm)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mixRgb(stops[i], stops[i + 1], t - i);
}
function cellLabelStyle(div, norm) {
  const dark = relLuminance(divergingColorAt(div, norm)) > 0.45;
  return dark ? { fill: '#141008', halo: 'rgba(255,255,255,.85)' } : { fill: '#fbf8f0', halo: 'rgba(0,0,0,.55)' };
}

// aggregate.js#archetypeMatrix only records the "a" side of each match into
// cell (ia|ib); it never mirrors the same match into (ib|ia) from b's
// perspective. For a true row-vs-col win-rate matrix every match must count
// once from each side. Local workaround (reported, not editing the lib).
function fullMatrix(mat) {
  const m = new Map();
  const add = (row, col, w, l, n) => {
    const k = `${row}|${col}`;
    const c = m.get(k) || { w: 0, l: 0, n: 0 };
    c.w += w; c.l += l; c.n += n;
    m.set(k, c);
  };
  for (const c of mat.cells) {
    add(c.a, c.b, c.w, c.l, c.n);
    add(c.b, c.a, c.l, c.w, c.n);
  }
  return m;
}

export default {
  id: 'archetypes',
  title: 'Archetypes',
  mount(el, ctx) {
    el.classList.add('sb-grid');

    const donut = card('Archetype split');
    const heat = card('Archetype matchup win rate');
    const disc = card('How archetypes are classified');
    donut.el.classList.add('sb-full');
    heat.el.classList.add('sb-full');
    disc.el.classList.add('sb-full');
    el.append(donut.el, heat.el, disc.el);

    // --- static disclosure -------------------------------------------------
    const discWrap = document.createElement('div');
    discWrap.className = 'sb-disclosure';
    for (const a of ARCHETYPES) {
      const d = document.createElement('details');
      const s = document.createElement('summary');
      s.textContent = a.label;
      const p = document.createElement('p');
      p.textContent = a.desc;
      d.append(s, p);
      discWrap.appendChild(d);
    }
    {
      const d = document.createElement('details');
      const s = document.createElement('summary');
      s.textContent = 'Other';
      const p = document.createElement('p');
      p.textContent = 'None of the rules above matched this team.';
      d.append(s, p);
      discWrap.appendChild(d);
    }
    disc.body.appendChild(discWrap);

    // --- donut + legend side by side (falls back to stacked on narrow screens) ---
    const donutRow = document.createElement('div');
    donutRow.className = 'sb-split';
    donut.body.appendChild(donutRow);

    const donutChartEl = document.createElement('div');
    donutChartEl.className = 'sb-chart';
    donutRow.appendChild(donutChartEl);
    const donutChart = ctx.echarts.init(donutChartEl);
    new ResizeObserver(() => donutChart.resize()).observe(donutChartEl);

    const listWrap = document.createElement('div');
    listWrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Archetype</th><th>n</th><th>Share</th><th>Win %</th></tr></thead><tbody></tbody>';
    listWrap.appendChild(table);
    donutRow.appendChild(listWrap);

    // --- heatmap ---------------------------------------------------------
    const heatChartEl = document.createElement('div');
    heatChartEl.className = 'sb-chart sb-chart--tall';
    const heatEmptyEl = document.createElement('div');
    heat.body.append(heatChartEl, heatEmptyEl);
    const heatChart = ctx.echarts.init(heatChartEl);
    new ResizeObserver(() => heatChart.resize()).observe(heatChartEl);

    let lastSplit = [];
    let lastIds = [];

    function renderDonut(theme) {
      donutChartEl.style.display = lastSplit.length ? '' : 'none';
      if (!lastSplit.length) return;
      donutChart.setOption({
        color: theme.series,
        tooltip: {
          trigger: 'item',
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const r = lastSplit[p.dataIndex];
            const win = r.winPct != null ? `${(r.winPct * 100).toFixed(1)}%` : '—';
            return `<b>${labelOf(r.id)}</b><br/>n=${r.n} (${(r.pct * 100).toFixed(1)}%)<br/>win rate ${win}`;
          },
        },
        series: [{
          type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: theme.surface, borderWidth: 2 },
          label: { color: theme.ink, fontFamily: theme.fontFamily, formatter: '{b}: {d}%' },
          labelLine: { lineStyle: { color: theme.axis } },
          data: lastSplit.map((r) => ({ name: labelOf(r.id), value: r.n, archId: r.id })),
        }],
      }, true);
    }

    function renderList() {
      const tbody = table.querySelector('tbody');
      tbody.textContent = '';
      for (const r of lastSplit) {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = labelOf(r.id);
        const tdN = document.createElement('td');
        tdN.className = 'num';
        tdN.textContent = ctx.fmt.n(r.n);
        const tdPct = document.createElement('td');
        tdPct.className = 'num';
        tdPct.textContent = ctx.fmt.pct(r.pct);
        const tdWin = document.createElement('td');
        tdWin.className = 'num';
        tdWin.textContent = r.winPct != null ? ctx.fmt.pct(r.winPct) : '—';
        tr.append(tdName, tdN, tdPct, tdWin);
        tr.addEventListener('click', (e) => ctx.chip('archetype', r.id, e));
        tbody.appendChild(tr);
      }
    }

    function renderHeatmap(view, theme) {
      const mat = archetypeMatrix(view.teams, view.matches);
      if (!mat) {
        heatChartEl.style.display = 'none';
        heatEmptyEl.textContent = '';
        heatEmptyEl.appendChild(emptyState('No head-to-head match results for the current filters.'));
        lastIds = [];
        return;
      }
      heatChartEl.style.display = '';
      heatEmptyEl.textContent = '';
      const full = fullMatrix(mat);
      const order = new Map(lastSplit.map((r, i) => [r.id, i]));
      const ids = mat.ids.slice().sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
      lastIds = ids;
      const div = theme.diverging;
      const good = [];
      const bad = [];
      for (let r = 0; r < ids.length; r++) {
        for (let c = 0; c < ids.length; c++) {
          const cell = full.get(`${ids[r]}|${ids[c]}`);
          const n = cell?.n || 0;
          const games = cell ? cell.w + cell.l : 0;
          if (n >= 10 && games > 0) {
            const val = +(cell.w / games * 100).toFixed(1);
            // Per-item static label colour, NOT a series-level label.color
            // callback: this vendored ECharts silently drops the label for
            // most points when label.color is a function on a heatmap
            // series (confirmed by direct canvas pixel sampling — verified
            // present in getOption() but never painted). A plain per-item
            // override renders reliably.
            const style = cellLabelStyle(div, val / 100);
            good.push({ value: [c, r, val, n], label: { color: style.fill, textBorderColor: style.halo } });
          } else {
            bad.push({ value: [c, r, null, n] });
          }
        }
      }
      const labels = ids.map(labelOf);
      const shortLabels = ids.map(axisLabelOf);
      // A narrow (mobile) container can't fit 10 rotated text columns plus
      // in-cell percentages without them running together — shrink the
      // grid margin/font and drop in-cell numbers (still on the tooltip).
      const narrow = heatChartEl.clientWidth > 0 && heatChartEl.clientWidth < 640;
      heatChart.setOption({
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const [c, r, val, n] = p.data.value;
            const row = labels[r]; const col = labels[c];
            if (val == null) return `<b>${row}</b> vs <b>${col}</b><br/>insufficient data (n=${n})`;
            return `<b>${row}</b> vs <b>${col}</b><br/>${row} wins ${val}% (n=${n})`;
          },
        },
        grid: { left: narrow ? 74 : 130, right: 20, top: 10, bottom: narrow ? 60 : 80, containLabel: false },
        xAxis: { type: 'category', data: shortLabels, axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, rotate: 35, interval: 0, fontSize: narrow ? 9 : 11 }, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        yAxis: { type: 'category', data: shortLabels, axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: narrow ? 9 : 11 }, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        visualMap: {
          // dimension must be explicit: this ECharts build doesn't auto-pick
          // the value dim (index 2) for heatmap series, and silently paints
          // every cell the same fallback color without it. Reported upstream.
          min: 0, max: 100, dimension: 2, seriesIndex: 0, show: true, calculable: false,
          orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
          text: ['row wins more', 'col wins more'],
          textStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 10 },
          inRange: { color: [div.neg2, div.neg1, div.mid, div.pos1, div.pos2] },
        },
        series: [
          {
            type: 'heatmap', data: good,
            label: {
              show: !narrow, formatter: (p) => `${p.data.value[2].toFixed(0)}%`,
              textBorderWidth: 1.2,
              // See above: label font is bold/blocky and legible at small
              // sizes (VT323, the retro body font, is too thin at 11px).
              fontFamily: theme.labelFontFamily, fontSize: 11, fontWeight: 700,
            },
            itemStyle: { borderColor: theme.surface, borderWidth: 2 },
            emphasis: { itemStyle: { borderColor: theme.ink, borderWidth: 2 } },
          },
          {
            type: 'heatmap', data: bad,
            label: { show: false },
            itemStyle: { color: theme.grid, borderColor: theme.surface, borderWidth: 2 },
          },
        ],
      }, true);
    }

    function rerender(view) {
      const theme = ctx.chartTheme();
      renderDonut(theme);
      renderList();
      renderHeatmap(view, theme);
    }

    let lastView = null;
    ctx.onTheme(() => { if (lastView) rerender(lastView); });

    donutChart.on('click', (p) => {
      const r = lastSplit[p.dataIndex];
      if (r) ctx.chip('archetype', r.id, p.event?.event);
    });
    heatChart.on('click', (p) => {
      if (p.seriesIndex == null || !p.data) return;
      const rowId = lastIds[p.data.value[1]];
      if (rowId) ctx.chip('archetype', rowId, p.event?.event);
    });

    return {
      update(view) {
        lastView = view;
        if (view.state.source !== 'tournaments') {
          const ranked = view.state.source === 'ranked';
          lastSplit = [];
          donutChartEl.style.display = 'none';
          listWrap.style.display = 'none';
          heatChartEl.style.display = 'none';
          heatEmptyEl.textContent = '';
          heatEmptyEl.appendChild(ranked ? emptyState(RANKED_NA, 'Tournament-only view') : emptyState('Switch Source to Tournaments to see archetype splits and matchups.', 'Tournament-only view'));
          ctx.meta(donut.meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'teams' });
          ctx.meta(heat.meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'matches' });
          return;
        }
        listWrap.style.display = '';
        lastSplit = archetypeSplit(view.teams).filter((r) => r.n >= view.state.minN);
        if (!lastSplit.length) {
          donutChartEl.style.display = 'none';
          listWrap.style.display = 'none';
        } else {
          donutChartEl.style.display = '';
          listWrap.style.display = '';
        }
        rerender(view);
        ctx.meta(donut.meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams' });
        ctx.meta(heat.meta, { source: 'Tournaments', n: view.matches?.length || 0, unit: 'matches' });
      },
      highlight() {
        // No species-keyed marks in this section.
      },
    };
  },
};
