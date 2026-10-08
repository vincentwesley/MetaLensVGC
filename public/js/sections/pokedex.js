// pokedex.js — Showdown-teambuilder-style list of every Pokémon in the regulation's roster.
// Click opens details (never a chip). Usage tier comes from the current source (tournaments/ladder = %, ranked = rank).
import { usage, ladderMerge, rankedSeason } from '../lib/aggregate.js';
import { dexRows, suggest, splitForme, usageMap, STATS } from '../lib/pokedex.js';
import { rankedSource, clickHint, typePill } from '../ui/meta.js';

const SHOWN = 100;
const LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', bst: 'BST' };
const COLS = [...STATS, 'bst'];
const GROUPS = [['pokemon', 'Pokémon'], ['types', 'Types'], ['abilities', 'Abilities'], ['moves', 'Moves']];
const TAG_LABEL = { types: 'Type', abilities: 'Ability', moves: 'Move' };
const TIER_TIP = 'Usage tier in this view. Tournaments / Ladder: Top 12 = the twelve most used; Common ≥ 4.5%; Uncommon ≥ 1%; Rare > 0%; Unused = no recorded use. In-game ranked (ranks only, no %): Top 12 = ranks 1-12; Common = 13-30; Uncommon = 31-60; Rare = 61+; Unused = not in the ranked list.';

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
    const meta = el('span');
    head.append(el('h3', null, 'Pokédex'), meta);
    const body = el('div', 'card__body');
    const hint = clickHint('Click a Pokémon to open its details (this doesn’t filter). Click a stat header to sort by it.');

    // combobox
    const box = el('div', 'dex-box');
    const search = el('input', 'items-search dex-search');
    search.type = 'text';
    search.placeholder = 'Search Pokémon, type, ability or move…  ( P )';
    search.autocomplete = 'off';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-label', 'Search the Pokédex');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-controls', 'dex-sug');
    const pop = el('div', 'dex-sug');
    pop.id = 'dex-sug';
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-label', 'Suggestions');
    pop.hidden = true;
    const tagBar = el('div', 'dex-tags');
    box.append(search, pop);

    // sort bar
    const sortBar = el('div', 'dex-sortbar');
    const seg = el('div', 'dex-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Sort Pokédex');
    const segBtns = {};
    for (const [v, l] of [['tier', 'Tier'], ['name', 'A–Z']]) {
      const b = el('button', 'dex-seg__btn', l);
      b.type = 'button';
      b.addEventListener('click', () => { sort = v; render(); });
      segBtns[v] = b;
      seg.appendChild(b);
    }
    const tierNote = el('span', 'dex-tiernote muted', 'Usage tier');
    tierNote.dataset.tip = TIER_TIP;
    tierNote.tabIndex = 0;
    sortBar.append(seg, tierNote);

    const headRow = el('div', 'dex-head');
    const headStats = el('div', 'dex-stats');
    const statBtns = {};
    for (const k of COLS) {
      const l = LABEL[k];
      const b = el('button', 'dex-sort', l);
      b.type = 'button';
      b.setAttribute('aria-sort', 'none');
      b.dataset.tip = `Sort by ${l}, highest first (click again for tier order)`;
      b.addEventListener('click', () => { sort = sort === k ? 'name' : k; render(); });
      statBtns[k] = b;
      headStats.appendChild(b);
    }
    headRow.appendChild(headStats);

    const status = el('p', 'dex-status muted');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const list = el('div', 'dex-list');
    const more = el('button', 'dex-more', '');
    more.type = 'button';
    more.hidden = true;
    body.append(hint, box, tagBar, sortBar, headRow, status, list, more);
    card.append(head, body);
    root.appendChild(card);

    let view = null, roster = null, family = 'vgc', official = false, use = new Map(), rev = 0, lastSig = '';
    let sort = 'name', shown = SHOWN, learn; // learn: undefined | 'loading' | 'failed' | {moves, learn}
    let tags = [], opts = [], active = -1, usageKey = [], timer = null;
    const cache = new Map(); // name -> row element (cleared when the roster arrives)
    let rosterFor = null, lastShown = 0;

    const useText = (u) => (!u ? '—' : u.pct != null ? ctx.fmt.pct(u.pct) : `Rank #${u.rank}`);

    function buildRow(r) {
      const b = el('button', 'dex-row');
      b.type = 'button';
      b.dataset.key = r.name;
      b.setAttribute('aria-label', `Open details for ${r.name}`);
      b.addEventListener('click', () => ctx.openDrawer(r.name));
      const { base, suffix } = splitForme(r.name, roster);
      const name = el('span', 'dex-row__name');
      const nm = el('span', null, base);
      if (suffix) nm.append(el('span', 'muted', `-${suffix}`));
      name.append(nm);
      b._use = el('small', 'dex-row__use muted');
      name.append(b._use);
      const types = el('span', 'dex-row__types');
      for (const t of r.types) types.appendChild(typePill(t));
      const abil = el('span', 'dex-row__abil');
      for (const s of [0, 1, 'H']) {
        const a = r.abilities[s];
        if (!a) continue;
        const sp = el('span', s === 'H' ? 'dex-hidden' : null, a);
        if (s === 'H') sp.title = 'Hidden Ability';
        abil.appendChild(sp);
      }
      const stats = el('span', 'dex-stats');
      [...r.bs, r.bst].forEach((v, i) => {
        const c = el('span', i === 6 ? 'dex-stat muted' : 'dex-stat');
        c.append(el('small', 'muted', LABEL[COLS[i]]), el('b', null, String(v)));
        stats.appendChild(c);
      });
      b._tier = el('span', 'dex-row__tier muted');
      b.append(b._tier, ctx.sprite(r.name, { size: 'sm', animated: view.state.anim }), name, types, abil, stats);
      return b;
    }

    function rowEl(r) {
      let b = cache.get(r.name);
      if (!b) { b = buildRow(r); cache.set(r.name, b); }
      b._tier.textContent = r.tier;
      b._use.textContent = useText(r.use);
      return b;
    }

    function closePop() {
      pop.hidden = true;
      active = -1;
      search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant');
    }
    function setActive(i) {
      active = i;
      opts.forEach((o, j) => o.setAttribute('aria-selected', String(j === i)));
      if (i >= 0) { search.setAttribute('aria-activedescendant', opts[i].id); opts[i].scrollIntoView({ block: 'nearest' }); }
      else search.removeAttribute('aria-activedescendant');
    }
    function choose(o) {
      const { kind, value, label } = o._item;
      search.value = '';
      closePop();
      if (kind === 'pokemon') { ctx.openDrawer(value); return; }
      if (!tags.some((t) => t.kind === kind && t.value === value)) tags.push({ kind, value, label });
      shown = SHOWN;
      render();
    }
    function ensureRoster() {
      const f = family;
      if (rosterFor === f) return;
      rosterFor = f;
      roster = null;
      ctx.loadPokedex(f).then((r) => {
        if (f !== family) return;
        roster = r; cache.clear(); rev++; shown = SHOWN;
        render();
        hint.hidden = !list.children.length;
      });
    }
    function ensureLearn() {
      if (learn) return;
      learn = 'loading';
      const fam = family;
      const go = () => ctx.loadLearnsets(fam).then((l) => { if (fam !== family) return; learn = l || 'failed'; if (!pop.hidden) showSuggestions(); render(); });
      // defer the fetch + parse so it doesn't land mid-typing
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 200);
    }
    function showSuggestions() {
      const q = search.value.trim();
      pop.textContent = '';
      opts = [];
      if (!q || !roster) { closePop(); return; }
      ensureLearn();
      const sg = suggest(q, roster, typeof learn === 'object' ? learn : null);
      for (const [g, title] of GROUPS) {
        if (!sg[g].length) continue;
        const grp = el('div', 'dex-sug__group');
        grp.setAttribute('role', 'group');
        grp.setAttribute('aria-label', title);
        grp.appendChild(el('div', 'dex-sug__head muted', title));
        for (const it of sg[g]) {
          const label = typeof it === 'string' ? it : it.name;
          const o = el('div', 'dex-sug__opt', label);
          o.id = `dex-opt-${opts.length}`;
          o.setAttribute('role', 'option');
          o.setAttribute('aria-selected', 'false');
          o._item = { kind: g, value: typeof it === 'string' ? it : it.id, label };
          o.addEventListener('mousedown', (e) => { e.preventDefault(); choose(o); });
          opts.push(o);
          grp.appendChild(o);
        }
        pop.appendChild(grp);
      }
      if (!opts.length) pop.appendChild(el('div', 'dex-sug__none muted', learn === 'loading' ? 'Loading moves…' : 'No suggestions'));
      pop.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      setActive(-1);
    }

    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(showSuggestions, 60); });
    search.addEventListener('focus', ensureLearn);
    search.addEventListener('blur', () => setTimeout(closePop, 0));
    search.addEventListener('keydown', (e) => {
      const open = !pop.hidden && opts.length > 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (pop.hidden) showSuggestions();
        if (!opts.length) return;
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setActive(active < 0 ? (d > 0 ? 0 : opts.length - 1) : (active + d + opts.length) % opts.length);
      } else if ((e.key === 'Home' || e.key === 'End') && open) {
        e.preventDefault();
        setActive(e.key === 'Home' ? 0 : opts.length - 1);
      } else if (e.key === 'Enter' && open) {
        e.preventDefault();
        choose(opts[active < 0 ? 0 : active]);
      } else if (e.key === 'Escape') {
        if (!pop.hidden) { e.stopPropagation(); closePop(); } else if (search.value) { e.stopPropagation(); search.value = ''; }
      }
    });
    more.addEventListener('click', () => { shown += SHOWN; render(); });
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

    function renderTags() {
      tagBar.textContent = '';
      for (const t of tags) {
        const b = el('button', 'dex-tag');
        b.type = 'button';
        b.append(el('span', 'muted', `${TAG_LABEL[t.kind]}: `), el('span', null, t.label), el('span', null, ' ×'));
        b.setAttribute('aria-label', `Remove filter ${t.label}`);
        b.addEventListener('click', () => { tags = tags.filter((x) => x !== t); shown = SHOWN; render(); search.focus(); });
        tagBar.appendChild(b);
      }
    }

    function render() {
      if (!view) return;
      if (!roster) { status.textContent = 'Loading Pokédex…'; status.hidden = false; return; }
      const sig = [rev, sort, typeof learn === 'object' ? 'L' : learn, tags.map((t) => t.kind + t.value).join('|')].join('~');
      if (sig === lastSig && shown === lastShown) return;
      const append = sig === lastSig && shown > lastShown; // "Show more": only add the new rows
      lastSig = sig;
      const prevShown = lastShown;
      lastShown = shown;
      const filters = { types: [], abilities: [], moves: [] };
      for (const t of tags) filters[t.kind].push(t.value);
      const usageMode = !official; // official tiers exist for National Dex singles only; VGC and NatDex Doubles tier by usage
      const res = dexRows(roster, { usage: use, tierMode: usageMode ? 'usage' : 'official', filters, learnsets: typeof learn === 'object' ? learn : null, sort });
      renderTags();
      segBtns.tier.setAttribute('aria-pressed', String(sort === 'tier'));
      segBtns.name.setAttribute('aria-pressed', String(sort === 'name'));
      for (const [k, b] of Object.entries(statBtns)) {
        b.setAttribute('aria-sort', sort === k ? 'descending' : 'none');
        b.classList.toggle('is-active', sort === k);
      }
      tierNote.hidden = !usageMode || sort !== 'tier';
      if (!append) list.textContent = '';
      more.hidden = true;
      body.querySelector('.empty-state')?.remove();
      status.hidden = !res.needsLearnsets;
      if (res.needsLearnsets) {
        status.textContent = learn === 'failed'
          ? `Move filter unavailable: learnsets-${family}.json could not be loaded, so moves are not applied.`
          : 'Loading moves…';
      }
      const rows = res.rows;
      if (!rows.length) {
        const empty = el('div', 'empty-state');
        const what = tags.map((t) => t.label).join(' + ');
        empty.appendChild(el('div', 'empty-state__title', Object.keys(roster.species).length ? `No Pokémon match ${what}` : 'No Pokémon known for this regulation yet'));
        if (tags.length) empty.appendChild(el('div', null, 'Remove a filter tag above to widen the list.'));
        body.appendChild(empty);
        return;
      }
      const starts = new Map(res.groups.map((g) => [g.from, g]));
      const frag = document.createDocumentFragment();
      const from = append ? prevShown : 0;
      rows.slice(from, shown).forEach((r, j) => {
        const i = from + j;
        const g = sort === 'tier' && starts.get(i);
        if (g) {
          const h = el('div', 'dex-tierbar', `${g.tier} `);
          h.setAttribute('role', 'heading');
          h.setAttribute('aria-level', '4');
          h.appendChild(el('small', 'muted', `(${g.to - g.from + 1})`));
          frag.appendChild(h);
        }
        frag.appendChild(rowEl(r));
      });
      list.appendChild(frag);
      if (rows.length > shown) { more.textContent = `Show more (${rows.length - shown})`; more.hidden = false; }
    }

    return {
      update(v) {
        view = v;
        const st = v.state;
        if (official !== !!v.officialTiers) { official = !!v.officialTiers; rev++; }
        const newFamily = v.family || 'vgc';
        if (newFamily !== family) {
          family = newFamily; learn = undefined; tags = tags.filter((t) => t.kind !== 'moves');
          rev++; shown = SHOWN;
        }
        ensureRoster();
        // Recompute usage only when its inputs changed (render() skips when nothing did).
        const key = [v.monTeams, v.ladder, v.ranked, st.source, st.from, st.to];
        if (key.some((x, i) => x !== usageKey[i])) {
          usageKey = key;
          let source, n, unit;
          if (st.source === 'ranked') {
            const season = rankedSeason(v.ranked, st.from, st.to);
            use = usageMap([], season?.ranking || []);
            source = rankedSource(season); n = season ? Object.keys(season.mons).length : 0; unit = 'Pokémon';
          } else if (st.source === 'ladder') {
            const m = ladderMerge(v.ladder, st.from, st.to, v.dex);
            use = usageMap((m?.mons || []).map((r) => ({ key: r.key, pct: r.usage })));
            source = 'Ladder (Smogon)'; n = m?.battles ?? 0; unit = 'battles';
          } else {
            use = usageMap(usage(v.monTeams));
            source = 'Tournaments'; n = v.monTeams.length; unit = 'teams';
          }
          ctx.meta(meta, { source, n, unit });
          rev++;
        }
        render();
        hint.hidden = !list.children.length;
      },
    };
  },
};
