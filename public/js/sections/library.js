// library.js — Team Sheet Library: searchable/sortable grid of real team sheets
// from the current filtered view (respects filterbar + chips). Gold treatment
// for Worlds teams and major-event winners. Copy paste per card + copy all
// visible, sprite click opens the deep-dive drawer, a pill filters by team.
import { ARCHETYPES } from '../lib/archetypes.js';
import { toPaste } from '../lib/paste.js';
import { toast } from '../ui/toast.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

const PAGE = 12;
const MAJOR_TIERS = new Set(['worlds', 'international', 'regional']);

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
}

function recordText(t) {
  return t.w + t.l + t.t > 0 ? `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}` : '—';
}

function isGold(t) {
  return t.tier === 'worlds' || (t.placing === 1 && MAJOR_TIERS.has(t.tier));
}

function archLabel(id) {
  if (id === 'other') return 'Other';
  return ARCHETYPES.find((a) => a.id === id)?.label || id;
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

function matchesSearch(t, q) {
  if (!q) return true;
  if (t.player && t.player.toLowerCase().includes(q)) return true;
  if (t.ev?.name && t.ev.name.toLowerCase().includes(q)) return true;
  if (t.keys.some((k) => k.toLowerCase().includes(q))) return true;
  if (t.mons.some((m) => m.item && m.item.toLowerCase().includes(q))) return true;
  return false;
}

function sortTeams(teams, mode) {
  const arr = teams.slice();
  if (mode === 'placing') arr.sort((a, b) => (a.placing ?? Infinity) - (b.placing ?? Infinity));
  else if (mode === 'record') {
    const wp = (t) => (t.w + t.l > 0 ? t.w / (t.w + t.l) : -1);
    arr.sort((a, b) => wp(b) - wp(a));
  } else arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return arr;
}

export default {
  id: 'library',
  title: 'Team Sheet Library',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = elm('div', 'card');
    const head = elm('div', 'card__head');
    head.appendChild(elm('h3', null, 'Team Sheet Library'));
    const meta = elm('span');
    head.appendChild(meta);
    card.appendChild(head);
    const body = elm('div', 'card__body');
    card.appendChild(body);
    el.appendChild(card);

    const toolbar = elm('div', 'lib-toolbar');
    const searchLabel = elm('label', 'lib-toolbar__label', 'Search ');
    const search = document.createElement('input');
    search.type = 'search';
    search.setAttribute('aria-label', 'Search team sheets by player, event, species or item');
    search.placeholder = 'Player, event, species or item…';
    searchLabel.appendChild(search);
    const sortLabel = elm('label', 'lib-toolbar__label', 'Sort ');
    const sortSel = document.createElement('select');
    for (const [v, l] of [['date', 'Newest'], ['placing', 'Placing'], ['record', 'Record']]) sortSel.appendChild(new Option(l, v));
    sortLabel.appendChild(sortSel);
    const copyAllBtn = elm('button', 'lib-btn lib-btn--wide', 'Copy all visible');
    copyAllBtn.type = 'button';
    toolbar.append(searchLabel, sortLabel, copyAllBtn);
    body.append(clickHint('Click a team’s archetype tag: show only that archetype. Filter: show only that team. Sprite: Pokémon details.'), toolbar);

    const grid = elm('div', 'lib-grid');
    body.appendChild(grid);
    const moreWrap = elm('div', 'lib-loadmore-wrap');
    const countEl = elm('span', 'lib-count');
    const moreBtn = elm('button', 'lib-btn', 'Show more');
    moreBtn.type = 'button';
    moreWrap.append(countEl, moreBtn);
    body.appendChild(moreWrap);

    let lastView = null;
    let shown = PAGE;
    let currentTeams = [];

    function buildCard(t, dex, anim) {
      const gold = isGold(t);
      const c = elm('div', `lib-card${gold ? ' lib-card--gold' : ''}`);
      if (gold) c.appendChild(elm('span', 'lib-badge', t.tier === 'worlds' ? 'WORLDS' : 'CHAMPION'));

      const cHead = elm('div', 'lib-card__head');
      const who = elm('div', 'lib-card__who');
      who.appendChild(elm('span', 'lib-card__player', t.player || 'Unknown'));
      if (t.country) who.appendChild(elm('span', 'lib-card__country', t.country));
      cHead.appendChild(who);
      cHead.appendChild(elm('span', `pill lib-tier lib-tier--${t.tier}`, t.tier));
      c.appendChild(cHead);

      const metaRow = elm('div', 'lib-card__meta');
      metaRow.appendChild(elm('span', 'lib-card__event', t.ev?.name || '—'));
      metaRow.appendChild(elm('span', null, ctx.fmt.date(t.date)));
      metaRow.appendChild(elm('span', null, t.placing != null ? `#${t.placing}` : '—'));
      metaRow.appendChild(elm('span', null, recordText(t)));
      c.appendChild(metaRow);

      const mons = elm('div', 'lib-mons');
      for (const m of t.mons) {
        const cell = elm('button', 'lib-mon');
        cell.type = 'button';
        cell.title = `${m.k}${m.item ? ` @ ${m.item}` : ''}`;
        cell.setAttribute('aria-label', `Open ${m.k} deep dive`);
        cell.appendChild(ctx.sprite(m.k, { size: 'sm', animated: anim }));
        cell.appendChild(elm('span', 'lib-mon__item', m.item || '—'));
        cell.addEventListener('click', () => ctx.openDrawer(m.k));
        mons.appendChild(cell);
      }
      c.appendChild(mons);

      const archPill = elm('button', 'pill lib-arch', archLabel(t.arch[0]));
      archPill.type = 'button';
      archPill.addEventListener('click', (e) => ctx.chip('archetype', t.arch[0], e));
      c.appendChild(archPill);

      const actions = elm('div', 'lib-card__actions');
      const copyBtn = elm('button', 'lib-btn', 'Copy');
      copyBtn.type = 'button';
      copyBtn.title = 'Copy paste';
      copyBtn.setAttribute('aria-label', 'Copy paste');
      copyBtn.addEventListener('click', async () => {
        const ok = await copyText(toPaste(t, dex));
        toast(ok ? 'Copied!' : 'Could not copy', { type: ok ? 'info' : 'error' });
      });
      const filterBtn = elm('button', 'lib-btn', 'Filter');
      filterBtn.type = 'button';
      filterBtn.title = 'Filter to this team';
      filterBtn.setAttribute('aria-label', 'Filter to this team');
      filterBtn.addEventListener('click', (e) => ctx.chip('team', t.id, e));
      actions.append(copyBtn, filterBtn);
      c.appendChild(actions);
      return c;
    }

    function render() {
      const view = lastView;
      if (!view) return;
      if (view.state.source === 'ranked') {
        ctx.meta(meta, { source: rankedSource(null) });
        grid.innerHTML = '';
        emptyState(grid, RANKED_NA);
        moreWrap.style.display = 'none';
        return;
      }
      const q = search.value.trim().toLowerCase();
      currentTeams = sortTeams(view.teams.filter((t) => matchesSearch(t, q)), sortSel.value);
      ctx.meta(meta, { source: 'Tournaments', n: currentTeams.length, unit: 'teams' });
      grid.innerHTML = '';
      if (!currentTeams.length) {
        emptyState(grid, 'No teams match');
        moreWrap.style.display = 'none';
        return;
      }
      for (const t of currentTeams.slice(0, shown)) grid.appendChild(buildCard(t, view.dex, view.state.anim));
      moreWrap.style.display = '';
      const visible = Math.min(shown, currentTeams.length);
      countEl.textContent = `Showing ${visible} of ${currentTeams.length}`;
      moreBtn.style.display = shown < currentTeams.length ? '' : 'none';
    }

    search.addEventListener('input', () => { shown = PAGE; render(); });
    sortSel.addEventListener('change', () => { shown = PAGE; render(); });
    moreBtn.addEventListener('click', () => { shown += PAGE; render(); });
    copyAllBtn.addEventListener('click', async () => {
      const view = lastView;
      if (!view || !currentTeams.length) return;
      const slice = currentTeams.slice(0, shown);
      const text = slice
        .map((t) => `# ${t.player || 'Unknown'} — ${t.ev?.name || ''} (${ctx.fmt.date(t.date)})\n\n${toPaste(t, view.dex)}`)
        .join('\n\n');
      const ok = await copyText(text);
      toast(ok ? `Copied ${slice.length} teams!` : 'Could not copy', { type: ok ? 'info' : 'error' });
    });

    return {
      update(view) {
        lastView = view;
        shown = PAGE;
        render();
      },
    };
  },
};
