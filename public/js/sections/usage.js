// usage.js — Usage leaderboard: sortable table, rank/sprite/name/usage bar/
// usage%/win% with Wilson CI/n. Tournament mode uses aggregate.usage();
// ladder mode uses ladderMerge() (usage % + n=raw battles only, no win%).
import { usage, atMinN, ladderMerge, rankedSeason, rankedEntries, itemsBySpecies, changeVsPrev, changeText, changeDir } from '../lib/aggregate.js';
import { rankedSource, clickHint, prevLabel } from '../ui/meta.js';
import { nameMatcher } from '../lib/names.js';
import { TYPE_COLORS } from '../lib/types.js';

const COLS_TEAM = [
  { key: 'rank', label: '#' },
  { key: 'sprite', label: '' },
  { key: 'name', label: 'Pokémon · top item' },
  { key: 'usage', label: 'Usage %', sortable: true, sortKey: 'pct' },
  { key: 'win', label: 'Win % (95% CI)', sortable: true, sortKey: 'winPct' },
  { key: 'n', label: 'N', sortable: true },
];
// Added to COLS_TEAM when a previous period exists (same rule as the snapshot: changeVsPrev).
const COL_CHANGE = { key: 'chg', label: 'Change', sortable: true, sortKey: 'chgPts' };
const COLS_LADDER = [
  { key: 'rank', label: '#' },
  { key: 'sprite', label: '' },
  { key: 'name', label: 'Pokémon · top item' },
  { key: 'usage', label: 'Usage %', sortable: true, sortKey: 'pct' },
  { key: 'n', label: 'N (battles)', sortable: true },
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

function primaryTypeColor(dex, key) {
  const sp = dex.species[key];
  const type = sp?.types?.[0];
  return TYPE_COLORS[type] || 'var(--muted)';
}

export default {
  id: 'usage',
  title: 'Usage Leaderboard',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card__head';
    const h = document.createElement('h3');
    h.textContent = 'Usage Leaderboard';
    const controls = document.createElement('div');
    controls.className = 'segmented';
    controls.setAttribute('role', 'radiogroup');
    controls.setAttribute('aria-label', 'Rows shown');
    const btnTop = document.createElement('button');
    btnTop.type = 'button'; btnTop.textContent = 'Top 30';
    const btnAll = document.createElement('button');
    btnAll.type = 'button'; btnAll.textContent = 'Show all';
    controls.append(btnTop, btnAll);
    // Search the whole list (not just the top 30); punctuation-insensitive ("raichu mega y").
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'items-search';
    search.placeholder = 'Find a Pokémon…  ( / )';
    search.setAttribute('aria-label', 'Find a Pokémon in the leaderboard');
    const meta = document.createElement('span');
    head.append(h, search, controls, meta);
    const body = document.createElement('div');
    body.className = 'card__body';
    card.append(head, body);
    el.appendChild(card);
    const hint = clickHint('Rows rank Pokémon by usage. Click a row: show only that Pokémon and its teams. Click the item under a name: Pokémon holding it. Sprite: details. Shift-click to exclude.');
    body.prepend(hint);

    let showAll = false;
    let sortKey = 'n';
    let sortDir = 'desc';
    let lastView = null;

    function setShowAll(v) {
      showAll = v;
      btnTop.setAttribute('aria-pressed', String(!v));
      btnAll.setAttribute('aria-pressed', String(v));
      refresh();
    }
    const query = () => nameMatcher(search.value);
    let searchTimer = null;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(refresh, 120); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; refresh(); } });
    // "/" from anywhere on the page (not while typing) jumps to this search.
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('#deepdive[aria-hidden="false"]')) return;
      e.preventDefault();
      search.scrollIntoView({ block: 'center' });
      search.focus();
    });
    btnTop.addEventListener('click', () => setShowAll(false));
    btnAll.addEventListener('click', () => setShowAll(true));
    setShowAll(false);

    function sortRows(rows) {
      const key = sortKey === 'win' ? 'winPct' : sortKey === 'pct' ? 'pct' : sortKey === 'n' ? 'n' : sortKey;
      const sorted = rows.slice().sort((a, b) => {
        const av = a[key], bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sortDir === 'asc' ? av - bv : bv - av;
      });
      return sorted;
    }

    function render() {
      const view = lastView;
      if (!view) return;
      const state = view.state;
      const dex = view.dex;
      let rows, cols, unit, source, n, relaxed = false;

      if (state.source === 'ranked') { renderRanked(view); return; }
      body.querySelector('.ddv-note')?.remove();

      if (state.source === 'ladder') {
        const merged = ladderMerge(view.ladder, state.from, state.to, view.dex);
        cols = COLS_LADDER; unit = 'battles'; source = 'Ladder (Smogon)';
        if (!merged) {
          n = 0;
          ctx.meta(meta, { source, n, unit });
          emptyState(body, 'No ladder data for this regulation yet');
          return;
        }
        n = merged.battles;
        ({ rows, relaxed } = atMinN(merged.mons.map((m) => ({ key: m.key, pct: m.usage, n: m.raw, winPct: null, ci: null, topItem: m.items[0] || null })), state.minN));
      } else {
        cols = COLS_TEAM; unit = 'teams'; source = 'Tournaments'; n = view.monTeams.length;
        const byItem = itemsBySpecies(view.monTeams);
        ({ rows, relaxed } = atMinN(usage(view.monTeams), state.minN));
        const prevRows = view.prev?.length ? new Map(usage(view.prev).map((r) => [r.key, r])) : null;
        if (prevRows) cols = [...COLS_TEAM, COL_CHANGE];
        rows = rows.map((r) => {
          const change = prevRows ? changeVsPrev(r.pct, prevRows.get(r.key), state.minN) : null;
          return { ...r, topItem: byItem.get(r.key)?.items[0] || null, change, chgPts: change && !change.isNew ? change.pts : null };
        });
      }

      ctx.meta(meta, { source, n, unit, relaxed });
      body.querySelector('.empty-state')?.remove();
      if (!rows.length) {
        emptyState(body, 'Insufficient data');
        return;
      }

      // Sorted by a column this mode doesn't show (win in ladder mode, change without a
      // previous period): fall back to N.
      if (!cols.some((c) => (c.sortKey || c.key) === sortKey)) { sortKey = 'n'; sortDir = 'desc'; }

      // Usage rank is fixed before sorting / searching, so a found row keeps its real place.
      const usageRank = new Map([...rows].sort((a, b) => b.n - a.n).map((r, i) => [r.key, i + 1]));
      const maxPct = Math.max(...rows.map((r) => r.pct), 0.0001);
      const q = query();
      rows = sortRows(q ? rows.filter((r) => q(r.key)) : rows);
      if (!rows.length) { emptyState(body, `No Pokémon matching “${search.value.trim()}”`); return; }
      const shown = showAll || q ? rows : rows.slice(0, 30);

      let wrap = body.querySelector('.table-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'table-wrap table-wrap--scroll';
        body.appendChild(wrap);
      }
      wrap.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'data-table';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      const ladderCols = lastView?.state.source === 'ladder';
      for (const c0 of cols) {
        // Smogon usage % is rating-weighted, so it need not follow the unweighted raw count.
        const c = ladderCols && c0.key === 'n' ? { ...c0, label: 'Raw uses' } : c0;
        const th = document.createElement('th');
        if (ladderCols && c.key === 'usage') th.setAttribute('data-tip', 'Smogon usage is weighted by player rating, so it can differ from the raw count.');
        th.className = `col-${c.key}${c.key === 'rank' || c.key === 'win' || c.key === 'n' ? ' num' : ''}`;
        th.textContent = c.label;
        if (c.sortable) {
          th.style.cursor = 'pointer';
          th.tabIndex = 0;
          const active = (c.sortKey || c.key) === sortKey;
          th.textContent = c.label + (active ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');
          const doSort = () => {
            const k = c.sortKey || c.key;
            if (sortKey === k) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
            else { sortKey = k; sortDir = 'desc'; }
            refresh();
          };
          th.addEventListener('click', doSort);
          th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); } });
        }
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      shown.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.dataset.key = r.key;
        tr.setAttribute('aria-label', `Filter by ${r.key}`);
        const act = (e) => ctx.chip('species', r.key, e);
        tr.addEventListener('click', act);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        tr.addEventListener('mouseenter', () => ctx.hover(r.key));
        tr.addEventListener('mouseleave', () => ctx.hover(null));
        tr.addEventListener('focus', () => ctx.hover(r.key));
        tr.addEventListener('blur', () => ctx.hover(null));

        const tdRank = document.createElement('td');
        tdRank.className = 'num col-rank';
        tdRank.textContent = String(q ? usageRank.get(r.key) : i + 1);
        const tdSprite = document.createElement('td');
        tdSprite.className = 'col-sprite';
        tdSprite.appendChild(drawerButton(ctx, r.key, state.anim));
        const tdName = document.createElement('td');
        tdName.className = 'col-name';
        const nameEl = document.createElement('div');
        nameEl.className = 'col-name__mon';
        nameEl.textContent = r.key;
        tdName.append(nameEl, itemCell(ctx, r.topItem));
        const tdUsage = document.createElement('td');
        tdUsage.className = 'col-usage';
        const barWrap = document.createElement('div');
        barWrap.className = 'usage-bar';
        const track = document.createElement('div');
        track.className = 'usage-bar__track';
        const barFill = document.createElement('div');
        barFill.className = 'usage-bar__fill';
        barFill.style.width = `${(r.pct / maxPct) * 100}%`;
        barFill.style.background = primaryTypeColor(dex, r.key);
        track.appendChild(barFill);
        const barLabel = document.createElement('span');
        barLabel.className = 'usage-bar__label';
        barLabel.textContent = ctx.fmt.pct(r.pct);
        barWrap.append(track, barLabel);
        tdUsage.appendChild(barWrap);

        tr.append(tdRank, tdSprite, tdName, tdUsage);

        if (cols !== COLS_LADDER) {
          const tdWin = document.createElement('td');
          tdWin.className = 'num col-win';
          if (r.winPct != null && r.ci) {
            const wrapCi = document.createElement('div');
            wrapCi.className = 'ci-cell';
            const text = document.createElement('span');
            text.textContent = `${(r.winPct * 100).toFixed(1)}% (${(r.ci[0] * 100).toFixed(1)}–${(r.ci[1] * 100).toFixed(1)})`;
            const bar = document.createElement('div');
            bar.className = 'ci-bar';
            const range = document.createElement('div');
            range.className = 'ci-bar__range';
            range.style.left = `${r.ci[0] * 100}%`;
            range.style.width = `${(r.ci[1] - r.ci[0]) * 100}%`;
            const dot = document.createElement('div');
            dot.className = 'ci-bar__dot';
            dot.style.left = `${r.winPct * 100}%`;
            bar.append(range, dot);
            wrapCi.append(text, bar);
            tdWin.appendChild(wrapCi);
          } else {
            tdWin.textContent = '—';
          }
          const tdN = document.createElement('td');
          tdN.className = 'num col-n';
          tdN.textContent = ctx.fmt.n(r.n);
          tr.append(tdWin, tdN);
          if (cols.includes(COL_CHANGE)) {
            const tdChg = document.createElement('td');
            const dir = changeDir(r.change);
            tdChg.className = `num col-chg kpi__delta${dir === 'flat' ? '' : ` kpi__delta--${dir}`}`;
            tdChg.textContent = changeText(r.change);
            tdChg.dataset.tip = r.change.isNew ? `Not used (or under min n) ${prevLabel(view)}` : `Usage change ${prevLabel(view)}, in percentage points`;
            tr.appendChild(tdChg);
          }
        } else {
          const tdN = document.createElement('td');
          tdN.className = 'num col-n';
          tdN.textContent = ctx.fmt.n(r.n);
          tr.append(tdN);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }

    // In-game ranked: rank order only (the game publishes ranks, never usage shares).
    function renderRanked(view) {
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      body.innerHTML = '';
      ctx.meta(meta, { source: rankedSource(season), n: season ? Object.keys(season.mons).length : 0, unit: 'Pokémon' });
      if (!season) { emptyState(body, 'No in-game ranked season in the selected range'); return; }
      const ranked = !!season.ranking;
      const names = ranked ? season.ranking.filter((k) => season.mons[k]) : Object.keys(season.mons).sort();
      const note = document.createElement('div');
      note.className = 'ddv-note';
      note.textContent = ranked
        ? `The game publishes ranks only, not usage shares. Top item / ability / move shares are within that Pokémon's ranked sets.`
        : `Ranking not published for finished season ${season.season} — listed alphabetically (no order implied). Shares are within that Pokémon's ranked sets.`;
      body.appendChild(note);
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap table-wrap--scroll';
      const table = document.createElement('table');
      table.className = 'data-table';
      const trh = table.createTHead().insertRow();
      const headers = [['', 'col-sprite'], [ranked ? 'Pokémon' : 'Pokémon (A–Z)', 'col-name'], ['Top item', ''], ['Top ability', ''], ['Top move', '']];
      if (ranked) headers.unshift(['Rank', 'num col-rank']); // finished seasons: no rank column (no order published)
      for (const [label, cls] of headers) {
        const th = document.createElement('th');
        th.className = cls;
        th.textContent = label;
        trh.appendChild(th);
      }
      const tbody = table.createTBody();
      const top = (tbl) => { const e = rankedEntries(tbl)[0]; return e ? `${e.name} ${ctx.fmt.pct(e.pct)}` : '—'; };
      const q = query();
      const found = q ? names.filter(q) : names;
      if (!found.length) { emptyState(body, `No Pokémon matching “${search.value.trim()}”`); return; }
      for (const key of showAll || q ? found : found.slice(0, 30)) {
        const mon = season.mons[key];
        const tr = tbody.insertRow();
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.dataset.key = key;
        tr.setAttribute('aria-label', `Filter by ${key}`);
        const act = (e) => ctx.chip('species', key, e);
        tr.addEventListener('click', act);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        tr.addEventListener('mouseenter', () => ctx.hover(key));
        tr.addEventListener('mouseleave', () => ctx.hover(null));
        const cells = [[null, 'col-sprite'], [key, 'col-name'], [top(mon.items), ''], [top(mon.abilities), ''], [top(mon.moves), '']];
        if (ranked) cells.unshift([`#${mon.rank ?? '—'}`, 'num col-rank']);
        for (const [text, cls] of cells) {
          const td = tr.insertCell();
          td.className = cls;
          if (text == null) td.appendChild(drawerButton(ctx, key, view.state.anim));
          else td.textContent = text;
        }
      }
      wrap.appendChild(table);
      body.appendChild(wrap);
    }

    // Empty states wipe the body; keep exactly one hint at the top, hidden when there are no rows.
    function refresh() {
      render();
      if (body.firstChild !== hint) body.prepend(hint);
      hint.hidden = !body.querySelector('tbody tr');
    }

    return {
      update(view) { lastView = view; refresh(); },
      highlight(key) {
        body.querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('is-hovered', key && tr.dataset.key === key));
      },
    };
  },
};

// Sprite doubles as the deep-dive entry point; the rest of the row adds a filter chip.
function drawerButton(ctx, key, anim) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sprite-btn';
  btn.title = `Details: ${key}`;
  btn.setAttribute('aria-label', `Open details for ${key}`);
  btn.appendChild(ctx.sprite(key, { size: 'sm', animated: anim }));
  btn.addEventListener('click', (e) => { e.stopPropagation(); ctx.openDrawer(key); });
  btn.addEventListener('keydown', (e) => e.stopPropagation());
  return btn;
}

// Most common held item for the row's Pokémon; clicking it adds an item chip
// (without also triggering the row's species chip).
function itemCell(ctx, top) {
  if (!top) return document.createTextNode('');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item-link item-link--sub';
  btn.title = `Filter to teams with ${top.name} (shift-click to exclude)`;
  const name = document.createElement('span');
  name.className = 'item-link__name';
  name.textContent = top.name;
  const pct = document.createElement('span');
  pct.className = 'item-link__pct';
  pct.textContent = ctx.fmt.pct(top.pct);
  btn.append(name, pct);
  btn.addEventListener('click', (e) => { e.stopPropagation(); ctx.chip('item', top.name, e); });
  btn.addEventListener('keydown', (e) => e.stopPropagation());
  return btn;
}
