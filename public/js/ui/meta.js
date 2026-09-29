// Renders the "source / sample size / updated" line every card must show.
// ctx.meta(el, { source, n, unit }) in main.js injects `updated` from manifest.generated.

export function renderMetaLine(el, { source, n, unit = 'teams', updated } = {}) {
  if (!el) return;
  el.classList.add('meta-line');
  el.textContent = '';
  const parts = [];
  if (source) parts.push(source);
  if (n != null) parts.push(`n=${Number(n).toLocaleString('en-US')} ${unit}`);
  if (!parts.length && !updated) { el.textContent = '—'; return; }
  if (parts.length) el.appendChild(document.createTextNode(parts.join(' · ')));
  // Only the "updated <date>" token is forced no-wrap (so the hyphenated
  // date never splits mid-token, e.g. "updated 2026-\n09-29"); `source` can
  // itself be a long, normally-wrappable sentence (see speed.js), so it
  // stays plain text that wraps at spaces like before.
  if (updated) {
    if (parts.length) el.appendChild(document.createTextNode(' · '));
    const span = document.createElement('span');
    span.className = 'meta-line__part';
    span.textContent = `updated ${updated}`;
    el.appendChild(span);
  }
}

// In-game ranked source (championsbattledata.com): attribution text required by its terms.
export const RANKED_ATTRIBUTION = { text: 'Battle data provided by Pokémon Champions Battle Data', url: 'https://championsbattledata.com/' };
export const RANKED_NA = 'Not available for the in-game ranked source (it publishes per-Pokémon sets, not teams)';

/** Meta-line source text for a ranked season (or null season). */
export function rankedSource(season) {
  const base = 'In-game ranked (Pokémon Champions Battle Data)';
  return season ? `${base} · ${season.season} · snapshot ${season.snapshot}` : base;
}
