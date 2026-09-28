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
