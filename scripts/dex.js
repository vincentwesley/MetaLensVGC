// Builds dex.json (SCHEMA.md) from the pokemon-showdown package's Champions mod data.
// Only includes species/moves/items that actually appear in the fetched data, plus
// every Mega form of each species that appears.
import pkg from 'pokemon-showdown';
const { Dex } = pkg;

let sdexCache = null;
function showdownDex() {
  if (!sdexCache) {
    try {
      sdexCache = Dex.mod('champions');
    } catch {
      sdexCache = Dex; // ponytail: base dex fallback if the champions mod ever goes missing
    }
  }
  return sdexCache;
}

function megaFormsOf(sp) {
  // Every other species whose battleOnly base is `sp.name` and which is a Mega.
  const out = [];
  for (const other of showdownDex().species.all()) {
    if (other.isMega && other.baseSpecies === sp.name) out.push(other.name);
  }
  return out;
}

/**
 * @param {Set<string>|string[]} speciesNames battle species that appear in the data
 * @param {Set<string>|string[]} moveNames
 * @param {Set<string>|string[]} itemNames
 */
export function buildDex(speciesNames, moveNames, itemNames) {
  const sdex = showdownDex();
  const wanted = new Set(speciesNames);
  for (const name of [...wanted]) {
    const sp = sdex.species.get(name);
    if (sp && sp.exists) for (const mega of megaFormsOf(sp)) wanted.add(mega);
  }

  const species = {};
  const missing = [];
  for (const name of wanted) {
    const sp = sdex.species.get(name);
    if (!sp || !sp.exists || !sp.baseStats) {
      missing.push(name);
      continue;
    }
    const entry = {
      id: sp.id,
      num: sp.num,
      types: sp.types,
      bs: [sp.baseStats.hp, sp.baseStats.atk, sp.baseStats.def, sp.baseStats.spa, sp.baseStats.spd, sp.baseStats.spe],
      abilities: [...new Set(Object.values(sp.abilities).filter(Boolean))],
      sprite: sp.spriteid,
      base: sp.baseSpecies || sp.name,
    };
    if (sp.isMega) {
      entry.megaOf = sp.baseSpecies;
      entry.stone = sp.requiredItem || null;
    }
    species[sp.name] = entry;
  }

  const moves = {};
  for (const name of moveNames) {
    const mv = sdex.moves.get(name);
    if (!mv || !mv.exists) continue;
    moves[mv.name] = { type: mv.type, cat: mv.category, bp: mv.basePower, pri: mv.priority, target: mv.target };
  }

  const items = {};
  for (const name of itemNames) {
    const it = sdex.items.get(name);
    if (!it || !it.exists) continue;
    if (it.megaStone) {
      const pairs = Object.entries(it.megaStone);
      if (pairs.length === 1) {
        items[it.name] = { mega: pairs[0][1], megaOf: pairs[0][0] };
      } else {
        // Stone shared by multiple forms (e.g. Meowsticite -> M/F).
        items[it.name] = { megaMap: Object.fromEntries(pairs) };
      }
    } else {
      items[it.name] = {};
    }
  }

  return { dex: { species, moves, items }, missing };
}
