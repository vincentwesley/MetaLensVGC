// Research export + releases (Vin's Atelier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TABLES, tablesFor, buildExport, codebook } from '../scripts/lib/research-export.js';
import { parseArgs, defaultRegs, countryRecord } from '../scripts/release.js';
import { REGIONS, REGION_MIN_GROUP, regionOf, countryColumn, checkPolicy, RELEASE_COUNTRY_POLICIES } from '../scripts/lib/geo-regions.js';
import { ARCHETYPE_RULESET } from '../public/js/lib/archetypes.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const dex = read('dex.json');

test('every CSV header is exactly its codebook entry, and the codebook documents every column (every country policy)', () => {
  for (const country of ['drop', 'region', 'raw']) {
  const out = buildExport([{ reg: 'M-C', teams: read('teams-M-C.json') }], dex, { country });
  const cb = codebook({ country });
  assert.ok(cb.includes('## Country policy'), country);
  for (const [name, t] of Object.entries(tablesFor(country))) {
    assert.equal(out[name].split('\n')[0], t.columns.map((c) => c[0]).join(','), name);
    assert.ok(cb.includes(`## ${name}`), name);
    for (const [col] of t.columns) assert.ok(cb.includes(`\`${col}\``), `${name}.${col}`);
  }
  assert.ok(cb.includes(`Archetype rule set ${ARCHETYPE_RULESET.version}`));
  }
});

test('country policy: drop (default) leaves no country or region anywhere; region maps every code and suppresses small groups', () => {
  const file = read('teams-M-C.json');
  const dropped = buildExport([{ reg: 'M-C', teams: file }], dex);
  const header = dropped['teams.csv'].split('\n')[0].split(',');
  assert.ok(!header.includes('country') && !header.includes('region'));
  assert.deepEqual(dropped.countryStats, { policy: 'drop' });
  assert.ok(!/country/.test(TABLES['teams.csv'].columns.map((c) => c[0]).join()), 'default schema has no country column');

  // Every country code in the committed data has a region.
  for (const reg of ['M-A', 'M-B', 'M-C']) {
    for (const row of read(`teams-${reg}.json`).teams) if (row[2]) assert.ok(regionOf(row[2]), `${reg}: no region for ${row[2]}`);
  }
  const codes = Object.values(REGIONS).flatMap((r) => r.codes.split(' '));
  assert.equal(new Set(codes).size, codes.length, 'a code sits in one region only');

  const out = buildExport([{ reg: 'M-C', teams: file }], dex, { country: 'region' });
  const rows = out['teams.csv'].trimEnd().split('\n').slice(1).map((l) => l.split(','));
  const evIdx = header.indexOf('event_id');
  const ids = new Set(Object.keys(REGIONS));
  const groups = new Map();
  for (const r of rows) {
    const v = r.at(-1);
    assert.ok(v === '' || v === 'suppressed' || ids.has(v), v);
    if (ids.has(v)) groups.set(`${r[evIdx]}|${v}`, (groups.get(`${r[evIdx]}|${v}`) || 0) + 1);
  }
  for (const [k, n] of groups) assert.ok(n >= REGION_MIN_GROUP, `${k} published with ${n} lists`);
  assert.ok(out.countryStats.suppressed > 0 && out.countryStats.unmapped === 0);
  assert.ok(!/(^|,)(US|BR|IT|GB)(,|$)/m.test(out['teams.csv']), 'no ISO code in a region export');
  assert.deepEqual(buildExport([{ reg: 'M-C', teams: file }], dex, { country: 'region' }), out, 'deterministic');
});

test('country policy: units (suppression by event, unmapped codes, raw only outside releases)', () => {
  const t = (ev, country) => ({ ev: { id: ev }, country });
  const teams = [...Array(REGION_MIN_GROUP).fill(0).map(() => t('a', 'FR')), t('a', 'ZA'), t('b', 'FR'), t('a', ''), t('a', 'QQ')];
  const { values, stats } = countryColumn(teams, 'region');
  assert.deepEqual(values, [...Array(REGION_MIN_GROUP).fill('europe'), 'suppressed', 'suppressed', '', '']);
  assert.deepEqual(stats, { policy: 'region', suppressed: 2, unmapped: 1 });
  assert.equal(regionOf('uk'), 'europe');
  assert.equal(countryColumn(teams, 'drop').values, null);
  assert.deepEqual(RELEASE_COUNTRY_POLICIES, ['drop', 'region']);
  assert.throws(() => checkPolicy('raw', RELEASE_COUNTRY_POLICIES));
  assert.deepEqual(countryRecord({ policy: 'drop' }).policy, 'drop');
  assert.equal(countryRecord({ policy: 'region', suppressed: 3, unmapped: 0 }).minGroup, REGION_MIN_GROUP);
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
    { cmd: 'build', version: 'data-v1.0', regs: ['M-A', 'M-B', 'M-C'], out: 'dist', allowNoPids: true, country: 'drop' });
  assert.equal(parseArgs(['build', 'data-v1.0', '--country', 'region']).country, 'region');
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
    assert.ok(RELEASE_COUNTRY_POLICIES.includes(r.country?.policy), `${f} must record a release country policy`);
    assert.ok(!Object.keys(r.files).some((n) => /ranked|ladder/.test(n)), `${f} must not ship ranked/ladder data`);
  }
});
