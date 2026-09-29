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
  'snapshot', 'usage', 'types', 'archetypes', 'quadrant',
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

  let raf = null;
  let rendering = false;
  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; render(); });
  }

  async function render() {
    if (rendering) { scheduleRender(); return; }
    rendering = true;
    const state = store.get();
    try {
      const regData = await ensureReg(state.reg);
      const ladder = await getLadder(state.reg);
      const ranked = await getRanked(state.reg);
      const teams = filterTeams(regData.teams, state, state.chips, dex);
      const base = filterTeams(regData.teams, state, [], dex);
      let prev = [];
      try {
        const pReg = prevRegId(state.reg);
        const prevRegTeams = pReg ? filterTeams((await ensureReg(pReg)).teams, state, [], dex) : [];
        prev = previousPeriod(regData.teams, state, prevRegTeams);
      } catch (err) { console.warn('[main] previousPeriod failed:', err); prev = []; }

      const view = { state, reg: state.reg, manifest, dex, teams, base, prev, matches: regData.matches, ladder, ranked };
      for (const s of mounted) {
        try { s.api?.update?.(view); } catch (err) { console.warn(`[main] section "${s.id}" update failed:`, err); }
      }
      filterbarApi.update(view);
    } catch (err) {
      console.warn('[main] render failed:', err);
      toast(`Could not load ${state.reg} data: ${err.message}`, { type: 'error' });
    } finally {
      rendering = false;
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
