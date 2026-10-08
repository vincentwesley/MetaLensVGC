import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'));
const dex = { vgc: rd('pokedex-vgc'), natdex: rd('pokedex-natdex') };
const ls = { vgc: rd('learnsets-vgc'), natdex: rd('learnsets-natdex') };

for (const k of ['vgc', 'natdex']) {
  test(`${k}: Garchomp, Charizard-Mega-Y, abilities, tiers`, () => {
    assert.deepEqual(dex[k].species.Garchomp.bs, [108, 130, 95, 80, 85, 102]);
    assert.ok(dex[k].species['Charizard-Mega-Y']);
    for (const [n, s] of Object.entries(dex[k].species)) {
      assert.ok(Object.keys(s.abilities).length, n);
      assert.ok(!s.tier || dex[k].tierOrder.includes(s.tier), n);
    }
  });
}

test('natdex is larger than vgc', () => {
  assert.ok(Object.keys(dex.natdex.species).length > Object.keys(dex.vgc.species).length);
});

test('learnsets: Fake Out for Incineroar, natdex-only species present', () => {
  for (const k of ['vgc', 'natdex']) assert.ok(ls[k].learn.incineroar.includes('fakeout'));
  const only = Object.keys(dex.natdex.species).find((n) => !dex.vgc.species[n]);
  assert.ok(only);
  assert.ok(ls.natdex.learn[only.toLowerCase().replace(/[^a-z0-9]/g, '')]?.length);
});
