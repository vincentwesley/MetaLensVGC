// Global sticky filter bar. Builds all controls from `manifest`, wires them to
// `ctx.store.set`, and mirrors state on every store change (so back/forward and
// hash edits stay in sync). Exposes update(view) to paint the live sample line.
import { rankedSeason } from '../lib/aggregate.js';

const TIERS = [
  ['worlds', 'Worlds'],
  ['international', 'Internationals'],
  ['regional', 'Regionals'],
  ['online', 'Online'],
];
const PLACEMENTS = [
  ['all', 'All'],
  ['topcut', 'Top Cut'],
  ['top8', 'Top 8'],
  ['winner', 'Winner'],
];

function segmented(name, options, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', name);
  const buttons = new Map();
  for (const [value, label] of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.value = value;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => onPick(value));
    wrap.appendChild(btn);
    buttons.set(value, btn);
  }
  return { el: wrap, buttons };
}

export function mountFilterbar(root, ctx, manifest) {
  const toggleBtn = document.getElementById('filterbar-toggle');
  const body = document.getElementById('filterbar-body');
  const summary = document.getElementById('filterbar-summary');

  // Collapse: hides the filter controls and the header settings, leaving a
  // one-line summary. The choice is a per-viewer preference kept in
  // localStorage (not in the shareable URL). Small screens start collapsed.
  const PREF = 'metalens.filtersCollapsed';
  let collapsed;
  try { collapsed = localStorage.getItem(PREF); } catch { collapsed = null; }
  collapsed = collapsed == null ? matchMedia('(max-width: 700px)').matches : collapsed === '1';
  function setCollapsed(v, save) {
    collapsed = v;
    document.documentElement.toggleAttribute('data-filters-collapsed', v);
    toggleBtn.setAttribute('aria-expanded', String(!v));
    toggleBtn.innerHTML = v
      ? '<span aria-hidden="true">▼</span> Filters<span class="filterbar__toggle-more"> &amp; settings</span>'
      : '<span aria-hidden="true">▲</span> Hide';
    toggleBtn.title = `${v ? 'Show' : 'Hide'} filters and settings (F)`;
    if (save) { try { localStorage.setItem(PREF, v ? '1' : '0'); } catch { /* storage unavailable */ } }
  }
  setCollapsed(collapsed, false);
  toggleBtn.addEventListener('click', () => setCollapsed(!collapsed, true));
  summary?.addEventListener('click', () => setCollapsed(false, true));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('#deepdive[aria-hidden="false"]')) return;
    e.preventDefault();
    setCollapsed(!collapsed, true);
  });

  const regs = manifest?.regs || [];
  const regIds = regs.map((r) => r.id);

  // Regulation
  const regGroup = document.createElement('div');
  regGroup.className = 'filterbar__group';
  const regLabel = document.createElement('span');
  regLabel.className = 'filterbar__label';
  regLabel.textContent = 'Reg';
  const reg = segmented('Regulation', regIds.map((id) => [id, id]), (id) => ctx.store.set({ reg: id }));
  regGroup.append(regLabel, reg.el);

  // Source
  const srcGroup = document.createElement('div');
  srcGroup.className = 'filterbar__group';
  const srcLabel = document.createElement('span');
  srcLabel.className = 'filterbar__label';
  srcLabel.textContent = 'Source';
  const source = segmented('Source', [['tournaments', 'Tournaments'], ['ladder', 'Ladder'], ['ranked', 'Ranked (in-game)']], (v) => ctx.store.set({ source: v }));
  srcGroup.append(srcLabel, source.el);

  // Event tiers
  const tierGroup = document.createElement('div');
  tierGroup.className = 'filterbar__group';
  const tierLabel = document.createElement('span');
  tierLabel.className = 'filterbar__label';
  tierLabel.textContent = 'Tier';
  const tierMulti = document.createElement('div');
  tierMulti.className = 'filterbar__multi';
  const tierInputs = new Map();
  for (const [value, label] of TIERS) {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = value;
    cb.addEventListener('change', () => {
      const tiers = TIERS.map(([v]) => v).filter((v) => tierInputs.get(v).checked);
      ctx.store.set({ tiers });
    });
    tierInputs.set(value, cb);
    l.append(cb, document.createTextNode(label));
    tierMulti.appendChild(l);
  }
  tierGroup.append(tierLabel, tierMulti);

  // Placement
  const placeGroup = document.createElement('div');
  placeGroup.className = 'filterbar__group';
  const placeLabel = document.createElement('span');
  placeLabel.className = 'filterbar__label';
  placeLabel.textContent = 'Placement';
  const place = segmented('Placement', PLACEMENTS, (v) => ctx.store.set({ place: v }));
  placeGroup.append(placeLabel, place.el);

  // Date range
  const dateGroup = document.createElement('div');
  dateGroup.className = 'filterbar__group';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'filterbar__label';
  dateLabel.textContent = 'Dates';
  const fromInput = document.createElement('input');
  fromInput.type = 'date';
  fromInput.setAttribute('aria-label', 'From date');
  const toInput = document.createElement('input');
  toInput.type = 'date';
  toInput.setAttribute('aria-label', 'To date');
  fromInput.addEventListener('change', () => ctx.store.set({ from: fromInput.value }));
  toInput.addEventListener('change', () => ctx.store.set({ to: toInput.value }));
  dateGroup.append(dateLabel, fromInput, toInput);

  // Min-sample slider
  const sliderGroup = document.createElement('div');
  sliderGroup.className = 'filterbar__group';
  const sliderLabel = document.createElement('span');
  sliderLabel.className = 'filterbar__label';
  sliderLabel.textContent = 'Min n';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '200';
  slider.step = '5';
  slider.setAttribute('aria-label', 'Minimum sample size (n)');
  const sliderVal = document.createElement('span');
  sliderVal.className = 'filterbar__label';
  // Dragging fires dozens of input events; only re-render once the value settles.
  let sliderTimer = null;
  slider.addEventListener('input', () => {
    sliderVal.textContent = slider.value;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => ctx.store.set({ minN: Number(slider.value) }, { replace: true }), 180);
  });
  sliderGroup.append(sliderLabel, slider, sliderVal);

  const sample = document.createElement('span');
  sample.className = 'filterbar__sample';
  sample.textContent = 'Loading…';

  body.append(regGroup, srcGroup, tierGroup, placeGroup, dateGroup, sliderGroup, sample);

  function regMeta(id) { return regs.find((r) => r.id === id); }

  function sync(state) {
    for (const [id, btn] of reg.buttons) btn.setAttribute('aria-pressed', String(id === state.reg));
    for (const [id, btn] of source.buttons) btn.setAttribute('aria-pressed', String(id === state.source));
    for (const [id, btn] of place.buttons) btn.setAttribute('aria-pressed', String(id === state.place));
    for (const [value, cb] of tierInputs) cb.checked = state.tiers.includes(value);

    const rm = regMeta(state.reg);
    const hasLadder = (rm?.ladderMonths?.length || 0) > 0;
    const ladderBtn = source.buttons.get('ladder');
    if (ladderBtn) {
      ladderBtn.disabled = !hasLadder;
      ladderBtn.title = hasLadder ? '' : 'No ladder data for this regulation';
      if (!hasLadder) ladderBtn.setAttribute('data-tip', 'No ladder data for this regulation');
      else ladderBtn.removeAttribute('data-tip');
    }
    const hasRanked = (rm?.rankedSeasons?.length || 0) > 0;
    const rankedBtn = source.buttons.get('ranked');
    if (rankedBtn) {
      rankedBtn.disabled = !hasRanked;
      rankedBtn.title = hasRanked ? '' : 'No in-game ranked data for this regulation';
      if (!hasRanked) rankedBtn.setAttribute('data-tip', 'No in-game ranked data for this regulation');
      else rankedBtn.removeAttribute('data-tip');
    }
    if (rm) { fromInput.min = toInput.min = rm.start; fromInput.max = toInput.max = rm.end; }
    if (fromInput.value !== (state.from || '')) fromInput.value = state.from || '';
    if (toInput.value !== (state.to || '')) toInput.value = state.to || '';
    if (String(slider.value) !== String(state.minN)) slider.value = String(state.minN);
    sliderVal.textContent = String(state.minN);
  }

  sync(ctx.store.get());
  ctx.store.subscribe(sync);

  function update(view) {
    if (summary) summary.dataset.sample = view?.state?.source === 'tournaments' ? `${(view?.teams?.length ?? 0).toLocaleString('en-US')} teams` : '';
    const n = view?.teams?.length ?? 0;
    const events = view?.teams ? new Set(view.teams.map((t) => t.ev?.id)).size : 0;
    const updated = manifest?.generated ? manifest.generated.slice(0, 10) : '—';
    if (view?.state?.source === 'ranked') {
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      sample.textContent = season
        ? `In-game ranked ${season.season} · snapshot ${season.snapshot} · ${Object.keys(season.mons).length.toLocaleString('en-US')} Pokémon · updated ${updated}`
        : `No in-game ranked season in range · updated ${updated}`;
      return;
    }
    sample.textContent = `${n.toLocaleString('en-US')} teams · ${events.toLocaleString('en-US')} events · updated ${updated}`;
  }

  // One-line summary shown while collapsed: the active bar filters at a glance.
  function paintSummary(state) {
    if (!summary) return;
    const srcLabel = { tournaments: 'Tournaments', ladder: 'Ladder', ranked: 'Ranked (in-game)' }[state.source] || state.source;
    const parts = [state.reg, srcLabel];
    if (state.source === 'tournaments') {
      if (state.tiers.length !== TIERS.length) parts.push(TIERS.filter(([v]) => state.tiers.includes(v)).map(([, l]) => l).join('+') || 'No tiers');
      if (state.place !== 'all') parts.push(PLACEMENTS.find(([v]) => v === state.place)?.[1] || state.place);
    }
    if (state.from || state.to) parts.push(`${state.from || '…'} → ${state.to || '…'}`);
    if (state.chips.length) parts.push(`${state.chips.length} filter${state.chips.length === 1 ? '' : 's'} active`);
    summary.textContent = parts.join(' · ');
  }
  paintSummary(ctx.store.get());
  ctx.store.subscribe(paintSummary);

  return { update };
}
