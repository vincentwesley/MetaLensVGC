// Source: official Pokémon Champions ranked-ladder "Battle Data"
// (https://championsbattledata.com, unofficial fan API — see /api_guide, /api-rules/).
// Doubles only. ToS: attribution required, no mirroring/redistribution as a data service,
// so we keep only what the site itself displays (top ~10 per category, as provided) and
// only the LAST daily snapshot of each finished in-game season (no daily-archive dump).
import { fetchJSON, fetchText } from '../lib/http.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';
import { regForDate } from '../lib/regs.js';

const API_BASE = 'https://championsbattledata.com';
const FORMAT = 'Doubles';
const INDEX_TTL = 1000 * 60 * 60 * 6; // index/current-season data can change within a day
export const ATTRIBUTION = {
  text: 'Battle data provided by Pokémon Champions Battle Data',
  url: 'https://championsbattledata.com/',
};

/** "29_09_2026" -> "2026-09-29" */
function ddmmyyyyToISO(d) {
  const [dd, mm, yyyy] = d.split('_');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * From index.dailyDataFolders (e.g. ["M6/29_09_2026", ..., "M1/13_05_2026"]) derive, per
 * in-game season, its last snapshot date and which regulation window it belongs to.
 * Finished seasons have exactly one dated folder listed (their final day); the season
 * still being collected has one per day so far — its latest date wins either way.
 *
 * A season's *last* snapshot often lands exactly on (or just past) the next regulation's
 * start — the archive snapshot is taken at rollover, one reg-window tick into the new
 * period, even though the season itself ran almost entirely in the previous one (verified
 * against dailyDataFolders: M2's last day is 2026-06-17, the exact M-A/M-B boundary; M5's
 * is 2026-09-10, one day past the M-B/M-C boundary). So each season is classified by when
 * it *started* — the day after the previous (chronologically-ordered) season's last
 * snapshot — not by its own last day. The first season in the list has no predecessor, so
 * its own snapshot is used. Pure and exported for testing.
 */
export function deriveSeasonMeta(dailyDataFolders) {
  const latest = new Map(); // season -> snapshot ISO date
  for (const folder of dailyDataFolders) {
    const [season, rawDate] = folder.split('/');
    const snapshot = ddmmyyyyToISO(rawDate);
    const prev = latest.get(season);
    if (!prev || snapshot > prev) latest.set(season, snapshot);
  }
  const ordered = [...latest.entries()].sort((a, b) => a[1].localeCompare(b[1])); // seasons are contiguous, chronological
  const seasons = [];
  let prevSnapshot = null;
  for (const [season, snapshot] of ordered) {
    const startDate = prevSnapshot ? addDaysISO(prevSnapshot, 1) : snapshot;
    const reg = regForDate(startDate);
    if (!reg) throw new Error(`ranked.js: season ${season} (starts ~${startDate}) falls outside every regulation window`);
    seasons.push({ season, snapshot, reg });
    prevSnapshot = snapshot;
  }
  return seasons;
}

function pct(row) {
  return typeof row.percentage_value === 'number' ? Math.round(row.percentage_value * 10) / 1000 : null;
}

/**
 * Battle-endpoint `rows[]` (one Pokémon, one season) -> the SCHEMA.md mon shape
 * (minus `rank`, which depends on the season's ranking, not the rows). Pure, no fetch.
 */
export function transformRows(rows, dex) {
  const moves = {};
  const items = {};
  const abilities = {};
  const natures = {};
  const spreadRows = [];
  const teammateRows = [];
  for (const row of rows) {
    switch (row.category) {
      case 'move': moves[row.name] = pct(row); break;
      case 'held_item': items[row.name] = pct(row); break;
      case 'ability': abilities[row.name] = pct(row); break;
      case 'stat_alignment': natures[row.name] = pct(row); break;
      case 'stat_points':
        spreadRows.push([
          [row.hp_points, row.attack_points, row.defense_points, row.sp_atk_points, row.sp_def_points, row.speed_points].join('/'),
          pct(row),
          row.rank,
        ]);
        break;
      case 'teammate':
        teammateRows.push([normalizeSpecies(row.name, dex), row.rank]);
        break;
      default:
        break;
    }
  }
  spreadRows.sort((a, b) => a[2] - b[2]);
  teammateRows.sort((a, b) => a[1] - b[1]);
  const spreads = {};
  for (const [key, v] of spreadRows) spreads[key] = v;
  return { moves, items, abilities, natures, spreads, teammates: teammateRows.map(([name]) => name) };
}

/**
 * Parses the server-rendered "Doubles usage ranking" table on
 * /pokemon-champions-ranked-usage/ (rank order only, no shares — the game publishes
 * ranks, not usage percentages). This table is static SEO content for the CURRENT
 * season only (a `?season=` query does not change it; the client-side season picker
 * on that page is for the general explorer, not this table) — no historical per-season
 * ranking is exposed anywhere on the site. Returns null if the table isn't found.
 * Pure, no fetch.
 */
export function parseRankingTable(html) {
  const heading = html.indexOf('Doubles usage ranking');
  if (heading === -1) return null;
  const tblStart = html.indexOf('<table', heading);
  const tblEnd = tblStart === -1 ? -1 : html.indexOf('</table>', tblStart);
  if (tblStart === -1 || tblEnd === -1) return null;
  const table = html.slice(tblStart, tblEnd);
  const rows = [...table.matchAll(/<td data-label="Rank">(\d+)<\/td><td data-label="Pokemon"><a href="[^"]+">([^<]+)<\/a>/g)];
  return rows.length ? rows.map((m) => m[2]) : null;
}

/**
 * @param {string} reg "M-A" | "M-B" | "M-C"
 * @param {object} dex
 * @param {{existingSeasons?: Set<string>, log?: (s:string)=>void}} [opts]
 *   existingSeasons: season ids already fully fetched in a previous run (the caller
 *   merges them back in); the current season is always refetched regardless.
 * @returns {Promise<{reg, source: "championsbattledata", format: "Doubles", attribution, seasons}>}
 *   `seasons` holds only newly-fetched seasons (not ones skipped via existingSeasons).
 */
export async function fetchRanked(reg, dex, opts = {}) {
  const existingSeasons = opts.existingSeasons || new Set();
  const log = opts.log || (() => {});

  const index = await fetchJSON(`${API_BASE}/api`, { ttl: INDEX_TTL });
  const allSeasons = deriveSeasonMeta(index.dailyDataFolders);
  const currentSeason = allSeasons.reduce((a, b) => (a.snapshot > b.snapshot ? a : b)).season;
  const regSeasons = allSeasons.filter((s) => s.reg === reg).sort((a, b) => a.snapshot.localeCompare(b.snapshot));

  let ranking = null;
  if (regSeasons.some((s) => s.season === currentSeason)) {
    try {
      const html = await fetchText(`${API_BASE}/pokemon-champions-ranked-usage/`, { ttl: INDEX_TTL });
      const raw = parseRankingTable(html);
      ranking = raw && raw.map((n) => normalizeSpecies(n, dex));
    } catch {
      ranking = null;
    }
  }
  const rankOf = new Map((ranking || []).map((name, i) => [name, i + 1]));

  const seasons = [];
  for (const { season, snapshot } of regSeasons) {
    if (season !== currentSeason && existingSeasons.has(season)) {
      log(`  [ranked ${reg}] ${season}: reused from existing file`);
      continue;
    }
    const mons = {};
    let n = 0;
    for (const p of index.pokemon) {
      const url = `${API_BASE}/api/battle/${FORMAT}/${p.showdownId}?season=${season}`;
      let data;
      try {
        data = await fetchJSON(url, { ttl: season === currentSeason ? INDEX_TTL : Infinity });
      } catch {
        continue; // no data for this mon/season (didn't exist yet, 404, etc.)
      }
      if (!data.rows || !data.rows.length) continue;
      const name = normalizeSpecies(data.pokemon || p.showdownName, dex);
      mons[name] = { rank: rankOf.get(name) ?? null, ...transformRows(data.rows, dex) };
      n++;
    }
    seasons.push({
      season,
      snapshot,
      url: `${API_BASE}/api/battle/${FORMAT}/:name?season=${season}`,
      ranking: season === currentSeason ? ranking : null,
      mons,
    });
    log(`  [ranked ${reg}] ${season} (${snapshot}): ${n} mons`);
  }
  return { reg, source: 'championsbattledata', format: FORMAT, attribution: ATTRIBUTION, seasons };
}
