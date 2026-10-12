import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestData, digestText } from '../public/js/lib/digest.js';

const team = (keys) => ({ reg: 'M-C', date: '2026-10-01', species: new Set(keys), keys, w: 1, l: 0, mons: keys.map((k) => ({ k, item: 'Life Orb' })) });
const mk = (n, keys) => Array.from({ length: n }, () => team(keys));
const manifest = { generated: '2026-10-12T00:00:00Z', regs: [{ id: 'M-C', label: 'Reg M-C' }] };
const state = { reg: 'M-C', source: 'tournaments', minN: 1, from: '', to: '' };

test('digestText exact output', () => {
  const d = {
    regLabel: 'Reg M-C', sourceLabel: 'Tournaments', n: 1200, unit: 'teams', range: '2026-09-09 to 2026-10-11', updated: '2026-10-12',
    top: [{ key: 'Incineroar', text: '45.0%' }, { key: 'Rillaboom', text: '30.0%' }],
    risers: [{ key: 'Rillaboom', text: '30.0% (+2.0pt)' }], fallers: [], compare: 'vs the prior period',
    item: { mon: 'Incineroar', item: 'Safety Goggles', text: '40.0%' }, arch: null, empty: null, note: null,
  };
  assert.equal(digestText(d), [
    'MetaLens VGC weekly digest: Reg M-C',
    'Tournaments | 1,200 teams | 2026-09-09 to 2026-10-11 | data updated 2026-10-12',
    '', 'Top 5 by usage', '1. Incineroar 45.0%', '2. Rillaboom 30.0%',
    '', 'Biggest risers (vs the prior period)', 'Rillaboom 30.0% (+2.0pt)',
    '', 'Biggest fallers (vs the prior period)', 'none',
    '', 'Most common item on Incineroar: Safety Goggles (40.0%)',
  ].join('\n'));
});

test('no previous period: no risers, says so', () => {
  const teams = [...mk(3, ['A', 'B']), ...mk(1, ['A', 'C'])];
  const d = digestData({ state, manifest, monTeams: teams, prev: [], reg: 'M-C' });
  assert.equal(d.compare, null);
  assert.deepEqual(d.risers, []);
  assert.deepEqual(d.top.map((r) => r.key), ['A', 'B', 'C']);
  assert.equal(d.top[0].text, '100.0%');
  assert.equal(d.item.item, 'Life Orb');
  assert.match(digestText(d), /No previous period yet/);
  assert.doesNotMatch(digestText(d), /NaN/);
});

test('risers and fallers from the previous period', () => {
  const cur = [...mk(6, ['A']), ...mk(4, ['B'])];
  const prev = [...mk(3, ['A']), ...mk(7, ['B'])];
  const d = digestData({ state, manifest, monTeams: cur, prev, reg: 'M-C' });
  assert.equal(d.risers[0].key, 'A');
  assert.equal(d.risers[0].text, '60.0% (+30.0pt)');
  assert.equal(d.fallers[0].key, 'B');
});

test('empty view says what is missing', () => {
  const d = digestData({ state, manifest, monTeams: [], prev: [], reg: 'M-C' });
  assert.ok(d.empty);
  assert.match(digestText(d), /No tournament teams/);
});

test('ladder: month-over-month movers', () => {
  const mon = (usage) => ({ usage, raw: 100, items: { lifeorb: 1 } });
  const ladder = { cutoff: 1760, months: [
    { month: '2026-08', battles: 100, mons: { A: mon(0.5), B: mon(0.2) } },
    { month: '2026-09', battles: 100, mons: { A: mon(0.3), B: mon(0.4) } },
  ] };
  const d = digestData({ state: { ...state, source: 'ladder' }, manifest, ladder, dex: {}, reg: 'M-C' });
  assert.equal(d.unit, 'battles');
  assert.equal(d.risers[0].key, 'B');
  assert.equal(d.fallers[0].key, 'A');
  assert.equal(d.compare, '2026-08 to 2026-09');
});
