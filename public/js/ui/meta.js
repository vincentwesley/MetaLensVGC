// Renders the "source / sample size / updated" line every card must show.
// ctx.meta(el, { source, n, unit, relaxed }) in main.js injects `updated` from manifest.generated.

export function renderMetaLine(el, { source, n, unit = 'teams', updated, relaxed } = {}) {
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
  // atMinN() had to include Pokémon under the min-n threshold to show anything.
  if (relaxed) {
    const warn = document.createElement('span');
    warn.className = 'meta-line__part meta-line__relaxed';
    warn.textContent = `includes n < ${relaxed}`;
    warn.dataset.tip = `Nothing in this view reaches the minimum sample (n ≥ ${relaxed}), so smaller samples are shown. Read them with care.`;
    warn.tabIndex = 0;
    el.append(' · ', warn);
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

/** One muted line under a chart: what it shows and what clicking it filters to. */
export function clickHint(text, { auto = true } = {}) {
  const p = document.createElement('p');
  p.className = 'click-hint';
  p.textContent = text;
  if (auto) { autoHints.add(p); watchEmpty(); }
  return p;
}

// One mechanism for every card: a hint is hidden while its container holds an
// .empty-state (nothing to click), and comes back when the state is gone.
// auto:false for hints whose container also holds unrelated empty sub-cards.
const autoHints = new Set();
let watching = false;
function watchEmpty() {
  if (watching || typeof MutationObserver === 'undefined') return;
  watching = true;
  new MutationObserver(() => {
    for (const h of autoHints) if (h.parentElement) h.hidden = !!h.parentElement.querySelector('.empty-state');
  }).observe(document.body, { childList: true, subtree: true });
}

// previousPeriod() either returns the preceding window within the same reg,
// or falls back to the previous regulation's teams. Label from whichever it
// gave us: ponytail — approximates the window length from view.base's date
// span rather than re-deriving previousPeriod's exact bounds; good enough for
// a label, upgrade if the two ever visibly disagree.
export function prevLabel(view) {
  const prev = view.prev;
  if (!prev || !prev.length) return null;
  if (prev[0].reg !== view.reg) return `vs ${prev[0].reg}`;
  const dates = view.base.map((t) => t.date).filter(Boolean).sort();
  if (!dates.length) return 'vs prior period';
  const days = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1;
  return `vs prior ${days} day${days === 1 ? '' : 's'}`;
}
