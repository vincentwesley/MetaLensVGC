// Smogon sample teams + sets (v1.9.0, Showdown formats).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { statArray, sampleMon as rawMon, sampleTeams as rawTeams, smogonSets } from '../scripts/sources/smogon-sets.js';
import { sampleTeams, filterSampleTeams, setsFor, setMon } from '../public/js/lib/samples.js';
import { toPaste } from '../public/js/lib/paste.js';
import { RULES } from '../public/js/lib/stats.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const dexNat = read('dex-natdex.json');

test('smogon-sets normalizer: stat arrays, IVs only when not all 31, unnamed teams, set option lists', () => {
  assert.deepEqual(statArray({ hp: 252, spe: 4 }), [252, 0, 0, 0, 0, 4]);
  assert.equal(statArray({}), null);
  const m = rawMon({ species: 'Regieleki', item: 'Light Clay', ability: 'Transistor', teraType: 'Ghost', evs: { hp: 64, spe: 100 }, nature: 'Timid', ivs: { atk: 0 }, moves: ['Electroweb', 'Reflect'] });
  assert.deepEqual(m, { species: 'Regieleki', item: 'Light Clay', ability: 'Transistor', tera: 'Ghost', nature: 'Timid', evs: [64, 0, 0, 0, 0, 100], ivs: [31, 0, 31, 31, 31, 31], moves: ['Electroweb', 'Reflect'] });
  assert.equal(rawMon({ species: 'X', ivs: { atk: 31 } }).ivs, null);
  assert.deepEqual(rawTeams([{ author: 'a', data: [{ species: 'Mew' }] }, { name: 'Empty', data: [] }]).map((t) => t.name), ['Untitled team']);
  const sets = smogonSets({ Charizard: { 'Sun Attacker': { moves: ['Heat Wave', ['Scorching Sands', 'Weather Ball']], item: 'Charizardite Y', nature: ['Timid', 'Modest'], evs: [{ spa: 252, spe: 252 }], ivs: { atk: 0 }, teratypes: 'Fire' } } });
  assert.deepEqual(sets.Charizard[0].moves, ['Heat Wave', ['Scorching Sands', 'Weather Ball']]);
  assert.deepEqual(sets.Charizard[0].item, ['Charizardite Y']);
  assert.deepEqual(sets.Charizard[0].evs, [[0, 0, 0, 252, 0, 252]]);
  assert.deepEqual(sets.Charizard[0].tera, ['Fire']);
});

test('sample teams: Mega form keys from the item, species chips keep teams using the Pokémon, Showdown paste with EVs/IVs/Tera', () => {
  const samples = { teams: [{ name: 'Sun', author: 'me', mons: [
    { species: 'Charizard', item: 'Charizardite Y', ability: 'Blaze', tera: null, nature: 'Timid', evs: [0, 0, 4, 252, 0, 252], ivs: [31, 0, 31, 31, 31, 31], moves: ['Heat Wave', 'Protect'] },
    { species: 'Incineroar', item: 'Sitrus Berry', ability: 'Intimidate', tera: 'Grass', nature: 'Careful', evs: [252, 0, 4, 0, 252, 0], ivs: null, moves: ['Fake Out'] },
  ] }] };
  const [t] = sampleTeams(samples, dexNat);
  assert.deepEqual(t.keys, ['Charizard-Mega-Y', 'Incineroar']);
  assert.equal(filterSampleTeams([t], (k) => k === 'Incineroar').length, 1);
  assert.equal(filterSampleTeams([t], (k) => k === 'Garchomp').length, 0);
  const paste = toPaste({ mons: t.mons }, dexNat, RULES.ev);
  assert.match(paste, /^Charizard @ Charizardite Y\nAbility: Blaze\nLevel: 100\nEVs: 4 Def \/ 252 SpA \/ 252 Spe\nTimid Nature\nIVs: 0 Atk\n- Heat Wave/);
  assert.match(paste, /Tera Type: Grass/);
  assert.ok(!/IVs:/.test(toPaste({ mons: t.mons }, dexNat, RULES.sp)), 'no IVs line in Champions pastes');
});

test('setsFor: own entry, else the base species (Mega forms); setMon picks the first option', () => {
  const samples = { sets: { Charizard: [{ name: 'Sun', moves: ['Heat Wave', ['Solar Beam', 'Overheat']], item: ['Charizardite Y'], ability: ['Blaze'], nature: ['Timid'], evs: [[0, 0, 0, 252, 4, 252]], ivs: null, tera: [] }] } };
  assert.equal(setsFor(samples, 'Charizard-Mega-Y', dexNat).length, 1);
  assert.equal(setsFor(samples, 'Garchomp', dexNat).length, 0);
  const m = setMon('Charizard', samples.sets.Charizard[0]);
  assert.deepEqual(m.moves, ['Heat Wave', 'Solar Beam']);
  assert.equal(m.item, 'Charizardite Y');
});

test('committed samples files: teams with 1-6 Pokémon known to the NatDex dex, credit and Smogon link', () => {
  for (const reg of ['ND', 'NDD']) {
    if (!existsSync(new URL(`../public/data/samples-${reg}.json`, import.meta.url))) continue;
    const s = read(`samples-${reg}.json`);
    assert.ok(s.teams.length > 0 && /smogon\.com/.test(s.source.smogon) && /Smogon/.test(s.credit), reg);
    for (const t of s.teams) {
      assert.ok(t.mons.length >= 1 && t.mons.length <= 6 && t.name, `${reg} ${t.name}`);
      for (const m of t.mons) assert.ok(dexNat.species[m.species], `${reg}: ${m.species} not in dex-natdex`);
    }
  }
});
