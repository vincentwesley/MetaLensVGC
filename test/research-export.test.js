// Research export + releases (Vin's Atelier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TABLES, buildExport, codebook } from '../scripts/lib/research-export.js';
import { parseArgs, defaultRegs } from '../scripts/release.js';
import { ARCHETYPE_RULESET } from '../public/js/lib/archetypes.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const dex = read('dex.json');

test('every CSV header is exactly its codebook entry, and the codebook documents every column', () => {
  const out = buildExport([{ reg: 'M-C', teams: read('teams-M-C.json') }], dex);
  const cb = codebook();
  for (const [name, t] of Object.entries(TABLES)) {
    assert.equal(out[name].split('\n')[0], t.columns.map((c) => c[0]).join(','), name);
    assert.ok(cb.includes(`## ${name}`), name);
    for (const [col] of t.columns) assert.ok(cb.includes(`\`${col}\``), `${name}.${col}`);
  }
  assert.ok(cb.includes(`Archetype rule set ${ARCHETYPE_RULESET.version}`));
});

test('export: no names, no ranked data; row counts match the teams file; deterministic', () => {
  const file = read('teams-M-C.json');
  const out = buildExport([{ reg: 'M-C', teams: file }], dex);
  const rows = (n) => out[n].trimEnd().split('\n').length - 1;
  assert.equal(rows('teams.csv'), file.teams.length);
  assert.equal(rows('matches.csv'), file.matches.length);
  assert.equal(rows('events.csv'), file.events.length);
  assert.equal(rows('team_archetypes.csv'), file.teams.length);
  const names = new Set(file.teams.map((t) => t[1]).filter((n) => n.length > 6 && /\s/.test(n)).slice(0, 200));
  for (const n of names) assert.ok(!out['teams.csv'].includes(n), `display name leaked: ${n}`);
  assert.deepEqual(buildExport([{ reg: 'M-C', teams: file }], dex), out);
  const src = readFileSync(new URL('../scripts/lib/research-export.js', import.meta.url), 'utf8');
  assert.ok(!/ranked-|ladder-/.test(src.replace(/\/\/.*$/gm, '').replace(/'[^']*'/g, (s) => (/ranked-|ladder-/.test(s) ? s : ''))),
    'research-export.js must not read ranked-/ladder- files');
});

test('release: args, default scope = ended regulations only', () => {
  assert.deepEqual(parseArgs(['build', 'data-v1.0', '--regs', 'M-A,M-B,M-C', '--allow-no-pids']),
    { cmd: 'build', version: 'data-v1.0', regs: ['M-A', 'M-B', 'M-C'], out: 'dist', allowNoPids: true });
  assert.deepEqual(defaultRegs('2026-12-04'), ['M-A', 'M-B', 'M-C']); // M-D is open-ended: never frozen by default
  assert.deepEqual(defaultRegs('2026-11-24'), ['M-A', 'M-B']);
});

test('committed release records are complete and immutable-looking', () => {
  const dir = new URL('../releases/', import.meta.url);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.equal(`${r.version}.json`, f);
    assert.match(r.commit, /^[0-9a-f]{40}$/);
    assert.ok(r.regulations.length && r.archetypeRules.version && r.sources.length);
    for (const [name, sum] of Object.entries(r.files)) assert.match(sum, /^[0-9a-f]{64}$/, name);
    for (const t of Object.keys(TABLES)) assert.ok(r.files[t], `${f} lacks ${t}`);
    assert.ok(!Object.keys(r.files).some((n) => /ranked|ladder/.test(n)), `${f} must not ship ranked/ladder data`);
  }
});
