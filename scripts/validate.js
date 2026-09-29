// Hand-written schema validation for public/data/*.json (public/data/SCHEMA.md is the
// contract). Exits non-zero on any error when run standalone.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REGULATIONS, REG_IDS, inWindow } from './lib/regs.js';

async function readJSON(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function parseSP(sp) {
  if (typeof sp !== 'string') return null;
  return sp.split('/').map(Number);
}

function validateTeamsFile(file, data, errors) {
  if (data.reg == null || !REG_IDS.includes(data.reg)) errors.push(`${file}: bad reg "${data.reg}"`);
  if (!Array.isArray(data.strings)) errors.push(`${file}: strings must be an array`);
  if (!Array.isArray(data.events)) errors.push(`${file}: events must be an array`);
  if (!Array.isArray(data.teams)) errors.push(`${file}: teams must be an array`);
  if (!Array.isArray(data.matches)) errors.push(`${file}: matches must be an array`);
  if (errors.length) return;

  const nStrings = data.strings.length;
  const checkStr = (i, ctx) => {
    if (i === -1) return;
    if (!Number.isInteger(i) || i < 0 || i >= nStrings) errors.push(`${file}: ${ctx} string index out of bounds: ${i}`);
  };

  data.events.forEach((ev, i) => {
    const TIERS = ['worlds', 'international', 'regional', 'online'];
    if (!TIERS.includes(ev.tier)) errors.push(`${file}: events[${i}].tier invalid: ${ev.tier}`);
    if (!['limitless', 'limitlessvgc'].includes(ev.source)) errors.push(`${file}: events[${i}].source invalid: ${ev.source}`);
    if (ev.cut != null && (!Number.isInteger(ev.cut) || ev.cut < 1)) errors.push(`${file}: events[${i}].cut invalid: ${ev.cut}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) errors.push(`${file}: events[${i}].date invalid: ${ev.date}`);
    else if (!inWindow(ev.date, data.reg)) errors.push(`${file}: events[${i}].date ${ev.date} outside ${data.reg} window`);
    if (!Number.isInteger(ev.players) || ev.players < 1) errors.push(`${file}: events[${i}].players invalid: ${ev.players}`);
  });

  data.teams.forEach((row, i) => {
    const [eventIdx, player, country, placing, wins, losses, ties, mons] = row;
    if (!Number.isInteger(eventIdx) || eventIdx < 0 || eventIdx >= data.events.length) {
      errors.push(`${file}: teams[${i}] bad eventIdx ${eventIdx}`);
    }
    if (typeof player !== 'string' || !player) errors.push(`${file}: teams[${i}] bad player`);
    if (typeof country !== 'string') errors.push(`${file}: teams[${i}] bad country`);
    if (placing != null && (!Number.isInteger(placing) || placing < 1)) errors.push(`${file}: teams[${i}] bad placing ${placing}`);
    for (const n of [wins, losses, ties]) if (!Number.isInteger(n) || n < 0) errors.push(`${file}: teams[${i}] bad w/l/t`);
    if (!Array.isArray(mons) || mons.length < 1 || mons.length > 6) errors.push(`${file}: teams[${i}] mons length ${mons?.length}`);
    (mons || []).forEach((mon, j) => {
      const [species, item, ability, moves, nature, sp] = mon;
      checkStr(species, `teams[${i}].mons[${j}].species`);
      checkStr(item, `teams[${i}].mons[${j}].item`);
      checkStr(ability, `teams[${i}].mons[${j}].ability`);
      if (!Array.isArray(moves) || moves.length > 4) errors.push(`${file}: teams[${i}].mons[${j}] too many moves`);
      (moves || []).forEach((m) => checkStr(m, `teams[${i}].mons[${j}].moves`));
      checkStr(nature, `teams[${i}].mons[${j}].nature`);
      if (sp !== 0) {
        const parts = parseSP(sp);
        if (!parts || parts.length !== 6 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 32)) {
          errors.push(`${file}: teams[${i}].mons[${j}] bad sp "${sp}"`);
        } else if (parts.reduce((a, b) => a + b, 0) > 66) {
          errors.push(`${file}: teams[${i}].mons[${j}] sp total > 66: "${sp}"`);
        }
      }
    });
  });

  data.matches.forEach(([a, b, result], i) => {
    if (!Number.isInteger(a) || a < 0 || a >= data.teams.length) errors.push(`${file}: matches[${i}] bad teamA ${a}`);
    if (!Number.isInteger(b) || b < 0 || b >= data.teams.length) errors.push(`${file}: matches[${i}] bad teamB ${b}`);
    if (![0, 1, 2].includes(result)) errors.push(`${file}: matches[${i}] bad result ${result}`);
  });
}

function validateLadderFile(file, data, errors) {
  if (!REG_IDS.includes(data.reg)) errors.push(`${file}: bad reg "${data.reg}"`);
  if (data.source !== 'smogon') errors.push(`${file}: source must be "smogon"`);
  if (!Array.isArray(data.months)) errors.push(`${file}: months must be an array`);
  for (const month of data.months || []) {
    if (!/^\d{4}-\d{2}$/.test(month.month || '')) errors.push(`${file}: bad month "${month.month}"`);
    if (typeof month.mons !== 'object') errors.push(`${file}: ${month.month} mons must be an object`);
    for (const [name, mon] of Object.entries(month.mons || {})) {
      if (typeof mon.usage !== 'number') errors.push(`${file}: ${month.month} ${name}.usage must be a number`);
      for (const table of ['items', 'abilities', 'moves', 'spreads']) {
        const size = Object.keys(mon[table] || {}).length;
        if (size > 12) errors.push(`${file}: ${month.month} ${name}.${table} has ${size} entries (max 12)`);
      }
      const teammates = Object.keys(mon.teammates || {}).length;
      if (teammates > 20) errors.push(`${file}: ${month.month} ${name}.teammates has ${teammates} entries (max 20)`);
    }
  }
}

function validateRankedFile(file, data, errors) {
  if (!REG_IDS.includes(data.reg)) errors.push(`${file}: bad reg "${data.reg}"`);
  if (data.source !== 'championsbattledata') errors.push(`${file}: source must be "championsbattledata"`);
  if (data.format !== 'Doubles') errors.push(`${file}: format must be "Doubles"`);
  if (!Array.isArray(data.seasons)) {
    errors.push(`${file}: seasons must be an array`);
    return;
  }
  const pctFields = ['moves', 'items', 'abilities', 'natures', 'spreads'];
  for (const s of data.seasons) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.snapshot || '')) errors.push(`${file}: ${s.season} bad snapshot "${s.snapshot}"`);
    if (s.ranking != null && !Array.isArray(s.ranking)) errors.push(`${file}: ${s.season} ranking must be an array or null`);
    if (typeof s.mons !== 'object' || s.mons == null) {
      errors.push(`${file}: ${s.season} mons must be an object`);
      continue;
    }
    for (const [name, mon] of Object.entries(s.mons)) {
      if (mon.rank != null && (!Number.isInteger(mon.rank) || mon.rank < 1)) {
        errors.push(`${file}: ${s.season} ${name}.rank invalid: ${mon.rank}`);
      }
      for (const table of pctFields) {
        for (const [k, v] of Object.entries(mon[table] || {})) {
          if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`${file}: ${s.season} ${name}.${table}["${k}"] not a 0-1 fraction: ${v}`);
        }
      }
      if (!Array.isArray(mon.teammates)) errors.push(`${file}: ${s.season} ${name}.teammates must be an array`);
    }
  }
}

function validateDexFile(data, errors) {
  const CATS = ['Physical', 'Special', 'Status'];
  for (const [name, sp] of Object.entries(data.species || {})) {
    if (!Array.isArray(sp.bs) || sp.bs.length !== 6) errors.push(`dex.json: species "${name}" bad bs`);
    if (!Array.isArray(sp.types) || !sp.types.length) errors.push(`dex.json: species "${name}" bad types`);
  }
  for (const [name, mv] of Object.entries(data.moves || {})) {
    if (!CATS.includes(mv.cat)) errors.push(`dex.json: move "${name}" bad cat "${mv.cat}"`);
  }
}

export async function validateAll(dataDir) {
  const errors = [];

  const manifest = await readJSON(path.join(dataDir, 'manifest.json')).catch((e) => {
    errors.push(`manifest.json: ${e.message}`);
    return null;
  });
  if (manifest) {
    for (const reg of REG_IDS) {
      const entry = manifest.regs.find((r) => r.id === reg);
      if (!entry) errors.push(`manifest.json: missing reg ${reg}`);
      else if (entry.start !== REGULATIONS[reg].start || entry.end !== REGULATIONS[reg].end) {
        errors.push(`manifest.json: ${reg} window mismatch`);
      }
    }
  }

  const dex = await readJSON(path.join(dataDir, 'dex.json')).catch((e) => {
    errors.push(`dex.json: ${e.message}`);
    return null;
  });
  if (dex) validateDexFile(dex, errors);

  for (const reg of REG_IDS) {
    const teamsPath = path.join(dataDir, `teams-${reg}.json`);
    const teams = await readJSON(teamsPath).catch((e) => {
      errors.push(`teams-${reg}.json: ${e.message}`);
      return null;
    });
    if (teams) validateTeamsFile(`teams-${reg}.json`, teams, errors);

    const ladderPath = path.join(dataDir, `ladder-${reg}.json`);
    const ladder = await readJSON(ladderPath).catch((e) => {
      errors.push(`ladder-${reg}.json: ${e.message}`);
      return null;
    });
    if (ladder) validateLadderFile(`ladder-${reg}.json`, ladder, errors);

    const rankedPath = path.join(dataDir, `ranked-${reg}.json`);
    const ranked = await readJSON(rankedPath).catch((e) => {
      errors.push(`ranked-${reg}.json: ${e.message}`);
      return null;
    });
    if (ranked) validateRankedFile(`ranked-${reg}.json`, ranked, errors);
  }

  return errors;
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const errors = await validateAll(dataDir);
  if (errors.length) {
    console.error(`${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('validate.js: OK');
}
