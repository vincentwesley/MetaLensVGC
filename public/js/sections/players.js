// players.js — Players & replays (Showdown formats only, v1.9.1).
// 1. Ladder top 100 from MetaLens' daily snapshots (showdown-ladder-<REG>.json), with peak Elo and best rank SINCE
//    TRACKING BEGAN (Showdown publishes current ratings only). A name opens the lookup.
// 2. Player lookup: live from Pokémon Showdown via ctx.lookupPlayer (profile + recent public replays).
// 3. Top-ladder replay stats from recent rated replays of the top players (showdown-replays-<REG>.json):
//    win rate (Wilson CI), how often each Pokémon is used in battle and leads, and the most common lead pairs.
import { aggregateReplays, toUserId } from '../lib/replays.js';
import { clickHint } from '../ui/meta.js';

const TOP_ROWS = 25;
const MIN_GAMES = 10;

function elm(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
function card(title) {
  const c = elm('div', 'card');
  const head = elm('div', 'card__head');
  head.appendChild(elm('h3', null, title));
  const meta = elm('div', 'meta-line');
  head.appendChild(meta);
  const body = elm('div', 'card__body');
  c.append(head, body);
  return { c, meta, body };
}
function empty(parent, title, text) {
  const b = elm('div', 'empty-state');
  b.appendChild(elm('div', 'empty-state__title', title));
  if (text) b.appendChild(elm('div', null, text));
  parent.appendChild(b);
}
function table(headers) {
  const wrap = elm('div', 'table-wrap');
  const t = elm('table', 'data-table');
  const tr = elm('tr');
  for (const [h, cls] of headers) tr.appendChild(elm('th', cls || null, h));
  const thead = elm('thead');
  thead.appendChild(tr);
  const tbody = elm('tbody');
  t.append(thead, tbody);
  wrap.appendChild(t);
  return { wrap, tbody };
}
const td = (text, cls) => elm('td', cls || null, text);
// Tooltip for a peak: from MetaLens' daily snapshots, or recorded by hand (data-manual/, with its source).
function peakTip(kind, date, manual, player) {
  if (!manual) return `${kind} reached ${date} (MetaLens daily snapshot)`;
  const m = player?.manual?.find((x) => x.date === date);
  return `${kind} reached ${date}, recorded by hand${m?.source ? `: ${m.source}` : ' from the Showdown ladder'}`;
}
const replayUrl = (id) => `https://replay.pokemonshowdown.com/${id}`;

export default {
  id: 'players',
  title: 'Players & replays',
  mount(el, ctx) {
    el.classList.add('sb-grid');
    const lad = card('Ladder top 100');
    const look = card('Player lookup');
    const stats = card('Top-ladder replay stats');
    const leads = card('Most common leads (top ladder)');
    for (const x of [lad, look]) x.c.classList.add('sb-full');
    el.append(look.c, lad.c, stats.c, leads.c);

    // --- lookup form (built once) ---
    const form = elm('form', 'pl-form');
    const input = elm('input', 'pl-input');
    input.type = 'search';
    input.placeholder = 'Showdown username…';
    input.setAttribute('aria-label', 'Showdown username');
    input.autocomplete = 'off';
    input.maxLength = 18;
    const go = elm('button', 'lib-btn', 'Look up');
    go.type = 'submit';
    form.append(input, go);
    const lookOut = elm('div', 'pl-out');
    look.body.append(elm('p', 'click-hint', 'Ratings, record and recent public replays come live from Pokémon Showdown; peak Elo and best rank only from MetaLens’ daily top-500 snapshots.'), form, lookOut);

    let lastView = null;
    let showAll = false;
    let lookupSeq = 0;

    async function lookup(name) {
      const view = lastView;
      const id = toUserId(name);
      if (!id || !view) return;
      input.value = name;
      const seq = ++lookupSeq;
      lookOut.textContent = '';
      lookOut.appendChild(elm('p', 'pl-loading', `Looking up ${name} on Pokémon Showdown…`));
      look.c.scrollIntoView?.({ block: 'nearest' });
      let res;
      try { res = await ctx.lookupPlayer(id, view.regMeta?.format); } catch { res = null; }
      if (seq !== lookupSeq) return;
      lookOut.textContent = '';
      if (!res || (!res.profile && !res.replays.length)) { empty(lookOut, 'Player not found', `No Showdown user “${name}”, or Showdown could not be reached.`); return; }
      renderPlayer(res, view);
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); lookup(input.value.trim()); });

    function renderPlayer(res, view) {
      const fmt = view.regMeta?.format;
      const label = view.regMeta?.label || view.reg;
      const p = res.profile;
      const head = elm('div', 'pl-head');
      head.appendChild(elm('h4', 'pl-name', p?.username || res.id));
      const kpis = elm('div', 'pl-kpis');
      const kpi = (l, v, tip) => { const k = elm('div', 'kpi'); const lab = elm('span', 'kpi__label', l); if (tip) lab.dataset.tip = tip; k.append(lab, elm('span', 'kpi__value', v)); kpis.appendChild(k); };
      const r = p?.ratings?.[fmt];
      if (r) {
        kpi(`${label} Elo`, String(Math.round(r.elo)));
        kpi('GXE', r.gxe != null ? `${r.gxe}%` : '—', 'Glicko X-Act Estimate: the chance of beating a random ladder player.');
        kpi('Record', `${r.w}-${r.l}`);
      } else kpi(`${label} rating`, 'not rated');
      const tracked = view.players?.ladder?.players?.[res.id];
      const since = view.players?.ladder?.tracking?.since;
      if (tracked) {
        kpi('Peak Elo', `${tracked.peakElo}${tracked.peakEloManual ? '*' : ''}`, peakTip('Peak Elo', tracked.peakEloDate, tracked.peakEloManual, tracked));
        kpi('Best rank', `#${tracked.bestRank}${tracked.bestRankManual ? '*' : ''}`, peakTip('Best rank', tracked.bestRankDate, tracked.bestRankManual, tracked));
      }
      head.appendChild(kpis);
      lookOut.appendChild(head);
      if (tracked?.peakEloManual || tracked?.bestRankManual) lookOut.appendChild(elm('p', 'ddv-note', `* Recorded by hand from the Showdown ladder (${(tracked.manual || []).map((m) => `${m.date}: #${m.rank}, ${m.elo} Elo`).join('; ')}). Other peaks come from MetaLens' daily snapshots since ${since}.`));
      if (!tracked) lookOut.appendChild(elm('p', 'ddv-note', since ? `Not in the ${label} top 500 in any MetaLens snapshot since ${since}, so no peak is recorded.` : 'Peak tracking starts with the first daily snapshot.'));

      // most used Pokémon in their recent public replays
      const mine = (g, i) => g.p[i].u === res.id;
      const games = res.games.filter((g) => g.p.some((s) => s.u === res.id));
      if (!res.replays.length) { empty(lookOut, `No public ${label} replays`, 'Only replays the players chose to save are public.'); return; }
      const agg = aggregateReplays(games, { side: mine });
      if (agg.mons.length) {
        lookOut.appendChild(elm('h5', 'pl-sub', `Most used in their last ${games.length} public replays`));
        const row = elm('div', 'pl-mons');
        for (const m of agg.mons.slice(0, 8)) {
          const b = elm('button', 'pl-mon');
          b.type = 'button';
          b.title = `${m.key}: ${m.games} games${m.winPct != null ? `, ${Math.round(m.winPct * 100)}% won` : ''}`;
          b.append(ctx.sprite(m.key, { size: 'sm' }), elm('span', null, m.key), elm('span', 'pl-mon__n', `${m.games}×`));
          b.addEventListener('click', () => ctx.openDrawer(m.key));
          row.appendChild(b);
        }
        lookOut.appendChild(row);
      }
      // recent replays
      lookOut.appendChild(elm('h5', 'pl-sub', 'Recent public replays'));
      const byId = new Map(games.map((g) => [g.id, g]));
      const { wrap, tbody } = table([['Date'], ['Opponent'], ['Rating', 'num'], ['Result'], ['Replay']]);
      for (const rp of res.replays.slice(0, 20)) {
        const g = byId.get(rp.id);
        const side = g ? g.p.findIndex((s) => s.u === res.id) : -1;
        const opp = (rp.players || []).find((n) => toUserId(n) !== res.id) || '—';
        const result = !g || side < 0 ? '—' : g.w == null ? 'no result' : g.w === side ? 'Won' : 'Lost';
        const tr = elm('tr');
        const a = elm('a', null, 'Watch');
        a.href = replayUrl(rp.id);
        a.target = '_blank';
        a.rel = 'noopener';
        const tdA = td('');
        tdA.appendChild(a);
        tr.append(td(new Date(rp.uploadtime * 1000).toISOString().slice(0, 10)), td(opp), td(rp.rating ? String(rp.rating) : 'unrated', 'num'),
          td(result, result === 'Won' ? 'pl-win' : result === 'Lost' ? 'pl-loss' : null), tdA);
        tbody.appendChild(tr);
      }
      lookOut.appendChild(wrap);
      lookOut.appendChild(elm('p', 'ddv-note', `Results and Pokémon from the newest ${games.length} replays (the others are listed without opening them). Data: Pokémon Showdown.`));
    }

    function renderLadder(view) {
      lad.body.textContent = '';
      const L = view.players?.ladder;
      if (!L?.top?.length) {
        ctx.meta(lad.meta, { source: 'Pokémon Showdown ladder' });
        empty(lad.body, 'No ladder snapshot yet', 'The daily Showdown snapshot has not run for this format yet.');
        return;
      }
      ctx.meta(lad.meta, { source: `Pokémon Showdown ladder · ${L.tracking.last} · peaks tracked since ${L.tracking.since} (${L.tracking.snapshots} daily snapshot${L.tracking.snapshots === 1 ? '' : 's'})`, n: L.top.length, unit: 'players' });
      lad.body.appendChild(clickHint('Click a name: look the player up. Peak Elo and best rank are the highest seen in MetaLens’ daily top-500 snapshots, not all-time; * = recorded by hand from the Showdown ladder (hover for the source).', { auto: false }));
      const { wrap, tbody } = table([['#', 'num'], ['Player'], ['Elo', 'num'], ['GXE', 'num'], ['W-L', 'num'], ['Peak Elo', 'num'], ['Best rank', 'num']]);
      for (const r of showAll ? L.top : L.top.slice(0, TOP_ROWS)) {
        const tr = elm('tr');
        const name = elm('button', 'pl-link', r.name);
        name.type = 'button';
        name.addEventListener('click', () => lookup(r.name));
        const tdN = td('');
        tdN.appendChild(name);
        const pl = L.players?.[r.userid];
        const peak = td(`${r.peakElo}${r.peakEloManual ? '*' : ''}`, 'num');
        peak.dataset.tip = peakTip('Peak Elo', r.peakEloDate, r.peakEloManual, pl);
        const best = td(`#${r.bestRank}${r.bestRankManual ? '*' : ''}`, 'num');
        best.dataset.tip = peakTip('Best rank', r.bestRankDate, r.bestRankManual, pl);
        tr.append(td(String(r.rank), 'num'), tdN, td(String(r.elo), 'num'), td(`${r.gxe}%`, 'num'), td(`${r.w}-${r.l}`, 'num'), peak, best);
        tbody.appendChild(tr);
      }
      lad.body.appendChild(wrap);
      if (L.top.length > TOP_ROWS) {
        const more = elm('button', 'lib-btn smp-more', showAll ? 'Show top 25' : `Show all ${L.top.length}`);
        more.type = 'button';
        more.addEventListener('click', () => { showAll = !showAll; renderLadder(view); });
        lad.body.appendChild(more);
      }
    }

    function renderStats(view) {
      stats.body.textContent = '';
      leads.body.textContent = '';
      const R = view.players?.replays;
      const games = R?.games || [];
      if (!games.length) {
        for (const x of [stats, leads]) { ctx.meta(x.meta, { source: 'Showdown replays' }); empty(x.body, 'No replay sample yet', 'The daily Showdown snapshot has not collected replays for this format yet.'); }
        return;
      }
      const src = `Rated public replays of the top ${R.sample.players} · last ${R.sample.windowDays} days`;
      const agg = aggregateReplays(games);
      ctx.meta(stats.meta, { source: src, n: games.length, unit: 'games' });
      ctx.meta(leads.meta, { source: src, n: games.length, unit: 'games' });
      const test = view.speciesFilter?.test;
      const rows = agg.mons.filter((m) => m.games >= MIN_GAMES && (!test || test(m.key)));
      stats.body.appendChild(clickHint(`Per Pokémon on a team (team preview): win rate with its 95% range, how often it was sent out and how often it led. Pokémon in ${MIN_GAMES}+ games. Click a row: details.`, { auto: false }));
      if (!rows.length) empty(stats.body, 'No Pokémon in enough games', `None of the Pokémon in your filters appears in ${MIN_GAMES}+ sampled games.`);
      else {
        const { wrap, tbody } = table([['Pokémon'], ['Games', 'num'], ['Win %', 'num'], ['Used', 'num'], ['Led', 'num']]);
        for (const m of rows.slice(0, 40)) {
          const tr = elm('tr');
          tr.tabIndex = 0;
          tr.classList.add('is-clickable');
          tr.addEventListener('click', () => ctx.openDrawer(m.key));
          const name = td('');
          name.append(ctx.sprite(m.key, { size: 'xs' }), ` ${m.key}`);
          const win = td(m.winPct == null ? '—' : ctx.fmt.pct(m.winPct), 'num');
          if (m.ci) win.dataset.tip = `95% range ${ctx.fmt.pct(m.ci[0])}–${ctx.fmt.pct(m.ci[1])} (${m.wins}-${m.losses})`;
          tr.append(name, td(ctx.fmt.n(m.games), 'num'), win, td(ctx.fmt.pct(m.broughtPct), 'num'), td(ctx.fmt.pct(m.ledPct), 'num'));
          tbody.appendChild(tr);
        }
        stats.body.appendChild(wrap);
      }
      const lrows = agg.leads.filter((l) => l.games >= 3).slice(0, 12);
      if (!lrows.length) empty(leads.body, 'No lead seen 3+ times');
      else {
        const { wrap, tbody } = table([['Lead'], ['Games', 'num'], ['Win %', 'num']]);
        for (const l of lrows) {
          const tr = elm('tr');
          const name = td('');
          for (const k of l.pair.split(' + ')) name.append(ctx.sprite(k, { size: 'xs' }));
          name.append(` ${l.pair}`);
          tr.append(name, td(ctx.fmt.n(l.games), 'num'), td(l.winPct == null ? '—' : ctx.fmt.pct(l.winPct), 'num'));
          tbody.appendChild(tr);
        }
        leads.body.appendChild(wrap);
      }
    }

    return {
      update(view) {
        const changed = lastView?.reg !== view.reg;
        lastView = view;
        if (changed) { lookOut.textContent = ''; showAll = false; }
        renderLadder(view);
        renderStats(view);
      },
      highlight() {},
    };
  },
};
