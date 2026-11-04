import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../scripts/build-pokedex.js';
import { showdownDex } from '../scripts/dex.js';

test('vgc build keeps `seen` species the mod marks Past/Illegal, tier left unset', () => {
  const dex = showdownDex();
  const past = dex.species.all().find((s) => s.exists && s.baseStats && s.isNonstandard === 'Past' && !s.isMega && !/^(CAP|Custom)/.test(s.isNonstandard));
  assert.ok(past, 'mod has a Past species');
  assert.ok(!build(dex, { natdex: false }).species[past.name]);
  const r = build(dex, { natdex: false, seen: new Set([past.name]) });
  assert.ok(r.species[past.name]);
  assert.equal(r.species[past.name].tier, undefined);
  assert.ok(r.learn[past.id].length);
});

test('seenFrom: ranked, ladder and MIN_SHEETS+ sheets count; stray sheets do not', async () => {
  const { seenFrom, MIN_SHEETS } = await import('../scripts/build-pokedex.js');
  const teams = [...Array(MIN_SHEETS)].map(() => ({ keys: ['Sneasler'] })).concat([{ keys: ['Calyrex-Shadow'] }]);
  const s = seenFrom({ ranked: { seasons: [{ ranking: ['Houndstone'] }] }, ladder: { months: { a: { mons: { 'Sceptile-Mega': {} } } } }, teams });
  assert.deepEqual([...s].sort(), ['Houndstone', 'Sceptile-Mega', 'Sneasler']);
});
