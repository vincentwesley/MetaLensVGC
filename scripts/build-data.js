#!/usr/bin/env node
// Entry point for `npm run data`. Builds public/data/{teams-<REG>.json, ladder-<REG>.json,
// ranked-<REG>.json, dex.json, manifest.json} from fetched sources. Incremental: completed
// tournaments and finished ranked seasons already present in public/data are reused rather
// than refetched.
//
// Usage: node scripts/build-data.js [--reg M-C] [--no-fetch-limitless] [--no-fetch-official] [--max-tournaments N] [--refetch-online[=all|M-A,M-B]]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { REGULATIONS, listedRegs, pickCurrent } from './lib/regs.js';
import { fetchLimitlessOnline, RECENT_BEFORE } from './sources/limitless.js';
import { fetchOfficialEvents } from './sources/official.js';
import { fetchLadder, keepNewest, SHOWDOWN_CUTOFFS } from './sources/ladder.js';
import { fetchSamples } from './sources/smogon-sets.js';
import { fetchRanked, renormalizeRanked } from './sources/ranked.js';
import pkg from 'pokemon-showdown';
import { buildDex } from './dex.js';
import { resolveSprites } from './sprites.js';
import { normalizeSpecies, normalizeTerm } from '../public/js/lib/names.js';
import { ARCHETYPE_RULESET } from '../public/js/lib/archetypes.js';
import { writeExport } from './lib/research-export.js';
import { buildPokedex, build as buildRoster } from './build-pokedex.js';
import { validateAll } from './validate.js';
import { idSalt } from './lib/ids.js';
import { decodeExistingTeamsFile, assembleTeamsFile, buildRostersFile } from './lib/teams-file.js';
import { newNormStats, countNormalization, qualityFile } from './lib/quality.js';
import { printReport } from './report.js';

// Only regulations that have started are fetched, written and listed (a new one appears on its start date, see regs.js).
const REG_IDS = listedRegs(new Date().toISOString().slice(0, 10));
const VGC_IDS = REG_IDS.filter((r) => REGULATIONS[r].family === 'vgc');
const SHOWDOWN_IDS = REG_IDS.filter((r) => REGULATIONS[r].family === 'showdown');

const { Dex } = pkg;
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function parseArgs(argv) {
  const args = { reg: null, noFetchLimitless: false, noFetchOfficial: false, maxTournaments: null, refetchOnline: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reg') args.reg = argv[++i];
    // rebuild online events from the source (pids, drop rounds, lost duplicates): every regulation, or only the listed ones.
    // Limitless allows ~50 requests / 5 min (3 per event), so all of M-A..M-C takes ~6.5 h: split it per regulation in CI.
    else if (argv[i] === '--refetch-online' || argv[i] === '--refetch-online=all') args.refetchOnline = true;
    else if (argv[i].startsWith('--refetch-online=')) {
      const regs = argv[i].slice('--refetch-online='.length).split(',').filter(Boolean);
      const bad = regs.filter((r) => !VGC_IDS.includes(r));
      if (bad.length || !regs.length) throw new Error(`--refetch-online: unknown regulation(s) ${bad.join(', ') || '(none)'}; use all or ${VGC_IDS.join(',')}`);
      args.refetchOnline = new Set(regs);
    }
    else if (argv[i] === '--no-fetch-limitless') args.noFetchLimitless = true;
    else if (argv[i] === '--no-fetch-official') args.noFetchOfficial = true; // dev runs: reuse committed official events (no rosters)
    else if (argv[i] === '--max-tournaments') args.maxTournaments = Number(argv[++i]);
  }
  return args;
}

async function readJSONIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const regsToProcess = (args.reg ? [args.reg] : REG_IDS).filter((r) => REGULATIONS[r]?.family === 'vgc');
  await mkdir(DATA_DIR, { recursive: true });

  const rawEventsByReg = {};
  const ladderByReg = {};
  const allSpecies = new Set();
  const allMoves = new Set();
  const allItems = new Set();
  const statsLog = [];
  const log = (s) => {
    statsLog.push(s);
    console.log(s);
  };

  const refetches = (reg) => args.refetchOnline === true || (args.refetchOnline instanceof Set && args.refetchOnline.has(reg));

  // 1) Load whatever already exists, so completed tournaments are reused.
  const existingFiles = {};
  const existingQuality = {};
  const salt = idSalt(); // METALENS_ID_SALT; without it new rows get no pid (see scripts/lib/ids.js)
  if (!salt) log('WARNING: METALENS_ID_SALT is not set: new team rows are written without a player id (pid).');
  for (const reg of VGC_IDS) {
    existingFiles[reg] = await readJSONIfExists(path.join(DATA_DIR, `teams-${reg}.json`));
    existingQuality[reg] = (await readJSONIfExists(path.join(DATA_DIR, `quality-${reg}.json`)))?.events || {};
    // online events from the last 7 days may have been captured mid-tournament: refetch them;
    // --refetch-online rebuilds every online event (one-time backfill of pids and of teams lost to name de-duplication)
    rawEventsByReg[reg] = decodeExistingTeamsFile(existingFiles[reg])
      .filter((e) => e.source !== 'limitless' || (!refetches(reg) && e.date < RECENT_BEFORE.slice(0, 10)));
  }
  // `fetched`: the day an event was first built into MetaLens (kept across rebuilds; null for events built before v1.7.0)
  const firstFetched = new Map();
  for (const reg of VGC_IDS) for (const ev of existingFiles[reg]?.events || []) if (ev.fetched) firstFetched.set(ev.id, ev.fetched);
  const today = new Date().toISOString().slice(0, 10);
  const stampFetched = (ev) => { ev.fetched = firstFetched.get(ev.id) || ev.fetched || today; return ev; };

  // 2) Official events (all regs, always — fully rebuilt every run, but every
  // request uses ttl: PERMANENT, so this only costs network time on first fetch;
  // subsequent runs replay from the disk cache. See dedupeEvents below.
  if (!args.noFetchOfficial) {
    log('Fetching official events (limitlessvgc.com)...');
    const official = await fetchOfficialEvents(null, { log });
    for (const reg of VGC_IDS) rawEventsByReg[reg].push(...official.byReg[reg].map(stampFetched));
    log(`  official: ${JSON.stringify(official.stats)}`);
  }

  // 3) Limitless online tournaments, only for the regulation(s) being processed.
  for (const reg of regsToProcess) {
    if (args.noFetchLimitless) continue;
    const existingKeys = new Set(rawEventsByReg[reg].filter((e) => e.source === 'limitless').map((e) => e.key));
    log(`Fetching Limitless online tournaments for ${reg}...`);
    const { rawEvents, stats } = await fetchLimitlessOnline(reg, null, {
      existingKeys,
      maxTournaments: args.maxTournaments,
      log,
    });
    rawEventsByReg[reg].push(...rawEvents.map(stampFetched));
    log(`  ${reg}: ${JSON.stringify(stats)}`);
  }

  // 4) Ladder (all regs, always). Showdown regs: every rating cutoff, the 3 newest published months each.
  const extraCutoffs = {}; // reg -> { cutoff: months[] } for ladder-<REG>-<cutoff>.json
  const loadLadder = async (reg, file, cutoff) => {
    const existing = await readJSONIfExists(path.join(DATA_DIR, file));
    const existingMonths = new Set((existing?.months || []).map((m) => m.month));
    const fresh = await fetchLadder(reg, null, { existingMonths, log, cutoff });
    // Keep any previously-fetched months fetchLadder didn't need to touch again.
    const have = new Set(fresh.map((m) => m.month));
    for (const m of existing?.months || []) if (!have.has(m.month)) fresh.push(m);
    fresh.sort((a, b) => a.month.localeCompare(b.month));
    return REGULATIONS[reg].family === 'showdown' ? keepNewest(fresh) : fresh;
  };
  for (const reg of REG_IDS) {
    log(`Fetching ladder for ${reg}...`);
    ladderByReg[reg] = await loadLadder(reg, `ladder-${reg}.json`, 1760);
    if (REGULATIONS[reg].family === 'showdown') {
      extraCutoffs[reg] = {};
      for (const c of SHOWDOWN_CUTOFFS.filter((x) => x !== 1760)) extraCutoffs[reg][c] = await loadLadder(reg, `ladder-${reg}-${c}.json`, c);
    }
  }

  // 4a) Smogon sample teams + sets for the Showdown formats (samples-<REG>.json).
  const samplesByReg = {};
  for (const reg of SHOWDOWN_IDS) {
    log(`Fetching Smogon sample teams for ${reg}...`);
    samplesByReg[reg] = await fetchSamples(reg, log);
  }

  // 4b) Ranked ladder (official Champions "Battle Data", Doubles, all regs, always).
  // Incremental like the ladder above: finished seasons already in the existing file are
  // reused rather than refetched; the season currently being collected always refetches.
  const rankedByReg = {};
  for (const reg of VGC_IDS) {
    const existingRanked = await readJSONIfExists(path.join(DATA_DIR, `ranked-${reg}.json`));
    const existingSeasons = new Set((existingRanked?.seasons || []).map((s) => s.season));
    log(`Fetching ranked ladder (championsbattledata.com) for ${reg}...`);
    const fresh = await fetchRanked(reg, null, { existingSeasons, log });
    const have = new Set(fresh.seasons.map((s) => s.season));
    const seasons = [...fresh.seasons];
    for (const s of existingRanked?.seasons || []) if (!have.has(s.season)) seasons.push(s);
    seasons.sort((a, b) => a.snapshot.localeCompare(b.snapshot));
    rankedByReg[reg] = { ...fresh, seasons };
  }

  // 5) Collect every species/move/item actually present, so far normalized without a dex.
  const ndSpecies = new Set();
  const ndMoves = new Set();
  const ndItems = new Set();
  for (const reg of SHOWDOWN_IDS) {
    for (const month of ladderByReg[reg]) {
      for (const [species, mon] of Object.entries(month.mons)) {
        ndSpecies.add(species);
        for (const it of Object.keys(mon.items)) ndItems.add(it);
        for (const mv of Object.keys(mon.moves)) ndMoves.add(mv);
      }
    }
  }
  // Sample teams and sets name Pokémon, items and moves the ladder may not (the deep dive and sprites need them).
  for (const s of Object.values(samplesByReg)) {
    for (const t of s?.teams || []) for (const m of t.mons) { ndSpecies.add(m.species); if (m.item) ndItems.add(m.item); for (const mv of m.moves) ndMoves.add(mv); }
    for (const [species, sets] of Object.entries(s?.sets || {})) {
      ndSpecies.add(species);
      for (const set of sets) { for (const it of set.item) ndItems.add(it); for (const slot of set.moves) for (const mv of [].concat(slot)) ndMoves.add(mv); }
    }
  }
  for (const reg of VGC_IDS) {
    for (const ev of rawEventsByReg[reg]) {
      for (const row of ev.rows) {
        for (const mon of row.mons) {
          if (mon.species) allSpecies.add(mon.species);
          if (mon.item) allItems.add(mon.item);
          for (const mv of mon.moves) if (mv) allMoves.add(mv);
        }
      }
    }
    for (const month of ladderByReg[reg]) {
      for (const [species, mon] of Object.entries(month.mons)) {
        allSpecies.add(species);
        for (const it of Object.keys(mon.items)) allItems.add(it);
        for (const mv of Object.keys(mon.moves)) allMoves.add(mv);
      }
    }
    for (const season of rankedByReg[reg].seasons) {
      for (const [species, mon] of Object.entries(season.mons)) {
        allSpecies.add(species);
        for (const it of Object.keys(mon.items)) allItems.add(it);
        for (const mv of Object.keys(mon.moves)) allMoves.add(mv);
        for (const tm of mon.teammates) allSpecies.add(tm);
      }
    }
  }

  // 6) Build the dex, then re-run species normalization through it for consistency.
  const { dex, missing } = buildDex(allSpecies, allMoves, allItems);
  if (missing.length) log(`dex: could not resolve ${missing.length} species (${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''})`);
  log('Resolving sprite availability (play.pokemonshowdown.com)...');
  await resolveSprites(dex.species);
  // Every Pokédex roster species needs a dex entry too (the Pokédex opens any of them in the deep dive).
  for (const name of Object.keys(buildRoster(Dex, { natdex: true }).species)) ndSpecies.add(name);
  const { dex: dexNat, missing: missingNat } = buildDex(ndSpecies, ndMoves, ndItems, Dex);
  if (missingNat.length) log(`dex-natdex: could not resolve ${missingNat.length} species (${missingNat.slice(0, 10).join(', ')})`);
  await resolveSprites(dexNat.species);
  for (const reg of VGC_IDS) {
    for (const ev of rawEventsByReg[reg]) {
      // Freshly built events (they carry `drops`) record what normalization did, for the quality report.
      const norm = ev.drops ? (ev.normalization = newNormStats()) : null;
      for (const row of ev.rows) {
        for (const mon of row.mons) {
          const raw = { species: mon.species, item: mon.item, ability: mon.ability, moves: mon.moves };
          mon.species = normalizeSpecies(mon.species, dex);
          // hand-typed sheets: "focus sash" / "U-Turn" / "None" -> dex names or null
          mon.item = normalizeTerm(mon.item, dex, 'item');
          mon.ability = normalizeTerm(mon.ability, dex, 'ability');
          mon.moves = mon.moves.map((m) => normalizeTerm(m, dex, 'move')).filter(Boolean);
          if (norm) countNormalization(norm, raw, mon, dex);
        }
      }
      for (const p of ev.roster || []) p.species = p.species.map((s) => normalizeSpecies(s, dex));
    }
    renormalizeRanked(rankedByReg[reg], dex);
  }

  // 7) Write teams-<REG>.json + ladder-<REG>.json per regulation, and manifest.json.
  const manifestRegs = [];
  for (const reg of REG_IDS) {
    const meta = REGULATIONS[reg];
    const ladderFile = { reg, source: 'smogon', cutoff: 1760, months: ladderByReg[reg] };
    await writeFile(path.join(DATA_DIR, `ladder-${reg}.json`), JSON.stringify(ladderFile));
    if (samplesByReg[reg]) await writeFile(path.join(DATA_DIR, `samples-${reg}.json`), JSON.stringify(samplesByReg[reg]));
    for (const [c, months] of Object.entries(extraCutoffs[reg] || {})) {
      await writeFile(path.join(DATA_DIR, `ladder-${reg}-${c}.json`), JSON.stringify({ reg, source: 'smogon', cutoff: Number(c), months }));
    }
    const common = { id: reg, family: meta.family, format: meta.format, level: meta.level, label: meta.label };
    if (meta.family === 'showdown') {
      manifestRegs.push({ ...common, teams: 0, events: 0, openSheets: 0, matches: 0, ladderMonths: ladderByReg[reg].map((m) => m.month), rankedSeasons: [],
        samples: samplesByReg[reg] ? { teams: samplesByReg[reg].teams.length, sets: Object.keys(samplesByReg[reg].sets).length } : null,
        ladderCutoffs: [1760, ...Object.keys(extraCutoffs[reg] || {}).map(Number).filter((c) => extraCutoffs[reg][c].length).sort((a, b) => b - a)] });
      continue;
    }
    const quality = { ...existingQuality[reg] };
    const teamsFile = assembleTeamsFile(reg, rawEventsByReg[reg], { salt, quality });
    await writeFile(path.join(DATA_DIR, `teams-${reg}.json`), JSON.stringify(teamsFile));
    for (const ev of rawEventsByReg[reg]) if (ev.normalization) quality[ev.id].normalization = ev.normalization;
    await writeFile(path.join(DATA_DIR, `quality-${reg}.json`), JSON.stringify(qualityFile(reg, teamsFile, quality)));
    await writeFile(path.join(DATA_DIR, `rosters-${reg}.json`), JSON.stringify(buildRostersFile(reg, rawEventsByReg[reg], teamsFile, { salt })));

    await writeFile(path.join(DATA_DIR, `ranked-${reg}.json`), JSON.stringify(rankedByReg[reg]));

    const openSheets = teamsFile.teams.reduce((n, row) => n + (row[7].some((m) => typeof m[5] === 'string') ? 1 : 0), 0);
    manifestRegs.push({
      ...common,
      start: REGULATIONS[reg].start,
      end: REGULATIONS[reg].end,
      teams: teamsFile.teams.length,
      events: teamsFile.events.length,
      openSheets,
      matches: teamsFile.matches.length,
      ladderMonths: ladderByReg[reg].map((m) => m.month),
      rankedSeasons: rankedByReg[reg].seasons.map((s) => s.season),
    });
  }

  await writeFile(
    path.join(DATA_DIR, 'dex.json'),
    JSON.stringify(dex),
  );
  await writeFile(path.join(DATA_DIR, 'dex-natdex.json'), JSON.stringify(dexNat));

  await writeFile(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify({
      generated: new Date().toISOString(),
      current: pickCurrent(manifestRegs),
      archetypeRules: ARCHETYPE_RULESET.version, // labels are computed at read time with this rule set (lib/archetypes.js)
      currentShowdown: 'ND',
      regs: manifestRegs,
      sources: [
        { id: 'limitless', name: 'Limitless (play.limitlesstcg.com)', url: 'https://play.limitlesstcg.com' },
        { id: 'limitlessvgc', name: 'Limitless VGC (limitlessvgc.com)', url: 'https://limitlessvgc.com' },
        { id: 'smogon', name: 'Smogon usage stats', url: 'https://www.smogon.com/stats' },
        { id: 'championsbattledata', name: 'Pokémon Champions Battle Data (championsbattledata.com)', url: 'https://championsbattledata.com' },
      ],
    }),
  );

  log(`pokedex: ${JSON.stringify(await buildPokedex(DATA_DIR))}`);

  // 8) Validate, then report.
  const errors = await validateAll(DATA_DIR);
  if (errors.length) {
    console.error(`\nvalidate.js: ${errors.length} error(s)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  await printReport(DATA_DIR);

  // 9) INTERNAL research export (CSV + codebook) from the files just written, gitignored. It keeps the country as
  // published for Vin's own analysis ('raw'); releases are built by scripts/release.js, which drops or groups it.
  const exported = await writeExport(DATA_DIR, path.join(process.cwd(), 'data-export'), VGC_IDS, { country: 'raw' });
  log(`research export (internal, raw country): data-export/ (${exported.files.join(', ')})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
