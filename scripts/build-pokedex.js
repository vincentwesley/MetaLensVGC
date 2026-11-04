#!/usr/bin/env node
// Builds pokedex-{vgc,natdex}.json + learnsets-{vgc,natdex}.json (SCHEMA.md) from the
// pokemon-showdown package. No network. Run alone: `npm run pokedex`.
import pkg from 'pokemon-showdown';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const { Dex } = pkg;
import { showdownDex } from './dex.js';
import { decode } from '../public/js/lib/aggregate.js';

const NATDEX_ORDER = ['AG', 'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU', 'NFE', 'LC'];
const DOUBLES_ORDER = ['DUber', 'DOU', 'DBL', 'DUU', 'NFE', 'LC']; // Showdown's Doubles tiers (gen9 Doubles OU; NatDex Doubles has no list of its own)
const VGC_ORDER = ['Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'NFE', 'LC'];

const tierOf = (t) => {
  if (!t || t === 'Illegal') return undefined;
  return t.replace(/^\((.*)\)$/, '$1'); // "(OU)" = OU by technicality -> OU
};

// seen (vgc only): species names that appear in real usage; kept even if the mod marks them Past/Illegal/untiered.
export function build(dex, { natdex, seen = new Set() }) {
  const species = {};
  const learn = {};
  const moveNames = {};
  const present = new Set();
  const presentD = new Set();
  const moveOk = (m) => m.exists && (natdex ? !['CAP', 'Custom', 'Future', 'LGPE', 'Unobtainable'].includes(m.isNonstandard) : !m.isNonstandard);
  for (const sp of dex.species.all()) {
    if (!sp.exists || !sp.baseStats) continue;
    const keep = !natdex && seen.has(sp.name);
    if (['CAP', 'Custom', 'Future', 'LGPE'].includes(sp.isNonstandard) && !(keep && sp.isNonstandard === 'Future')) continue;
    if (!natdex && sp.isNonstandard && !keep) continue;
    const tier = tierOf(natdex ? sp.natDexTier : sp.tier);
    if (!keep && (!tier || /^CAP/.test(tier))) continue; // untiered/Illegal = not selectable (battle-only formes etc.)
    const ab = {};
    for (const [k, v] of Object.entries(sp.abilities)) if (v) ab[k] = v;
    if (!Object.keys(ab).length) continue;
    const b = sp.baseStats;
    species[sp.name] = { num: sp.num, types: sp.types, bs: [b.hp, b.atk, b.def, b.spa, b.spd, b.spe], abilities: ab };
    if (tier && !/^CAP/.test(tier)) { species[sp.name].tier = tier; present.add(tier); }
    if (natdex) {
      const dt = tierOf(sp.doublesTier);
      if (dt) { species[sp.name].dtier = dt; presentD.add(dt); }
    }
    const ids = [];
    let pool = dex.species.getMovePool(sp.id, natdex);
    if (keep && !pool.length) pool = Dex.species.getMovePool(sp.id, natdex); // Past species: mod pool may be empty
    for (const id of pool) {
      const m = dex.moves.get(id);
      if (!moveOk(m)) continue;
      moveNames[m.id] = m.name;
      ids.push(m.id);
    }
    learn[sp.id] = ids.sort();
  }
  const order = (natdex ? NATDEX_ORDER : VGC_ORDER).filter((t) => present.has(t));
  const extra = [...present].filter((t) => !order.includes(t)); // ponytail: unexpected tiers appended, not silently dropped
  return { species, learn, moveNames, tierOrder: [...order, ...extra], dTierOrder: DOUBLES_ORDER.filter((t) => presentD.has(t)) };
}

const natdexOnly = (name, o, d) => (name === 'natdex' ? { ...o, dTierOrder: d } : o);

export const MIN_SHEETS = 5; // a species on fewer current-reg sheets than this is treated as a typo / joke entry

/** Species with real evidence of being legal in the current VGC regulation (the installed Showdown champions mod lags
 * behind new regulations): any in-game ranked season, any Smogon ladder month, or MIN_SHEETS+ tournament sheets.
 * Whole-dex names (dex.json) are NOT evidence: stray sheets once put Calyrex-Shadow, Koraidon etc. in the M-C Pokédex. */
export function seenFrom({ ranked, ladder, teams }) {
  const seen = new Set();
  for (const s of ranked?.seasons || []) for (const k of s.ranking || []) seen.add(k);
  for (const m of Object.values(ladder?.months || {})) for (const k of Object.keys(m.mons || {})) seen.add(k);
  const n = new Map();
  for (const t of teams || []) for (const k of t.keys) n.set(k, (n.get(k) || 0) + 1);
  for (const [k, c] of n) if (c >= MIN_SHEETS) seen.add(k);
  return seen;
}

async function seenInCurrentReg(dataDir) {
  const rd = (f) => readFile(path.join(dataDir, f), 'utf8').then(JSON.parse, () => null);
  const reg = (await rd('manifest.json'))?.current;
  const dex = await rd('dex.json');
  if (!reg || !dex) return new Set();
  const file = await rd(`teams-${reg}.json`);
  return seenFrom({ ranked: await rd(`ranked-${reg}.json`), ladder: await rd(`ladder-${reg}.json`), teams: file ? decode(file, dex).teams : [] });
}

export async function buildPokedex(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const generated = new Date().toISOString();
  const out = {};
  const seen = await seenInCurrentReg(dataDir);
  for (const [name, dex, natdex] of [['vgc', showdownDex(), false], ['natdex', Dex, true]]) {
    const { species, learn, moveNames, tierOrder, dTierOrder } = build(dex, { natdex, seen });
    const moves = Object.fromEntries(Object.keys(moveNames).sort().map((k) => [k, moveNames[k]]));
    // ponytail: no moveList index; learnsets-natdex.json is ~1.2MB raw, under the 1.5MB budget
    const raw = JSON.stringify({ moves, learn });
    await writeFile(path.join(dataDir, `pokedex-${name}.json`), JSON.stringify(natdexOnly(name, { generated, tierOrder, species }, dTierOrder)));
    await writeFile(path.join(dataDir, `learnsets-${name}.json`), raw);
    out[name] = { species: Object.keys(species).length, learnBytes: raw.length };
  }
  return out;
}

if (process.argv[1]?.endsWith('build-pokedex.js')) {
  console.log(JSON.stringify(await buildPokedex(path.join(process.cwd(), 'public', 'data'))));
}
