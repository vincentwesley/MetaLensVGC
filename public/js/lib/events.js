// events.js (lib) — pure grouping for the Event Results section.
// groupEvents(teams) → events newest first: { id, name, date, tier, n, winner, mix }.
// winner: the place-1 team in view or null (ties: first listed). mix: primary-archetype counts of the
// best 8 placed teams in view (the top cut when the view holds it), sorted by count then id.
export const TOP = 8;

export function groupEvents(teams) {
  const by = new Map();
  for (const t of teams) {
    if (!t.ev) continue;
    let g = by.get(t.ev.id);
    if (!g) by.set(t.ev.id, g = { id: t.ev.id, name: t.ev.name || '—', date: t.ev.date || '', tier: t.ev.tier, teams: [] });
    g.teams.push(t);
  }
  const out = [];
  for (const g of by.values()) {
    const placed = g.teams.filter((t) => Number.isFinite(t.placing)).sort((a, b) => a.placing - b.placing);
    const counts = new Map();
    for (const t of placed.slice(0, TOP)) {
      const id = t.arch?.[0] || 'other';
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    out.push({
      id: g.id, name: g.name, date: g.date, tier: g.tier, n: g.teams.length,
      winner: placed.find((t) => t.placing === 1) || null,
      mix: [...counts].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}
