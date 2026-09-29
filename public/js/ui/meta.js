// Renders the "source / sample size / updated" line every card must show.
// ctx.meta(el, { source, n, unit }) in main.js injects `updated` from manifest.generated.

export function renderMetaLine(el, { source, n, unit = 'teams', updated } = {}) {
  if (!el) return;
  const parts = [];
  if (source) parts.push(source);
  if (n != null) parts.push(`n=${Number(n).toLocaleString('en-US')} ${unit}`);
  if (updated) parts.push(`updated ${updated}`);
  el.textContent = parts.join(' · ') || '—';
  el.classList.add('meta-line');
}

// In-game ranked source (championsbattledata.com): attribution text required by its terms.
export const RANKED_ATTRIBUTION = { text: 'Battle data provided by Pokémon Champions Battle Data', url: 'https://championsbattledata.com/' };
export const RANKED_NA = 'Not available for the in-game ranked source (it publishes per-Pokémon sets, not teams)';

/** Meta-line source text for a ranked season (or null season). */
export function rankedSource(season) {
  const base = 'In-game ranked (Pokémon Champions Battle Data)';
  return season ? `${base} · ${season.season} · snapshot ${season.snapshot}` : base;
}
