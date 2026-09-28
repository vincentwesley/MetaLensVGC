// scanner.js — My Team Scanner: paste a Showdown team, get it checked against
// the current filtered meta view. No prefilled team (real data only); the
// "load random" helper fills the textarea from a real team via toPaste so the
// demo path never fabricates a spread.
import { usage, ladderMerge, closestTeams, speedTiers } from '../lib/aggregate.js';
import { parsePaste, toPaste } from '../lib/paste.js';
import { calcStat } from '../lib/stats.js';
import { TYPES, TYPE_COLORS, effectiveness } from '../lib/types.js';
import { toast } from '../ui/toast.js';

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
  const card = elm('div', 'card scn-block');
  const head = elm('div', 'card__head');
  head.appendChild(elm('h3', null, title));
  const bodyEl = elm('div', 'card__body');
  card.append(head, bodyEl);
  return { card, body: bodyEl };
}

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

// Ladder-derived per-species speed from its single most-common spread.
function ladderSpeedOf(merged, key, dex) {
  const mon = merged?.mons.find((m) => m.key === key);
  const top = mon?.spreads[0];
  if (!top) return null;
  const [nature, spStr] = top.name.split(':');
  const spe5 = Number(spStr.split('/')[5]);
  const bs = dex.species[key]?.bs;
  if (!bs) return null;
  return { spe: calcStat(bs[5], spe5, 5, nature), nature };
}

// Speed of a meta species, in priority order sheets -> ladder -> theoretical bounds.
function metaSpeedOf(key, view, merged, sheetTiersByKey) {
  const sheet = sheetTiersByKey.get(key);
  if (sheet && sheet.spe != null) return { spe: sheet.spe, label: `${sheet.nature} (sheet)` };
  const lad = ladderSpeedOf(merged, key, view.dex);
  if (lad) return { spe: lad.spe, label: `${lad.nature} (ladder${merged.cutoff ? ` ${merged.cutoff}` : ''})` };
  const bs = view.dex.species[key]?.bs;
  if (!bs) return null;
  const lo = calcStat(bs[5], 0, 5, 'Brave');
  const hi = calcStat(bs[5], 32, 5, 'Jolly');
  return { lo, hi, label: 'range, no SP data' };
}

// Meta-wide speed list for the "speed position" panel: same source-priority,
// but as a full ranked list rather than per-species lookups.
function metaSpeedList(view, merged) {
  const sheetTiers = speedTiers(view.teams, view.dex, 99999).filter((r) => r.spe != null);
  if (sheetTiers.length) return { list: sheetTiers.map((r) => ({ key: r.key, spe: r.spe })), label: 'Tournament sheets' };
  if (merged) {
    const list = merged.mons
      .map((m) => ({ key: m.key, ...ladderSpeedOf(merged, m.key, view.dex) }))
      .filter((r) => r.spe != null);
    if (list.length) return { list, label: `Ladder (Smogon ${merged.cutoff})` };
  }
  return { list: [], label: 'No speed data available' };
}

function topThreatsNoAnswer(view, merged, myTypesList, myMaxSpe, sheetTiersByKey, minN) {
  const threats = usage(view.teams).filter((r) => r.n >= minN).slice(0, 20);
  const out = [];
  for (const r of threats) {
    const types = view.dex.species[r.key]?.types;
    if (!types) continue;
    const stabs = [...new Set(types)];
    const hitsSE = myTypesList.filter((mt) => stabs.some((t) => effectiveness(t, mt) > 1)).length;
    const resistsBoth = myTypesList.some((mt) => stabs.every((t) => effectiveness(t, mt) < 1));
    const reasonA = hitsSE >= 2 && !resistsBoth;

    const sp = metaSpeedOf(r.key, view, merged, sheetTiersByKey);
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

    randomBtn.addEventListener('click', () => {
      const view = lastView;
      if (!view || !view.teams.length) { toast('No teams in the current view to sample from', { type: 'error' }); return; }
      const t = view.teams[Math.floor(Math.random() * view.teams.length)];
      textarea.value = toPaste(t, view.dex);
    });

    function renderResults() {
      const view = lastView;
      results.innerHTML = '';
      const text = textarea.value.trim();
      if (!text) { emptyState(results, 'Paste a team and hit Scan'); return; }
      if (!view) { emptyState(results, 'Data still loading'); return; }
      const dex = view.dex;
      const mons = parsePaste(text, dex);
      if (!mons.length) { emptyState(results, 'Could not parse that paste'); return; }

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
      const merged = ladderMerge(view.ladder, view.state.from, view.state.to);
      const sheetTiers = speedTiers(view.teams, dex, 99999);
      const sheetTiersByKey = new Map(sheetTiers.map((r) => [r.key, r]));
      const mySpeeds = mons.map((m) => {
        const bs = baseStatsOf(m, dex);
        if (!bs) return null;
        const spSpe = m.sp ? m.sp[5] : 0;
        const nature = m.nature || 'Hardy';
        return calcStat(bs[5], spSpe, 5, nature);
      }).filter((v) => v != null);
      const myMaxSpe = mySpeeds.length ? Math.max(...mySpeeds) : null;

      const { card: tCard, body: tBody } = sectionCard('Top meta threats with no answer');
      const threats = topThreatsNoAnswer(view, merged, myTypesKnown, myMaxSpe, sheetTiersByKey, view.state.minN);
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
      const { list: metaList, label: speedSource } = metaSpeedList(view, merged);
      if (!metaList.length) {
        emptyState(sBody, 'No speed data available for this regulation yet');
      } else {
        sBody.appendChild(elm('div', 'ddv-note', `Meta speed source: ${speedSource}`));
        const sorted = metaList.slice().sort((a, b) => b.spe - a.spe);
        const speedRows = elm('div', 'scn-speedrows');
        mons.forEach((m) => {
          const bs = baseStatsOf(m, dex);
          if (!bs) return;
          const hadSp = !!m.sp;
          const spSpe = hadSp ? m.sp[5] : 0;
          const nature = m.nature || 'Hardy';
          const mySpe = calcStat(bs[5], spSpe, 5, nature);
          const faster = sorted.filter((r) => r.spe < mySpe).length;
          const pct = sorted.length ? faster / sorted.length : null;
          const row = elm('div', 'scn-speedrow');
          row.appendChild(elm('span', 'scn-speedrow__name', m.k));
          row.appendChild(elm('span', 'scn-speedrow__val', `${mySpe} Spe${hadSp ? '' : ' (assumed 0 SP)'}`));
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
    }

    scanBtn.addEventListener('click', renderResults);

    return {
      update(view) { lastView = view; },
    };
  },
};
