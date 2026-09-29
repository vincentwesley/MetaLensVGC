// Boot, ctx, view computation, section mounting. See CLAUDE.md "Sections" contract.

import { store } from './state.js';
import * as data from './data.js';
import { sprite, spriteUrl } from './ui/sprites.js';
import { mountFilterbar } from './ui/filterbar.js';
import { mountChips } from './ui/chips.js';
import { mountDrawer } from './ui/drawer.js';
import { renderMetaLine } from './ui/meta.js';
import { fmt } from './ui/fmt.js';
import { chartTheme, onTheme, notifyThemeSubs } from './ui/echarts-theme.js';
import { toast } from './ui/toast.js';

const SECTION_IDS = [
  'snapshot', 'usage', 'types', 'items', 'archetypes', 'quadrant',
  'teammates', 'speed', 'trends', 'library', 'scanner', 'methodology',
];

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

  host.appendChild(segToggle('Skin', [['retro', 'Retro'], ['pro', 'Pro']], (s) => s.skin, (v) => store.set({ skin: v })));
  host.appendChild(segToggle('Theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], (s) => s.theme, (v) => store.set({ theme: v })));

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
  buildHeaderControls();

  let manifest, dex;
  try {
    [manifest, dex] = await Promise.all([data.loadManifest(), data.loadDex()]);
  } catch (err) {
    toast(`Could not load core data: ${err.message}`, { type: 'error', duration: 0 });
    document.querySelectorAll('.section__mount').forEach((el) => placeholderBox(el, 'Data unavailable'));
    return;
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

  const { decode, filterTeams, previousPeriod } = lib.aggregate;

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
    echarts: window.echarts,
    sprite: (key, opts) => sprite(key, dex, opts),
    spriteUrl: (key, opts) => spriteUrl(key, dex, opts),
    openDrawer: (key) => drawerApi.open(key),
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
  const syncPending = () => document.documentElement.toggleAttribute('data-rendering', dirty.size > 0);

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
    raf = requestAnimationFrame(() => { raf = null; render(); });
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
      const prev = previousPeriod(regTeams, state, prevRegTeams || []);
      // Without the previous regulation loaded yet, show no deltas rather than
      // comparing against an empty period.
      return prevRegTeams === null && prev.length === 0 ? null : prev;
    } catch (err) { console.warn('[main] previousPeriod failed:', err); return []; }
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

      const view = { state, reg: state.reg, manifest, dex, teams, base, prev, matches: regData.matches, ladder, ranked, regTeams: regData.teams };
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
