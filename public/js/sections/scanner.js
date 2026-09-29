// scanner.js — My Team Scanner: paste a Showdown team, get it checked against
// the current filtered meta view. No prefilled team (real data only); the
// "load random" helper fills the textarea from a real team via toPaste so the
// demo path never fabricates a spread.
import { usage, ladderMerge, closestTeams, speedTiers, metaSpeed, rankedSeason } from '../lib/aggregate.js';
import { parsePaste, toPaste, anyKnownSpecies } from '../lib/paste.js';
import { calcStat } from '../lib/stats.js';
import { TYPES, TYPE_COLORS, effectiveness } from '../lib/types.js';
import { toast } from '../ui/toast.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';
import { scanTeam, LIMITS, archLabel } from '../lib/scan.js';
import { ARCHETYPES } from '../lib/archetypes.js';

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

// Grid slot per card (css: .scn-results grid-template-areas), so short cards
// sit side by side on wide screens instead of each spanning the full width.
const CARD_AREA = {
  'Parsed team': 'parsed', "Your team's archetype": 'arch', 'Weaknesses vs. the current meta': 'weak',
  'Top meta threats with no answer': 'threats', 'Speed position': 'speed', 'Matchups: Pokémon': 'mpoke',
  'Matchups: archetypes': 'march', 'Item check': 'items', 'Common teammate picks': 'picks',
  'Weakest link': 'link', 'Closest tournament teams': 'closest',
};

function sectionCard(title) {
  const card = elm('div', 'card scn-block');
  if (CARD_AREA[title]) card.style.gridArea = CARD_AREA[title];
  const head = elm('div', 'card__head');
  head.appendChild(elm('h3', null, title));
  const bodyEl = elm('div', 'card__body');
  card.append(head, bodyEl);
  return { card, body: bodyEl };
}

const CALL_LABEL = { good: 'favourable', bad: 'unfavourable', unclear: 'low confidence' };

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function typesOf(mon, dex) {
  const sp = dex.species[mon.k] || dex.species[mon.s];
  return sp ? sp.types : null;
}
function baseStatsOf(mon, dex) {
  const sp = dex.species[mon.k] || dex.species[mon.s];
  return sp ? sp.bs : null;
}

// Speed of a pasted Pokémon. Without an SP line, use that species' most common
// real spread (same sources as the meta list) rather than assuming 0 SP.
function mySpeedOf(m, dex, src) {
  const bs = baseStatsOf(m, dex);
  if (!bs) return null;
  if (m.sp) {
    return { spe: calcStat(bs[5], m.sp[5], 5, m.nature || 'Hardy'), note: m.nature ? '' : ' (neutral nature assumed)' };
  }
  const meta = metaSpeed(dex.species[m.k] ? m.k : m.s, src, dex);
  if (meta && meta.spe != null) {
    const nature = m.nature || meta.nature;
    return { spe: calcStat(bs[5], meta.sp, 5, nature), note: ` (${nature}, ${meta.sp} SP: most common ${SPEED_SOURCE[meta.source]} spread)` };
  }
  return { spe: calcStat(bs[5], 0, 5, m.nature || 'Hardy'), note: ' (assumed 0 SP)' };
}

// Frequency of damaging (bp > 0) move types across the current view — the
// "meta's actual attacking-move distribution" the spec asks weaknesses to be
// weighted by, as opposed to a purely defensive type-usage profile.
function moveTypeFreq(teams, dex) {
  const counts = new Map();
  let total = 0;
  for (const t of teams) {
    for (const m of t.mons) {
      for (const mv of m.moves) {
        const md = dex.moves[mv];
        if (md && md.bp > 0) {
          counts.set(md.type, (counts.get(md.type) || 0) + 1);
          total++;
        }
      }
    }
  }
  return TYPES.map((type) => ({ type, freq: total ? (counts.get(type) || 0) / total : 0 }));
}

function expectedEff(types, freq) {
  if (!types) return null;
  let sum = 0;
  for (const f of freq) sum += f.freq * effectiveness(f.type, types);
  return sum;
}

function multLabel(m) {
  if (m === 0) return '0×';
  if (m === 0.25) return '¼×';
  if (m === 0.5) return '½×';
  if (m === 1) return '1×';
  if (m === 2) return '2×';
  if (m === 4) return '4×';
  return `${m}×`;
}

function bucketColor(mult, theme) {
  const d = theme.diverging;
  if (mult === 0 || mult === 0.25) return d.neg2;
  if (mult === 0.5) return d.neg1;
  if (mult === 1) return d.mid;
  if (mult === 4) return d.pos2;
  return d.pos1; // 2x
}

const SPEED_SOURCE = { sheet: 'sheet', ranked: 'in-game ranked', ladder: 'Smogon ladder' };

// Speed of a meta species from the same sources, in the same order, as the
// Speed Tiers section: sheets -> in-game ranked -> Smogon ladder -> bounds.
function metaSpeedOf(key, view, src) {
  const m = metaSpeed(key, src, view.dex);
  if (!m) return null;
  if (m.source === 'bounds') return { lo: m.min, hi: m.max, label: 'range, no SP data' };
  return { spe: m.spe, label: `${m.nature} (${SPEED_SOURCE[m.source]}${m.source === 'ladder' && src.merged?.cutoff ? ` ${src.merged.cutoff}` : ''})`, source: m.source };
}

// Meta-wide speed list for the "speed position" panel: the view's species
// (n >= minN) that have a real most-common spread in any source.
function metaSpeedList(view, src) {
  const list = [];
  const used = new Set();
  for (const r of usage(view.teams)) {
    if (r.n < view.state.minN) continue;
    const sp = metaSpeedOf(r.key, view, src);
    if (sp?.spe == null) continue;
    list.push({ key: r.key, spe: sp.spe });
    used.add(sp.source);
  }
  const label = ['sheet', 'ranked', 'ladder'].filter((x) => used.has(x))
    .map((x) => (x === 'ranked' && src.season ? `in-game ranked ${src.season.season} spreads` : x === 'ladder' ? `Smogon ladder ${src.merged?.cutoff || ''}`.trim() : 'tournament sheets'))
    .join(' + ');
  return { list, label: list.length ? `${label} (${list.length} Pokémon)` : 'No speed data available' };
}

function topThreatsNoAnswer(view, src, myTypesList, myMaxSpe, minN) {
  const threats = usage(view.teams).filter((r) => r.n >= minN).slice(0, 20);
  const out = [];
  for (const r of threats) {
    const types = view.dex.species[r.key]?.types;
    if (!types) continue;
    const stabs = [...new Set(types)];
    const hitsSE = myTypesList.filter((mt) => stabs.some((t) => effectiveness(t, mt) > 1)).length;
    const resistsBoth = myTypesList.some((mt) => stabs.every((t) => effectiveness(t, mt) < 1));
    const reasonA = hitsSE >= 2 && !resistsBoth;

    const sp = metaSpeedOf(r.key, view, src);
    let reasonB = false;
    let speedNote = null;
    if (sp && myMaxSpe != null) {
      if (sp.spe != null) { reasonB = sp.spe > myMaxSpe; speedNote = `${sp.spe} Spe, ${sp.label}`; }
      else { reasonB = sp.lo > myMaxSpe; speedNote = `${sp.lo}–${sp.hi} Spe ${sp.label}`; }
    }
    if (!reasonA && !reasonB) continue;
    const reasons = [];
    if (reasonA) reasons.push(`${stabs.join('/')} STAB hits ${hitsSE} of your mons super-effectively, none of yours resist both`);
    if (reasonB) reasons.push(`outspeeds your whole team (${speedNote})`);
    out.push({ key: r.key, pct: r.pct, reasons });
  }
  return out;
}

export default {
  id: 'scanner',
  title: 'My Team Scanner',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = elm('div', 'card');
    const head = elm('div', 'card__head');
    head.appendChild(elm('h3', null, 'My Team Scanner'));
    const metaEl = elm('span');
    head.appendChild(metaEl);
    card.appendChild(head);
    const body = elm('div', 'card__body');
    card.appendChild(body);
    el.appendChild(card);

    const inputWrap = elm('div', 'scn-input');
    const label = elm('label', 'scn-input__label', 'Paste your team (Showdown export)');
    label.htmlFor = 'scn-textarea';
    const textarea = document.createElement('textarea');
    textarea.id = 'scn-textarea';
    textarea.className = 'scn-textarea';
    textarea.rows = 10;
    textarea.placeholder = 'Garchomp @ Choice Scarf\nAbility: Rough Skin\nLevel: 50\nEVs: 4 Atk / 2 SpD / 32 Spe\nJolly Nature\n- Earthquake\n- ...';
    const actions = elm('div', 'scn-actions');
    const scanBtn = elm('button', 'lib-btn lib-btn--wide', 'Scan');
    scanBtn.type = 'button';
    const randomBtn = elm('button', 'lib-btn', 'Load a random team from the current view');
    randomBtn.type = 'button';
    actions.append(scanBtn, randomBtn);
    inputWrap.append(label, textarea, actions);
    body.appendChild(inputWrap);

    const results = elm('div', 'scn-results');
    body.appendChild(results);

    let lastView = null;
    let scanned = false;

    randomBtn.addEventListener('click', () => {
      const view = lastView;
      if (!view || !view.teams.length) { toast('No teams in the current view to sample from', { type: 'error' }); return; }
      const t = view.teams[Math.floor(Math.random() * view.teams.length)];
      textarea.value = toPaste(t, view.dex);
    });

    function renderResults() {
      const view = lastView;
      results.innerHTML = '';
      if (view?.state.source === 'ranked') { emptyState(results, RANKED_NA); return; }
      const text = textarea.value.trim();
      if (!text) { emptyState(results, 'Paste a team and hit Scan'); return; }
      if (!view) { emptyState(results, 'Data still loading'); return; }
      const dex = view.dex;
      const mons = parsePaste(text, dex);
      if (!anyKnownSpecies(mons, dex)) { emptyState(results, 'Could not parse that paste: no recognised Pokémon'); return; }
      results.appendChild(clickHint('Click a Pokémon name: show only teams with it. Shift-click to exclude.', { auto: false }));

      // --- parsed team ---
      const { card: pCard, body: pBody } = sectionCard('Parsed team');
      const pGrid = elm('div', 'scn-parsed');
      let anyUnknown = false;
      for (const m of mons) {
        const known = !!(dex.species[m.k] || dex.species[m.s]);
        if (!known) anyUnknown = true;
        const cell = elm('div', `scn-mon${known ? '' : ' scn-mon--unknown'}`);
        cell.appendChild(ctx.sprite(m.k, { size: 40, animated: view.state.anim }));
        cell.appendChild(elm('span', 'scn-mon__name', m.k));
        if (m.item) cell.appendChild(elm('span', 'scn-mon__item', m.item));
        if (!known) cell.appendChild(elm('span', 'scn-mon__flag', 'Unknown species'));
        pGrid.appendChild(cell);
      }
      pBody.appendChild(pGrid);
      if (anyUnknown) pBody.appendChild(elm('div', 'ddv-note', 'Some species were not recognized — check spelling / forms.'));
      results.appendChild(pCard);

      // Aligned 1:1 with `mons` (may hold nulls for unrecognized species) for
      // per-row rendering; the *Known variant drops nulls for aggregate checks
      // (topThreatsNoAnswer) where row alignment doesn't matter.
      const myTypesList = mons.map((m) => typesOf(m, dex));
      const myTypesKnown = myTypesList.filter(Boolean);
      const myKeys = [...new Set(mons.map((m) => m.k))];

      // --- weaknesses weighted by the meta's real attacking-move distribution ---
      const freq = moveTypeFreq(view.teams, dex);
      const theme = ctx.chartTheme();
      const { card: wCard, body: wBody } = sectionCard('Weaknesses vs. the current meta');
      if (!freq.some((f) => f.freq > 0)) {
        emptyState(wBody, 'Insufficient data — no damaging moves recorded in the current view');
      } else {
        const legend = elm('div', 'scn-legend');
        for (const m of [0, 0.25, 0.5, 1, 2, 4]) {
          const sw = elm('span', 'scn-legend__item');
          const chip = elm('span', 'scn-legend__swatch');
          chip.style.background = bucketColor(m, theme);
          sw.append(chip, document.createTextNode(multLabel(m)));
          legend.appendChild(sw);
        }
        wBody.appendChild(legend);

        const wrap = elm('div', 'table-wrap');
        const table = elm('table', 'data-table scn-grid');
        const thead = elm('thead');
        const trh = elm('tr');
        trh.appendChild(elm('th', null, 'Pokémon'));
        for (const f of freq) {
          const th = elm('th', null, f.type.slice(0, 3));
          th.style.borderBottom = `3px solid ${TYPE_COLORS[f.type]}`;
          th.title = `${f.type} — ${(f.freq * 100).toFixed(1)}% of damaging moves in the meta`;
          trh.appendChild(th);
        }
        trh.appendChild(elm('th', null, 'Expected'));
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = elm('tbody');
        mons.forEach((m, i) => {
          const types = myTypesList[i];
          const tr = elm('tr');
          const tdName = elm('td', null, m.k);
          tr.appendChild(tdName);
          for (const f of freq) {
            const mult = types ? effectiveness(f.type, types) : null;
            const td = elm('td', 'scn-cell', mult == null ? '—' : multLabel(mult));
            if (mult != null) { td.style.background = bucketColor(mult, theme); td.style.color = '#fff'; }
            tr.appendChild(td);
          }
          const exp = expectedEff(types, freq);
          tr.appendChild(elm('td', 'num', exp == null ? '—' : exp.toFixed(2) + '×'));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        wBody.appendChild(wrap);
      }
      results.appendChild(wCard);

      // --- top meta threats with no answer ---
      const merged = ladderMerge(view.ladder, view.state.from, view.state.to, view.dex);
      const sheetTiers = speedTiers(view.teams, dex, 99999);
      const sheetTiersByKey = new Map(sheetTiers.map((r) => [r.key, r]));
      const speedSrc = { sheetByKey: sheetTiersByKey, season: rankedSeason(view.ranked, view.state.from, view.state.to), merged };
      const mySpeeds = mons.map((m) => mySpeedOf(m, dex, speedSrc)?.spe).filter((v) => v != null);
      const myMaxSpe = mySpeeds.length ? Math.max(...mySpeeds) : null;

      const { card: tCard, body: tBody } = sectionCard('Top meta threats with no answer');
      const threats = topThreatsNoAnswer(view, speedSrc, myTypesKnown, myMaxSpe, view.state.minN);
      if (!threats.length) {
        emptyState(tBody, 'No unanswered top-20 threats found in the current view');
      } else {
        const list = elm('div', 'scn-threats');
        for (const th of threats) {
          const row = elm('div', 'scn-threat');
          row.appendChild(ctx.sprite(th.key, { size: 32, animated: view.state.anim }));
          const info = elm('div', 'scn-threat__info');
          info.appendChild(elm('span', 'scn-threat__name', `${th.key} (${ctx.fmt.pct(th.pct)} usage)`));
          info.appendChild(elm('span', 'scn-threat__reason', th.reasons.join(' · ')));
          row.appendChild(info);
          list.appendChild(row);
        }
        tBody.appendChild(list);
      }
      results.appendChild(tCard);

      // --- speed position ---
      const { card: sCard, body: sBody } = sectionCard('Speed position');
      const { list: metaList, label: speedSource } = metaSpeedList(view, speedSrc);
      if (!metaList.length) {
        emptyState(sBody, 'No speed data available for this regulation yet');
      } else {
        sBody.appendChild(elm('div', 'ddv-note', `Meta speed source: ${speedSource}`));
        const sorted = metaList.slice().sort((a, b) => b.spe - a.spe);
        const speedRows = elm('div', 'scn-speedrows');
        mons.forEach((m) => {
          const my = mySpeedOf(m, dex, speedSrc);
          if (!my) return;
          const mySpe = my.spe;
          const faster = sorted.filter((r) => r.spe < mySpe).length;
          const pct = sorted.length ? faster / sorted.length : null;
          const row = elm('div', 'scn-speedrow');
          row.appendChild(elm('span', 'scn-speedrow__name', m.k));
          row.appendChild(elm('span', 'scn-speedrow__val', `${mySpe} Spe${my.note}`));
          const track = elm('div', 'scn-speedrow__track');
          const dot = elm('div', 'scn-speedrow__dot');
          dot.style.left = `${pct == null ? 0 : pct * 100}%`;
          track.appendChild(dot);
          row.appendChild(track);
          row.appendChild(elm('span', 'scn-speedrow__pct', pct == null ? '—' : `faster than ${(pct * 100).toFixed(0)}%`));
          speedRows.appendChild(row);
        });
        sBody.appendChild(speedRows);
      }
      results.appendChild(sCard);

      // --- closest tournament teams ---
      const { card: cCard, body: cBody } = sectionCard('Closest tournament teams');
      const closest = closestTeams(myKeys, view.teams, 5);
      if (!closest.length || closest[0].sim === 0) {
        emptyState(cBody, 'No similar teams in the current view');
      } else {
        const list = elm('div', 'scn-closest');
        for (const c of closest) {
          if (c.sim === 0) continue;
          const row = elm('div', 'scn-closest__item');
          const info = elm('div', 'scn-closest__info');
          info.appendChild(elm('span', null, `${c.team.player || 'Unknown'} — ${c.team.ev?.name || ''}`));
          info.appendChild(elm('span', 'ddv-note', `${(c.sim * 100).toFixed(0)}% overlap`));
          row.appendChild(info);
          const copyBtn = elm('button', 'lib-btn', 'Copy paste');
          copyBtn.type = 'button';
          copyBtn.addEventListener('click', async () => {
            const ok = await copyText(toPaste(c.team, dex));
            toast(ok ? 'Copied!' : 'Could not copy', { type: ok ? 'info' : 'error' });
          });
          row.appendChild(copyBtn);
          list.appendChild(row);
        }
        cBody.appendChild(list);
      }
      results.appendChild(cCard);

      renderEvidence(view, mons, results);
    }

    // --- evidence cards: archetype, matchups, items, team-comp (all from real games/teams) ---
    function renderEvidence(view, mons, into) {
      const dex = view.dex;
      const base = view.base || view.teams;
      const t0 = performance.now();
      const r = scanTeam({ mons, base, matches: view.matches || [], dex, minN: view.state.minN, types: TYPES });
      const pct = (x) => ctx.fmt.pct(x, 0);
      const ciText = (v) => `${(v.ci[0] * 100).toFixed(0)}–${(v.ci[1] * 100).toFixed(0)}%`;
      const src = 'Tournament teams and match results';
      const withMeta = (title, n, unit) => {
        const c = sectionCard(title);
        const m = elm('span');
        c.card.querySelector('.card__head').appendChild(m);
        ctx.meta(m, { source: src, n, unit });
        return c;
      };
      const chipBtn = (kind, value, label, cls) => {
        const b = elm('button', `scn-link${cls ? ` ${cls}` : ''}`, label ?? value);
        b.type = 'button';
        b.dataset.tip = `Filter the dashboard to ${value} (shift/alt-click: exclude)`;
        b.addEventListener('click', (e) => ctx.chip(kind, value, e));
        return b;
      };
      const monLabel = (key, size = 28) => {
        const w = elm('span', 'scn-ml');
        w.appendChild(ctx.sprite(key, { size, animated: view.state.anim }));
        w.appendChild(chipBtn('species', key));
        return w;
      };
      const tag = (call, text) => elm('span', `scn-tag scn-tag--${call}`, text || CALL_LABEL[call]);
      const record = (v) => `${v.w}-${v.l}`;

      // 1. archetype
      {
        const { card, body: b } = withMeta("Your team's archetype", base.length, 'teams in view');
        const a = r.arch;
        const def = a.id === 'other' ? null : ARCHETYPES.find((x) => x.id === a.id);
        const line = elm('div', 'scn-arch');
        line.appendChild(elm('span', 'scn-arch__label', a.label));
        if (a.ids.length > 1) line.appendChild(elm('span', 'ddv-note', `also matches: ${a.ids.slice(1).map(archLabel).join(', ')}`));
        b.appendChild(line);
        b.appendChild(elm('div', 'ddv-note', def ? def.desc : 'No archetype rule matches this team (no weather setter, Trick Room or Tailwind user, etc.).'));
        into.appendChild(card);
      }

      // 2. good / bad matchups by Pokémon
      const nSim = r.sim ? r.sim.teams.length : 0;
      const gamesN = r.games ? r.games.w + r.games.l : 0;
      {
        const { card, body: b } = withMeta('Matchups: Pokémon', nSim, 'teams like yours');
        if (!r.sim) emptyState(b, `Insufficient data — need at least ${LIMITS.simFallback} different Pokémon`);
        else {
          const th = elm('div', 'ddv-note', `Teams like yours: tournament teams sharing at least ${r.sim.threshold} of your ${new Set(mons.map((m) => m.k)).size} Pokémon${r.sim.fellBack ? ` (fewer than ${LIMITS.simTeams} teams share ${LIMITS.simMin}, so the threshold was lowered to ${LIMITS.simFallback})` : ''}. ${nSim.toLocaleString('en-US')} teams matched, ${gamesN.toLocaleString('en-US')} games with a result${r.games ? ` (${r.games.w}-${r.games.l}, ${pct(r.games.w / gamesN)} overall)` : ''}. Mirror games are excluded.`);
          b.appendChild(th);
          if (gamesN < LIMITS.totalGames || !r.species.rows.length) {
            emptyState(b, `Insufficient data — teams like yours have ${gamesN} games (need ${LIMITS.totalGames}, and ${LIMITS.matchGames}+ per opponent Pokémon)`);
          } else {
            b.appendChild(elm('div', 'ddv-note', `Win rate of teams like yours against opponents that bring the Pokémon, top-meta Pokémon with ${LIMITS.matchGames}+ games. Best = highest 95% Wilson lower bound, worst = lowest upper bound. "Favourable/unfavourable" only when the interval excludes 50%.`));
            const cols = elm('div', 'scn-cols');
            for (const [title, rows] of [['Best matchups', r.species.best], ['Worst matchups', r.species.worst]]) {
              const col = elm('div', 'scn-col');
              col.appendChild(elm('h4', 'scn-sub', title));
              if (!rows.length) emptyState(col, 'Insufficient data');
              for (const v of rows) {
                const row = elm('div', 'scn-mrow');
                row.appendChild(monLabel(v.key));
                const st = elm('span', 'scn-mrow__stat');
                st.append(elm('strong', null, pct(v.winPct)), document.createTextNode(` ${record(v)} · n=${v.n} · CI ${ciText(v)} `), tag(v.call));
                row.appendChild(st);
                col.appendChild(row);
              }
              cols.appendChild(col);
            }
            b.appendChild(cols);
          }
        }
        into.appendChild(card);
      }

      // 3. archetype matchups
      {
        const am = r.archMatchups;
        const { card, body: b } = withMeta('Matchups: archetypes', am.source === 'similar' ? nSim : base.length, am.source === 'similar' ? 'teams like yours' : 'teams in view');
        if (!am.rows.length) emptyState(b, `Insufficient data — no opponent archetype has ${LIMITS.matchGames}+ games`);
        else {
          b.appendChild(elm('div', 'ddv-note', am.source === 'similar'
            ? `Teams like yours (see above) against each opponent's primary archetype, ${LIMITS.matchGames}+ games per row.`
            : `Teams like yours are too few for this, so this is the ${r.arch.label} row of the archetype matrix over every team in view (not your exact team), ${LIMITS.matchGames}+ games per row.`));
          const wrap = elm('div', 'table-wrap');
          const table = elm('table', 'data-table scn-arch-table');
          const th = elm('thead');
          const trh = elm('tr');
          for (const [h, num] of [['Opponent', 0], ['Win %', 1], ['W-L', 1], ['n', 1], ['95% CI', 1], ['', 0]]) trh.appendChild(elm('th', num ? 'num' : null, h));
          th.appendChild(trh);
          table.appendChild(th);
          const tb = elm('tbody');
          for (const v of am.rows) {
            const tr = elm('tr', `scn-row--${v.call}`);
            tr.appendChild(elm('td', null, v.label));
            tr.appendChild(elm('td', 'num', pct(v.winPct)));
            tr.appendChild(elm('td', 'num', record(v)));
            tr.appendChild(elm('td', 'num', String(v.n)));
            tr.appendChild(elm('td', 'num', ciText(v)));
            const td = elm('td'); td.appendChild(tag(v.call));
            tr.appendChild(td);
            tb.appendChild(tr);
          }
          table.appendChild(tb);
          wrap.appendChild(table);
          b.appendChild(wrap);
        }
        into.appendChild(card);
      }

      // 4. items
      {
        const { card, body: b } = withMeta('Item check', base.length, 'teams in view');
        const it = r.items;
        for (const d of it.duplicates) b.appendChild(elm('div', 'scn-warn', `Item clause: ${d.item} is held by ${d.keys.join(' and ')} — no two Pokémon may hold the same item.`));
        b.appendChild(elm('div', 'ddv-note', `Your item vs. the three most common items for that species in the current view (${LIMITS.itemSlots}+ appearances needed). Win % is the tournament record of teams running that species with that item (${LIMITS.itemGames}+ games).`));
        const list = elm('div', 'scn-items');
        for (const m of it.mons) {
          const row = elm('div', 'scn-item');
          row.appendChild(monLabel(m.key));
          const info = elm('div', 'scn-item__info');
          const cur = m.item || 'no item';
          const winTxt = (x) => (x.winPct == null ? `win % needs ${LIMITS.itemGames}+ games (has ${x.games})` : `${pct(x.winPct)} over ${x.games} games`);
          if (m.status === 'fixed') info.appendChild(elm('span', 'ddv-note', `${cur} — Mega Stone, fixed`));
          else if (m.status === 'insufficient') info.appendChild(elm('span', 'ddv-note', `${cur} — Insufficient data (${m.slotN} appearances)`));
          else {
            const head = elm('span', null);
            head.appendChild(document.createTextNode(`${cur}: `));
            head.appendChild(elm('span', m.status === 'ok' ? 'scn-ok' : 'scn-note', m.status === 'ok'
              ? `among the top 3 (${pct(m.current.pct)} of ${m.slotN} ${m.key})`
              : m.item ? `${m.current.n ? `${pct(m.current.pct)} of ${m.slotN} ${m.key} (${m.current.n} teams), not in the top 3` : `not held by any of ${m.slotN} ${m.key} in view`}` : 'no item listed'));
            info.appendChild(head);
            if (m.current && m.current.n) info.appendChild(elm('span', 'ddv-note', `Yours: ${winTxt(m.current)}`));
            if (m.status === 'suggest') {
              const sug = elm('div', 'scn-sug');
              for (const t of m.top) {
                const line = elm('span', `scn-sug__item${t.blockedBy ? ' scn-sug__item--blocked' : ''}`);
                line.appendChild(chipBtn('item', t.name));
                line.appendChild(document.createTextNode(` ${pct(t.pct)} of ${m.key}`));
                line.appendChild(document.createTextNode(t.winPct == null ? ' · win % Insufficient data' : ` · ${pct(t.winPct)} over ${t.games} games`));
                if (t.blockedBy) line.appendChild(document.createTextNode(` · already held by ${t.blockedBy}`));
                sug.appendChild(line);
              }
              info.appendChild(sug);
            }
          }
          row.appendChild(info);
          list.appendChild(row);
        }
        b.appendChild(list);
        into.appendChild(card);
      }

      // 5a. teammate picks
      {
        const pk = r.picks;
        const { card, body: b } = withMeta('Common teammate picks', pk ? pk.poolTeams : 0, 'teams sharing 3+ of yours');
        const weakTxt = r.weak.length ? r.weak.map((w) => `${w.type} (${w.n} of your Pokémon)`).join(', ') : null;
        if (!pk || pk.poolTeams < LIMITS.simTeams || !pk.picks.length) emptyState(b, `Insufficient data — need ${LIMITS.simTeams}+ teams sharing 3 of your Pokémon and picks on ${LIMITS.pickTeams}+ of them`);
        else {
          b.appendChild(elm('div', 'ddv-note', `Among ${pk.poolTeams.toLocaleString('en-US')} teams sharing at least 3 of your Pokémon (record ${pk.poolWinPct == null ? '—' : pct(pk.poolWinPct)} over ${pk.poolGames} games), the other Pokémon they run most. Win % is those teams' tournament record. Picks that resist a shared weakness${weakTxt ? ` (${weakTxt})` : ' (your team has none shared by 3+ members)'} or the STAB types of your worst matchups are listed first and tagged.`));
          const list = elm('div', 'scn-items');
          for (const p of pk.picks) {
            const row = elm('div', 'scn-item');
            row.appendChild(monLabel(p.key));
            const info = elm('div', 'scn-item__info');
            info.appendChild(elm('span', null, `On ${pct(p.share)} of those teams (${p.n} teams) · ${p.winPct == null ? 'win % Insufficient data' : `${pct(p.winPct)} over ${p.games} games (CI ${ciText(p)})`}`));
            const tags = elm('span', 'scn-tags');
            if (p.resists.length) tags.appendChild(elm('span', 'scn-tag scn-tag--good', `resists ${p.resists.join(', ')}`));
            if (p.answers.length) tags.appendChild(elm('span', 'scn-tag scn-tag--good', `resists the STABs of ${p.answers.join(', ')}`));
            if (tags.childNodes.length) info.appendChild(tags);
            row.appendChild(info);
            list.appendChild(row);
          }
          b.appendChild(list);
        }
        into.appendChild(card);
      }

      // 5b. weakest link
      {
        const rows = r.link.rows;
        const { card, body: b } = withMeta('Weakest link', base.length, 'teams in view');
        if (!rows.length) emptyState(b, `Insufficient data — needs ${LIMITS.linkGames}+ games both with and without a member among teams sharing 3 of your other Pokémon`);
        else {
          b.appendChild(elm('div', 'ddv-note', `For each member: tournament record of teams that share 3+ of your OTHER Pokémon and run it, vs. those that do not (${LIMITS.linkGames}+ games each side). Correlation from real teams, not proof the Pokémon is the cause. "Clear" = the 95% intervals do not overlap.`));
          const wrap = elm('div', 'table-wrap');
          const table = elm('table', 'data-table scn-arch-table');
          const th = elm('thead');
          const trh = elm('tr');
          for (const [h, num] of [['Pokémon', 0], ['With', 1], ['Without', 1], ['Diff', 1], ['Instead', 0]]) trh.appendChild(elm('th', num ? 'num' : null, h));
          th.appendChild(trh);
          table.appendChild(th);
          const tb = elm('tbody');
          for (const v of rows) {
            const tr = elm('tr', v.clear && v.diff > 0 ? 'scn-row--bad' : v.clear ? 'scn-row--good' : '');
            tr.appendChild(elm('td', null, v.key));
            tr.appendChild(elm('td', 'num', `${pct(v.with.winPct)} (${v.with.w + v.with.l} g)`));
            tr.appendChild(elm('td', 'num', `${pct(v.without.winPct)} (${v.without.w + v.without.l} g)`));
            tr.appendChild(elm('td', 'num', `${v.diff > 0 ? '+' : ''}${(v.diff * 100).toFixed(0)} pts${v.clear ? '' : ' (unclear)'}`));
            const td = elm('td');
            if (v.replacement) {
              td.appendChild(chipBtn('species', v.replacement.key));
              td.appendChild(document.createTextNode(` on ${v.replacement.n} teams${v.replacement.winPct == null ? '' : `: ${pct(v.replacement.winPct)} over ${v.replacement.games} games`}`));
            } else td.textContent = '—';
            tr.appendChild(td);
            tb.appendChild(tr);
          }
          table.appendChild(tb);
          wrap.appendChild(table);
          b.appendChild(wrap);
          const top = rows[0];
          b.appendChild(elm('div', 'ddv-note', top.clear && top.diff > 0
            ? `Teams sharing your other Pokémon without ${top.key}: ${pct(top.without.winPct)} over ${top.without.w + top.without.l} games; with it: ${pct(top.with.winPct)} over ${top.with.w + top.with.l} games.`
            : 'No member stands out: every with/without difference is within the noise.'));
        }
        into.appendChild(card);
      }
      into.dataset.scanMs = String(Math.round(performance.now() - t0));
    }

    scanBtn.addEventListener('click', () => { scanned = true; renderResults(); });

    return {
      update(view) {
        const ranked = view.state.source === 'ranked';
        const was = lastView?.state.source === 'ranked';
        lastView = view;
        if (ranked) ctx.meta(metaEl, { source: rankedSource(null) });
        else metaEl.textContent = '';
        if (ranked || was || scanned) renderResults();
      },
    };
  },
};
