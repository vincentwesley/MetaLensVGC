// teams-<REG>.json assembly (see public/data/SCHEMA.md): RawEvents in, the string-interned file out, and back.
// Pure (no fetch, no fs); used by build-data.js and the tests.
import { pidOf, nsOf } from './ids.js';

// Turns an already-written teams-<REG>.json back into RawEvents, so completed
// tournaments never need to be refetched.
export function decodeExistingTeamsFile(file) {
  if (!file) return [];
  const { strings, events, teams, matches } = file;
  const str = (i) => (i == null || i < 0 ? null : strings[i]);
  const rawEvents = events.map((ev, idx) => {
    const key = ev.source === 'limitless' ? `limitless:${ev.id.slice(3)}` : ev.id;
    return { ...ev, key, eventIdx: idx, rows: [], matches: [] };
  });
  const rowToEvent = [];
  teams.forEach((row, rowIdx) => {
    const [eventIdx, name, country, placing, wins, losses, ties, mons, pid = null, ns = 0, dropRound = null] = row;
    const decodedMons = mons.map(([species, item, ability, moves, nature, sp]) => ({
      species: str(species),
      item: str(item),
      ability: str(ability),
      moves: moves.map((m) => str(m)).filter(Boolean),
      nature: str(nature),
      sp: typeof sp === 'string' ? sp : null,
    }));
    // A reused row keeps its pid; its source key is gone, so it gets a unique internal key (`row:<i>`), which also keeps
    // two same-named players apart when their pairings are rebuilt below.
    rawEvents[eventIdx].rows.push({ player: `row:${rowIdx}`, pid, ns, name, country, placing, wins, losses, ties, dropRound, mons: decodedMons });
    rowToEvent.push(eventIdx);
  });
  // Rebuild per-event matches keyed by those internal keys, keeping the match context (round, phase, bo, games).
  matches.forEach(([a, b, ...rest]) => {
    const evIdx = rowToEvent[a];
    if (evIdx == null || rowToEvent[b] !== evIdx) return;
    rawEvents[evIdx].matches.push([`row:${a}`, `row:${b}`, ...rest]);
  });
  return rawEvents.map(({ eventIdx, ...rest }) => rest);
}

// Official events are always fully rebuilt (see fetchOfficialEvents), so the same id
// can appear twice here: once from the stale decoded teams-<REG>.json, once freshly
// rebuilt (pushed after). Map dedup keeps the later value but not its insertion slot,
// so the freshly rebuilt event wins while event order (and eventIdx) stays stable.
export function dedupeEvents(rawEvents) {
  const byId = new Map();
  for (const ev of rawEvents) byId.set(ev.id, ev);
  return [...byId.values()];
}

// salt: METALENS_ID_SALT (null = rows without pid). quality: per-event quality records, filled in here.
export function assembleTeamsFile(reg, rawEvents, { salt = null, quality = {} } = {}) {
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
  const rowKeys = new Map(); // event id -> Map(source key -> team row), for rosters-<REG>.json

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
      ...(ev.phases ? { phases: ev.phases } : {}),
      coverage: ev.coverage ?? null,
      fetched: ev.fetched ?? null,
      // true when the event was built with drop rounds (v1.8.2+); teams row[10] is then null only for players who didn't drop
      ...(ev.dropReported ? { dropReported: true } : {}),
    });

    // Dedupe rows by source key (stable username / player id) within the event, keep the first. Two different players
    // who share a display name are two rows.
    const q = (quality[ev.id] ||= {});
    let duplicates = 0;
    const rowIndexByPlayer = new Map();
    rowKeys.set(ev.id, rowIndexByPlayer);
    for (const row of ev.rows) {
      if (rowIndexByPlayer.has(row.player)) { duplicates++; continue; }
      const mons = row.mons.slice(0, 6).map((mon) => [
        intern(mon.species),
        intern(mon.item),
        intern(mon.ability),
        mon.moves.slice(0, 4).map(intern),
        intern(mon.nature),
        mon.sp || 0,
      ]);
      const rowIdx = teams.length;
      // pid: reused rows keep theirs; fresh rows hash their source key (no salt -> null, see scripts/lib/ids.js)
      const pid = row.pid !== undefined ? row.pid : salt ? pidOf(row.player, salt) : null;
      const ns = row.ns !== undefined ? row.ns : nsOf(row.player);
      teams.push([eventIdx, row.name, row.country || '', row.placing ?? null, row.wins || 0, row.losses || 0, row.ties || 0, mons, pid, ns, row.dropRound ?? null]);
      rowIndexByPlayer.set(row.player, rowIdx); // the source key only links pairings; pid + display name are stored
    }
    // Fresh events record their quality here; reused ones keep the record from the previous quality file.
    if (ev.drops) q.rows = { ...ev.drops, duplicates, kept: ev.rows.length - duplicates };

    let noTeamRow = 0;
    for (const [pA, pB, ...rest] of ev.matches) {
      const a = rowIndexByPlayer.get(pA);
      const b = rowIndexByPlayer.get(pB);
      if (a == null || b == null) { noTeamRow++; continue; }
      matches.push([a, b, ...rest]);
    }
    if (ev.pairingStats) q.pairings = { ...ev.pairingStats, linked: ev.matches.length - noTeamRow, noTeamRow };
    else if (ev.drops && !ev.pairingStats) q.pairings = { total: 0, missing: 'no pairings published' };
    if (ev.coverage) q.coverage = ev.coverage;
  });

  const file = { reg, generated: new Date().toISOString(), idVersion: teams.length && teams.every((t) => t[8]) ? 1 : 0, strings, events, teams, matches };
  // rowKeys is not part of the file (non-enumerable): build-data passes it on to buildRostersFile.
  Object.defineProperty(file, 'rowKeys', { value: rowKeys, enumerable: false });
  return file;
}

/**
 * rosters-<REG>.json: for official events, every standings player with a species-only team (the standings site lists
 * all teams; limitlessvgc.com links full lists for top finishers only) and every pairing among them.
 * player: [pid|null, ns, placing|null, wins, losses, dropRound|null, topcut 0/1, day2 0/1, [species idx], teamRow|-1]
 * match:  [playerIdxA, playerIdxB, result, round, phase]   (same codes as teams-<REG>.json matches)
 */
export function buildRostersFile(reg, rawEvents, teamsFile, { salt = null } = {}) {
  const strings = [];
  const idx = new Map();
  const intern = (s) => {
    if (!idx.has(s)) { idx.set(s, strings.length); strings.push(s); }
    return idx.get(s);
  };
  const eventIdx = new Map(teamsFile.events.map((e, i) => [e.id, i]));
  const events = [];
  for (const ev of dedupeEvents(rawEvents)) {
    if (!ev.roster || !eventIdx.has(ev.id)) continue;
    const keys = teamsFile.rowKeys?.get(ev.id) || new Map();
    const at = new Map();
    const players = ev.roster.map((p, i) => {
      at.set(p.player, i);
      return [salt ? pidOf(p.player, salt) : null, nsOf(p.player), p.placing, p.wins, p.losses, p.dropRound, p.topcut ? 1 : 0,
        p.day2 ? 1 : 0, p.species.map(intern), keys.get(p.player) ?? -1];
    });
    const matches = [];
    for (const [a, b, result, round, phase] of ev.matches) {
      if (at.has(a) && at.has(b)) matches.push([at.get(a), at.get(b), result, round, phase]);
    }
    events.push({ event: eventIdx.get(ev.id), id: ev.id, players, matches });
  }
  return { reg, generated: teamsFile.generated, idVersion: salt ? 1 : 0, strings, events };
}
