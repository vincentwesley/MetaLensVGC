// Applies saved look prefs before first paint (plain script: CSP forbids inline).
try {
  const p = JSON.parse(localStorage.getItem('metalens.prefs'));
  const ok = { skin: ['pro', 'retro'], theme: ['dark', 'light', 'auto'], palette: ['grass', 'ghost', 'water', 'fire', 'fairy', 'electric', 'steel'] };
  const root = document.documentElement;
  for (const k in ok) if (p && ok[k].includes(p[k])) root.setAttribute('data-' + k, p[k]);
  if (p && typeof p.anim === 'boolean') root.setAttribute('data-anim', p.anim ? 'on' : 'off');
} catch { /* no storage: defaults */ }
