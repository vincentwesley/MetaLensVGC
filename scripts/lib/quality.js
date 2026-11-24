// Data-quality bookkeeping for quality-<REG>.json (see public/data/SCHEMA.md). Pure.
import { normalizeTerm } from '../../public/js/lib/names.js';

const NORM_KINDS = ['species', 'item', 'ability', 'move'];
export function newNormStats() {
  return Object.fromEntries(NORM_KINDS.map((k) => [k, { exact: 0, corrected: 0, placeholder: 0, unknown: 0, unknownNames: [] }]));
}

/** One mon, before -> after normalization. `unknown` = kept as typed because the dex has no such name (abilities: no
 * dex table, so never unknown). Exported for testing. */
export function countNormalization(stats, raw, mon, dex) {
  const table = { species: dex.species, item: dex.items, move: dex.moves, ability: null };
  const one = (kind, before, after) => {
    if (before == null || before === '') return;
    const s = stats[kind];
    if (after == null) s.placeholder++;
    else if (table[kind] && !table[kind][after]) {
      s.unknown++;
      if (s.unknownNames.length < 20 && !s.unknownNames.includes(after)) s.unknownNames.push(after);
    } else if (after === before) s.exact++;
    else s.corrected++;
  };
  one('species', raw.species, mon.species);
  one('item', raw.item, mon.item);
  one('ability', raw.ability, mon.ability);
  const after = new Map(raw.moves.map((m) => [m, normalizeTerm(m, dex, 'move')]));
  for (const m of raw.moves) one('move', m, after.get(m));
}

/**
 * quality-<REG>.json: one record per event in the teams file plus per-regulation totals. Records of events reused from
 * an earlier build are carried over as they were; every record also gets what the written file itself shows (team
 * rows, linked matches by result, match context present). Exported for testing.
 */
export function qualityFile(reg, teamsFile, quality) {
  const events = {};
  const perEvent = teamsFile.events.map(() => ({ teams: 0, matches: { linked: 0, decisive: 0, ties: 0, noResult: 0, withRound: 0 } }));
  const rowEvent = teamsFile.teams.map((t) => t[0]);
  for (const t of teamsFile.teams) perEvent[t[0]].teams++;
  for (const [a, , result, round] of teamsFile.matches) {
    const m = perEvent[rowEvent[a]].matches;
    m.linked++;
    if (result === 1 || result === 2) m.decisive++;
    else if (result === 3) m.noResult++;
    else m.ties++; // 0: tie (or, in matches built before v1.7.0, tie or unknown)
    if (round) m.withRound++;
  }
  teamsFile.events.forEach((ev, i) => {
    events[ev.id] = { ...(quality[ev.id] || {}), file: perEvent[i], coverage: ev.coverage ?? quality[ev.id]?.coverage ?? null };
  });
  return { reg, generated: teamsFile.generated, events, totals: totals(Object.values(events)) };
}

/** Sums every numeric leaf (rows.*, pairings.*, normalization.*.*, file.*) across event records. */
export function totals(records) {
  const out = {};
  const add = (dst, src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (typeof v === 'number' && k !== 'rate' && k !== 'players') dst[k] = (dst[k] || 0) + v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) add((dst[k] ||= {}), v);
    }
  };
  for (const r of records) add(out, { rows: r.rows, pairings: r.pairings, normalization: r.normalization, file: r.file });
  out.events = records.length;
  out.eventsByCoverage = {};
  for (const r of records) {
    const kind = r.coverage?.kind || 'unknown';
    out.eventsByCoverage[kind] = (out.eventsByCoverage[kind] || 0) + 1;
  }
  return out;
}
