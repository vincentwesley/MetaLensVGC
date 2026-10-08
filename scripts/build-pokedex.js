#!/usr/bin/env node
// Builds pokedex-{vgc,natdex}.json + learnsets-{vgc,natdex}.json (SCHEMA.md) from the
// pokemon-showdown package. No network. Run alone: `npm run pokedex`.
import pkg from 'pokemon-showdown';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const { Dex } = pkg;
import { showdownDex } from './dex.js';

const NATDEX_ORDER = ['AG', 'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU', 'NFE', 'LC'];
const VGC_ORDER = ['Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'NFE', 'LC'];

const tierOf = (t) => {
  if (!t || t === 'Illegal') return undefined;
  return t.replace(/^\((.*)\)$/, '$1'); // "(OU)" = OU by technicality -> OU
};

export function build(dex, { natdex }) {
  const species = {};
  const learn = {};
  const moveNames = {};
  const present = new Set();
  const moveOk = (m) => m.exists && (natdex ? !['CAP', 'Custom', 'Future', 'LGPE', 'Unobtainable'].includes(m.isNonstandard) : !m.isNonstandard);
  for (const sp of dex.species.all()) {
    if (!sp.exists || !sp.baseStats) continue;
    if (['CAP', 'Custom', 'Future', 'LGPE'].includes(sp.isNonstandard)) continue;
    if (!natdex && sp.isNonstandard) continue;
    const tier = tierOf(natdex ? sp.natDexTier : sp.tier);
    if (!tier || /^CAP/.test(tier)) continue; // untiered/Illegal = not selectable (battle-only formes etc.)
    const ab = {};
    for (const [k, v] of Object.entries(sp.abilities)) if (v) ab[k] = v;
    if (!Object.keys(ab).length) continue;
    const b = sp.baseStats;
    species[sp.name] = { num: sp.num, types: sp.types, bs: [b.hp, b.atk, b.def, b.spa, b.spd, b.spe], abilities: ab, tier };
    present.add(tier);
    const ids = [];
    for (const id of dex.species.getMovePool(sp.id, natdex)) {
      const m = dex.moves.get(id);
      if (!moveOk(m)) continue;
      moveNames[m.id] = m.name;
      ids.push(m.id);
    }
    learn[sp.id] = ids.sort();
  }
  const order = (natdex ? NATDEX_ORDER : VGC_ORDER).filter((t) => present.has(t));
  const extra = [...present].filter((t) => !order.includes(t)); // ponytail: unexpected tiers appended, not silently dropped
  return { species, learn, moveNames, tierOrder: [...order, ...extra] };
}

export async function buildPokedex(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const generated = new Date().toISOString();
  const out = {};
  for (const [name, dex, natdex] of [['vgc', showdownDex(), false], ['natdex', Dex, true]]) {
    const { species, learn, moveNames, tierOrder } = build(dex, { natdex });
    const moves = Object.fromEntries(Object.keys(moveNames).sort().map((k) => [k, moveNames[k]]));
    // ponytail: no moveList index; learnsets-natdex.json is ~1.2MB raw, under the 1.5MB budget
    const raw = JSON.stringify({ moves, learn });
    await writeFile(path.join(dataDir, `pokedex-${name}.json`), JSON.stringify({ generated, tierOrder, species }));
    await writeFile(path.join(dataDir, `learnsets-${name}.json`), raw);
    out[name] = { species: Object.keys(species).length, learnBytes: raw.length };
  }
  return out;
}

if (process.argv[1]?.endsWith('build-pokedex.js')) {
  console.log(JSON.stringify(await buildPokedex(path.join(process.cwd(), 'public', 'data'))));
}
