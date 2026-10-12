// events.js — Event Results: the view's tournaments newest first, with the winner's team and the
// top-cut archetype mix. Team-level (view.teams). Clicking a winner row adds a Team chip.
import { archetypeSplit } from '../lib/aggregate.js';
import { ARCHETYPES } from '../lib/archetypes.js';
import { groupEvents } from '../lib/events.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

const PAGE = 12;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function emptyState(parent, title, detail) {
  parent.textContent = '';
  const box = el('div', 'empty-state');
  box.append(el('div', 'empty-state__title', title));
  if (detail) box.append(el('div', null, detail));
  parent.appendChild(box);
}

const labelOf = (id) => (id === 'other' ? 'Other' : ARCHETYPES.find((a) => a.id === id)?.label || id);

// Same colour rule as the Archetypes section (its helper is private): named archetypes ranked once per
// regulation take the series colours in order, the rest the muted grey, so a filter never repaints one.
const orders = new WeakMap();
function colorsFor(regTeams, theme) {
  let order = orders.get(regTeams);
  if (!order) orders.set(regTeams, order = archetypeSplit(regTeams).map((r) => r.id).filter((id) => id !== 'other'));
  return (id) => { const i = order.indexOf(id); return i >= 0 && i < theme.series.length ? theme.series[i] : theme.muted; };
}

export default {
  id: 'events',
  title: 'Event Results',
  mount(root, ctx) {
    root.innerHTML = '';
    const card = el('div', 'card');
    const head = el('div', 'card__head');
    const meta = el('span');
    head.append(el('h3', null, 'Event Results'), meta);
    const body = el('div', 'card__body');
    const list = el('div', 'ev-list');
    const moreWrap = el('div', 'lib-loadmore-wrap');
    const countEl = el('span', 'lib-count');
    const moreBtn = el('button', 'lib-btn', 'Show more');
    moreBtn.type = 'button';
    moreWrap.append(countEl, moreBtn);
    body.append(clickHint('Each tournament in view, newest first. Click a winner’s row: show only that team. Shift-click to exclude.'), list, moreWrap);
    card.append(head, body);
    root.appendChild(card);

    let lastView = null;
    let shown = PAGE;

    function row(g, view, colorOf) {
      const r = el('div', 'ev-row');
      const top = el('div', 'ev-row__head');
      top.append(el('span', 'ev-row__name', g.name), el('span', `pill lib-tier lib-tier--${g.tier}`, g.tier),
        el('span', 'ev-row__sub', `${ctx.fmt.date(g.date)} · ${ctx.fmt.n(g.n)} ${g.n === 1 ? 'team' : 'teams'} in view`));
      r.appendChild(top);

      const w = g.winner;
      if (w) {
        const btn = el('button', 'ev-winner');
        btn.type = 'button';
        btn.setAttribute('aria-label', `Show only ${w.player || 'the winner'}'s team`);
        btn.append(el('span', 'ev-winner__lbl', 'Winner'), el('span', 'ev-winner__who', w.player || 'Unknown'));
        const mons = el('span', 'ev-winner__mons');
        for (const m of w.mons) mons.appendChild(ctx.sprite(m.k, { size: 'xs', animated: view.state.anim }));
        btn.appendChild(mons);
        btn.addEventListener('click', (e) => ctx.chip('team', w.id, e));
        r.appendChild(btn);
      } else r.appendChild(el('div', 'ev-row__sub', 'Winner not in view'));

      if (g.mix.length) {
        const tot = g.mix.reduce((s, x) => s + x.n, 0);
        const bar = el('div', 'ev-mix');
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', `Top ${tot}: ${g.mix.map((x) => `${x.n} ${labelOf(x.id)}`).join(', ')}`);
        for (const x of g.mix) {
          const seg = el('span', 'ev-mix__seg');
          seg.style.flexGrow = x.n;
          seg.style.background = colorOf(x.id);
          seg.title = `${labelOf(x.id)}: ${x.n} of the top ${tot}`;
          bar.appendChild(seg);
        }
        r.append(bar, el('div', 'ev-row__sub', `Top ${tot}: ${g.mix.map((x) => `${labelOf(x.id)} ${x.n}`).join(' · ')}`));
      }
      return r;
    }

    function render() {
      const view = lastView;
      list.textContent = '';
      moreWrap.style.display = 'none';
      if (view.state.source === 'ranked') {
        ctx.meta(meta, { source: rankedSource(null) });
        emptyState(list, 'Tournament-only view', RANKED_NA);
        return;
      }
      if (view.state.source !== 'tournaments') {
        ctx.meta(meta, { source: 'Tournaments', n: 0, unit: 'teams' });
        emptyState(list, 'Tournament-only view', 'Event results come from tournaments. Switch Source to Tournaments.');
        return;
      }
      ctx.meta(meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams' });
      const events = groupEvents(view.teams);
      if (!events.length) { emptyState(list, 'No events in view', 'No tournament teams match the current filters.'); return; }
      const colorOf = colorsFor(view.regTeams, ctx.chartTheme());
      for (const g of events.slice(0, shown)) list.appendChild(row(g, view, colorOf));
      moreWrap.style.display = '';
      countEl.textContent = `Showing ${Math.min(shown, events.length)} of ${events.length} events`;
      moreBtn.style.display = shown < events.length ? '' : 'none';
    }

    moreBtn.addEventListener('click', () => { shown += PAGE; render(); });

    return {
      update(view) { lastView = view; shown = PAGE; render(); },
    };
  },
};
