// Applies saved look prefs before first paint (plain script: CSP forbids inline).
try {
  const p = JSON.parse(localStorage.getItem('metalens.prefs'));
  const ok = { skin: ['pro', 'retro', 'glass', 'paper', 'terminal', 'soft'], theme: ['dark', 'light', 'auto'], palette: ['grass', 'ghost', 'water', 'fire', 'fairy', 'electric', 'steel'] };
  const root = document.documentElement;
  for (const k in ok) if (k !== 'skin') if (p && ok[k].includes(p[k])) root.setAttribute('data-' + k, p[k]);
  if (p && ok.skin.includes(p.skin)) { // same mapping as state.js applyDom
    root.setAttribute('data-skin', p.skin === 'retro' ? 'retro' : 'pro');
    root.setAttribute('data-style', p.skin);
  }
  if (p && typeof p.anim === 'boolean') root.setAttribute('data-anim', p.anim ? 'on' : 'off');
} catch { /* no storage: defaults */ }
// Layout state that main.js would otherwise set after first paint (avoids layout shift): collapsed filter bar, dismissed tips.
try {
  const c = localStorage.getItem('metalens.filtersCollapsed');
  if (c == null ? matchMedia('(max-width: 700px)').matches : c === '1') document.documentElement.setAttribute('data-filters-collapsed', '');
  if (localStorage.getItem('metalens.howtoDismissed') === '1') document.documentElement.setAttribute('data-howto-off', '');
} catch { /* defaults */ }
