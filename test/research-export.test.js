// Research export + releases (Vin's Atelier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TABLES, tablesFor, buildExport, codebook, confirmationSplit, eventSizes, outsizedEvents, buildAggregates, AGG_TABLES, releaseTables, limitations, PAPER, LICENCE } from '../scripts/lib/research-export.js';
import { decode } from '../public/js/lib/aggregate.js';
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
    { cmd: 'build', version: 'data-v1.0', regs: ['M-A', 'M-B', 'M-C'], out: 'dist', allowNoPids: true, country: 'drop', aggregatesOnly: false, splitSeed: null });
  assert.deepEqual(parseArgs(['build', 'data-v1.0', '--aggregates-only', '--split-seed', 'ab12']).splitSeed, 'ab12');
  assert.equal(parseArgs(['build', 'data-v1.0', '--aggregates-only']).aggregatesOnly, true);
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

test('effective_ability: the Mega form ability for a holder of its own stone, the listed one otherwise', () => {
  const out = buildExport([{ reg: 'M-C', teams: read('teams-M-C.json') }], dex);
  const lines = out['team_members.csv'].trimEnd().split('\n');
  const h = lines[0].split(',');
  const col = (r, c) => r[h.indexOf(c)];
  const rows = lines.slice(1).map((l) => l.split(','));
  const mega = rows.find((r) => col(r, 'form') === 'Charizard-Mega-Y');
  assert.ok(mega, 'fixture has a Charizard-Mega-Y');
  assert.equal(col(mega, 'effective_ability'), 'Drought');
  assert.equal(col(mega, 'holds_own_mega_stone'), '1');
  const plain = rows.find((r) => col(r, 'holds_own_mega_stone') === '0' && col(r, 'ability'));
  assert.equal(col(plain, 'effective_ability'), col(plain, 'ability'));
  for (const r of rows) if (col(r, 'holds_own_mega_stone') === '1') assert.equal(col(r, 'effective_ability'), dex.species[col(r, 'form')].abilities[0]);
});

test('confirmation split: whole events, size blocks of 10, outsized events explore, 28-32% of decided matches per regulation and overall', () => {
  const regs = ['M-A', 'M-B', 'M-C'].map((reg) => ({ reg, events: eventSizes(read(`teams-${reg}.json`)) }));
  const a = confirmationSplit(regs, 'seed-1');
  assert.deepEqual(confirmationSplit(regs, 'seed-1'), a, 'deterministic');
  const split = new Map(a.rows.map((r) => [r.event_id, r.split]));
  for (const { reg, events } of regs) {
    assert.equal(a.rows.filter((r) => r.regulation === reg).length, events.length, 'every event once');
    const out = outsizedEvents(events);
    for (const id of out) assert.equal(split.get(id), 'explore', `${id} outsized -> explore`);
    // size blocks: exactly round(0.3 x block) confirm in each block of 10 (by team count)
    const pool = events.filter((e) => !out.has(e.id)).sort((x, y) => y.teams - x.teams || (x.id < y.id ? -1 : 1));
    for (let i = 0; i < pool.length; i += 10) {
      const blk = pool.slice(i, i + 10);
      assert.equal(blk.filter((e) => split.get(e.id) === 'confirm').length, Math.round(blk.length * 0.3), `${reg} block ${i / 10}`);
    }
    const d = pool.reduce((n, e) => n + e.decided, 0);
    const dc = pool.filter((e) => split.get(e.id) === 'confirm').reduce((n, e) => n + e.decided, 0);
    assert.ok(dc / d >= 0.28 && dc / d <= 0.32, `${reg} ${dc / d}`);
    assert.equal(a.shares[reg].confirmMatchShare, Math.round((dc / d) * 10000) / 10000);
  }
  assert.ok(a.shares.overall.confirmMatchShare >= 0.28 && a.shares.overall.confirmMatchShare <= 0.32);
  assert.ok(Number.isInteger(a.draw) && a.draw >= 0);
  const b = confirmationSplit(regs, 'seed-2');
  assert.notDeepEqual(b.rows.map((r) => r.split), a.rows.map((r) => r.split), 'another seed draws another split');
  assert.throws(() => confirmationSplit(regs, ''));
});

test('confirmation split redraws until the band holds (synthetic: draw 0 can fail), and records how many', () => {
  // 40 events (each < 5% of teams, so none outsized) with uneven decided-match counts: many draws miss 28-32%
  const events = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, teams: 100 - i, decided: i % 10 === 0 ? 400 : 20 + i }));
  const res = confirmationSplit([{ reg: 'X', events }], 'redraw-seed');
  assert.ok(res.shares.X.confirmMatchShare >= 0.28 && res.shares.X.confirmMatchShare <= 0.32);
  const draws = Array.from({ length: 20 }, (_, k) => confirmationSplit([{ reg: 'X', events }], `s${k}`).draw);
  assert.ok(draws.some((d) => d > 0), 'some seeds need redraws');
  assert.throws(() => confirmationSplit([{ reg: 'X', events: [{ id: 'a', teams: 10, decided: 10 }, { id: 'b', teams: 10, decided: 10 }] }], 's'), /no confirmation split/);
});

test('outsized_event: exactly the two Grand Champions Festival events in M-A..M-C, from the size rule (no hardcoded ids)', () => {
  const flagged = [];
  for (const reg of ['M-A', 'M-B', 'M-C']) {
    const file = read(`teams-${reg}.json`);
    const out = outsizedEvents(eventSizes(file));
    for (const e of file.events) if (out.has(e.id)) flagged.push(e.name);
    const csv = buildExport([{ reg, teams: file }], dex)['events.csv'].trimEnd().split('\n');
    const h = csv[0].split(',');
    const n = csv.slice(1).filter((l) => l.split(',')[h.indexOf('outsized_event')] === '1').length;
    assert.equal(n, out.size, reg);
  }
  assert.equal(flagged.length, 2);
  assert.ok(flagged.every((n) => /Grand Champions Festival/.test(n)), flagged.join(' | '));
});

test('aggregates: no pids or team ids; totals agree with the row-level data; matchups counted from both sides', () => {
  const file = read('teams-M-C.json');
  const ids = file.events.map((e) => e.id);
  const split = new Map(confirmationSplit([{ reg: 'M-C', events: eventSizes(file) }], 's').rows.map((r) => [r.event_id, r.split]));
  const out = buildAggregates([{ reg: 'M-C', teams: file }], dex, (id) => split.get(id));
  for (const [name, t] of Object.entries(AGG_TABLES)) assert.equal(out[name].split('\n')[0], t.columns.map((c) => c[0]).join(','), name);
  const all = Object.values(out).join('\n');
  assert.ok(!file.teams.slice(0, 500).some((r) => r[8] && all.includes(r[8])), 'no pid in aggregates');
  assert.ok(!/M-C-\d/.test(all), 'no team ids');
  const parse = (n) => { const [h, ...rs] = out[n].trimEnd().split('\n').map((l) => l.split(',')); return rs.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const { teams, matches } = decode(file, dex);
  // primary archetype counts sum to the number of teams; week_teams sums to it once per (week, split)
  const arch = parse('agg_usage_archetype.csv');
  assert.equal(arch.reduce((n, r) => n + +r.teams_primary, 0), teams.length);
  assert.equal(arch.reduce((n, r) => n + +r.teams_matching, 0), teams.reduce((n, t) => n + t.arch.length, 0));
  const weeks = new Map(arch.map((r) => [`${r.week}|${r.split}`, +r.week_teams]));
  assert.equal([...weeks.values()].reduce((a, b) => a + b, 0), teams.length);
  const rill = parse('agg_usage_species.csv').filter((r) => r.form === 'Rillaboom').reduce((n, r) => n + +r.teams, 0);
  assert.equal(rill, teams.filter((t) => t.keys.includes('Rillaboom')).length);
  const mu = parse('agg_archetype_matchups.csv').filter((r) => r.counting === 'primary');
  const linked = matches.filter((m) => teams[m.a] && teams[m.b]);
  assert.equal(mu.reduce((n, r) => n + +r.matches, 0), 2 * linked.length, 'each match from both sides');
  assert.equal(mu.reduce((n, r) => n + +r.wins, 0), mu.reduce((n, r) => n + +r.losses, 0));
  assert.deepEqual(buildAggregates([{ reg: 'M-C', teams: file }], dex, (id) => split.get(id)), out, 'deterministic');
});

test('codebook: paper, attribution, licence pending, limitations, split section; aggregates codebook lists only aggregate tables', () => {
  const split = { seed: 'abc', redraws: 2, sha256: 'f'.repeat(64), shares: { 'M-C': { events: 10, explore: 7, confirm: 3, outsized: 0, confirmTeamShare: 0.3, confirmMatchShare: 0.3, confirmMatchShareAll: 0.3 } } };
  const cb = codebook({ split, onlineShare: 0.981 });
  for (const s of [PAPER.title, 'Vincent Wesley', 'in preparation', LICENCE, 'About 98%', 'four brought', 'pseudonymized, not anonymous', '## Confirmation split', 'f'.repeat(64), 'confirmation_split.csv']) assert.ok(cb.includes(s), s);
  assert.equal(limitations(0.981).length, 4);
  const agg = codebook({ content: 'aggregates', split, onlineShare: 0.98 });
  assert.ok(agg.includes('## agg_usage_species.csv') && !agg.includes('## teams.csv') && !agg.includes('## matches.csv'));
  assert.deepEqual(Object.keys(releaseTables({ content: 'aggregates' })), ['events.csv', ...Object.keys(AGG_TABLES)]);
});
