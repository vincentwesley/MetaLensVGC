// samples.js (lib) — Smogon sample teams and recommended sets for the Showdown formats (samples-<REG>.json, built by
// scripts/sources/smogon-sets.js). Pure: shapes them for the Sample teams section, the deep dive and Showdown pastes.
// The teams and sets are © Smogon and their authors; every view that shows them credits and links Smogon.
import { megaKey } from './names.js';

/** A sample-team Pokémon as a decoded Mon (paste.js / sprites): k = Mega form when it holds its own stone. */
export function sampleMon(m, dex) {
  const k = megaKey(m.species, m.item, dex) || m.species;
  return { s: m.species, k, item: m.item, ability: m.ability, tera: m.tera || null, nature: m.nature, sp: m.evs, ivs: m.ivs, moves: m.moves, mega: k !== m.species };
}

/** Sample teams as {name, author, mons: Mon[], keys} for display and toPaste. */
export function sampleTeams(samples, dex) {
  return (samples?.teams || []).map((t, i) => {
    const mons = t.mons.map((m) => sampleMon(m, dex));
    return { i, name: t.name, author: t.author, mons, keys: mons.map((m) => m.k) };
  });
}

/**
 * Teams passing the species chips: `test(key)` from speciesChipFilter (undefined = no species chips). A team is kept
 * when one of its Pokémon passes, so a species chip keeps the teams that use that Pokémon.
 */
export function filterSampleTeams(teams, test) {
  if (!test) return teams;
  // Each Pokémon as a one-set "row", so item / move chips (Showdown) check what it actually holds / knows.
  const row = (m) => ({ items: m.item ? { [m.item]: 1 } : {}, moves: Object.fromEntries(m.moves.map((mv) => [mv, 1])) });
  return teams.filter((t) => t.mons.some((m) => test(m.k, row(m))));
}

/** Smogon sets for a deep-dive key: the key's own entry, else its base species (Mega forms share the base's sets). */
export function setsFor(samples, key, dex) {
  const sets = samples?.sets || {};
  if (sets[key]) return sets[key];
  const base = dex?.species?.[key]?.base || key.replace(/-Mega(-[A-Z])?$/, '');
  return sets[base] || [];
}

/** A recommended set as a Mon (first option of every choice), for Copy. */
export function setMon(species, set) {
  const first = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
  return { s: species, k: species, item: first(set.item), ability: first(set.ability), tera: first(set.tera), nature: first(set.nature),
    sp: set.evs?.[0] || null, ivs: set.ivs || null, moves: (set.moves || []).map(first).filter(Boolean), mega: false };
}
