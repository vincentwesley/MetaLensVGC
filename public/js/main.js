// Boot, ctx, view computation, section mounting. See CLAUDE.md "Sections" contract.

import { store } from './state.js';
import * as data from './data.js';
import { sprite, spriteUrl } from './ui/sprites.js';
import { mountFilterbar } from './ui/filterbar.js';
import { mountChips } from './ui/chips.js';
import { mountDrawer } from './ui/drawer.js';
import { renderMetaLine } from './ui/meta.js';
import { fmt } from './ui/fmt.js';
import { chartTheme, onTheme, notifyThemeSubs, withChartDefaults } from './ui/echarts-theme.js';
import { toast } from './ui/toast.js';
import { installTips } from './ui/tip.js';
import { installKeyActivation } from './ui/keys.js';
import { installPixelField } from './ui/pixelfield.js';
import { isStale } from './lib/stale.js';
import { mountSecnav, mountHowto } from './ui/secnav.js';
import { crossfade } from './ui/motion.js';

const SECTION_IDS = [
  'snapshot', 'usage', 'types', 'items', 'archetypes', 'quadrant',
  'teammates', 'speed', 'trends', 'library', 'scanner', 'methodology',
];

// Every chart is created through this: a full redraw (setOption with notMerge)
// while the pointer is over a chart disposes the tooltip component while a show
// is still pending, and ECharts then writes into a removed element (throws).
// Hiding the tooltip first avoids it for all sections.
function safeEcharts(echarts) {
  if (!echarts) return echarts;
  return {
    ...echarts,
    init(...args) {
      const inst = echarts.init(...args);
      const setOption = inst.setOption.bind(inst);
      inst.setOption = (opt, ...rest) => {
        try { inst.dispatchAction({ type: 'hideTip' }); } catch { /* no tooltip yet */ }
        return setOption(withChartDefaults(opt), ...rest);
      };
      return inst;
    },
  };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildHeaderControls() {
  const host = document.getElementById('header-controls');

  function segToggle(label, options, get, set) {
    const wrap = document.createElement('div');
    wrap.className = 'segmented';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', label);
    const btns = new Map();
    for (const [value, text] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => set(value));
      wrap.appendChild(b);
      btns.set(value, b);
    }
    const sync = (s) => { for (const [v, b] of btns) b.setAttribute('aria-pressed', String(get(s) === v)); };
    sync(store.get());
    store.subscribe(sync);
    return wrap;
  }

  host.appendChild(segToggle('Skin', [['retro', 'Retro'], ['pro', 'Pro']], (s) => s.skin, (v) => crossfade(() => store.set({ skin: v }))));
  host.appendChild(segToggle('Theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], (s) => s.theme, (v) => crossfade(() => store.set({ theme: v }))));

  const animLabel = document.createElement('label');
  animLabel.className = 'toggle';
  const animInput = document.createElement('input');
  animInput.type = 'checkbox';
  animInput.checked = store.get().anim;
  animInput.addEventListener('change', () => store.set({ anim: animInput.checked }));
  const animTrack = document.createElement('span');
  animTrack.className = 'toggle__track';
  animLabel.append(animInput, animTrack, document.createTextNode('Animated'));
  store.subscribe((s) => { animInput.checked = s.anim; });
  host.appendChild(animLabel);
}

function placeholderBox(el, title) {
  const box = document.createElement('div');
  box.className = 'section-placeholder';
  box.textContent = `${title || 'This section'} — coming soon`;
  el.appendChild(box);
}

async function loadSectionModule(id) {
  try {
    const mod = await import(`./sections/${id}.js`);
    return mod?.default || null;
  } catch (err) {
    console.warn(`[main] section "${id}" not available yet:`, err?.message || err);
    return null;
  }
}

async function loadLib() {
  // js/lib/* is owned by a parallel agent; tolerate it not existing yet so the
  // shell is testable in isolation (acceptance criteria allows this).
  const [stateCore, aggregate, types] = await Promise.all([
    import('./lib/state-core.js'),
    import('./lib/aggregate.js'),
    import('./lib/types.js').catch(() => ({ TYPE_COLORS: {} })),
  ]);
  return { stateCore, aggregate, types };
}

async function boot() {
  installTips();
  installKeyActivation();
  installPixelField();
  // Keyboard focus and anchor jumps scroll things below the sticky header +
  // filter bar instead of behind them (html scroll-padding-top uses this).
  // The header wraps to two rows on narrow screens, so its real height is
  // measured too (the filter bar sticks right under it).
  const stickybar = document.querySelector('.stickybar');
  const header = document.querySelector('.site-header');
  if (stickybar && header) {
    const rootStyle = document.documentElement.style;
    const ro = new ResizeObserver(() => {
      rootStyle.setProperty('--header-real', `${header.offsetHeight}px`);
      const h = getComputedStyle(stickybar).position === 'sticky' ? stickybar.offsetHeight : 0;
      rootStyle.setProperty('--stickybar-h', `${h}px`);
    });
    ro.observe(stickybar);
    ro.observe(header);
  }
  buildHeaderControls();
  mountHowto(document.getElementById('howto'));
  mountSecnav(document.getElementById('secnav'));

  let manifest, dex;
  try {
    [manifest, dex] = await Promise.all([data.loadManifest(), data.loadDex()]);
  } catch (err) {
    toast(`Could not load core data: ${err.message}`, { type: 'error', duration: 0 });
    document.querySelectorAll('.section__mount').forEach((el) => placeholderBox(el, 'Data unavailable'));
    return;
  }
  store.setRegs((manifest.regs || []).map((r) => r.id));
  if (isStale(manifest.generated)) {
    const note = document.getElementById('stale-notice');
    note.textContent = `Data last refreshed ${manifest.generated.slice(0, 10)} — the weekly update may have failed; figures may be out of date.`;
    note.hidden = false;
  }

  let lib;
  try {
    lib = await loadLib();
  } catch (err) {
    console.warn('[main] js/lib not ready yet:', err?.message || err);
    toast('Data engine (js/lib) is not built yet — showing shell only.', { type: 'error', duration: 0 });
    document.querySelectorAll('.section__mount').forEach((el) => placeholderBox(el, el.closest('.section')?.dataset.title));
    mountShellOnly(manifest, dex);
    return;
  }

  const { decode, filterTeams, previousPeriod, projectTeams, speciesChipFilter } = lib.aggregate;

  const ladderCache = new Map();
  const rankedCache = new Map();

  function prevRegId(reg) {
    const ids = (manifest.regs || []).map((r) => r.id);
    const i = ids.indexOf(reg);
    return i > 0 ? ids[i - 1] : null;
  }

  const ctx = {
    store,
    dex,
    echarts: safeEcharts(window.echarts),
    sprite: (key, opts) => sprite(key, dex, opts),
    spriteUrl: (key, opts) => spriteUrl(key, dex, opts),
    openDrawer: (key) => drawerApi.open(key),
    loadRanked: (reg) => getRanked(reg), // lazy: the deep dive's regulation shift loads the previous reg's ranked file
    prevReg: prevRegId,
    chip: (kind, value, event) => store.addChip({ kind, value, neg: !!(event && (event.shiftKey || event.altKey)) }),
    hover: (key) => { for (const s of mounted) s.api?.highlight?.(key); },
    meta: (el, opts) => renderMetaLine(el, { ...opts, updated: manifest.generated?.slice(0, 10) }),
    cssVar,
    fmt,
    chartTheme,
    onTheme,
  };

  const drawerApi = mountDrawer(document.getElementById('deepdive'));
  mountChips(document.getElementById('chips'), ctx);
  const filterbarApi = mountFilterbar(document.getElementById('filterbar'), ctx, manifest);

  // Mount grid sections (tolerant of missing modules) + the deepdive drawer module.
  const mounted = [];
  for (const id of SECTION_IDS) {
    const sectionEl = document.querySelector(`[data-section="${id}"]`);
    const mountEl = sectionEl?.querySelector('.section__mount');
    if (!mountEl) continue;
    const def = await loadSectionModule(id);
    if (def) {
      try {
        mounted.push({ id, api: def.mount(mountEl, ctx) });
      } catch (err) {
        console.warn(`[main] section "${id}" failed to mount:`, err);
        placeholderBox(mountEl, sectionEl.dataset.title);
      }
    } else {
      placeholderBox(mountEl, sectionEl.dataset.title);
    }
  }
  {
    const deepdiveEl = document.querySelector('#deepdive [data-section="deepdive"]');
    const def = await loadSectionModule('deepdive');
    if (def) {
      try { mounted.push({ id: 'deepdive', api: def.mount(deepdiveEl, ctx) }); }
      catch (err) { console.warn('[main] deepdive failed to mount:', err); placeholderBox(deepdiveEl, 'Deep Dive'); }
    } else {
      placeholderBox(deepdiveEl, 'Deep Dive');
    }
  }

  async function ensureReg(reg) {
    return data.getDecoded(reg, dex, decode);
  }

  async function getLadder(reg) {
    if (ladderCache.has(reg)) return ladderCache.get(reg);
    const l = await data.loadLadderFile(reg);
    ladderCache.set(reg, l);
    return l;
  }

  async function getRanked(reg) {
    if (!rankedCache.has(reg)) rankedCache.set(reg, await data.loadRankedFile(reg));
    return rankedCache.get(reg);
  }

  // --- rendering -----------------------------------------------------------
  // Sections are only updated while they are on (or near) screen. Off-screen
  // sections are marked dirty and catch up when they scroll into view, so a
  // filter click only pays for what you can see. Updates yield to the browser
  // between sections so clicks and scrolling stay responsive, and a render
  // that has been superseded by a newer state stops early.
  const ALWAYS = new Set(['deepdive']);
  const nearView = new Set();
  const dirty = new Set();
  let lastView = null;
  let renderSeq = 0;

  const yieldToMain = () => (globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise((r) => setTimeout(r, 0)));

  // <html data-rendering> is present while any section is out of date (tests
  // wait on it; it is also a handy hook for a loading indicator).
  // Each dirty section also carries aria-busy (css shows a thin accent bar on it).
  const sectionEls = new Map(mounted.map((s) => [s.id, document.querySelector(`main [data-section="${s.id}"]`)]));
  const syncPending = () => {
    document.documentElement.toggleAttribute('data-rendering', dirty.size > 0);
    for (const [id, el] of sectionEls) el?.setAttribute('aria-busy', String(dirty.has(id)));
  };

  function updateSection(s, view) {
    dirty.delete(s.id);
    try { s.api?.update?.(view); } catch (err) { console.warn(`[main] section "${s.id}" update failed:`, err); }
    syncPending();
  }

  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
    : (fn) => setTimeout(fn, 50);

  // Off-screen sections catch up one at a time in idle time, so they are
  // current by the time you scroll to them, without blocking input.
  let idleQueued = false;
  function queueIdleCatchUp() {
    if (idleQueued) return;
    idleQueued = true;
    idle(() => {
      idleQueued = false;
      if (rendering || !lastView) return;
      const s = mounted.find((m) => dirty.has(m.id));
      if (!s) return;
      updateSection(s, lastView);
      queueIdleCatchUp();
    });
  }

  const io = new IntersectionObserver((entries) => {
    let any = false;
    for (const e of entries) {
      const id = e.target.dataset.section;
      if (e.isIntersecting) { nearView.add(id); any = true; } else nearView.delete(id);
    }
    if (any && lastView && !rendering) flushVisible(lastView, renderSeq);
  }, { rootMargin: '400px 0px' });

  async function flushVisible(view, seq) {
    for (const s of mounted) {
      if (!dirty.has(s.id) || !(nearView.has(s.id) || ALWAYS.has(s.id))) continue;
      if (seq !== renderSeq || lastView !== view) return;
      updateSection(s, view);
      await yieldToMain();
    }
  }
  for (const s of mounted) {
    const el = document.querySelector(`main [data-section="${s.id}"]`);
    if (el) io.observe(el);
  }

  let raf = null;
  let rendering = false;
  function scheduleRender() {
    if (raf) return;
    // rAF + task: let the browser paint the immediate feedback (the new chip,
    // the pressed button) before the recompute starts.
    raf = requestAnimationFrame(() => setTimeout(() => { raf = null; render(); }, 0));
  }

  // The previous regulation's file (up to ~9 MB) is only needed for the
  // "change vs previous period" deltas, so it is fetched after first paint
  // instead of blocking it. Sections that use view.prev refresh when it lands.
  const PREV_USERS = ['snapshot', 'trends'];
  const prevLoading = new Set();
  function prevRegTeamsFor(state) {
    const pReg = prevRegId(state.reg);
    if (!pReg) return [];
    const cached = data.getDecodedSync(pReg);
    if (cached) return filterTeams(cached.teams, state, [], dex);
    if (!prevLoading.has(pReg)) {
      prevLoading.add(pReg);
      const load = () => ensureReg(pReg).then(() => {
        const st = store.get();
        if (st.reg !== state.reg || !lastView) return;
        const view = { ...lastView, prev: computePrev(st, lastView.regTeams) };
        lastView = view;
        for (const s of mounted) {
          if (!PREV_USERS.includes(s.id)) continue;
          if (nearView.has(s.id)) updateSection(s, view); else dirty.add(s.id);
        }
        syncPending();
        queueIdleCatchUp();
      }).catch((err) => console.warn('[main] previous regulation load failed:', err));
      (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(load, { timeout: 3000 });
    }
    return null; // not loaded yet
  }

  function computePrev(state, regTeams) {
    try {
      const prevRegTeams = prevRegTeamsFor(state);
      const window = previousPeriod(regTeams, state, prevRegTeams || []);
      // Without the previous regulation loaded yet, show no deltas rather than
      // comparing against an empty period.
      if (prevRegTeams === null && window.length === 0) return null;
      // Compare like with like: the same chips (and Pokémon-level projection)
      // as the current view. previousPeriod already applied the bar filters.
      return projectTeams(filterTeams(window, {}, state.chips, dex), state.chips, dex);
    } catch (err) { console.warn('[main] previousPeriod failed:', err); return []; }
  }

  // Ladder / ranked files hold per-species rows, so the chips that can be checked
  // per species (Pokémon, type, weak-to) filter those rows here, once, for every
  // section. (Usage shares stay shares of all battles.)
  function chipLadder(ladder, test) {
    if (!test || !ladder?.months) return ladder;
    return {
      ...ladder,
      months: ladder.months.map((m) => ({ ...m, mons: Object.fromEntries(Object.entries(m.mons).filter(([k]) => test(k))) })),
    };
  }
  const megaFormsOf = (name) => Object.keys(dex.species).filter((k) => dex.species[k].megaOf === name);
  function chipRanked(ranked, test) {
    if (!test || !ranked?.seasons) return ranked;
    // The game tracks Megas under the base species (+ stone), so a base name also
    // passes when one of its Mega forms does.
    const ok = (name) => test(name) || megaFormsOf(name).some(test);
    return {
      ...ranked,
      seasons: ranked.seasons.map((se) => ({
        ...se,
        mons: Object.fromEntries(Object.entries(se.mons).filter(([k]) => ok(k))),
        ranking: se.ranking ? se.ranking.filter(ok) : se.ranking,
      })),
    };
  }

  async function render() {
    if (rendering) { scheduleRender(); return; }
    rendering = true;
    const seq = ++renderSeq;
    const state = store.get();
    try {
      const regData = await ensureReg(state.reg);
      const ladder = await getLadder(state.reg);
      const ranked = await getRanked(state.reg);
      const teams = filterTeams(regData.teams, state, state.chips, dex);
      const base = filterTeams(regData.teams, state, [], dex);
      const prev = computePrev(state, regData.teams);

      // teams: whole teams in view (team-level sections). monTeams: the same teams
      // reduced to the Pokémon that pass type/item/move chips (Pokémon-level sections).
      const monTeams = projectTeams(teams, state.chips, dex);
      // Deep dive: any Pokémon can be opened, under the type/item/move chips only.
      const ddTeams = projectTeams(teams, state.chips, dex, { keys: false });
      // Ladder / in-game ranked rows are per species: which chips can apply there.
      const speciesFilter = speciesChipFilter(state.chips, dex);
      const view = {
        state, reg: state.reg, manifest, dex, teams, monTeams, ddTeams, speciesFilter, base, prev, matches: regData.matches,
        ladder: chipLadder(ladder, speciesFilter.test), ranked: chipRanked(ranked, speciesFilter.test), regTeams: regData.teams,
      };
      lastView = view;
      filterbarApi.update(view);
      for (const s of mounted) dirty.add(s.id);
      syncPending();
      // Visible sections first (in page order), yielding between each; the
      // rest catch up in idle time or as they scroll into view.
      await flushVisible(view, seq);
      queueIdleCatchUp();
    } catch (err) {
      console.warn('[main] render failed:', err);
      toast(`Could not load ${state.reg} data: ${err.message}`, { type: 'error' });
    } finally {
      rendering = false;
      if (store.get() !== state) scheduleRender();
    }
  }

  store.subscribe(scheduleRender);

  let lastSkin = store.get().skin, lastTheme = store.get().theme;
  store.subscribe((s) => {
    if (s.skin !== lastSkin || s.theme !== lastTheme) {
      lastSkin = s.skin; lastTheme = s.theme;
      notifyThemeSubs();
    }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.get().theme === 'auto') notifyThemeSubs();
  });

  render();
}

function mountShellOnly(manifest, dex) {
  // js/lib missing: still wire the header/filter chrome so the shell is testable.
  const ctx = {
    store, dex, echarts: window.echarts,
    sprite: (key, opts) => sprite(key, dex, opts),
    spriteUrl: (key, opts) => spriteUrl(key, dex, opts),
    openDrawer: () => {},
    chip: () => {},
    hover: () => {},
    meta: (el, opts) => renderMetaLine(el, opts),
    cssVar, fmt, chartTheme, onTheme,
  };
  mountDrawer(document.getElementById('deepdive'));
  mountChips(document.getElementById('chips'), ctx);
  mountFilterbar(document.getElementById('filterbar'), ctx, manifest);
}

boot();
