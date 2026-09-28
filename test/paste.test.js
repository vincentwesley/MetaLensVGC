import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaste, parsePaste } from '../public/js/lib/paste.js';

const dex = {
  items: {
    'Charizardite Y': { mega: 'Charizard-Mega-Y', megaOf: 'Charizard' },
    'Choice Scarf': {},
  },
};

function sampleTeam() {
  return {
    mons: [
      {
        s: 'Garchomp', k: 'Garchomp', item: 'Choice Scarf', ability: 'Rough Skin',
        moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
        nature: 'Jolly', sp: [0, 0, 0, 0, 2, 32], mega: false,
      },
      {
        s: 'Charizard', k: 'Charizard-Mega-Y', item: 'Charizardite Y', ability: 'Blaze',
        moves: ['Heat Wave', 'Solar Beam', 'Weather Ball', 'Protect'],
        nature: 'Modest', sp: null, mega: true,
      },
    ],
  };
}

test('toPaste: formats species @ item, ability, level, EVs (SP), nature, moves', () => {
  const text = toPaste(sampleTeam(), dex);
  const [garchomp, charizard] = text.split('\n\n');
  assert.equal(garchomp, [
    'Garchomp @ Choice Scarf',
    'Ability: Rough Skin',
    'Level: 50',
    'EVs: 2 SpD / 32 Spe',
    'Jolly Nature',
    '- Earthquake',
    '- Dragon Claw',
    '- Rock Slide',
    '- Protect',
  ].join('\n'));
  // Uses the battle species (s), never the Mega form (k).
  assert.ok(charizard.startsWith('Charizard @ Charizardite Y'));
  assert.ok(!charizard.includes('Charizard-Mega-Y'));
  // No SP data -> no EVs line at all.
  assert.ok(!charizard.includes('EVs:'));
});

test('parsePaste: round-trips species/item/ability/moves/nature/SP', () => {
  const team = sampleTeam();
  const text = toPaste(team, dex);
  const mons = parsePaste(text, dex);
  assert.equal(mons.length, 2);

  assert.equal(mons[0].s, 'Garchomp');
  assert.equal(mons[0].k, 'Garchomp');
  assert.equal(mons[0].item, 'Choice Scarf');
  assert.equal(mons[0].ability, 'Rough Skin');
  assert.deepEqual(mons[0].moves, team.mons[0].moves);
  assert.equal(mons[0].nature, 'Jolly');
  assert.deepEqual(mons[0].sp, [0, 0, 0, 0, 2, 32]);
  assert.equal(mons[0].mega, false);

  assert.equal(mons[1].s, 'Charizard');
  assert.equal(mons[1].k, 'Charizard-Mega-Y'); // derived from held Charizardite Y
  assert.equal(mons[1].mega, true);
  assert.equal(mons[1].sp, null);
});

test('parsePaste: handles nickname, gender marker, missing item', () => {
  const text = [
    'Sparky (Raichu) (M)',
    'Ability: Static',
    'Level: 50',
    'Jolly Nature',
    '- Thunderbolt',
  ].join('\n');
  const [mon] = parsePaste(text, dex);
  assert.equal(mon.s, 'Raichu');
  assert.equal(mon.item, null);
  assert.equal(mon.ability, 'Static');
  assert.equal(mon.nature, 'Jolly');
  assert.deepEqual(mon.moves, ['Thunderbolt']);
});

test('parsePaste: EV value above 32 is a classic spread, sp -> null', () => {
  const text = [
    'Garchomp @ Life Orb',
    'Ability: Rough Skin',
    'Level: 50',
    'EVs: 252 Atk / 4 SpD / 252 Spe',
    'Jolly Nature',
    '- Earthquake',
  ].join('\n');
  const [mon] = parsePaste(text, dex);
  assert.equal(mon.sp, null);
});

test('parsePaste: SPs: line, IVs/Tera Type/Shiny ignored', () => {
  const text = [
    'Garchomp @ Life Orb',
    'Ability: Rough Skin',
    'Level: 50',
    'Shiny: Yes',
    'Tera Type: Ground',
    'IVs: 0 Atk',
    'SPs: 32 Atk / 32 Spe',
    'Jolly Nature',
    '- Earthquake',
    '- Protect',
  ].join('\n');
  const [mon] = parsePaste(text, dex);
  assert.deepEqual(mon.sp, [0, 32, 0, 0, 0, 32]);
  assert.deepEqual(mon.moves, ['Earthquake', 'Protect']);
});
