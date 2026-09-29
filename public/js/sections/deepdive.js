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
import { speciesDetail, ladderMerge, rankedSeason, rankedMon, rankedEntries, speedSpecies } from '../lib/aggregate.js';
import { SPREAD_ARCHETYPES, archetypeLabel, rankedSpreadRows, smogonSpreadRows, archetypeShares, speedBenchmarks, metaSpeedField } from '../lib/spreads.js';
import { rankedSource, RANKED_ATTRIBUTION } from '../ui/meta.js';
import { TYPE_COLORS } from '../lib/types.js';
import { inkOn } from '../lib/contrast.js';

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

const fmtSpread = (sp) => sp.join('/');
const pctText = (x) => `${Math.round(x * 100)}%`;

/** "Max Speed 34% · Bulk-heavy 21% · …" for an archetypeShares result (listed spreads only). */
function shareStrip({ byArch }) {
  return SPREAD_ARCHETYPES.filter((a) => byArch[a.id]).sort((a, b) => byArch[b.id] - byArch[a.id])
    .map((a) => `${a.label} ${pctText(byArch[a.id])}`).join(' · ');
}

/** "outspeeds 18 of 29 · next faster: Garchomp 169" */
function benchText(spe, field) {
  const b = speedBenchmarks(spe, field);
  const total = b.outspeeds + b.ties + b.underspeeds;
  if (!total) return '—';
  const parts = [`outspeeds ${b.outspeeds} of ${total}`];
  if (b.ties) parts.push(`ties ${b.ties}`);
  parts.push(b.nextFaster ? `next faster: ${b.nextFaster.key} ${b.nextFaster.spe}` : 'fastest in the field');
  return parts.join(' · ');
}

/** Previous reg's last ranked season vs this one: archetype shares of the species' listed spreads. */
function shiftText(key, dex, bs, cur, prevReg, prevRanked, curReg) {
  if (!prevReg) return 'Shift vs previous regulation: none (first regulation).';
  const head = `Shift ${prevReg} -> ${curReg}`;
  const last = (prevRanked?.seasons || []).reduce((b, s) => (!b || s.snapshot > b.snapshot ? s : b), null);
  if (!last) return `${head}: Insufficient data (no ranked data for ${prevReg}).`;
  const rm = rankedMon(last, key, dex);
  if (!rm) return `${head}: NEW in ${curReg} (not in ${prevReg}'s ${last.season} ranked data).`;
  const prevRows = rankedSpreadRows(rm.mon, bs);
  if (!prevRows.length) return `${head}: Insufficient data (no ${last.season} spreads).`;
  const a = archetypeShares(prevRows), b = archetypeShares(cur);
  const parts = SPREAD_ARCHETYPES.filter((x) => a.byArch[x.id] || b.byArch[x.id])
    .map((x) => `${x.label} ${Math.round((a.byArch[x.id] || 0) * 100)}% -> ${Math.round((b.byArch[x.id] || 0) * 100)}%`);
  return `${head} (${last.season} vs current): ${parts.join(' · ')}; top spreads cover ${pctText(a.covered)} -> ${pctText(b.covered)}.`;
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

    let spSource = 'ranked'; // 'ranked' | 'smogon': the Spread explorer's source toggle
    let shiftSeq = 0;

    // One "Spread explorer" card: in-game ranked (default) or Smogon, rows with SP, share, nature, Lv50 stats,
    // archetype and a speed benchmark against the view's top-30 meta speeds.
    function buildSpreadExplorer(view, key, merged) {
      const dex = view.dex;
      const bs = dex.species[key]?.bs;
      const { card, body } = sectionCard('Spread explorer');
      const metaEl = elm('div');
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      const rm = rankedMon(season, key, dex);
      const rankedRows = rm && bs ? rankedSpreadRows(rm.mon, bs) : [];
      // Smogon: the latest month of the regulation (inside the date filter); the option exists only if it lists this Pokémon.
      const { from, to } = view.state;
      const lad = (view.ladder?.months || []).filter((m) => (!from || m.month >= from.slice(0, 7)) && (!to || m.month <= to.slice(0, 7)))
        .reduce((b, m) => (!b || m.month > b.month ? m : b), null);
      const ladMerged = lad ? ladderMerge({ ...view.ladder, months: [lad] }, '', '', dex) : null;
      const ladMon = ladMerged?.mons.find((m) => m.key === key);
      const smogonRows = ladMon && bs ? smogonSpreadRows(ladMon, bs) : [];
      const avail = [];
      if (rankedRows.length) avail.push('ranked');
      if (smogonRows.length) avail.push('smogon');
      if (!avail.includes(spSource)) spSource = avail[0] || 'ranked';

      const field = metaSpeedField(speedSpecies(view.state.source, view.monTeams, season, dex, 30), { season, merged }, dex)
        .filter((f) => f.key !== key);

      const toggle = elm('div', 'spx-toggle');
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', 'Spread source');
      const labels = { ranked: `In-game ranked · ${season?.season ?? ''}`, smogon: `Smogon · ${lad?.month ?? ''}` };
      const panel = elm('div', 'spx-panel');
      const btns = {};
      for (const id of avail) {
        const b = elm('button', 'spx-toggle__btn', labels[id]);
        b.type = 'button';
        b.dataset.source = id;
        b.addEventListener('click', () => { spSource = id; paint(); });
        btns[id] = b;
        toggle.appendChild(b);
      }
      if (avail.length > 1) body.appendChild(toggle);
      body.append(metaEl, panel);

      function paint() {
        for (const id of avail) btns[id].setAttribute('aria-pressed', String(id === spSource));
        panel.innerHTML = '';
        const seq = ++shiftSeq;
        if (!avail.length) {
          ctx.meta(metaEl, { source: 'In-game ranked and Smogon spreads' });
          emptyState(panel, 'Insufficient data');
          panel.appendChild(elm('div', 'ddv-note', 'No in-game ranked or Smogon spreads for this Pokémon in this regulation (tournament sheets carry none).'));
          return;
        }
        const isRanked = spSource === 'ranked';
        const rows = isRanked ? rankedRows : smogonRows;
        if (isRanked) {
          const of = rm.name === key ? '' : ` · ${rm.name} data (Megas are tracked as base + stone)`;
          ctx.meta(metaEl, { source: `${rankedSource(season)} · sample size not published${of}` });
        } else {
          ctx.meta(metaEl, { source: `Smogon ${ladMerged.cutoff} ladder · ${lad.month} · ${ladMon.raw.toLocaleString('en-US')} ${key} entries`, n: ladMerged.battles, unit: 'battles' });
        }
        const shares = archetypeShares(rows);
        panel.appendChild(elm('div', 'spx-strip', `${shareStrip(shares)} — top spreads cover ${pctText(shares.covered)}${isRanked ? " of this Pokémon's ranked players" : ' of its Smogon sets'}`));
        if (isRanked) {
          const shift = elm('div', 'ddv-note spx-shift');
          panel.appendChild(shift);
          const pReg = ctx.prevReg?.(view.reg);
          if (!pReg) shift.textContent = shiftText(key, dex, bs, rows, null, null, view.reg);
          else {
            shift.textContent = `Shift ${pReg} -> ${view.reg}: loading…`;
            ctx.loadRanked(pReg).then((pr) => { if (seq === shiftSeq) shift.textContent = shiftText(key, dex, bs, rows, pReg, pr, view.reg); })
              .catch(() => { if (seq === shiftSeq) shift.textContent = `Shift ${pReg} -> ${view.reg}: Insufficient data.`; });
          }
        }

        // One block per spread (the drawer is narrow): SP + share, then nature / Lv50 stats / type, then the speed benchmark.
        const list = elm('ul', 'spx-rows');
        list.setAttribute('aria-label', 'Spreads, most common first');
        for (const r of rows) {
          const li = elm('li', 'spx-row');
          const nat = !r.nature ? 'no nature reported' : r.natureJoint ? r.nature : `${r.nature} ${pctText(r.natureShare)}*`;
          const top = elm('div', 'spx-row__top');
          top.append(elm('span', 'spx-row__sp', `${fmtSpread(r.sp)} SP`), elm('span', 'spx-row__share', `${pctText(r.share)}${isRanked ? ' of spreads' : ''}`));
          const mid = elm('div', 'spx-row__mid');
          mid.append(elm('span', 'spx-row__nat', nat), elm('span', 'spx-row__stats', `Lv50 ${r.stats.join(' / ')}`), elm('span', 'pill spx-row__arch', archetypeLabel(r.arch)));
          li.append(top, mid, elm('div', 'ddv-note spx-row__bench', field.length ? `Speed ${r.stats[5]}: ${benchText(r.stats[5], field)}` : `Speed ${r.stats[5]}`));
          list.appendChild(li);
        }
        panel.appendChild(list);
        if (isRanked) panel.appendChild(elm('div', 'ddv-note', "* Ranked natures are reported separately from spreads; stats use this Pokémon's most common ranked nature (its share of ranked players' natures)."));
        panel.appendChild(elm('div', 'ddv-note', `Type describes the SP only (${SPREAD_ARCHETYPES.slice(0, 4).map((a) => `${a.label}: ${a.desc}`).join('; ')}; first match wins). Speed benchmark: the ${field.length} most-used Pokémon of this view with a known speed (Speed Tiers sources).`));
        if (isRanked) {
          const attr = elm('div', 'ddv-note');
          const a = document.createElement('a');
          a.href = RANKED_ATTRIBUTION.url; a.target = '_blank'; a.rel = 'noopener';
          a.textContent = RANKED_ATTRIBUTION.text;
          attr.appendChild(a);
          panel.appendChild(attr);
        }
      }
      paint();
      return card;
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

      const det = speciesDetail(view.ddTeams || view.monTeams, key, dex);
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
        if (TYPE_COLORS[t]) pill.style.color = inkOn(TYPE_COLORS[t]);
        pill.addEventListener('click', (e) => ctx.chip('type', t, e));
        pill.style.cursor = 'pointer';
        pill.tabIndex = 0;
        pill.setAttribute('role', 'button');
        pill.setAttribute('aria-label', `Filter by ${t} type`);
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

      content.appendChild(buildSpreadExplorer(view, key, merged));

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
