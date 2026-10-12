// threats.js (lib) — which Pokémon check the most of the field. For the top N species
// by usage, every counter (Smogon p = KO/switch probability) adds usage * p to its
// score and 1 to its check count. Pure: input is ladderMerge().mons.
export function threatScores(mons, topN = 12) {
  const top = (mons || []).filter((m) => Number.isFinite(m?.usage) && m.usage > 0)
    .sort((a, b) => b.usage - a.usage).slice(0, topN);
  const acc = new Map();
  for (const m of top) {
    for (const c of m.counters || []) {
      if (!c?.name || !(c.score > 0) || !Number.isFinite(c.score)) continue;
      const o = acc.get(c.name) || { name: c.name, score: 0, checks: 0 };
      o.score += m.usage * c.score;
      o.checks += 1;
      acc.set(c.name, o);
    }
  }
  const rows = [...acc.values()].sort((a, b) => b.score - a.score || b.checks - a.checks || a.name.localeCompare(b.name));
  return { total: top.length, rows };
}
