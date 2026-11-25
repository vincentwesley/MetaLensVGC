// Source: Smogon sample teams and recommended sets for the Showdown formats, via the pkmn/smogon data mirror
// (https://github.com/pkmn/smogon, refreshed daily from Smogon). The sets and teams are © Smogon and their authors:
// MetaLens shows them with credit and a link back (owner's decision 2026-11-25), never as its own content.
import { fetchText } from '../lib/http.js';
import { REGULATIONS } from '../lib/regs.js';

const BASE = 'https://pkmn.github.io/smogon/data';
const TTL = 1000 * 60 * 60 * 12;
// Smogon strategy-dex pages that list the same sample teams / sets (credit + "Open on Smogon" links).
export const SMOGON_PAGES = {
  gen9nationaldex: 'https://www.smogon.com/dex/sv/formats/national-dex/',
  gen9nationaldexdoubles: 'https://www.smogon.com/dex/sv/formats/national-dex-doubles/',
};
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** {hp: 252, spe: 4} -> [252, 0, 0, 0, 0, 4]; empty -> null. defaultValue fills missing stats (IVs: 31). */
export function statArray(obj, defaultValue = 0) {
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) return null;
  return STATS.map((s) => (Number.isFinite(obj[s]) ? obj[s] : defaultValue));
}

/** One sample-team Pokémon in the samples-<REG>.json shape. */
export function sampleMon(m) {
  const ivs = statArray(m.ivs, 31);
  return {
    species: String(m.species || ''),
    item: m.item || null,
    ability: m.ability || null,
    tera: m.teraType || null,
    nature: m.nature || null,
    evs: statArray(m.evs, 0),
    ivs: ivs && ivs.some((v) => v !== 31) ? ivs : null,
    moves: (m.moves || []).filter(Boolean).map(String).slice(0, 4),
  };
}

/** pkmn teams json -> [{name, author, mons}] (unnamed teams get "Untitled team"). */
export function sampleTeams(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((t) => Array.isArray(t?.data) && t.data.length)
    .map((t) => ({ name: (t.name || '').trim() || 'Untitled team', author: (t.author || '').trim() || null, mons: t.data.map(sampleMon).filter((m) => m.species) }));
}

/** pkmn sets json -> {species: [{name, moves (string | string[] per slot), item[], ability[], nature[], evs[], ivs, tera[]}]} */
export function smogonSets(raw) {
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const out = {};
  for (const [species, sets] of Object.entries(raw || {})) {
    out[species] = Object.entries(sets || {}).map(([name, s]) => ({
      name,
      moves: list(s.moves).map((slot) => (Array.isArray(slot) ? slot.map(String) : String(slot))),
      item: list(s.item), ability: list(s.ability), nature: list(s.nature),
      evs: list(s.evs).map((e) => statArray(e, 0)).filter(Boolean),
      ivs: statArray(list(s.ivs)[0], 31),
      tera: list(s.teratypes),
    }));
  }
  return out;
}

/** Sample teams + sets for a Showdown reg; null when the mirror has neither. */
export async function fetchSamples(reg, log = () => {}) {
  const { format } = REGULATIONS[reg];
  const get = async (kind) => {
    try { return JSON.parse(await fetchText(`${BASE}/${kind}/${format}.json`, { ttl: TTL })); } catch { return null; }
  };
  const [teamsRaw, setsRaw] = [await get('teams'), await get('sets')];
  if (!teamsRaw && !setsRaw) return null;
  const teams = sampleTeams(teamsRaw);
  const sets = smogonSets(setsRaw);
  log(`  [samples ${reg}] ${teams.length} sample teams, sets for ${Object.keys(sets).length} Pokémon`);
  return {
    reg, format,
    source: { teams: `${BASE}/teams/${format}.json`, sets: `${BASE}/sets/${format}.json`, smogon: SMOGON_PAGES[format] || 'https://www.smogon.com/dex/sv/' },
    credit: 'Sample teams and sets © Smogon and their authors, via the pkmn/smogon data mirror.',
    teams, sets,
  };
}
