// items.js — Item usage: (a) which held items the field runs (share of teams,
// win rate, who holds them) and (b) the most common items for each Pokémon.
// Tournaments: aggregate.itemUsage()/itemsBySpecies() over view.monTeams.
// Ladder: ladderItemUsage()/ladderMerge() (share of Pokémon slots, no win %).
// Ranked (in-game): only (b), from each Pokémon's published set shares, in rank order.
import {
  usage, atMinN, itemUsage, itemsBySpecies, ladderMerge, ladderItemUsage,
  rankedSeason, rankedEntries,
} from '../lib/aggregate.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';
import { nameMatcher } from '../lib/names.js';

const TOP_ITEMS = 20;
const TOP_MONS = 20;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const LADDER_NA = 'No ladder data for this regulation yet';

function emptyState(parent, title) {
  parent.querySelector('.empty-state')?.remove();
  const box = el('div', 'empty-state');
  box.appendChild(el('div', 'empty-state__title', title));
  parent.appendChild(box);
}

function segmented(label, options, onPick) {
  const wrap = el('div', 'segmented');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  const btns = new Map();
  for (const [value, text] of options) {
    const b = el('button', null, text);
    b.type = 'button';
    b.addEventListener('click', () => onPick(value));
    wrap.appendChild(b);
    btns.set(value, b);
  }
  return { el: wrap, sync(v) { for (const [k, b] of btns) b.setAttribute('aria-pressed', String(k === v)); } };
}

function panel(title) {
  const card = el('div', 'card items-panel');
  const head = el('div', 'card__head');
  const h = el('h3', null, title);
  const controls = el('div', 'items-panel__controls');
  const meta = el('span');
  head.append(h, controls, meta);
  const body = el('div', 'card__body');
  card.append(head, body);
  return { card, controls, meta, body };
}

export default {
  id: 'items',
  title: 'Item Usage',
  mount(root, ctx) {
    root.innerHTML = '';
    root.className = 'items-grid';

    // --- (a) item usage chart ------------------------------------------------
    const A = panel('Item Usage');
    const chartEl = el('div', 'items-chart');
    A.body.append(clickHint('Most-used held items. Click a bar: show only Pokémon holding that item. Shift-click to exclude.'), chartEl);
    let showStones = false;
    const stoneSeg = segmented('Mega Stones', [[false, 'Hide Mega Stones'], [true, 'Show']], (v) => { showStones = v; stoneSeg.sync(v); render(); });
    stoneSeg.sync(showStones);
    A.controls.appendChild(stoneSeg.el);

    const chart = ctx.echarts.init(chartEl);
    new ResizeObserver(() => chart.resize()).observe(chartEl);
    chart.on('click', (p) => p.data && ctx.chip('item', p.data.name, p.event?.event));

    // --- (b) most common items per Pokémon -----------------------------------
    const B = panel('Most Common Items by Pokémon');
    const search = el('input', 'items-search');
    search.type = 'search';
    search.placeholder = 'Find a Pokémon…';
    search.setAttribute('aria-label', 'Find a Pokémon');
    let showAll = false;
    const allSeg = segmented('Rows shown', [[false, `Top ${TOP_MONS}`], [true, 'All']], (v) => { showAll = v; allSeg.sync(v); renderTable(); });
    allSeg.sync(showAll);
    B.controls.append(search, allSeg.el);
    const note = el('div', 'items-note');
    const tableWrap = el('div', 'table-wrap table-wrap--scroll');
    B.body.append(clickHint('Click a row: show only that Pokémon and its teams. Click an item: Pokémon holding it. Sprite: details.'), note, tableWrap);
    let searchTimer = null;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderTable, 120); });

    root.append(A.card, B.card);

    let lastView = null;
    let chartRows = null; // for theme re-draws
    let tableRows = [];   // [{ key, n, items: [{name, pct, n?}] }]
    let tableUnit = 'slots';
    let noLadderTable = false;

    function drawChart(rows, mode, theme) {
      const shown = rows.slice(0, TOP_ITEMS).reverse();
      const axis = {
        axisLine: { lineStyle: { color: theme.axis } },
        axisLabel: { color: theme.muted, fontFamily: theme.fontFamily },
        splitLine: { lineStyle: { color: theme.grid } },
      };
      const pctLabel = mode === 'ladder' ? 'of Pokémon slots' : 'of teams';
      chart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 8, right: 56, top: 8, bottom: 24, containLabel: true },
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const r = p.data.row;
            const lines = [`<b>${r.name}</b>`, `${ctx.fmt.pct(r.pct)} ${pctLabel}`];
            if (mode !== 'ladder') {
              lines.push(`${ctx.fmt.n(r.n)} teams · ${ctx.fmt.n(r.slots)} Pokémon`);
              if (r.winPct != null) lines.push(`win ${ctx.fmt.pct(r.winPct)} (${ctx.fmt.pct(r.ci[0])}–${ctx.fmt.pct(r.ci[1])})`);
            }
            if (r.holders.length) lines.push(`held by: ${r.holders.slice(0, 4).map((h) => `${h.key} ${ctx.fmt.pct(h.pct)}`).join(', ')}`);
            return lines.join('<br/>');
          },
        },
        xAxis: { type: 'value', ...axis, axisLabel: { ...axis.axisLabel, formatter: (v) => `${Math.round(v * 100)}%` } },
        yAxis: {
          type: 'category', data: shown.map((r) => r.name), ...axis,
          axisTick: { show: false }, axisLabel: { ...axis.axisLabel, interval: 0, color: theme.inkSecondary },
        },
        series: [{
          type: 'bar', barMaxWidth: 16, cursor: 'pointer',
          itemStyle: { color: theme.series[0], borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', color: theme.muted, fontFamily: theme.fontFamily, formatter: (p) => ctx.fmt.pct(p.value, 1) },
          emphasis: { itemStyle: { color: theme.series[1] } },
          data: shown.map((r) => ({ value: r.pct, name: r.name, row: r })),
        }],
      }, { notMerge: true });
    }

    function renderChart(view) {
      const theme = ctx.chartTheme();
      const src = view.state.source;
      chartEl.hidden = false;
      A.body.querySelector('.empty-state')?.remove();
      if (src === 'ranked') {
        ctx.meta(A.meta, { source: rankedSource(null) });
        chartRows = null; chartEl.hidden = true;
        emptyState(A.body, RANKED_NA);
        return;
      }
      let rows, noLadder = false;
      if (src === 'ladder') {
        const merged = ladderMerge(view.ladder, view.state.from, view.state.to, view.dex);
        noLadder = !merged;
        ctx.meta(A.meta, { source: 'Ladder (Smogon)', n: merged?.battles ?? 0, unit: 'battles' });
        rows = ladderItemUsage(merged, view.dex, { megaStones: showStones });
      } else {
        ctx.meta(A.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams' });
        rows = view.monTeams.length ? itemUsage(view.monTeams, view.dex, { megaStones: showStones }) : [];
      }
      if (!rows.length) { chartRows = null; chartEl.hidden = true; emptyState(A.body, noLadder ? LADDER_NA : 'Insufficient data'); return; }
      chartRows = { rows, mode: src };
      chartEl.style.height = `${Math.max(220, Math.min(rows.length, TOP_ITEMS) * 24 + 40)}px`;
      chart.resize();
      drawChart(rows, src, theme);
    }

    function buildTableRows(view) {
      const src = view.state.source;
      const minN = view.state.minN;
      note.textContent = '';
      noLadderTable = false;
      if (src === 'ranked') {
        const season = rankedSeason(view.ranked, view.state.from, view.state.to);
        ctx.meta(B.meta, { source: rankedSource(season), n: season ? Object.keys(season.mons).length : 0, unit: 'Pokémon' });
        if (!season) return [];
        note.textContent = 'In-game ranked: item shares within each Pokémon’s ranked sets; Pokémon in published rank order.';
        const names = season.ranking ? season.ranking.filter((k) => season.mons[k]) : Object.keys(season.mons).sort();
        tableUnit = null;
        return names.map((key) => ({ key, n: null, items: rankedEntries(season.mons[key].items) }));
      }
      if (src === 'ladder') {
        const merged = ladderMerge(view.ladder, view.state.from, view.state.to, view.dex);
        noLadderTable = !merged;
        if (!merged) { ctx.meta(B.meta, { source: 'Ladder (Smogon)', n: 0, unit: 'battles' }); return []; }
        tableUnit = 'battles';
        const { rows, relaxed } = atMinN(merged.mons.map((m) => ({ key: m.key, n: m.raw, items: m.items.filter((i) => i.name !== 'No item') })), minN);
        ctx.meta(B.meta, { source: 'Ladder (Smogon)', n: merged.battles, unit: 'battles', relaxed });
        return rows;
      }
      tableUnit = 'slots';
      const by = itemsBySpecies(view.monTeams);
      const { rows, relaxed } = atMinN(usage(view.monTeams), minN);
      ctx.meta(B.meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams', relaxed });
      return rows.map((r) => {
        const d = by.get(r.key);
        return { key: r.key, n: d?.n ?? 0, items: d?.items ?? [] };
      });
    }

    function itemCell(item) {
      const td = el('td', 'items-cell');
      if (!item) { td.appendChild(el('span', 'muted', '—')); return td; }
      const btn = el('button', 'item-link');
      btn.type = 'button';
      btn.title = `Filter to teams with ${item.name} (shift-click to exclude)`;
      btn.append(el('span', 'item-link__name', item.name), el('span', 'item-link__pct', ctx.fmt.pct(item.pct)));
      btn.addEventListener('click', (e) => { e.stopPropagation(); ctx.chip('item', item.name, e); });
      btn.addEventListener('keydown', (e) => e.stopPropagation());
      const bar = el('div', 'items-share');
      const fill = el('div', 'items-share__fill');
      fill.style.width = `${Math.round(item.pct * 100)}%`;
      bar.appendChild(fill);
      td.append(btn, bar);
      return td;
    }

    function renderTable() {
      const view = lastView;
      if (!view) return;
      tableWrap.textContent = '';
      B.body.querySelector('.empty-state')?.remove();
      const q = nameMatcher(search.value); // punctuation-insensitive, same as the leaderboard search
      let rows = q ? tableRows.filter((r) => q(r.key)) : tableRows;
      if (!q && !showAll) rows = rows.slice(0, TOP_MONS);
      if (!rows.length) { emptyState(B.body, q ? `No Pokémon matching “${search.value.trim()}”` : noLadderTable ? LADDER_NA : 'Insufficient data'); return; }

      const table = el('table', 'data-table items-table');
      const trh = table.createTHead().insertRow();
      const heads = [['', 'col-sprite'], ['Pokémon', 'col-name'], ['Most common item', ''], ['2nd', ''], ['3rd', '']];
      if (tableUnit) heads.push([tableUnit === 'battles' ? 'N (battles)' : 'N', 'num col-n']);
      for (const [label, cls] of heads) { const th = el('th', cls, label); trh.appendChild(th); }
      const tbody = table.createTBody();
      for (const r of rows) {
        const tr = tbody.insertRow();
        tr.dataset.key = r.key;
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', `Filter by ${r.key}`);
        const act = (e) => ctx.chip('species', r.key, e);
        tr.addEventListener('click', act);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        tr.addEventListener('mouseenter', () => ctx.hover(r.key));
        tr.addEventListener('mouseleave', () => ctx.hover(null));

        const tdS = el('td', 'col-sprite');
        const sb = el('button', 'sprite-btn');
        sb.type = 'button';
        sb.title = `Details: ${r.key}`;
        sb.setAttribute('aria-label', `Open details for ${r.key}`);
        sb.appendChild(ctx.sprite(r.key, { size: 'sm', animated: view.state.anim }));
        sb.addEventListener('click', (e) => { e.stopPropagation(); ctx.openDrawer(r.key); });
        sb.addEventListener('keydown', (e) => e.stopPropagation());
        tdS.appendChild(sb);
        tr.append(tdS, el('td', 'col-name', r.key), itemCell(r.items[0]), itemCell(r.items[1]), itemCell(r.items[2]));
        if (tableUnit) tr.appendChild(el('td', 'num col-n', ctx.fmt.n(r.n)));
      }
      tableWrap.appendChild(table);
    }

    function render() {
      const view = lastView;
      if (!view) return;
      renderChart(view);
      tableRows = buildTableRows(view);
      renderTable();
    }

    ctx.onTheme((theme) => { if (chartRows) drawChart(chartRows.rows, chartRows.mode, theme); });

    return {
      update(view) { lastView = view; render(); },
      highlight(key) {
        tableWrap.querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('is-hovered', !!key && tr.dataset.key === key));
      },
    };
  },
};
