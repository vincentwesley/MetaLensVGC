// samples.js — Sample teams (Showdown formats only): Smogon's sample teams for the selected format, with author credit,
// a Copy button (Showdown paste with EVs, IVs and Tera) and a link back to Smogon. Pokémon chips keep the teams that
// use those Pokémon; a sprite opens the deep dive. Data: samples-<REG>.json (scripts/sources/smogon-sets.js).
import { sampleTeams, filterSampleTeams } from '../lib/samples.js';
import { toPaste } from '../lib/paste.js';
import { RULES } from '../lib/stats.js';
import { copyText } from '../ui/clipboard.js';
import { toast } from '../ui/toast.js';
import { clickHint } from '../ui/meta.js';

function elm(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function emptyState(parent, title, text) {
  const box = elm('div', 'empty-state');
  box.appendChild(elm('div', 'empty-state__title', title));
  if (text) box.appendChild(elm('div', null, text));
  parent.appendChild(box);
}

const PAGE = 6;

const matches = (t, q) => !q || t.name.toLowerCase().includes(q) || (t.author || '').toLowerCase().includes(q)
  || t.mons.some((m) => m.k.toLowerCase().includes(q) || m.s.toLowerCase().includes(q) || (m.item || '').toLowerCase().includes(q));

export default {
  id: 'samples',
  title: 'Sample teams',
  mount(el, ctx) {
    const card = elm('div', 'card smp');
    const head = elm('div', 'card__head');
    head.appendChild(elm('h3', null, 'Sample teams'));
    const meta = elm('div', 'meta-line');
    head.appendChild(meta);
    const body = elm('div', 'card__body');
    card.append(head, body);
    el.appendChild(card);

    const tools = elm('div', 'smp-tools');
    const search = elm('input', 'smp-search');
    search.type = 'search';
    search.placeholder = 'Search team, author, Pokémon or item…';
    search.setAttribute('aria-label', 'Search sample teams');
    const count = elm('span', 'smp-count');
    tools.append(search, count);
    const credit = elm('p', 'smp-credit');
    const grid = elm('div', 'smp-grid');
    const more = elm('button', 'lib-btn smp-more');
    more.type = 'button';
    body.append(clickHint('Click a Pokémon to open its details. Copy gives a Showdown import with EVs, IVs and Tera. Pokémon filters keep the teams that use them.'), tools, grid, more, credit);

    let lastView = null;
    let q = '';
    let showAll = false;
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); if (lastView) paint(lastView); });
    more.addEventListener('click', () => { showAll = !showAll; if (lastView) paint(lastView); });

    function teamCard(t, view, link) {
      const c = elm('article', 'smp-card');
      const top = elm('div', 'smp-card__top');
      top.appendChild(elm('h4', 'smp-card__name', t.name));
      if (t.author) top.appendChild(elm('span', 'smp-card__author', `by ${t.author}`));
      c.appendChild(top);
      const mons = elm('div', 'smp-mons');
      for (const m of t.mons) {
        const b = elm('button', 'smp-mon');
        b.type = 'button';
        b.title = `${m.k}${m.item ? ` @ ${m.item}` : ''}${m.tera ? ` · Tera ${m.tera}` : ''}\n${m.moves.join(' / ')}`;
        b.setAttribute('aria-label', `Open ${m.k} details`);
        b.appendChild(ctx.sprite(m.k, { size: 'sm', animated: view.state.anim }));
        b.appendChild(elm('span', 'smp-mon__name', m.k));
        b.appendChild(elm('span', 'smp-mon__item', m.item || '—'));
        if (m.tera) b.appendChild(elm('span', 'smp-mon__tera', `Tera ${m.tera}`));
        b.addEventListener('click', () => ctx.openDrawer(m.k));
        mons.appendChild(b);
      }
      c.appendChild(mons);
      const actions = elm('div', 'smp-card__actions');
      const copy = elm('button', 'lib-btn', 'Copy');
      copy.type = 'button';
      copy.title = 'Copy as a Showdown import';
      copy.addEventListener('click', async () => {
        const ok = await copyText(toPaste({ mons: t.mons }, view.dex, view.rules || RULES.ev));
        toast(ok ? 'Copied!' : 'Could not copy', { type: ok ? 'info' : 'error' });
      });
      const open = elm('a', 'lib-btn', 'On Smogon');
      open.href = link;
      open.target = '_blank';
      open.rel = 'noopener';
      actions.append(copy, open);
      c.appendChild(actions);
      return c;
    }

    function paint(view) {
      grid.textContent = '';
      const samples = view.samples;
      const all = sampleTeams(samples, view.dex);
      const link = samples?.source?.smogon || 'https://www.smogon.com/dex/sv/';
      credit.textContent = '';
      credit.append('Sample teams © Smogon and their authors, via the ');
      const a = elm('a', null, 'pkmn/smogon');
      a.href = 'https://github.com/pkmn/smogon';
      a.target = '_blank';
      a.rel = 'noopener';
      credit.append(a, ' data mirror. ');
      const s = elm('a', null, 'See them on Smogon');
      s.href = link;
      s.target = '_blank';
      s.rel = 'noopener';
      credit.append(s, '.');
      ctx.meta(meta, { source: `Smogon sample teams · ${view.regMeta?.label || view.reg}`, n: all.length, unit: 'teams' });
      if (!all.length) {
        tools.hidden = true;
        more.hidden = true;
        emptyState(grid, 'No sample teams for this format', 'Smogon has not published sample teams for it yet.');
        return;
      }
      tools.hidden = false;
      const shown = filterSampleTeams(all, view.speciesFilter?.test).filter((t) => matches(t, q));
      count.textContent = shown.length === all.length ? `${all.length} teams` : `${shown.length} of ${all.length} teams`;
      more.hidden = shown.length <= PAGE;
      more.textContent = showAll ? 'Show fewer' : `Show all ${shown.length} teams`;
      if (!shown.length) {
        emptyState(grid, 'No sample team matches', q ? 'Try another search.' : 'None of the sample teams uses the Pokémon in your filters.');
        return;
      }
      for (const t of showAll ? shown : shown.slice(0, PAGE)) grid.appendChild(teamCard(t, view, link));
    }

    return {
      update(view) {
        lastView = view;
        paint(view);
      },
      highlight() {},
    };
  },
};
