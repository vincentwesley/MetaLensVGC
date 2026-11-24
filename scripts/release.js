#!/usr/bin/env node
// Frozen, versioned research data releases (Vin's Atelier).
//
//   node scripts/release.js build  data-v1.0 [--regs M-A,M-B,M-C] [--out dist] [--allow-no-pids] [--country drop|region]
//       Builds dist/<version>/ from the committed public/data at HEAD: the CSV export + CODEBOOK.md, quality files,
//       README, CITATION.cff, .zenodo.json and RELEASE.json (provenance + SHA-256 of every file). Deterministic.
//   node scripts/release.js freeze data-v1.0 [...build options]
//       build, then write releases/<version>.json (the RELEASE.json record) and create the annotated git tag <version>.
//       Refuses if the record or the tag already exists, or if tracked files have uncommitted changes.
//   node scripts/release.js verify data-v1.0
//       Rebuilds the release from its tag in a temporary worktree and checks every checksum against the record.
//
// --country (default drop): the sheet's country is left out (drop) or grouped into world regions with small groups
// suppressed (region); see scripts/lib/geo-regions.js. The country as published is never released. RELEASE.json
// records the policy, and verify rebuilds with the same one.
// The release never contains ranked-<REG>.json (Pokémon Champions Battle Data forbids redistribution) or the Smogon
// ladder files. Archive the built folder on Zenodo by upload, not through the GitHub integration, which would archive the
// whole repository including those files.
import { readFile, writeFile, mkdir, rm, readdir, copyFile, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { writeExport } from './lib/research-export.js';
import { ARCHETYPE_RULESET } from '../public/js/lib/archetypes.js';
import { REGULATIONS, VGC_IDS } from './lib/regs.js';
import { DEFAULT_COUNTRY_POLICY, RELEASE_COUNTRY_POLICIES, REGION_MIN_GROUP, REGION_SCHEME, checkPolicy } from './lib/geo-regions.js';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'public', 'data');
const VERSION_RE = /^data-v\d+\.\d+(\.\d+)?$/;
const AUTHOR = { name: 'Wesley, Vincent', affiliation: "Vin's Atelier" };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function parseArgs(argv) {
  const [cmd, version, ...rest] = argv;
  const opts = { cmd, version, regs: null, out: 'dist', allowNoPids: false, country: DEFAULT_COUNTRY_POLICY };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--regs') opts.regs = rest[++i].split(',');
    else if (rest[i] === '--out') opts.out = rest[++i];
    else if (rest[i] === '--allow-no-pids') opts.allowNoPids = true;
    else if (rest[i] === '--country') opts.country = rest[++i];
  }
  return opts;
}

/** Default scope: VGC regulations that have ended (an open-ended or running one is never frozen by default). */
export function defaultRegs(today = new Date().toISOString().slice(0, 10)) {
  return VGC_IDS.filter((r) => REGULATIONS[r].end && REGULATIONS[r].end <= today);
}

const readJSON = async (f) => JSON.parse(await readFile(f, 'utf8'));

async function build({ version, regs, out, allowNoPids, country = DEFAULT_COUNTRY_POLICY }) {
  if (!VERSION_RE.test(version || '')) throw new Error(`version must look like data-v1.0 (got "${version}")`);
  checkPolicy(country, RELEASE_COUNTRY_POLICIES); // never 'raw' in a release
  regs ||= defaultRegs();
  if (!regs.length) throw new Error('no regulation to release (pass --regs)');
  const dir = path.join(ROOT, out, version);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const manifest = await readJSON(path.join(DATA, 'manifest.json'));
  const counts = {};
  let pids = true;
  const fetched = [];
  const eventDates = [];
  for (const reg of regs) {
    const teams = await readJSON(path.join(DATA, `teams-${reg}.json`));
    if (teams.idVersion !== 1) pids = false;
    if (teams.idVersion !== 1 && !allowNoPids) throw new Error(`teams-${reg}.json has no player ids (idVersion ${teams.idVersion ?? 'missing'}): run the pipeline with METALENS_ID_SALT first, or pass --allow-no-pids for a dry run`);
    for (const ev of teams.events) {
      if (ev.fetched) fetched.push(ev.fetched);
      eventDates.push(ev.date);
    }
    counts[reg] = { events: teams.events.length, teams: teams.teams.length, matches: teams.matches.length };
    await copyFile(path.join(DATA, `quality-${reg}.json`), path.join(dir, `quality-${reg}.json`)).catch(() => {
      if (!allowNoPids) throw new Error(`quality-${reg}.json is missing`);
    });
  }
  const exported = await writeExport(DATA, dir, regs, { release: version, country });
  await writeFile(path.join(dir, 'README.md'), readme(version, regs, country));
  await writeFile(path.join(dir, 'CITATION.cff'), citation(version));
  await writeFile(path.join(dir, '.zenodo.json'), `${JSON.stringify(zenodo(version, regs), null, 2)}\n`);

  const files = {};
  for (const f of (await readdir(dir)).sort()) files[f] = sha256(await readFile(path.join(dir, f)));
  const sorted = (a) => [...a].sort();
  const record = {
    version,
    regulations: regs,
    commit: git('rev-parse', 'HEAD'),
    dataGenerated: manifest.generated,
    pids, // false only for dry runs built with --allow-no-pids
    archetypeRules: { version: ARCHETYPE_RULESET.version, fingerprint: ARCHETYPE_RULESET.fingerprint },
    country: countryRecord(exported.country),
    sources: [
      { id: 'limitless', name: 'Limitless Play (online tournaments)', url: 'https://play.limitlesstcg.com' },
      { id: 'limitlessvgc', name: 'limitlessvgc.com (official events, team lists)', url: 'https://limitlessvgc.com' },
      { id: 'limitlessvgc-standings', name: 'standings.limitlessvgc.com (official standings, pairings, species-only teams)', url: 'https://standings.limitlessvgc.com' },
    ],
    eventDates: { first: sorted(eventDates)[0] || null, last: sorted(eventDates).at(-1) || null },
    fetchedDates: { first: sorted(fetched)[0] || null, last: sorted(fetched).at(-1) || null, eventsWithoutDate: eventDates.length - fetched.length },
    counts,
    files,
    author: AUTHOR,
  };
  await writeFile(path.join(dir, 'RELEASE.json'), `${JSON.stringify(record, null, 2)}\n`);
  return { dir, record };
}

/** RELEASE.json `country`: the policy used, so the paper can state it. */
export function countryRecord(stats) {
  if (stats.policy === 'drop') return { policy: 'drop', note: 'country left out of every table' };
  return { policy: stats.policy, scheme: REGION_SCHEME, minGroup: REGION_MIN_GROUP, suppressed: stats.suppressed, unmapped: stats.unmapped };
}

function readme(version, regs, country) {
  return [`# MetaLens VGC research data ${version}`, '',
    `Pokémon Champions VGC tournament data, Regulations ${regs.join(', ')}, compiled by Vincent Wesley (Vin's Atelier) for MetaLens VGC (https://metalensvgc.pages.dev).`, '',
    'See CODEBOOK.md for every table and column, RELEASE.json for provenance and SHA-256 checksums, and quality-<REG>.json for what was dropped or normalized per event.', '',
    'Not included: Pokémon Champions Battle Data in-game ranked data (its API terms forbid redistribution) and Smogon ladder statistics.', '',
    'Players are pseudonymized (salted HMAC ids), not anonymous: the source pages are public.', '',
    country === 'drop' ? 'Country is not included (see CODEBOOK.md, Country policy).'
      : `Country is grouped into world regions; groups under ${REGION_MIN_GROUP} lists per event are suppressed (see CODEBOOK.md, Country policy).`, '',
    `Reproduce: check out the git tag \`${version}\` of https://github.com/vincentwesley/MetaLensVGC and run \`node scripts/release.js verify ${version}\`.`, ''].join('\n');
}

function citation(version) {
  return ['cff-version: 1.2.0', 'message: "If you use this data, please cite it as below."', 'type: dataset',
    `title: "MetaLens VGC research data ${version}"`, `version: "${version}"`,
    'authors:', '  - family-names: "Wesley"', '    given-names: "Vincent"', `    affiliation: "${AUTHOR.affiliation}"`,
    'url: "https://metalensvgc.pages.dev"', 'repository-code: "https://github.com/vincentwesley/MetaLensVGC"', ''].join('\n');
}

function zenodo(version, regs) {
  return {
    title: `MetaLens VGC research data ${version}`,
    upload_type: 'dataset',
    version,
    creators: [AUTHOR],
    description: `Pokémon Champions VGC tournament team lists, matches and official-event rosters for Regulations ${regs.join(', ')}, with a codebook and per-event data-quality report. Compiled by Vincent Wesley (Vin's Atelier) for MetaLens VGC.`,
    keywords: ['Pokémon', 'VGC', 'metagame', 'esports', 'tournament data'],
    related_identifiers: [{ identifier: 'https://github.com/vincentwesley/MetaLensVGC', relation: 'isSupplementTo', scheme: 'url' }],
  };
}

async function freeze(opts) {
  const recordPath = path.join(ROOT, 'releases', `${opts.version}.json`);
  if (await readFile(recordPath).then(() => true, () => false)) throw new Error(`${recordPath} already exists: releases are immutable`);
  if (git('tag', '--list', opts.version)) throw new Error(`git tag ${opts.version} already exists: releases are immutable`);
  if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('uncommitted changes: a release is built from a committed tree only');
  const { dir, record } = await build(opts);
  await mkdir(path.dirname(recordPath), { recursive: true });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  git('add', recordPath);
  git('commit', '-m', `data release ${opts.version}\n\nRelease record for MetaLens VGC research data ${opts.version} (Vin's Atelier).`);
  git('tag', '-a', opts.version, '-m', `MetaLens VGC research data ${opts.version}`, record.commit);
  console.log(`froze ${opts.version}: ${dir}\nrecord ${recordPath} committed, tag ${opts.version} -> ${record.commit}\npush both: git push origin HEAD ${opts.version}`);
}

async function verify({ version }) {
  const record = await readJSON(path.join(ROOT, 'releases', `${version}.json`));
  const tmp = path.join(ROOT, 'dist', `.verify-${version}`);
  await rm(tmp, { recursive: true, force: true });
  git('worktree', 'add', '--detach', tmp, version);
  try {
    await symlink(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
    const args = ['scripts/release.js', 'build', version, '--regs', record.regulations.join(','), '--out', 'dist', ...(record.pids === false ? ['--allow-no-pids'] : []),
      ...(record.country ? ['--country', record.country.policy] : [])];
    execFileSync('node', args, { cwd: tmp, stdio: 'inherit' });
    const rebuilt = await readJSON(path.join(tmp, 'dist', version, 'RELEASE.json'));
    const bad = Object.keys({ ...record.files, ...rebuilt.files }).filter((f) => f !== 'RELEASE.json' && record.files[f] !== rebuilt.files[f]);
    if (bad.length) throw new Error(`${version}: checksums differ for ${bad.join(', ')}`);
    console.log(`${version}: all ${Object.keys(record.files).length} files reproduce byte for byte`);
  } finally {
    git('worktree', 'remove', '--force', tmp);
  }
}

if (process.argv[1]?.endsWith('release.js')) {
  const opts = parseArgs(process.argv.slice(2));
  const run = { build: async (o) => console.log(`built ${(await build(o)).dir}`), freeze, verify }[opts.cmd];
  if (!run) {
    console.error('usage: node scripts/release.js build|freeze|verify <data-vX.Y> [--regs M-A,M-B,M-C] [--allow-no-pids] [--country drop|region]');
    process.exit(2);
  }
  run(opts).catch((e) => { console.error(e.message); process.exit(1); });
}
