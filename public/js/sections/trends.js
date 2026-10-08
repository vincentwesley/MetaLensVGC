// trends.js — weekly usage lines (brush/zoom sets state.from/to on release),
// risers & fallers, and a regulation-shift table. All three need per-team
// dates; the ladder source gets monthly lines and month-over-month movers instead
// (lib/ladder-field.js); the regulation shift stays tournament-only.
import { usage, atMinN, weekly, movers, changeVsPrev, ladderMerge } from '../lib/aggregate.js';
import { ladderSeries, ladderMovers } from '../lib/ladder-field.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

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

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default {
  id: 'trends',
  title: 'Trends',
  mount(el, ctx) {
    el.classList.add('sb-grid');

    const linesCard = card('Weekly usage trend');
    const moversCard = card('Risers & fallers');
    const shiftCard = card('Regulation shift');
    linesCard.el.classList.add('sb-full');
    moversCard.el.classList.add('sb-full');
    shiftCard.el.classList.add('sb-full');
    el.append(linesCard.el, moversCard.el, shiftCard.el);

    // --- weekly lines --------------------------------------------------
    const linesControls = document.createElement('div');
    linesControls.className = 'sb-controls';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sb-link-btn';
    resetBtn.textContent = 'Reset range';
    resetBtn.addEventListener('click', () => ctx.store.set({ from: '', to: '' }));
    linesControls.appendChild(resetBtn);
    const lineChartEl = document.createElement('div');
    lineChartEl.className = 'sb-chart sb-chart--tall';
    const lineEmptyEl = document.createElement('div');
    const linesHint = clickHint('Weekly usage of the top Pokémon. Drag the slider below the chart: set the date range for the whole dashboard.');
    linesCard.body.append(linesHint, linesControls, lineChartEl, lineEmptyEl);
    const lineChart = ctx.echarts.init(lineChartEl);
    new ResizeObserver(() => lineChart.resize()).observe(lineChartEl);

    let lastWeeks = [];
    lineChart.on('datazoom', (p) => {
      if (!lastWeeks.length) return;
      const b = p.batch ? p.batch[0] : p;
      const start = b.start ?? 0;
      const end = b.end ?? 100;
      const lastIdx = lastWeeks.length - 1;
      const startIdx = Math.max(0, Math.round((start / 100) * lastIdx));
      const endIdx = Math.min(lastIdx, Math.round((end / 100) * lastIdx));
      if (startIdx === 0 && endIdx === lastIdx) { ctx.store.set({ from: '', to: '' }); return; }
      ctx.store.set({ from: lastWeeks[startIdx], to: addDays(lastWeeks[endIdx], 6) });
    });

    function renderLadderLines(view, theme) {
      linesCard.el.querySelector('h3').textContent = 'Monthly usage trend';
      linesHint.textContent = 'Monthly usage of the top Pokémon on the ladder (a gap means the species was not in that month).';
      const st = view.state;
      const merged = ladderMerge(view.ladder, st.from, st.to, view.dex);
      ctx.meta(linesCard.meta, { source: 'Ladder (Smogon)', n: merged?.battles || 0, unit: 'battles' });
      lastWeeks = [];
      if (!merged || !merged.mons.length) {
        lineChartEl.style.display = 'none';
        lineEmptyEl.textContent = '';
        lineEmptyEl.appendChild(emptyState('No ladder months in the current range.', 'No ladder data'));
        return;
      }
      const topKeys = merged.mons.slice(0, 8).map((m) => m.key);
      const ls = ladderSeries(view.ladder, topKeys, st.from, st.to);
      lineEmptyEl.textContent = '';
      if (ls.months.length < 2) {
        // One month: show the real single point per species instead of a blank chart.
        lineChartEl.style.display = 'none';
        const box = emptyState('A trend line needs two months; this range has one. Usage that month:', 'One month of data');
        const note = document.createElement('div');
        note.textContent = topKeys.map((k) => `${k} ${ctx.fmt.pct(ls.series[k][0])}`).join(' · ');
        box.appendChild(note);
        lineEmptyEl.appendChild(box);
        return;
      }
      lineChartEl.style.display = '';
      lineChart.setOption({
        color: theme.series,
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg, borderColor: theme.border, textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          valueFormatter: (v) => (v == null ? 'not in data' : `${(v * 100).toFixed(1)}%`),
        },
        legend: { type: 'scroll', data: topKeys, textStyle: { color: theme.inkSecondary, fontFamily: theme.fontFamily }, top: 0, pageIconColor: theme.ink, pageTextStyle: { color: theme.muted } },
        grid: { left: 46, right: 20, top: 36, bottom: 30 },
        xAxis: { type: 'category', data: ls.months, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, fontFamily: theme.fontFamily } },
        yAxis: { type: 'value', axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, formatter: (v) => `${(v * 100).toFixed(0)}%` }, axisLine: { lineStyle: { color: theme.axis } }, splitLine: { lineStyle: { color: theme.grid } } },
        dataZoom: [],
        series: topKeys.map((k) => ({ name: k, type: 'line', showSymbol: true, symbolSize: 6, data: ls.series[k], connectNulls: false })),
      }, true);
    }

    function renderLines(view, theme) {
      if (view.state.source === 'ladder') { renderLadderLines(view, theme); return; }
      linesCard.el.querySelector('h3').textContent = 'Weekly usage trend';
      linesHint.textContent = 'Weekly usage of the top Pokémon. Drag the slider below the chart: set the date range for the whole dashboard.';
      if (view.state.source !== 'tournaments') {
        const ranked = view.state.source === 'ranked';
        lineChartEl.style.display = 'none';
        lineEmptyEl.textContent = '';
        lineEmptyEl.appendChild(ranked ? emptyState(RANKED_NA, 'Tournament-only view') : emptyState('Switch Source to Tournaments to see weekly trends.', 'Tournament-only view'));
        ctx.meta(linesCard.meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'teams' });
        lastWeeks = [];
        return;
      }
      const { rows: topRows, relaxed } = atMinN(usage(view.monTeams), view.state.minN);
      const topKeys = topRows.slice(0, 8).map((r) => r.key);
      const wk = weekly(view.monTeams, topKeys);
      ctx.meta(linesCard.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams', relaxed });
      lastWeeks = wk.weeks;
      if (wk.weeks.length < 2) {
        lineChartEl.style.display = 'none';
        lineEmptyEl.textContent = '';
        lineEmptyEl.appendChild(wk.weeks.length === 1
          ? emptyState('The current filters cover one full week; a trend line needs two.', 'One week of data')
          : emptyState('No week in the current filters has enough teams to plot.', 'No full week'));
        return;
      }
      lineChartEl.style.display = '';
      lineEmptyEl.textContent = '';
      lineChart.setOption({
        color: theme.series,
        tooltip: {
          trigger: 'axis',
          backgroundColor: theme.tooltipBg, borderColor: theme.border, textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          valueFormatter: (v) => `${(v * 100).toFixed(1)}%`,
        },
        // Scrollable (not wrapping) legend: up to 8 species names can take 2+
        // rows if left to wrap, colliding with the y-axis's top tick label.
        // A scroll legend always stays a single row and pages instead.
        legend: { type: 'scroll', data: topKeys, textStyle: { color: theme.inkSecondary, fontFamily: theme.fontFamily }, top: 0, pageIconColor: theme.ink, pageTextStyle: { color: theme.muted } },
        grid: { left: 46, right: 20, top: 36, bottom: 70 },
        xAxis: { type: 'category', data: wk.weeks, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, fontFamily: theme.fontFamily } },
        yAxis: { type: 'value', axisLabel: { color: theme.muted, fontFamily: theme.fontFamily, formatter: (v) => `${(v * 100).toFixed(0)}%` }, axisLine: { lineStyle: { color: theme.axis } }, splitLine: { lineStyle: { color: theme.grid } } },
        dataZoom: [
          { type: 'slider', xAxisIndex: 0, bottom: 8, realtime: false, textStyle: { color: theme.muted } },
          { type: 'inside', xAxisIndex: 0, realtime: false },
        ],
        series: topKeys.map((k) => ({
          name: k, type: 'line', showSymbol: true, symbolSize: 6,
          data: wk.series[k], connectNulls: true,
        })),
      }, true);
    }

    // --- risers & fallers ------------------------------------------------
    const compareLabel = document.createElement('div');
    compareLabel.className = 'sb-subhead';
    const moversHint = clickHint('Biggest usage changes between the last two weeks. Click a row: show only that Pokémon and its teams. Shift-click to exclude.');
    moversCard.body.append(moversHint, compareLabel);
    const moversWrap = document.createElement('div');
    moversWrap.className = 'sb-two-col';
    const risersCol = document.createElement('div');
    const fallersCol = document.createElement('div');
    const risersHead = document.createElement('div'); risersHead.className = 'sb-subhead'; risersHead.textContent = 'Risers';
    const fallersHead = document.createElement('div'); fallersHead.className = 'sb-subhead'; fallersHead.textContent = 'Fallers';
    const risersList = document.createElement('div');
    const fallersList = document.createElement('div');
    risersCol.append(risersHead, risersList);
    fallersCol.append(fallersHead, fallersList);
    moversWrap.append(risersCol, fallersCol);
    moversCard.body.appendChild(moversWrap);

    function moverRow(r, up) {
      const row = document.createElement('div');
      row.className = 'sb-row sb-row--clickable';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.appendChild(ctx.sprite(r.key, { size: 'xs' }));
      const name = document.createElement('div');
      name.className = 'sb-names';
      name.textContent = r.key;
      const delta = document.createElement('div');
      delta.className = `sb-stat ${up ? 'sb-stat--up' : 'sb-stat--down'}`;
      delta.textContent = ctx.fmt.signedPct(r.delta);
      const n = document.createElement('div');
      n.className = 'sb-stat sb-stat--muted';
      // Both periods qualified minN (movers() requires it on both sides), so
      // showing the pair makes that guarantee visible instead of just n=nLast.
      n.textContent = `n=${ctx.fmt.n(r.nPrev)}→${ctx.fmt.n(r.nLast)}`;
      row.append(name, delta, n);
      const act = (e) => ctx.chip('species', r.key, e);
      row.addEventListener('click', act);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
      return row;
    }

    function ladderRow(r, up) {
      const row = moverRow({ ...r, nPrev: 0, nLast: 0 }, up);
      row.querySelector('.sb-stat').textContent = r.isNew ? 'NEW' : ctx.fmt.signedPct(r.delta);
      row.lastChild.textContent = `${ctx.fmt.pct(r.pctPrev)}→${ctx.fmt.pct(r.pctLast)}`;
      return row;
    }

    function renderLadderMovers(view) {
      moversHint.textContent = 'Biggest usage changes between the last two ladder months. Click a row: show only that Pokémon. Shift-click to exclude.';
      const st = view.state;
      const merged = ladderMerge(view.ladder, st.from, st.to, view.dex);
      ctx.meta(moversCard.meta, { source: 'Ladder (Smogon)', n: merged?.battles || 0, unit: 'battles' });
      const m = merged ? ladderMovers(view.ladder, st.from, st.to) : null;
      if (!m) {
        risersList.appendChild(merged
          ? emptyState('Risers & fallers compare the last two ladder months; this range has one.', 'One month of data')
          : emptyState('No ladder months in the current range.', 'No ladder data'));
        return;
      }
      compareLabel.textContent = `Comparing ${m.monthPrev} vs ${m.monthLast} (species under 1% usage in both months left out; NEW = not in the previous month)`;
      if (!m.risers.length) risersList.appendChild(emptyState('Nothing in view gained share between these months.', 'No risers'));
      else for (const r of m.risers.slice(0, 10)) risersList.appendChild(ladderRow(r, true));
      if (!m.fallers.length) fallersList.appendChild(emptyState('Nothing in view lost share between these months.', 'No fallers'));
      else for (const r of m.fallers.slice(0, 10)) fallersList.appendChild(ladderRow(r, false));
    }

    function renderMovers(view) {
      risersList.textContent = ''; fallersList.textContent = ''; compareLabel.textContent = '';
      if (view.state.source === 'ladder') { renderLadderMovers(view); return; }
      moversHint.textContent = 'Biggest usage changes between the last two weeks. Click a row: show only that Pokémon and its teams. Shift-click to exclude.';
      if (view.state.source !== 'tournaments') {
        const ranked = view.state.source === 'ranked';
        risersList.appendChild(ranked ? emptyState(RANKED_NA, 'Tournament-only view') : emptyState('Switch Source to Tournaments to see risers & fallers.', 'Tournament-only view'));
        ctx.meta(moversCard.meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      // Nothing moves at min n in a narrow view: compare whatever both weeks have (flagged).
      const strict = movers(view.monTeams, view.state.minN);
      const m = strict.risers.length || strict.fallers.length || !strict.weekPrev ? strict : movers(view.monTeams, 1);
      const floor = m === strict ? view.state.minN : 1;
      const { risers, fallers, weekPrev, weekLast } = m;
      ctx.meta(moversCard.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams', relaxed: m !== strict && (risers.length || fallers.length) ? view.state.minN : false });
      if (weekPrev && weekLast) {
        compareLabel.textContent = `Comparing week of ${weekPrev} vs week of ${weekLast} (partial/small weeks excluded; both weeks need n ≥ ${floor} per species)`;
      }
      if (!risers.length && !fallers.length) {
        risersList.appendChild(weekPrev
          ? emptyState('No Pokémon in view changed its share between these weeks.', 'No movers')
          : emptyState('The current filters cover less than two full weeks.', 'One week of data'));
        return;
      }
      if (!risers.length) risersList.appendChild(emptyState('Nothing in view gained share between these weeks.', 'No risers'));
      else for (const r of risers.slice(0, 10)) risersList.appendChild(moverRow(r, true));
      if (!fallers.length) fallersList.appendChild(emptyState('Nothing in view lost share between these weeks.', 'No fallers'));
      else for (const r of fallers.slice(0, 10)) fallersList.appendChild(moverRow(r, false));
    }

    // --- regulation shift --------------------------------------------------
    const shiftWrap = document.createElement('div');
    shiftCard.body.append(clickHint('Top 20 now versus the previous period. Click a row: show only that Pokémon and its teams.'), shiftWrap);

    function renderShift(view) {
      shiftWrap.textContent = '';
      if (view.state.source !== 'tournaments') {
        const ranked = view.state.source === 'ranked';
        const lad = view.state.source === 'ladder';
        shiftWrap.appendChild(ranked ? emptyState(RANKED_NA, 'Tournament-only view') : emptyState(lad ? 'The regulation shift compares tournament periods. Month-over-month ladder changes are under Risers & fallers.' : 'Switch Source to Tournaments to see the regulation shift.', 'Tournament-only view'));
        ctx.meta(shiftCard.meta, ranked ? { source: rankedSource(null) } : lad ? { source: 'Ladder (Smogon)', n: ladderMerge(view.ladder, view.state.from, view.state.to)?.battles || 0, unit: 'battles' } : { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      ctx.meta(shiftCard.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams' });
      const prev = view.prev || [];
      if (!prev.length) {
        shiftWrap.appendChild(emptyState('The previous period has no teams matching these filters.', 'No previous period'));
        return;
      }
      const isRegShift = prev[0].reg !== view.reg;
      const label = document.createElement('div');
      label.className = 'sb-subhead';
      label.textContent = isRegShift
        ? `Top 20: ${prev[0].reg} -> ${view.reg}`
        : `Top 20 shift within ${view.reg} (previous regulation not available — comparing to the prior window in this reg)`;
      shiftWrap.appendChild(label);

      const minN = view.state.minN;
      // Unfiltered lookups so a row can show its *other* period's n even
      // when that n fell short of minN there (that's exactly the "low
      // sample" case worth flagging, not something to hide).
      const currNMap = new Map(usage(view.monTeams).map((r) => [r.key, r.n]));
      const prevRowMap = new Map(usage(prev).map((r) => [r.key, r]));
      const cur = atMinN(usage(view.monTeams), minN);
      const currTop = cur.rows.slice(0, 20);
      ctx.meta(shiftCard.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams', relaxed: cur.relaxed });
      // Rank *every* previous-period species that cleared minN, not just its
      // top 20 — a mon can have existed last regulation with a real sample
      // (e.g. n=2,483) while sitting outside that period's top 20, which is
      // a real previous rank, not "NEW".
      const prevRanked = usage(prev).filter((r) => r.n >= minN);
      const prevTop = prevRanked.slice(0, 20);
      const currRank = new Map(currTop.map((r, i) => [r.key, i + 1]));
      const prevRank = new Map(prevRanked.map((r, i) => [r.key, i + 1]));
      const left = prevTop.filter((r) => !currRank.has(r.key));
      const rows = [...currTop.map((r) => ({ key: r.key, pct: r.pct, rank: currRank.get(r.key), status: 'in' })),
        ...left.map((r) => ({ key: r.key, pct: r.pct, rank: null, status: 'out' }))];

      const wrap = document.createElement('div');
      wrap.className = 'table-wrap table-wrap--scroll';
      const table = document.createElement('table');
      table.className = 'data-table';
      table.innerHTML = '<thead><tr><th>#</th><th></th><th>Pokémon</th><th>n now</th><th>n prev</th><th>Prev rank</th><th>Change</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        const tdRank = document.createElement('td'); tdRank.className = 'num'; tdRank.textContent = r.rank ?? '—';
        const tdSprite = document.createElement('td'); tdSprite.appendChild(ctx.sprite(r.key, { size: 'xs' }));
        const tdName = document.createElement('td'); tdName.textContent = r.key;
        const nNow = currNMap.get(r.key) || 0;
        const nPrev = prevRowMap.get(r.key)?.n || 0;
        const tdNNow = document.createElement('td'); tdNNow.className = 'num';
        tdNNow.textContent = ctx.fmt.n(nNow) + (nNow < minN ? ' ⚠' : '');
        if (nNow < minN) tdNNow.title = `Below the minimum sample (n ≥ ${minN})`;
        const tdNPrev = document.createElement('td'); tdNPrev.className = 'num';
        tdNPrev.textContent = ctx.fmt.n(nPrev) + (nPrev < minN ? ' ⚠' : '');
        if (nPrev < minN) tdNPrev.title = `Below the minimum sample (n ≥ ${minN})`;
        const pRank = prevRank.get(r.key);
        const tdPrev = document.createElement('td'); tdPrev.className = 'num'; tdPrev.textContent = pRank ?? '—';
        const tdChange = document.createElement('td'); tdChange.className = 'num';
        if (r.status === 'out') { tdChange.textContent = 'OUT'; tdChange.classList.add('sb-stat--down'); }
        // "NEW" only when the previous period's sample was too small to rank
        // at all (nPrev < minN) — a mon that existed with a real sample but
        // outside the previous top 20 gets its real (possibly >20) rank below.
        else if (pRank == null || changeVsPrev(r.pct, prevRowMap.get(r.key), minN).isNew) { tdChange.textContent = 'NEW'; tdChange.classList.add('sb-stat--up'); tdChange.dataset.tip = `Not used (or under min n) in ${prev[0].reg === view.reg ? 'the prior window' : prev[0].reg}`; }
        else {
          const d = pRank - r.rank;
          tdChange.textContent = d === 0 ? '—' : (d > 0 ? `▲ ${d}` : `▼ ${Math.abs(d)}`);
          if (d > 0) tdChange.classList.add('sb-stat--up');
          else if (d < 0) tdChange.classList.add('sb-stat--down');
        }
        tr.append(tdRank, tdSprite, tdName, tdNNow, tdNPrev, tdPrev, tdChange);
        tr.addEventListener('click', (e) => ctx.chip('species', r.key, e));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      shiftWrap.appendChild(wrap);
    }

    let lastView = null;
    function rerenderAll(view) {
      renderLines(view, ctx.chartTheme());
      renderMovers(view);
      renderShift(view);
    }
    ctx.onTheme(() => { if (lastView) renderLines(lastView, ctx.chartTheme()); });

    return {
      update(view) { lastView = view; rerenderAll(view); },
      highlight(key) {
        risersList.querySelectorAll('.sb-row').forEach((r) => r.classList.toggle('is-hovered', !!key && r.textContent.includes(key)));
        fallersList.querySelectorAll('.sb-row').forEach((r) => r.classList.toggle('is-hovered', !!key && r.textContent.includes(key)));
      },
    };
  },
};
