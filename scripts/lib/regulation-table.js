// regulations.csv for the research release (Vin's Atelier): one row per regulation with its dates and the Pokémon and
// Mega forms newly legal compared with the previous regulation, derived (never typed by hand) from:
//   - the installed pokemon-showdown package's Champions mods (REGULATIONS[reg].dexMod), where both regulations have one;
//   - otherwise the tournament data: forms on MIN_LISTS+ full team lists in the regulation that were neither legal in the
//     previous one (its dex mod) nor on MIN_LISTS+ of its lists (catches sheet spellings the mod doesn't list, e.g. Floette).
// Pipeline-only (Node); deterministic for the same data and package version.
import { createRequire } from 'node:module';
import { decode } from '../../public/js/lib/aggregate.js';
import { REGULATIONS, VGC_IDS } from './regs.js';

export const MIN_LISTS = 5; // same evidence bar as the Pokédex roster (scripts/build-pokedex.js MIN_SHEETS)
const require = createRequire(import.meta.url);

export function showdownVersion() {
  return require('pokemon-showdown/package.json').version;
}

/** Forms legal under a pokemon-showdown mod: existing, standard, not tiered Illegal / Unreleased. */
export function legalForms(mod) {
  const { Dex } = require('pokemon-showdown');
  return new Set(Dex.mod(mod).species.all()
    .filter((s) => s.exists && !s.isNonstandard && s.tier !== 'Illegal' && s.tier !== 'Unreleased')
    .map((s) => s.name));
}

/** Display form (Mon.k, Mega forms separate) -> number of full team lists including it. */
export function formCounts(teamsFile, dex) {
  const c = new Map();
  for (const t of decode(teamsFile, dex).teams) for (const k of new Set(t.keys)) c.set(k, (c.get(k) || 0) + 1);
  return c;
}

export const isMegaForm = (name) => /-Mega(-[A-Z])?$/.test(name);
const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * regs: release regulation ids; counts(reg) -> formCounts or null (no teams file). Returns rows for regulations.csv.
 */
export function regulationRows(regs, counts) {
  const legalCache = new Map();
  const legal = (reg) => {
    const mod = REGULATIONS[reg]?.dexMod;
    if (!mod) return null;
    if (!legalCache.has(mod)) legalCache.set(mod, legalForms(mod));
    return legalCache.get(mod);
  };
  const observed = (reg) => new Set([...(counts(reg) || new Map())].filter(([, n]) => n >= MIN_LISTS).map(([k]) => k));
  return regs.map((reg) => {
    const r = REGULATIONS[reg];
    const prev = VGC_IDS[VGC_IDS.indexOf(reg) - 1] || null;
    let forms;
    let basis;
    if (legal(reg) && !prev) {
      forms = legal(reg);
      basis = `initial roster: every form legal under pokemon-showdown mod "${r.dexMod}"`;
    } else if (legal(reg) && legal(prev)) {
      forms = [...legal(reg)].filter((f) => !legal(prev).has(f));
      basis = `pokemon-showdown mods: legal under "${r.dexMod}" and not under "${REGULATIONS[prev].dexMod}" (${prev})`;
    } else {
      const before = observed(prev);
      forms = [...observed(reg)].filter((f) => !before.has(f) && !(legal(prev)?.has(f)));
      basis = `data: on ${MIN_LISTS}+ full team lists in ${reg}, on fewer than ${MIN_LISTS} in ${prev}`
        + (legal(prev) ? ` and not legal under pokemon-showdown mod "${REGULATIONS[prev].dexMod}" (${prev})` : '');
    }
    const megas = sorted([...forms].filter(isMegaForm));
    const mons = sorted([...forms].filter((f) => !isMegaForm(f)));
    return { regulation: reg, start_date: r.start, end_date: r.end, showdown_format: r.format, previous: prev,
      new_basis: basis, n_new_pokemon: mons.length, n_new_megas: megas.length, new_pokemon: mons.join('|'), new_megas: megas.join('|') };
  });
}
