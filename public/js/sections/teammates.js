// teammates.js — co-usage heatmap of the top ~15 species (Raw % / Lift toggle,
// sprite axis labels), top 3-Pokémon cores, and a ladder-side "teammate rate"
// list for a picked species. The heatmap/cores need real per-team rosters, so
// they're tournament-only; the ladder list is its own independent panel (not
// gated by the Source toggle) since Smogon chaos stats carry teammate % too.
import { usage, coUsage, cores, ladderMerge } from '../lib/aggregate.js';

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

function richKey(k) { return `sp_${k.replace(/[^a-zA-Z0-9]/g, '_')}`; }

export default {
  id: 'teammates',
  title: 'Teammates & Cores',
  mount(el, ctx) {
    el.classList.add('sb-grid');

    const heat = card('Teammate co-usage');
    const coresCard = card('Top cores');
    const ladderCard = card('Ladder teammate rate');
    heat.el.classList.add('sb-full');
    coresCard.el.classList.add('sb-full');
    ladderCard.el.classList.add('sb-full');
    el.append(heat.el, coresCard.el, ladderCard.el);

    // --- heatmap: Raw % / Lift toggle -------------------------------------
    const controls = document.createElement('div');
    controls.className = 'sb-controls';
    const modeSeg = document.createElement('div');
    modeSeg.className = 'segmented';
    modeSeg.setAttribute('role', 'radiogroup');
    modeSeg.setAttribute('aria-label', 'Co-usage metric');
    const btnRaw = document.createElement('button');
    btnRaw.type = 'button'; btnRaw.textContent = 'Raw %';
    const btnLift = document.createElement('button');
    btnLift.type = 'button'; btnLift.textContent = 'Lift';
    btnLift.setAttribute('data-tip', 'Lift = P(both) / (P(a) × P(b)). 1.0 = no relationship; >1 = seen together more than chance.');
    modeSeg.append(btnRaw, btnLift);
    controls.appendChild(modeSeg);
    heat.body.appendChild(controls);

    const heatChartEl = document.createElement('div');
    heatChartEl.className = 'sb-chart sb-chart--tall';
    const heatEmptyEl = document.createElement('div');
    heat.body.append(heatChartEl, heatEmptyEl);
    const heatChart = ctx.echarts.init(heatChartEl);
    new ResizeObserver(() => heatChart.resize()).observe(heatChartEl);

    let mode = 'raw';
    function setMode(m) {
      mode = m;
      btnRaw.setAttribute('aria-pressed', String(m === 'raw'));
      btnLift.setAttribute('aria-pressed', String(m === 'lift'));
      if (lastView) renderHeat(lastView, ctx.chartTheme());
    }
    btnRaw.addEventListener('click', () => setMode('raw'));
    btnLift.addEventListener('click', () => setMode('lift'));

    let lastKeys = [];
    heatChart.on('click', (p) => {
      if (p.seriesIndex == null || !p.data) return;
      const [c, r] = p.data;
      if (r === c || !lastKeys[r] || !lastKeys[c]) return;
      ctx.chip('core', [lastKeys[r], lastKeys[c]], p.event?.event);
    });

    function renderHeat(view, theme) {
      if (view.state.source === 'ladder') {
        heatChartEl.style.display = 'none';
        heatEmptyEl.textContent = '';
        heatEmptyEl.appendChild(emptyState('Switch Source to Tournaments to see teammate co-usage.', 'Tournament-only view'));
        lastKeys = [];
        ctx.meta(heat.meta, { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      const rows = usage(view.teams).filter((r) => r.n >= view.state.minN);
      ctx.meta(heat.meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams' });
      if (rows.length < 2) {
        heatChartEl.style.display = 'none';
        heatEmptyEl.textContent = '';
        heatEmptyEl.appendChild(emptyState('Insufficient data'));
        lastKeys = [];
        return;
      }
      heatChartEl.style.display = '';
      heatEmptyEl.textContent = '';
      const keys = rows.slice(0, 15).map((r) => r.key);
      lastKeys = keys;
      const co = coUsage(view.teams, keys);
      const good = [];
      const bad = [];
      for (let r = 0; r < keys.length; r++) {
        for (let c = 0; c < keys.length; c++) {
          const n = co.n[r][c];
          if (r === c || n < view.state.minN) { bad.push([c, r, null, n]); continue; }
          const val = mode === 'lift' ? co.lift[r][c] : co.pct[r][c] * 100;
          good.push([c, r, val, n]);
        }
      }
      const rich = {};
      for (const k of keys) rich[richKey(k)] = { height: 20, width: 20, backgroundColor: { image: ctx.spriteUrl(k) } };
      const axisLabel = { formatter: (v) => `{${richKey(v)}|}`, rich, margin: 8 };
      const div = theme.diverging;
      const rawMax = Math.max(1, ...good.map((d) => d[2]));
      heatChart.setOption({
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const [c, r, val, n] = p.data;
            if (r === c) return `<b>${keys[r]}</b><br/>solo usage n=${n}`;
            if (val == null) return `<b>${keys[r]}</b> + <b>${keys[c]}</b><br/>insufficient data (n=${n})`;
            const label = mode === 'lift' ? `lift ${val.toFixed(2)}×` : `${val.toFixed(1)}% of teams together`;
            return `<b>${keys[r]}</b> + <b>${keys[c]}</b><br/>${label} (n=${n})`;
          },
        },
        grid: { left: 30, right: 20, top: 10, bottom: 60, containLabel: false },
        xAxis: { type: 'category', data: keys, axisLabel, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        yAxis: { type: 'category', data: keys, axisLabel, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        // dimension must be explicit: this ECharts build doesn't auto-pick the
        // value dim (index 2) for heatmap series, and silently paints every
        // cell the same fallback color without it. Reported upstream.
        visualMap: mode === 'lift'
          ? {
            min: 0, max: 2, dimension: 2, seriesIndex: 0, show: true, calculable: false,
            orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
            text: ['often together', 'rarely together'],
            textStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 10 },
            inRange: { color: [div.neg2, div.neg1, div.mid, div.pos1, div.pos2] },
          }
          : {
            min: 0, max: rawMax, dimension: 2, seriesIndex: 0, show: true, calculable: false,
            orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
            textStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 10 },
            inRange: { color: theme.sequential },
          },
        series: [
          {
            type: 'heatmap', data: good,
            label: {
              show: true,
              formatter: (p) => (mode === 'lift' ? p.data[2].toFixed(1) : `${p.data[2].toFixed(0)}%`),
              // Both ramps get dark near an end (sequential: high end; diverging:
              // both saturated ends) — dark ink text there is unreadable, so pick
              // light text near those ends and keep ink over the light middle.
              color: (p) => {
                const v = p.data[2];
                const norm = mode === 'lift' ? v / 2 : v / rawMax;
                const nearDarkEnd = mode === 'lift' ? (norm < 0.25 || norm > 0.75) : norm > 0.6;
                return nearDarkEnd ? '#fff' : theme.ink;
              },
              fontFamily: theme.fontFamily, fontSize: 9,
            },
            itemStyle: { borderColor: theme.surface, borderWidth: 2 },
            emphasis: { itemStyle: { borderColor: theme.ink, borderWidth: 2 } },
          },
          {
            type: 'heatmap', data: bad, label: { show: false },
            itemStyle: { color: theme.grid, borderColor: theme.surface, borderWidth: 2 },
          },
        ],
      }, true);
    }

    // --- top cores ---------------------------------------------------------
    const coresWrap = document.createElement('div');
    coresCard.body.appendChild(coresWrap);

    function renderCores(view) {
      coresWrap.textContent = '';
      if (view.state.source === 'ladder') {
        coresWrap.appendChild(emptyState('Switch Source to Tournaments to see top cores.', 'Tournament-only view'));
        ctx.meta(coresCard.meta, { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      const rows = cores(view.teams, 3, 10, view.state.minN);
      ctx.meta(coresCard.meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams' });
      if (!rows.length) { coresWrap.appendChild(emptyState('Insufficient data')); return; }
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'sb-row sb-row--clickable';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        const sprites = document.createElement('div');
        sprites.className = 'sb-sprites';
        for (const k of r.keys) sprites.appendChild(ctx.sprite(k, { size: 28, animated: view.state.anim }));
        const names = document.createElement('div');
        names.className = 'sb-names';
        names.textContent = r.keys.join(' + ');
        const n = document.createElement('div');
        n.className = 'sb-stat sb-stat--muted';
        n.textContent = `n=${ctx.fmt.n(r.n)}`;
        const pct = document.createElement('div');
        pct.className = 'sb-stat';
        pct.textContent = ctx.fmt.pct(r.pct);
        const win = document.createElement('div');
        win.className = `sb-stat${r.winPct == null ? ' sb-stat--muted' : ''}`;
        win.textContent = r.winPct != null ? ctx.fmt.pct(r.winPct) : '—';
        row.append(sprites, names, n, pct, win);
        const act = (e) => ctx.chip('core', r.keys, e);
        row.addEventListener('click', act);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        coresWrap.appendChild(row);
      }
    }

    // --- ladder teammate rate for a picked species --------------------------
    const ladderControls = document.createElement('div');
    ladderControls.className = 'sb-controls';
    const ladderLabel = document.createElement('span');
    ladderLabel.className = 'filterbar__label';
    ladderLabel.textContent = 'Species';
    const ladderSelect = document.createElement('select');
    ladderControls.append(ladderLabel, ladderSelect);
    const ladderList = document.createElement('div');
    ladderCard.body.append(ladderControls, ladderList);

    let lastMerged = null;
    function renderLadderList() {
      ladderList.textContent = '';
      if (!lastMerged) {
        ladderList.appendChild(emptyState('No ladder data for this regulation.'));
        return;
      }
      const mon = lastMerged.mons.find((m) => m.key === ladderSelect.value);
      if (!mon || !mon.teammates.length) {
        ladderList.appendChild(emptyState('No teammate data for this species.'));
        return;
      }
      for (const t of mon.teammates.slice(0, 12)) {
        const row = document.createElement('div');
        row.className = 'sb-row';
        row.appendChild(ctx.sprite(t.name, { size: 24 }));
        const name = document.createElement('div');
        name.className = 'sb-names';
        name.textContent = t.name;
        const pct = document.createElement('div');
        pct.className = 'sb-stat';
        pct.textContent = ctx.fmt.pct(t.pct);
        row.append(name, pct);
        ladderList.appendChild(row);
      }
    }
    ladderSelect.addEventListener('change', renderLadderList);

    function renderLadder(view) {
      const merged = ladderMerge(view.ladder, view.state.from, view.state.to);
      lastMerged = merged;
      ctx.meta(ladderCard.meta, { source: 'Ladder (Smogon)', n: merged ? merged.battles : 0, unit: 'battles' });
      if (!merged) { renderLadderList(); return; }
      const prevVal = ladderSelect.value;
      ladderSelect.textContent = '';
      for (const m of merged.mons.slice(0, 40)) {
        const opt = document.createElement('option');
        opt.value = m.key; opt.textContent = m.key;
        ladderSelect.appendChild(opt);
      }
      if (merged.mons.some((m) => m.key === prevVal)) ladderSelect.value = prevVal;
      renderLadderList();
    }

    let lastView = null;
    ctx.onTheme(() => { if (lastView) renderHeat(lastView, ctx.chartTheme()); });
    setMode('raw');

    return {
      update(view) {
        lastView = view;
        renderHeat(view, ctx.chartTheme());
        renderCores(view);
        renderLadder(view);
      },
      highlight(key) {
        coresWrap.querySelectorAll('.sb-row').forEach((row) => {
          row.classList.toggle('is-hovered', !!key && row.textContent.includes(key));
        });
      },
    };
  },
};
