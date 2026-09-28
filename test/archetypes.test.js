import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES, classify } from '../public/js/lib/archetypes.js';

const dex = {
  species: {
    Torkoal: { types: ['Fire'], bs: [70, 85, 140, 85, 70, 20], abilities: ['Drought', 'White Smoke'] },
    'Indeedee-F': { types: ['Psychic'], bs: [70, 55, 65, 95, 105, 85], abilities: ['Psychic Surge'] },
    Charizard: { types: ['Fire', 'Flying'], bs: [78, 84, 78, 109, 85, 100], abilities: ['Blaze', 'Solar Power'] },
    'Charizard-Mega-Y': { types: ['Fire', 'Flying'], bs: [78, 104, 78, 159, 115, 100], abilities: ['Drought'] },
    'Floette-Eternal': { types: ['Fairy'], bs: [74, 65, 67, 125, 128, 92], abilities: ['Flower Veil'] },
    'Floette-Mega': { types: ['Fairy'], bs: [74, 85, 87, 155, 148, 102], abilities: ['Fairy Aura'] },
    Salamence: { types: ['Dragon', 'Flying'], bs: [95, 135, 80, 110, 80, 100], abilities: ['Intimidate'] },
    'Salamence-Mega': { types: ['Dragon', 'Flying'], bs: [95, 145, 130, 120, 90, 120], abilities: ['Aerilate'] },
    Bronzong: { types: ['Steel', 'Psychic'], bs: [67, 89, 116, 79, 116, 33], abilities: ['Levitate'] },
    Pelipper: { types: ['Water', 'Flying'], bs: [60, 50, 100, 95, 70, 65], abilities: ['Drizzle'] },
    Whimsicott: { types: ['Grass', 'Fairy'], bs: [60, 67, 85, 77, 75, 116], abilities: ['Prankster'] },
    Sneasler: { types: ['Fighting', 'Poison'], bs: [80, 130, 60, 40, 60, 120], abilities: ['Poison Touch', 'Unburden'] },
    Filler: { types: ['Normal'], bs: [80, 80, 80, 80, 80, 80], abilities: ['Run Away'] },
  },
};

function mon(s, extra = {}) {
  return { s, k: s, item: null, ability: null, moves: [], nature: 'Adamant', sp: null, mega: false, ...extra };
}

function makeTeam(mons) {
  const keys = mons.map((m) => m.k);
  return { mons, keys, mega: mons.find((m) => m.mega)?.k ?? null };
}

test('ARCHETYPES: ordered array with id/label/desc/test for each', () => {
  for (const a of ARCHETYPES) {
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.label, 'string');
    assert.equal(typeof a.desc, 'string');
    assert.equal(typeof a.test, 'function');
  }
});

test('classify: sun team (Torkoal, ability Drought)', () => {
  const team = makeTeam([
    mon('Torkoal', { ability: 'Drought' }),
    mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('sun'));
  assert.equal(ids[0], 'sun');
});

test('classify: constructed Big Six team (Charizard-Mega-Y + Floette-Mega)', () => {
  const team = makeTeam([
    mon('Charizard', { k: 'Charizard-Mega-Y', item: 'Charizardite Y', ability: 'Blaze', mega: true }),
    mon('Floette-Eternal', { k: 'Floette-Mega', item: 'Floettite', ability: 'Flower Veil', mega: true }),
    mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('big-six'));
  // Charizard-Mega-Y's *effective* ability is Drought, so this team also
  // reads as "sun" -- co-occurrence is intended, but big-six outranks it.
  assert.ok(ids.includes('sun'));
  assert.equal(ids[0], 'big-six');
});

test('classify: trick room team (2+ slow mons, no Psychic Surge)', () => {
  const team = makeTeam([
    mon('Torkoal', { moves: ['Trick Room', 'Body Press'] }),
    mon('Bronzong'),
    mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('trick-room'));
  assert.ok(!ids.includes('psy-tr'));
});

test('classify: psy-tr team (Psychic Surge + Trick Room user)', () => {
  const team = makeTeam([
    mon('Indeedee-F', { ability: 'Psychic Surge' }),
    mon('Torkoal', { moves: ['Trick Room'] }),
    mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('psy-tr'));
  assert.ok(!ids.includes('trick-room'));
  assert.equal(ids[0], 'psy-tr');
});

test('classify: tailwind team (Tailwind user, no trick room)', () => {
  const team = makeTeam([
    mon('Whimsicott', { moves: ['Tailwind', 'Moonblast'] }),
    mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('tailwind'));
  assert.equal(ids[0], 'tailwind');
});

test('classify: sala-fakeout (Mega Salamence + 2 Fake Out users)', () => {
  const team = makeTeam([
    mon('Salamence', { k: 'Salamence-Mega', item: 'Salamencite', mega: true }),
    mon('Sneasler', { moves: ['Fake Out'] }),
    mon('Filler', { moves: ['Fake Out'] }),
    mon('Filler'), mon('Filler'), mon('Filler'),
  ]);
  const ids = classify(team, dex);
  assert.ok(ids.includes('sala-fakeout'));
  assert.equal(ids[0], 'sala-fakeout');
});

test('classify: rain (Drizzle) and other (no matches)', () => {
  const rainTeam = makeTeam([mon('Pelipper', { ability: 'Drizzle' }), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler')]);
  assert.ok(classify(rainTeam, dex).includes('rain'));

  const plainTeam = makeTeam([mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler'), mon('Filler')]);
  assert.deepEqual(classify(plainTeam, dex), ['other']);
});
