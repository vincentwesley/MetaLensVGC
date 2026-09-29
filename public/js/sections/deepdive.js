// deepdive.js — Pokémon deep dive (renders into the drawer's .drawer__body,
// which main.js mounts at #deepdive [data-section="deepdive"] and which
// dispatches `deepdive:open` / `deepdive:close` CustomEvents on itself).
//
// index.html's main grid has no standalone `[data-section="deepdive"]` card
// (only the drawer body carries that attribute), and editing index.html's
// section list is outside this agent's allowed files. The spec's "compact
// Pick a Pokémon helper" is rendered instead as a persistent search box
// pinned to the top of the drawer body, always visible while the drawer is
// open, so the intent (search species in the current view -> open drawer)
// is still met without new markup outside owned files.
import { speciesDetail, speedTiers, ladderMerge, rankedSeason, rankedMon, rankedEntries } from '../lib/aggregate.js';
import { rankedSource, RANKED_ATTRIBUTION } from '../ui/meta.js';
import { calcStats, calcStat } from '../lib/stats.js';
import { TYPE_COLORS } from '../lib/types.js';

function elm(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function emptyState(parent, title) {
  const box = elm('div', 'empty-state');
  box.appendChild(elm('div', 'empty-state__title', title));
  parent.appendChild(box);
  return box;
}

function sectionCard(title) {
  const card = elm('div', 'card ddv-block');
  const head = elm('div', 'card__head');
  head.appendChild(elm('h3', null, title));
  const body = elm('div', 'card__body');
  card.append(head, body);
  return { card, body };
}

/** Accessible clickable row (mirrors usage.js's <tr> pattern) used for bar lists. */
function barRow(label, pct, maxPct, { onClick, sprite, valueText } = {}) {
  const row = elm('div', 'bar-row');
  if (onClick) {
    row.classList.add('is-clickable');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.addEventListener('click', onClick);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } });
  }
  const labelWrap = elm('span', 'bar-row__label');
  if (sprite) labelWrap.appendChild(sprite);
  labelWrap.appendChild(document.createTextNode(label));
  const track = elm('div', 'bar-row__track');
  const fill = elm('div', 'bar-row__fill');
  fill.style.width = `${maxPct > 0 ? Math.min(100, (pct / maxPct) * 100) : 0}%`;
  track.appendChild(fill);
  row.append(labelWrap, track, elm('span', 'bar-row__val', valueText ?? `${(pct * 100).toFixed(1)}%`));
  return row;
}

function barList(parent, rows, opts = {}) {
  if (!rows.length) { emptyState(parent, 'Insufficient data'); return; }
  const max = Math.max(...rows.map((r) => r.pct), 0.0001);
  const list = elm('div', 'bar-list');
  for (const r of rows) list.appendChild(barRow(r.name, r.pct, max, { onClick: opts.onClick ? (e) => opts.onClick(r.name, e) : null }));
  parent.appendChild(list);
}

function hasMegaForm(dex, baseName) {
  return Object.values(dex.species || {}).some((sp) => sp.megaOf === baseName);
}

function fmtSpread(sp) { return sp.join('/'); }
function fmtStats(stats) { return stats.join(' / '); }

// `tiers` is a list of { key, nature, spe } for other top species, sourced from
// whichever channel produced `top` itself (tournament sheets or ladder) so the
// comparison never mixes a sheet spread against a ladder-only speed or vice versa.
function builtForNote(key, top, tiers) {
  if (!top?.stats) return null;
  const mySpeed = top.stats[5];
  const speedSp = top.sp[5];
  if (speedSp >= 20) {
    const faster = tiers.filter((r) => r.key !== key && r.spe != null && r.spe < mySpeed);
    if (faster.length) return `Outspeeds ${faster[0].nature} ${faster[0].key} (${faster[0].spe})`;
    return `Speed-invested (${speedSp} SP) — outpaces every top-used meta mon with known spreads`;
  }
  const bulk = ['HP', null, 'Def', null, 'SpD'].filter((label, i) => label && top.sp[i] > 0);
  if (bulk.length) return `Bulk: ${bulk.join('/')} SP invested`;
  return null;
}

// Ladder-derived speed tiers, same shape as aggregate.js#speedTiers, built from
// each species' single most-common spread (already sorted by pct in ladderMerge).
function ladderSpeedTiers(merged, dex) {
  if (!merged) return [];
  return merged.mons.map((m) => {
    const top = m.spreads[0];
    if (!top) return { key: m.key, nature: null, spe: null };
    const [nature, spStr] = top.name.split(':');
    const spe5 = Number(spStr.split('/')[5]);
    const bs = dex.species[m.key]?.bs;
    return { key: m.key, nature, spe: bs ? calcStat(bs[5], spe5, 5, nature) : null };
  });
}

export default {
  id: 'deepdive',
  title: 'Pokémon Deep Dive',
  mount(el, ctx) {
    el.innerHTML = '';

    // --- persistent "pick a Pokémon" search, always visible in the drawer ---
    const picker = elm('div', 'ddv-picker');
    const searchLabel = elm('label', 'ddv-picker__label', 'Jump to Pokémon');
    searchLabel.htmlFor = 'ddv-picker-input';
    const search = document.createElement('input');
    search.type = 'search';
    search.id = 'ddv-picker-input';
    search.setAttribute('list', 'ddv-picker-list');
    search.placeholder = 'Search species in current view…';
    const datalist = document.createElement('datalist');
    datalist.id = 'ddv-picker-list';
    search.addEventListener('change', () => {
      const v = search.value.trim();
      if (v && lastView?.dex?.species?.[v]) { search.value = ''; render(v); }
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = search.value.trim();
        if (v && lastView?.dex?.species?.[v]) { search.value = ''; render(v); }
      }
    });
    picker.append(searchLabel, search, datalist);
    el.appendChild(picker);

    const content = elm('div', 'ddv-content');
    el.appendChild(content);

    let lastView = null;
    let currentKey = null;
    let isOpen = false;

    function updatePickerList(view) {
      const keys = [...new Set((view?.teams || []).flatMap((t) => t.keys))].sort();
      datalist.innerHTML = '';
      for (const k of keys) datalist.appendChild(new Option(k));
    }

    function render(key) {
      currentKey = key;
      content.innerHTML = '';
      const view = lastView;
      if (!view || !key) { emptyState(content, 'Pick a Pokémon to see its deep dive'); return; }
      const dex = view.dex;
      const sp = dex.species[key];
      if (!sp) { emptyState(content, `No dex entry for ${key}`); return; }

      const titleEl = document.getElementById('deepdive-title');
      if (titleEl) titleEl.textContent = key;

      const det = speciesDetail(view.teams, key, dex);
      const metaLine = elm('div');
      ctx.meta(metaLine, { source: view.state.source === 'ladder' ? 'Tournaments (base stats/usage) + Ladder (sets)' : 'Tournaments', n: det.n, unit: 'teams' });
      content.appendChild(metaLine);

      // --- header: sprite, types, base stats, usage %, win % ---
      const head = elm('div', 'ddv-head');
      const spriteWrap = elm('div', 'ddv-sprite-lg');
      spriteWrap.appendChild(ctx.sprite(key, { size: 96, animated: view.state.anim }));
      const info = elm('div', 'ddv-info');
      info.appendChild(elm('h3', null, key));
      const types = elm('div', 'ddv-types');
      for (const t of sp.types) {
        const pill = elm('span', 'pill', t);
        pill.style.background = TYPE_COLORS[t] || 'var(--muted)';
        pill.addEventListener('click', (e) => ctx.chip('type', t, e));
        pill.style.cursor = 'pointer';
        types.appendChild(pill);
      }
      info.appendChild(types);

      const kpis = elm('div', 'ddv-kpis');
      const usageKpi = elm('div', 'kpi');
      usageKpi.append(elm('span', 'kpi__label', 'Usage'), elm('span', 'kpi__value', ctx.fmt.pct(det.pct)));
      const winKpi = elm('div', 'kpi');
      winKpi.append(elm('span', 'kpi__label', 'Win % (with it)'), elm('span', 'kpi__value', ctx.fmt.pct(det.withWinPct)));
      kpis.append(usageKpi, winKpi);
      info.appendChild(kpis);
      head.append(spriteWrap, info);
      content.appendChild(head);

      // base stats
      const { card: statsCard, body: statsBody } = sectionCard('Base stats');
      const bs = sp.bs;
      const statNames = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
      const maxBs = 255;
      for (let i = 0; i < 6; i++) {
        const row = elm('div', 'ddv-stat-row');
        row.append(elm('span', null, statNames[i]));
        const track = elm('div', 'ddv-stat-track');
        const fill = elm('div', 'ddv-stat-fill');
        fill.style.width = `${(bs[i] / maxBs) * 100}%`;
        track.appendChild(fill);
        row.append(track, elm('span', null, String(bs[i])));
        statsBody.appendChild(row);
      }
      content.appendChild(statsCard);

      // win rate with vs without
      const { card: wrCard, body: wrBody } = sectionCard('Win rate with vs. without');
      if (det.withWinPct == null && det.withoutWinPct == null) {
        emptyState(wrBody, 'Insufficient data');
      } else {
        const cmp = elm('div', 'ddv-winrate');
        const withT = elm('div', 'kpi');
        withT.append(elm('span', 'kpi__label', 'With'), elm('span', 'kpi__value', ctx.fmt.pct(det.withWinPct)));
        const withoutT = elm('div', 'kpi');
        withoutT.append(elm('span', 'kpi__label', 'Without'), elm('span', 'kpi__value', ctx.fmt.pct(det.withoutWinPct)));
        cmp.append(withT, withoutT);
        wrBody.appendChild(cmp);
      }
      content.appendChild(wrCard);

      const useLadder = view.state.source === 'ladder';
      const merged = ladderMerge(view.ladder, view.state.from, view.state.to, view.dex);
      const ladderRow = useLadder ? merged?.mons.find((m) => m.key === key) : null;

      // items
      const { card: itemsCard, body: itemsBody } = sectionCard('Items');
      barList(itemsBody, useLadder ? (ladderRow?.items || []).map((r) => ({ name: r.name, pct: r.pct })) : det.items.map((r) => ({ name: r.name, pct: r.pct })),
        { onClick: (name, e) => ctx.chip('item', name, e) });
      content.appendChild(itemsCard);

      // abilities (no chip kind exists for abilities in state schema — informational only)
      const { card: abCard, body: abBody } = sectionCard('Abilities');
      barList(abBody, useLadder ? (ladderRow?.abilities || []).map((r) => ({ name: r.name, pct: r.pct })) : det.abilities.map((r) => ({ name: r.name, pct: r.pct })));
      content.appendChild(abCard);

      // moves
      const { card: mvCard, body: mvBody } = sectionCard('Moves');
      barList(mvBody, useLadder ? (ladderRow?.moves || []).map((r) => ({ name: r.name, pct: r.pct })) : det.moves.map((r) => ({ name: r.name, pct: r.pct })),
        { onClick: (name, e) => ctx.chip('move', name, e) });
      content.appendChild(mvCard);

      // exact 4-move sets
      const { card: setsCard, body: setsBody } = sectionCard('Common move sets');
      barList(setsBody, det.sets.map((r) => ({ name: r.name, pct: r.pct })));
      content.appendChild(setsCard);

      // mega usage
      if (hasMegaForm(dex, sp.base ?? key)) {
        const { card: megaCard, body: megaBody } = sectionCard('Mega usage');
        const kpi = elm('div', 'kpi');
        kpi.append(elm('span', 'kpi__label', `Holds ${dex.species[key]?.stone ? 'its' : "a"} Mega Stone`), elm('span', 'kpi__value', ctx.fmt.pct(det.megaPct)));
        megaBody.appendChild(kpi);
        content.appendChild(megaCard);
      }

      // spreads + natures: no tournament sheet ever carries SP (Limitless doesn't
      // publish them; see CLAUDE.md data facts), so this falls back to the same
      // reg's ladder almost always — not gated on the source toggle, since the
      // toggle only switches item/ability/move/teammate display, and there is no
      // sheet-based alternative to switch away from here.
      const { card: spCard, body: spBody } = sectionCard('Top SP spreads & natures');
      let spreadRows = det.spreads; // tournament sheets: [{ nature, sp, n, stats }]
      let spreadSource = 'Tournament sheets';
      if (!spreadRows.length && merged) {
        const ladderSpreads = merged.mons.find((m) => m.key === key)?.spreads || [];
        if (ladderSpreads.length) {
          const bs = dex.species[key]?.bs;
          spreadRows = ladderSpreads.slice(0, 8).map((r) => {
            const [nature, spStr] = r.name.split(':');
            const spArr = spStr.split('/').map(Number);
            return { nature, sp: spArr, pct: r.pct, stats: bs ? calcStats(bs, spArr, nature) : null };
          });
          spreadSource = `Ladder (Smogon ${merged.cutoff})`;
        }
      }
      if (!spreadRows.length) {
        emptyState(spBody, 'No spread data for this regulation yet');
      } else {
        spBody.appendChild(elm('div', 'ddv-note', spreadSource));
        const fromSheets = spreadSource === 'Tournament sheets';
        const wrap = elm('div', 'table-wrap');
        const table = elm('table', 'data-table');
        const thead = elm('thead');
        const trh = elm('tr');
        const headers = fromSheets
          ? ['Nature', 'Spread (HP/Atk/Def/SpA/SpD/Spe)', 'Final stats', 'n', '%']
          : ['Nature', 'Spread (HP/Atk/Def/SpA/SpD/Spe)', 'Final stats', '%'];
        for (const h of headers) trh.appendChild(elm('th', null, h));
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = elm('tbody');
        for (const s of spreadRows.slice(0, 8)) {
          const tr = elm('tr');
          tr.append(elm('td', null, s.nature), elm('td', null, fmtSpread(s.sp)), elm('td', null, s.stats ? fmtStats(s.stats) : '—'));
          if (fromSheets) tr.append(elm('td', 'num', ctx.fmt.n(s.n)), elm('td', 'num', ctx.fmt.pct(s.n / det.n)));
          else tr.append(elm('td', 'num', ctx.fmt.pct(s.pct)));
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        spBody.appendChild(wrap);
        const tiers = fromSheets ? speedTiers(view.teams, dex, 20) : ladderSpeedTiers(merged, dex);
        const note = builtForNote(key, spreadRows[0], tiers);
        if (note) spBody.appendChild(elm('div', 'ddv-note', note));
      }
      content.appendChild(spCard);

      // teammates
      const { card: tmCard, body: tmBody } = sectionCard('Teammates');
      const teammates = useLadder ? (ladderRow?.teammates || []).map((r) => ({ name: r.name, pct: r.pct })) : det.teammates.map((r) => ({ name: r.name, pct: r.pct }));
      if (!teammates.length) {
        emptyState(tmBody, 'Insufficient data');
      } else {
        const grid = elm('div', 'sprite-grid');
        for (const t of teammates.slice(0, 12)) {
          const cell = elm('button', 'sprite-cell');
          cell.type = 'button';
          cell.appendChild(ctx.sprite(t.name, { size: 32, animated: view.state.anim }));
          cell.appendChild(elm('span', null, t.name));
          cell.appendChild(elm('span', 'ddv-note', ctx.fmt.pct(t.pct)));
          cell.addEventListener('click', (e) => ctx.chip('species', t.name, e));
          grid.appendChild(cell);
        }
        tmBody.appendChild(grid);
      }
      content.appendChild(tmCard);

      // in-game ranked ladder (shown whenever it has this species, regardless of source)
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      const rm = rankedMon(season, key, dex);
      if (rm) {
        const { card: rkCard, body: rkBody } = sectionCard('Ranked ladder (in-game)');
        const { name, mon } = rm;
        const rankTxt = mon.rank ? `in-game rank #${mon.rank}` : season.ranking ? 'not in the published ranking' : `ranking not published for finished season ${season.season}`;
        rkBody.appendChild(elm('div', 'ddv-note', `${rankedSource(season)} · ${name === key ? '' : `${name} (Megas are tracked as base + stone) · `}${rankTxt}. Shares are within this Pokémon's ranked sets; the game publishes no usage %.`));
        const sub = (label, tbl, onClick) => {
          rkBody.appendChild(elm('div', 'ddv-picker__label', label));
          barList(rkBody, rankedEntries(tbl), { onClick });
        };
        sub('Moves', mon.moves, (n, e) => ctx.chip('move', n, e));
        sub('Items', mon.items, (n, e) => ctx.chip('item', n, e));
        sub('Abilities', mon.abilities);
        sub('Natures', mon.natures);
        rkBody.appendChild(elm('div', 'ddv-picker__label', 'SP spreads'));
        const spreads = rankedEntries(mon.spreads);
        if (!spreads.length) emptyState(rkBody, 'Insufficient data');
        else {
          const wrap = elm('div', 'table-wrap');
          const table = elm('table', 'data-table');
          const trh = table.createTHead().insertRow();
          for (const h of ['HP/Atk/Def/SpA/SpD/Spe', '%']) trh.appendChild(elm('th', h === '%' ? 'num' : null, h));
          const tbody = table.createTBody();
          for (const r of spreads) {
            const tr = tbody.insertRow();
            tr.append(elm('td', null, r.name), elm('td', 'num', ctx.fmt.pct(r.pct)));
          }
          wrap.appendChild(table);
          rkBody.appendChild(wrap);
        }
        rkBody.appendChild(elm('div', 'ddv-picker__label', 'Teammates (rank order, no shares published)'));
        if (!mon.teammates.length) emptyState(rkBody, 'Insufficient data');
        else {
          const grid = elm('div', 'sprite-grid');
          mon.teammates.forEach((t, i) => {
            const cell = elm('button', 'sprite-cell');
            cell.type = 'button';
            cell.appendChild(ctx.sprite(t, { size: 32, animated: view.state.anim }));
            cell.appendChild(elm('span', null, t));
            cell.appendChild(elm('span', 'ddv-note', `#${i + 1}`));
            cell.addEventListener('click', (e) => ctx.chip('species', t, e));
            grid.appendChild(cell);
          });
          rkBody.appendChild(grid);
        }
        const attr = elm('div', 'ddv-note');
        const a = document.createElement('a');
        a.href = RANKED_ATTRIBUTION.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = RANKED_ATTRIBUTION.text;
        attr.appendChild(a);
        rkBody.appendChild(attr);
        content.appendChild(rkCard);
      }

      // checks & counters (ladder)
      const { card: ccCard, body: ccBody } = sectionCard('Checks & counters (ladder)');
      const counters = merged?.mons.find((m) => m.key === key)?.counters || [];
      if (!counters.length) {
        emptyState(ccBody, 'No ladder checks data');
      } else {
        const max = Math.max(...counters.map((c) => c.score), 0.0001);
        const list = elm('div', 'bar-list');
        for (const c of counters.slice(0, 12)) {
          list.appendChild(barRow(c.name, c.score, max, { valueText: `${(c.score * 100).toFixed(1)}%` }));
        }
        ccBody.appendChild(list);
      }
      content.appendChild(ccCard);
    }

    el.addEventListener('deepdive:open', (e) => { isOpen = true; render(e.detail?.key); });
    el.addEventListener('deepdive:close', () => { isOpen = false; });

    return {
      update(view) {
        lastView = view;
        updatePickerList(view);
        if (isOpen && currentKey) render(currentKey);
      },
    };
  },
};
