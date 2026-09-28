import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toID, normalizeSpecies, megaKey } from '../public/js/lib/names.js';
import pokemonShowdown from 'pokemon-showdown';
const { Dex } = pokemonShowdown;

const champions = Dex.mod('champions');

// Minimal dex fixture built from the real champions mod, in the shape SCHEMA.md
// describes (species keyed by display name, each entry carrying its own `id`).
function buildDex(speciesNames, items) {
  const species = {};
  for (const name of speciesNames) {
    const sp = champions.species.get(name);
    species[sp.name] = { id: sp.id };
  }
  return { species, items: items || {} };
}

test('toID lowercases and strips punctuation', () => {
  assert.equal(toID('Mr. Rime'), 'mrrime');
  assert.equal(toID("Farfetch'd"), 'farfetchd');
  assert.equal(toID('Ho-Oh'), 'hooh');
  assert.equal(toID(null), '');
});

test('normalizeSpecies: Limitless hyphen ids without a dex', () => {
  assert.equal(normalizeSpecies('raichu-alola'), 'Raichu-Alola');
  assert.equal(normalizeSpecies('floette-eternal'), 'Floette-Eternal');
  assert.equal(normalizeSpecies('rotom-wash'), 'Rotom-Wash');
  assert.equal(normalizeSpecies('basculegion-f'), 'Basculegion-F');
  assert.equal(normalizeSpecies('basculegion-female'), 'Basculegion-F');
  assert.equal(normalizeSpecies('indeedee-f'), 'Indeedee-F');
  assert.equal(normalizeSpecies('lycanroc-dusk'), 'Lycanroc-Dusk');
  assert.equal(normalizeSpecies('samurott-hisui'), 'Samurott-Hisui');
  assert.equal(normalizeSpecies('arcanine-hisui'), 'Arcanine-Hisui');
  assert.equal(normalizeSpecies('ninetales-alola'), 'Ninetales-Alola');
  assert.equal(normalizeSpecies('kommo-o'), 'Kommo-o');
  assert.equal(normalizeSpecies('mr-rime'), 'Mr. Rime');
  assert.equal(normalizeSpecies('urshifu-rapid-strike'), 'Urshifu-Rapid-Strike');
  assert.equal(normalizeSpecies('ogerpon-wellspring'), 'Ogerpon-Wellspring');
  assert.equal(normalizeSpecies('tauros-paldea-combat'), 'Tauros-Paldea-Combat');
});

test('normalizeSpecies: English prefix-style display names', () => {
  assert.equal(normalizeSpecies('Alolan Raichu'), 'Raichu-Alola');
  assert.equal(normalizeSpecies('Hisuian Samurott'), 'Samurott-Hisui');
  assert.equal(normalizeSpecies('Eternal Flower Floette'), 'Floette-Eternal');
  assert.equal(normalizeSpecies('Wash Rotom'), 'Rotom-Wash');
});

test('normalizeSpecies: already-Showdown (Smogon-style) names pass through', () => {
  assert.equal(normalizeSpecies('Basculegion-F'), 'Basculegion-F');
  assert.equal(normalizeSpecies('Kingambit'), 'Kingambit');
  assert.equal(normalizeSpecies('Urshifu-Rapid-Strike'), 'Urshifu-Rapid-Strike');
});

test('normalizeSpecies: resolves through a dex when given one', () => {
  const dex = buildDex(['Floette-Eternal', 'Floette-Mega', 'Garchomp', 'Basculegion-F', 'Kommo-o', 'Mr. Rime']);
  assert.equal(normalizeSpecies('floette-eternal', dex), 'Floette-Eternal');
  assert.equal(normalizeSpecies('basculegion-female', dex), 'Basculegion-F');
  assert.equal(normalizeSpecies('kommo-o', dex), 'Kommo-o');
  assert.equal(normalizeSpecies('mr-rime', dex), 'Mr. Rime');
});

test('megaKey: identifies a species holding its own mega stone', () => {
  const dex = {
    species: {},
    items: {
      Floettite: { mega: 'Floette-Mega', megaOf: 'Floette-Eternal' },
      Swampertite: { mega: 'Swampert-Mega', megaOf: 'Swampert' },
      Meowsticite: { megaMap: { Meowstic: 'Meowstic-M-Mega', 'Meowstic-F': 'Meowstic-F-Mega' } },
    },
  };
  assert.equal(megaKey('Floette-Eternal', 'Floettite', dex), 'Floette-Mega');
  assert.equal(megaKey('Swampert', 'Swampertite', dex), 'Swampert-Mega');
  assert.equal(megaKey('Meowstic-F', 'Meowsticite', dex), 'Meowstic-F-Mega');
});

test('megaKey: a stone on the wrong species is not a Mega', () => {
  const dex = {
    species: {},
    items: { Swampertite: { mega: 'Swampert-Mega', megaOf: 'Swampert' } },
  };
  assert.equal(megaKey('Garchomp', 'Swampertite', dex), null);
  assert.equal(megaKey('Garchomp', 'Life Orb', dex), null);
  assert.equal(megaKey('Garchomp', null, dex), null);
  assert.equal(megaKey('Garchomp', 'Life Orb', null), null);
});
