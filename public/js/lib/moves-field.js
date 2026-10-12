// Moves & Tera field maths (pure). Input: ladderMerge().mons rows ({key, usage, moves:[{name,pct}], tera:[{name,pct}]}).
// Every share is weighted by the species usage and normalised by the usage of the species that HAVE that table,
// so a species without move data never drags the numbers down (and nothing is invented for it).
import { realTera } from './aggregate.js';

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

function field(mons, table, pick, limit) {
  const sum = new Map();
  let total = 0;
  let species = 0;
  for (const m of mons || []) {
    const rows = pick(m[table]);
    if (!(m.usage > 0) || !rows.length) continue;
    total += m.usage;
    species++;
    for (const r of rows) if (r.pct > 0) sum.set(r.name, (sum.get(r.name) || 0) + m.usage * r.pct);
  }
  const out = [...sum].map(([name, v]) => ({ name, pct: total ? v / total : 0 })).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  return { rows: out.slice(0, limit), species, total };
}

/** Top moves: {rows:[{name,pct}], species}. pct = usage-weighted share of the field Pokemon that run it. */
export const fieldMoves = (mons, limit = 15) => field(mons, 'moves', (r) => r || [], limit);

/** Top real Tera types (Smogon 'Nothing' dropped; names capitalised to match TYPES). Empty rows = Tera unused/banned. */
export function fieldTera(mons, limit = 18) {
  const f = field(mons, 'tera', (r) => realTera(r), 100);
  // normalise by the usage of ALL species with tera data (incl. 'Nothing'), so bars are shares of the field
  let all = 0;
  for (const m of mons || []) if (m.usage > 0 && (m.tera || []).length) all += m.usage;
  const rows = f.rows.map((r) => ({ name: cap(r.name), pct: all ? (r.pct * f.total) / all : 0 })).slice(0, limit);
  return { rows, species: f.species };
}
