// pokedex.js — every Pokémon of the regulation as a card grid. Click opens details (never a chip).
// Usage comes from the current source: tournaments/ladder = %, ranked = rank (the game publishes no %).
import { usage, ladderMerge, rankedSeason } from '../lib/aggregate.js';
import { allSpecies } from '../lib/species-info.js';
import { dexList } from '../lib/pokedex.js';
import { TYPES } from '../lib/types.js';
import { rankedSource, clickHint, typePill } from '../ui/meta.js';

const SHOWN = 60;
const SORTS = [['usage', 'Usage'], ['name', 'Name'], ['dex', 'Dex #'], ['speed', 'Base Speed']];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export default {
  id: 'pokedex',
  title: 'Pokédex',
  mount(root, ctx) {
    root.innerHTML = '';
    const card = el('div', 'card');
    const head = el('div', 'card__head');
    const search = el('input', 'items-search dex-search');
    search.type = 'search';
    search.placeholder = 'Find a Pokémon…  ( P )';
    search.setAttribute('aria-label', 'Find a Pokémon in the Pokédex');
    const sort = el('select', 'items-search');
    sort.setAttribute('aria-label', 'Sort Pokédex');
    for (const [v, l] of SORTS) sort.add(new Option(l, v));
    const meta = el('span');
    head.append(el('h3', null, 'Pokédex'), search, sort, meta);
    const body = el('div', 'card__body');
    const typeBar = el('div', 'dex-types');
    typeBar.setAttribute('role', 'group');
    typeBar.setAttribute('aria-label', 'Filter by type');
    const types = new Set();
    for (const t of TYPES) {
      const b = el('button', null, t);
      const pill = typePill(t);
      b.className = 'pill dex-type';
      b.type = 'button';
      b.style.background = pill.style.background;
      b.style.color = pill.style.color;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        if (types.delete(t)) b.setAttribute('aria-pressed', 'false'); else { types.add(t); b.setAttribute('aria-pressed', 'true'); }
        all = false;
        render();
      });
      typeBar.appendChild(b);
    }
    const grid = el('div', 'dex-grid');
    const more = el('button', 'dex-more', '');
    more.type = 'button';
    const hint = clickHint('Click a Pokémon to open its details (this doesn’t filter)');
    body.append(hint, typeBar, grid, more);
    card.append(head, body);
    root.appendChild(card);

    let view = null, reg = null, keys = [], use = new Map(), label = () => '—', all = false, timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { all = false; render(); }, 120); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; render(); } });
    sort.addEventListener('change', render);
    more.addEventListener('click', () => { all = true; render(); });
    // "P" or Ctrl/Cmd+K from anywhere (P not while typing; neither with the drawer open) jumps to this search.
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const isK = k === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
      const isP = k === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!isK && !isP) return;
      if (document.querySelector('#deepdive[aria-hidden="false"]')) return;
      if (isP && e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      search.scrollIntoView({ block: 'center' });
      search.focus();
    });

    function render() {
      if (!view) return;
      const q = search.value.trim();
      const list = dexList(keys, view.dex, use, { q, types: [...types], sort: sort.value });
      grid.textContent = '';
      more.hidden = true;
      body.querySelector('.empty-state')?.remove();
      if (!list.length) {
        const box = el('div', 'empty-state');
        const what = [q && `“${q}”`, types.size && `${[...types].join(' + ')} type`].filter(Boolean).join(' · ');
        box.appendChild(el('div', 'empty-state__title', keys.length ? `No Pokémon match ${what}` : 'No Pokémon known for this regulation yet'));
        body.appendChild(box);
        return;
      }
      for (const key of all ? list : list.slice(0, SHOWN)) {
        const sp = view.dex.species[key];
        const c = el('button', 'dex-card');
        c.type = 'button';
        c.dataset.key = key;
        c.setAttribute('aria-label', `Open details for ${key}`);
        c.addEventListener('click', () => ctx.openDrawer(key));
        const pills = el('span', 'dex-card__types');
        for (const t of sp.types || []) pills.appendChild(typePill(t));
        c.append(ctx.sprite(key, { size: 'sm', animated: view.state.anim }), el('span', 'dex-card__name', key), pills,
          el('span', 'dex-card__use', label(key)), el('span', 'dex-card__num muted', sp.num ? `#${sp.num}` : ''));
        grid.appendChild(c);
      }
      if (list.length > SHOWN && !all) { more.textContent = `Show all (${list.length})`; more.hidden = false; }
    }

    return {
      update(v) {
        view = v;
        const st = v.state;
        keys = allSpecies(v.base, v.ranked, v.ladder, v.dex);
        let source, n, unit;
        use = new Map();
        if (st.source === 'ranked') {
          const season = rankedSeason(v.ranked, st.from, st.to);
          const ranking = season?.ranking || [];
          ranking.forEach((k, i) => use.set(k, ranking.length - i));
          label = (k) => (use.has(k) ? `Rank #${ranking.length - use.get(k) + 1}` : '—');
          source = rankedSource(season); n = season ? Object.keys(season.mons).length : 0; unit = 'Pokémon';
        } else {
          let rows;
          if (st.source === 'ladder') {
            const m = ladderMerge(v.ladder, st.from, st.to, v.dex);
            rows = (m?.mons || []).map((r) => [r.key, r.usage]);
            source = 'Ladder (Smogon)'; n = m?.battles ?? 0; unit = 'battles';
          } else {
            rows = usage(v.monTeams).map((r) => [r.key, r.pct]);
            source = 'Tournaments'; n = v.monTeams.length; unit = 'teams';
          }
          use = new Map(rows);
          label = (k) => (use.has(k) ? ctx.fmt.pct(use.get(k)) : '—');
        }
        ctx.meta(meta, { source, n, unit });
        if (v.reg !== reg) { reg = v.reg; all = false; } // keep "Show all" across chip changes
        render();
        hint.hidden = !grid.children.length;
      },
    };
  },
};
