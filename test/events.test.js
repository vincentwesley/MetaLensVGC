import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEvents } from '../public/js/lib/events.js';

const ev = (id, date, name = id) => ({ id, name, date, tier: 'online' });
const team = (e, player, placing, arch = 'a') => ({ ev: e, id: `${e.id}:${player}`, player, placing, arch: [arch], mons: [] });

test('groupEvents: groups by event, newest first, counts teams in view', () => {
  const a = ev('a', '2026-09-01'), b = ev('b', '2026-10-01');
  const g = groupEvents([team(a, 'x', 2), team(b, 'y', 1), team(a, 'z', 1)]);
  assert.deepEqual(g.map((e) => [e.id, e.n]), [['b', 1], ['a', 2]]);
});

test('groupEvents: winner is place 1 only; null when absent or placing missing', () => {
  const a = ev('a', '2026-09-01'), b = ev('b', '2026-09-02');
  const g = groupEvents([team(a, 'x', 2), team(b, 'y', null), team(b, 'w', 1), team(b, 'v', 1)]);
  assert.equal(g.find((e) => e.id === 'a').winner, null);
  assert.equal(g.find((e) => e.id === 'b').winner.player, 'w'); // tie: first listed
});

test('groupEvents: archetype mix uses best 8 placed teams, sorted, no NaN', () => {
  const a = ev('a', '2026-09-01');
  const ts = [];
  for (let i = 1; i <= 10; i++) ts.push(team(a, `p${i}`, i, i <= 5 ? 'tr' : 'rain'));
  ts.push(team(a, 'unplaced', null, 'zzz'));
  const [g] = groupEvents(ts);
  assert.deepEqual(g.mix, [{ id: 'tr', n: 5 }, { id: 'rain', n: 3 }]);
  assert.equal(g.n, 11);
});

test('groupEvents: no placings gives an empty mix; empty input gives []', () => {
  assert.deepEqual(groupEvents([team(ev('a', ''), 'x', null)])[0].mix, []);
  assert.deepEqual(groupEvents([]), []);
});
