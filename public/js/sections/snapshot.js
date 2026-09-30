// snapshot.js — Meta Snapshot (hero): top-6 species cards + KPI tiles.
// Tournament mode: aggregate.usage()/kpis() over view.monTeams, delta vs view.prev.
// Ladder mode: ladderMerge() gives usage-only rows + n=battles (no win%, no delta).
import { usage, atMinN, kpis, changeVsPrev, changeText, ladderMerge, rankedSeason, rankedMegaKey } from '../lib/aggregate.js';
import { rankedSource, clickHint } from '../ui/meta.js';
import { effectiveSpecies } from '../lib/stats.js';

function emptyState(el, title, detail) {
  el.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state';
  const h = document.createElement('div');
  h.className = 'empty-state__title';
  h.textContent = title;
  box.appendChild(h);
  if (detail) {
    const p = document.createElement('div');
    p.textContent = detail;
    box.appendChild(p);
  }
  el.appendChild(box);
}

// previousPeriod() either returns the preceding window within the same reg,
// or falls back to the previous regulation's teams. Label from whichever it
// gave us: ponytail — approximates the window length from view.base's date
// span rather than re-deriving previousPeriod's exact bounds; good enough for
// a label, upgrade if the two ever visibly disagree.
function deltaLabel(view) {
  const prev = view.prev;
  if (!prev || !prev.length) return null;
  if (prev[0].reg !== view.reg) return `vs ${prev[0].reg}`;
  const dates = view.base.map((t) => t.date).filter(Boolean).sort();
  if (!dates.length) return 'vs prior period';
  const days = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1;
  return `vs prior ${days} day${days === 1 ? '' : 's'}`;
}

function monCard(ctx, key, pct, winPct, change, label, anim, prevN, minN) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'snapshot__mon';
  card.dataset.key = key;
  card.addEventListener('click', (e) => ctx.chip('species', key, e));
  card.addEventListener('mouseenter', () => ctx.hover(key));
  card.addEventListener('mouseleave', () => ctx.hover(null));
  card.addEventListener('focus', () => ctx.hover(key));
  card.addEventListener('blur', () => ctx.hover(null));

  const img = ctx.sprite(key, { size: 56, animated: anim });
  img.className += ' snapshot__mon-sprite';
  card.appendChild(img);

  const name = document.createElement('div');
  name.className = 'snapshot__mon-name';
  name.textContent = key;
  card.appendChild(name);

  const stats = document.createElement('div');
  stats.className = 'snapshot__mon-stats';
  const usageEl = document.createElement('span');
  usageEl.textContent = typeof pct === 'string' ? pct : ctx.fmt.pct(pct); // string = in-game rank label
  stats.appendChild(usageEl);
  if (winPct != null) {
    const winEl = document.createElement('span');
    winEl.className = 'snapshot__mon-win';
    winEl.textContent = `${ctx.fmt.pct(winPct)} W`;
    stats.appendChild(winEl);
  }
  card.appendChild(stats);

  if (change) {
    const d = document.createElement('div');
    const { isNew, pts: deltaPts } = change;
    // Low-sample previous period: the delta is still the real number, but a
    // handful of prior teams makes it noisy, so grey it out and say why
    // rather than hide it (still real data, just a shakier comparison).
    const lowSample = !prevN || prevN < Math.max(minN || 0, 50);
    if (isNew) {
      d.className = 'kpi__delta kpi__delta--up';
      d.textContent = changeText(change);
      d.setAttribute('data-tip', `Not used (or under min n) in ${String(label).replace(/^vs /, '')}`);
    } else {
      d.className = `kpi__delta ${deltaPts > 0 ? 'kpi__delta--up' : deltaPts < 0 ? 'kpi__delta--down' : ''}${lowSample ? ' kpi__delta--low' : ''}`;
      d.textContent = changeText(change);
      d.setAttribute('data-tip', `Change in usage share ${label}, in percentage points`);
    }
    card.appendChild(d);
  }
  return card;
}

function kpiTile(label, value, opts = {}) {
  const el = document.createElement('div');
  el.className = 'kpi';
  const l = document.createElement('div');
  l.className = 'kpi__label';
  l.textContent = label;
  if (opts.tip) { l.setAttribute('data-tip', opts.tip); l.tabIndex = 0; }
  const v = document.createElement('div');
  v.className = 'kpi__value';
  if (opts.sprite) {
    // Long names (Salamence-Mega) may only break after a hyphen, never mid-word.
    const t = document.createElement('span');
    String(value).split(/(?<=-)/).forEach((part, i) => { if (i) t.appendChild(document.createElement('wbr')); t.appendChild(document.createTextNode(part)); });
    v.append(opts.sprite, t);
  } else v.textContent = value;
  el.append(l, v);
  return el;
}

export default {
  id: 'snapshot',
  title: 'Meta Snapshot',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card snapshot-card';
    const head = document.createElement('div');
    head.className = 'card__head';
    const h = document.createElement('h3');
    h.textContent = 'Meta Snapshot';
    const meta = document.createElement('span');
    head.append(h, meta);
    const body = document.createElement('div');
    body.className = 'card__body';
    const hero = document.createElement('div');
    hero.className = 'snapshot__hero';
    const kpiRow = document.createElement('div');
    kpiRow.className = 'snapshot__kpis';
    const changeNote = document.createElement('p');
    changeNote.className = 'snapshot__change';
    body.append(hero, kpiRow);
    card.append(head, body);
    el.appendChild(card);
    const hint = clickHint('Top Pokémon by usage. Click a card: show only that Pokémon and its teams. Shift-click to exclude.');
    body.prepend(hint);

    let lastView = null;
    let lastKpis = new Map();

    function render() {
      const view = lastView;
      if (!view) return;
      const state = view.state;
      const anim = !!state.anim;
      changeNote.remove();

      if (state.source === 'ranked') {
        const season = rankedSeason(view.ranked, state.from, state.to);
        const count = season ? Object.keys(season.mons).length : 0;
        ctx.meta(meta, { source: rankedSource(season), n: count, unit: 'Pokémon' });
        if (!season) { emptyState(body, 'No in-game ranked season in the selected range'); return; }
        hero.innerHTML = ''; kpiRow.innerHTML = '';
        body.querySelector('.empty-state')?.remove();
        body.prepend(hero); body.append(kpiRow);
        const ranking = (season.ranking || []).filter((k) => season.mons[k]);
        if (!ranking.length) emptyState(hero, `Ranking not published for finished season ${season.season}`);
        else ranking.slice(0, 6).forEach((k) => hero.appendChild(monCard(ctx, k, `Rank #${season.mons[k].rank}`, null, null, '', anim)));
        const megas = ranking.filter((k) => rankedMegaKey(k, season.mons[k], ctx.dex)).slice(0, 3);
        const notPub = 'Not published';
        kpiRow.appendChild(kpiTile('Season', season.season));
        kpiRow.appendChild(kpiTile('Snapshot', season.snapshot));
        kpiRow.appendChild(kpiTile('Pokémon with data', ctx.fmt.n(count)));
        kpiRow.appendChild(kpiTile('#1 ranked', ranking[0] || notPub, ranking[0] ? { sprite: ctx.sprite(ranking[0], { size: 20, animated: anim }) } : {}));
        const megaTile = kpiTile('Top-ranked Mega Stone holder', megas.length ? `#${season.mons[megas[0]].rank} ${megas[0]}` : notPub,
          { tip: 'Highest-ranked Pokémon whose most common held item is their own Mega Stone (50%+ of ranked sets).' });
        if (megas.length > 1) {
          const next = document.createElement('div');
          next.className = 'ddv-note';
          next.textContent = `then ${megas.slice(1).map((k) => `#${season.mons[k].rank} ${k}`).join(', ')}`;
          megaTile.appendChild(next);
        }
        kpiRow.appendChild(megaTile);
        return;
      }

      if (state.source === 'ladder') {
        const merged = ladderMerge(view.ladder, state.from, state.to, view.dex);
        if (!merged) {
          ctx.meta(meta, { source: 'Ladder (Smogon)', n: 0, unit: 'battles' });
          emptyState(body, 'No ladder data for this regulation yet');
          return;
        }
        ctx.meta(meta, { source: 'Ladder (Smogon)', n: merged.battles, unit: 'battles' });
        hero.innerHTML = ''; kpiRow.innerHTML = '';
        body.querySelector('.empty-state')?.remove();
        body.prepend(hero); body.append(kpiRow);
        const top = merged.mons.slice(0, 6);
        if (!top.length) {
          emptyState(hero, 'Insufficient data');
        } else {
          top.forEach((m) => hero.appendChild(monCard(ctx, m.key, m.usage, null, null, '', anim)));
        }
        const megaKeys = merged.mons.filter((m) => ctx.dex.species[m.key]?.megaOf);
        const megaShare = megaKeys.reduce((a, m) => a + m.usage, 0);
        const topMega = megaKeys.sort((a, b) => b.usage - a.usage)[0];
        kpiRow.appendChild(kpiTile('Battles sampled', ctx.fmt.n(merged.battles)));
        kpiRow.appendChild(kpiTile('Unique species', ctx.fmt.n(merged.mons.length)));
        kpiRow.appendChild(kpiTile('Meta diversity', effectiveSpecies(merged.mons.map((m) => m.raw)).toFixed(1),
          { tip: 'Effective number of species: exp(Shannon entropy) of usage share. Higher = more balanced meta.' }));
        kpiRow.appendChild(kpiTile('Mega share', ctx.fmt.pct(megaShare)));
        kpiRow.appendChild(kpiTile('Most-used Mega', topMega ? topMega.key : '—', topMega ? { sprite: ctx.sprite(topMega.key, { size: 20, animated: anim }) } : {}));
        return;
      }

      const { rows, relaxed } = atMinN(usage(view.monTeams), state.minN);
      ctx.meta(meta, { source: 'Tournaments', n: view.monTeams.length, unit: 'teams', relaxed });
      hero.innerHTML = ''; kpiRow.innerHTML = '';
      body.querySelector('.empty-state')?.remove();
      body.prepend(hero); body.append(kpiRow);

      if (!view.monTeams.length) {
        emptyState(hero, 'Insufficient data');
        return;
      }

      const top = rows.slice(0, 6);
      if (!top.length) {
        emptyState(hero, 'Insufficient data');
      } else {
        const prevRows = view.prev && view.prev.length ? new Map(usage(view.prev).map((r) => [r.key, r])) : null;
        const label = deltaLabel(view);
        const prevN = view.prev ? view.prev.length : 0;
        if (label) {
          const low = prevN < Math.max(state.minN || 0, 50);
          changeNote.textContent = `Change ${label} (prev n=${ctx.fmt.n(prevN)} teams)${low ? ' · low sample' : ''}`;
          hero.after(changeNote);
        }
        top.forEach((r) => {
          const change = prevRows ? changeVsPrev(r.pct, prevRows.get(r.key), state.minN) : null;
          hero.appendChild(monCard(ctx, r.key, r.pct, r.winPct, change, label || '', anim, prevN, state.minN));
        });
      }

      const k = kpis(view.monTeams);
      kpiRow.appendChild(kpiTile('Teams sampled', ctx.fmt.n(k.teams)));
      kpiRow.appendChild(kpiTile('Unique species', ctx.fmt.n(k.species)));
      kpiRow.appendChild(kpiTile('Meta diversity', k.diversity.toFixed(1),
        { tip: 'Effective number of species: exp(Shannon entropy) of usage counts. Higher = more balanced meta.' }));
      kpiRow.appendChild(kpiTile('Mega share', ctx.fmt.pct(k.megaShare)));
      kpiRow.appendChild(kpiTile('Most-used Mega', k.topMega ? k.topMega.key : '—',
        k.topMega ? { sprite: ctx.sprite(k.topMega.key, { size: 20, animated: anim }) } : {}));
    }

    return {
      update(view) {
        lastView = view; render();
        // KPI values that changed since the last render get a short tick (css .kpi--changed).
        const now = new Map();
        for (const t of kpiRow.querySelectorAll('.kpi')) {
          const label = t.querySelector('.kpi__label').textContent, v = t.querySelector('.kpi__value');
          const value = v.textContent;
          if (lastKpis.has(label) && lastKpis.get(label) !== value) v.classList.add('kpi--changed');
          now.set(label, value);
        }
        lastKpis = now;
        // render() re-prepends the hero and can wipe the body; keep one hint on top.
        if (body.firstChild !== hint) body.prepend(hint);
        hint.hidden = !body.querySelector('.snapshot__mon');
      },
      highlight(key) {
        hero.querySelectorAll('.snapshot__mon').forEach((c) => c.classList.toggle('is-hovered', key && c.dataset.key === key));
      },
    };
  },
};
