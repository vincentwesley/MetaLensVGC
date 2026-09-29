#!/usr/bin/env node
// Entry point for `npm run data`. Builds public/data/{teams-<REG>.json, ladder-<REG>.json,
// ranked-<REG>.json, dex.json, manifest.json} from fetched sources. Incremental: completed
// tournaments and finished ranked seasons already present in public/data are reused rather
// than refetched.
//
// Usage: node scripts/build-data.js [--reg M-C] [--no-fetch-limitless] [--max-tournaments N]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { REG_IDS, REGULATIONS } from './lib/regs.js';
import { fetchLimitlessOnline, RECENT_BEFORE } from './sources/limitless.js';
import { fetchOfficialEvents } from './sources/official.js';
import { fetchLadder } from './sources/ladder.js';
import { fetchRanked, renormalizeRanked } from './sources/ranked.js';
import { buildDex } from './dex.js';
import { resolveSprites } from './sprites.js';
import { normalizeSpecies, normalizeTerm } from '../public/js/lib/names.js';
import { validateAll } from './validate.js';
import { printReport } from './report.js';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function parseArgs(argv) {
  const args = { reg: null, noFetchLimitless: false, maxTournaments: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reg') args.reg = argv[++i];
    else if (argv[i] === '--no-fetch-limitless') args.noFetchLimitless = true;
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

// Turns an already-written teams-<REG>.json back into RawEvents, so completed
// tournaments never need to be refetched.
function decodeExistingTeamsFile(file) {
  if (!file) return [];
  const { strings, events, teams, matches } = file;
  const str = (i) => (i == null || i < 0 ? null : strings[i]);
  const rawEvents = events.map((ev, idx) => {
    const key = ev.source === 'limitless' ? `limitless:${ev.id.slice(3)}` : ev.id;
    return { ...ev, key, eventIdx: idx, rows: [], matches: [] };
  });
  const rowToEvent = [];
  teams.forEach((row) => {
    const [eventIdx, player, country, placing, wins, losses, ties, mons] = row;
    const decodedMons = mons.map(([species, item, ability, moves, nature, sp]) => ({
      species: str(species),
      item: str(item),
      ability: str(ability),
      moves: moves.map((m) => str(m)).filter(Boolean),
      nature: str(nature),
      sp: typeof sp === 'string' ? sp : null,
    }));
    rawEvents[eventIdx].rows.push({ player, name: player, country, placing, wins, losses, ties, mons: decodedMons });
    rowToEvent.push(eventIdx);
  });
  // Rebuild per-event matches as [playerA, playerB, result] using row->player lookup.
  const rowPlayer = teams.map((row) => row[1]);
  matches.forEach(([a, b, result]) => {
    const evIdx = rowToEvent[a];
    if (evIdx == null || rowToEvent[b] !== evIdx) return;
    rawEvents[evIdx].matches.push([rowPlayer[a], rowPlayer[b], result]);
  });
  return rawEvents.map(({ eventIdx, ...rest }) => rest);
}

// Official events are always fully rebuilt (see fetchOfficialEvents), so the same id
// can appear twice here: once from the stale decoded teams-<REG>.json, once freshly
// rebuilt (pushed after). Map dedup keeps the later value but not its insertion slot,
// so the freshly rebuilt event wins while event order (and eventIdx) stays stable.
function dedupeEvents(rawEvents) {
  const byId = new Map();
  for (const ev of rawEvents) byId.set(ev.id, ev);
  return [...byId.values()];
}

function assembleTeamsFile(reg, rawEvents) {
  rawEvents = dedupeEvents(rawEvents);
  const strings = [];
  const internIndex = new Map();
  const intern = (s) => {
    if (s == null || s === '') return -1;
    if (internIndex.has(s)) return internIndex.get(s);
    const i = strings.length;
    strings.push(s);
    internIndex.set(s, i);
    return i;
  };

  const events = [];
  const teams = [];
  const matches = [];

  rawEvents.forEach((ev, eventIdx) => {
    events.push({
      id: ev.id,
      name: ev.name,
      date: ev.date,
      tier: ev.tier,
      source: ev.source,
      url: ev.url,
      players: ev.players,
      cut: ev.cut,
      rounds: ev.rounds,
    });

    // Dedupe rows by player name within the event, keep the first.
    const seenPlayers = new Set();
    const rowIndexByPlayer = new Map();
    for (const row of ev.rows) {
      if (seenPlayers.has(row.name)) continue;
      seenPlayers.add(row.name);
      const mons = row.mons.slice(0, 6).map((mon) => [
        intern(mon.species),
        intern(mon.item),
        intern(mon.ability),
        mon.moves.slice(0, 4).map(intern),
        intern(mon.nature),
        mon.sp || 0,
      ]);
      const rowIdx = teams.length;
      teams.push([eventIdx, row.name, row.country || '', row.placing ?? null, row.wins || 0, row.losses || 0, row.ties || 0, mons]);
      rowIndexByPlayer.set(row.player, rowIdx); // `player` (stable username) is only used to link pairings; display `name` is what's stored
    }

    for (const [pA, pB, result] of ev.matches) {
      const a = rowIndexByPlayer.get(pA);
      const b = rowIndexByPlayer.get(pB);
      if (a == null || b == null) continue;
      matches.push([a, b, result]);
    }
  });

  return { reg, generated: new Date().toISOString(), strings, events, teams, matches };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const regsToProcess = args.reg ? [args.reg] : REG_IDS;
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

  // 1) Load whatever already exists, so completed tournaments are reused.
  const existingFiles = {};
  for (const reg of REG_IDS) {
    existingFiles[reg] = await readJSONIfExists(path.join(DATA_DIR, `teams-${reg}.json`));
    // online events from the last 7 days may have been captured mid-tournament: refetch them
    rawEventsByReg[reg] = decodeExistingTeamsFile(existingFiles[reg])
      .filter((e) => e.source !== 'limitless' || e.date < RECENT_BEFORE.slice(0, 10));
  }

  // 2) Official events (all regs, always — fully rebuilt every run, but every
  // request uses ttl: PERMANENT, so this only costs network time on first fetch;
  // subsequent runs replay from the disk cache. See dedupeEvents below.
  log('Fetching official events (limitlessvgc.com)...');
  const official = await fetchOfficialEvents(null, { log });
  for (const reg of REG_IDS) rawEventsByReg[reg].push(...official.byReg[reg]);
  log(`  official: ${JSON.stringify(official.stats)}`);

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
    rawEventsByReg[reg].push(...rawEvents);
    log(`  ${reg}: ${JSON.stringify(stats)}`);
  }

  // 4) Ladder (all regs, always).
  for (const reg of REG_IDS) {
    const existingLadder = await readJSONIfExists(path.join(DATA_DIR, `ladder-${reg}.json`));
    const existingMonths = new Set((existingLadder?.months || []).map((m) => m.month));
    log(`Fetching ladder for ${reg}...`);
    ladderByReg[reg] = await fetchLadder(reg, null, { existingMonths, log });
    // Keep any previously-fetched months fetchLadder didn't need to touch again.
    const have = new Set(ladderByReg[reg].map((m) => m.month));
    for (const m of existingLadder?.months || []) if (!have.has(m.month)) ladderByReg[reg].push(m);
    ladderByReg[reg].sort((a, b) => a.month.localeCompare(b.month));
  }

  // 4b) Ranked ladder (official Champions "Battle Data", Doubles, all regs, always).
  // Incremental like the ladder above: finished seasons already in the existing file are
  // reused rather than refetched; the season currently being collected always refetches.
  const rankedByReg = {};
  for (const reg of REG_IDS) {
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
  for (const reg of REG_IDS) {
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
  for (const reg of REG_IDS) {
    for (const ev of rawEventsByReg[reg]) {
      for (const row of ev.rows) {
        for (const mon of row.mons) {
          mon.species = normalizeSpecies(mon.species, dex);
          // hand-typed sheets: "focus sash" / "U-Turn" / "None" -> dex names or null
          mon.item = normalizeTerm(mon.item, dex, 'item');
          mon.ability = normalizeTerm(mon.ability, dex, 'ability');
          mon.moves = mon.moves.map((m) => normalizeTerm(m, dex, 'move')).filter(Boolean);
        }
      }
    }
    renormalizeRanked(rankedByReg[reg], dex);
  }

  // 7) Write teams-<REG>.json + ladder-<REG>.json per regulation, and manifest.json.
  const manifestRegs = [];
  for (const reg of REG_IDS) {
    const teamsFile = assembleTeamsFile(reg, rawEventsByReg[reg]);
    await writeFile(path.join(DATA_DIR, `teams-${reg}.json`), JSON.stringify(teamsFile));

    const ladderFile = { reg, source: 'smogon', cutoff: 1760, months: ladderByReg[reg] };
    await writeFile(path.join(DATA_DIR, `ladder-${reg}.json`), JSON.stringify(ladderFile));

    await writeFile(path.join(DATA_DIR, `ranked-${reg}.json`), JSON.stringify(rankedByReg[reg]));

    const openSheets = teamsFile.teams.reduce((n, row) => n + (row[7].some((m) => typeof m[5] === 'string') ? 1 : 0), 0);
    manifestRegs.push({
      id: reg,
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

  await writeFile(
    path.join(DATA_DIR, 'manifest.json'),
    JSON.stringify({
      generated: new Date().toISOString(),
      current: 'M-C',
      regs: manifestRegs,
      sources: [
        { id: 'limitless', name: 'Limitless (play.limitlesstcg.com)', url: 'https://play.limitlesstcg.com' },
        { id: 'limitlessvgc', name: 'Limitless VGC (limitlessvgc.com)', url: 'https://limitlessvgc.com' },
        { id: 'smogon', name: 'Smogon usage stats', url: 'https://www.smogon.com/stats' },
        { id: 'championsbattledata', name: 'Pokémon Champions Battle Data (championsbattledata.com)', url: 'https://championsbattledata.com' },
      ],
    }),
  );

  // 8) Validate, then report.
  const errors = await validateAll(DATA_DIR);
  if (errors.length) {
    console.error(`\nvalidate.js: ${errors.length} error(s)`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  await printReport(DATA_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
