// Source: official events (limitlessvgc.com) — Worlds/Internationals/Regionals/Special
// Events. Produces RawEvent objects (see build-data.js), grouped by regulation.
import { fetchText } from '../lib/http.js';
import { REGULATIONS } from '../lib/regs.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';

const BASE = 'https://limitlessvgc.com';
const LIST_TTL = 1000 * 60 * 60 * 6;
const PERMANENT = Infinity;
const FORMAT_TO_REG = { 'm-a': 'M-A', 'm-b': 'M-B', 'm-c': 'M-C' };

function tierFor(name) {
  if (/World Championships/i.test(name)) return 'worlds';
  if (/\b(NAIC|EUIC|LAIC|OCIC|International)\b/i.test(name)) return 'international';
  return 'regional';
}

export function parseListingRows(html) {
  const rows = [];
  for (const chunk of html.split('<tr data-date="').slice(1)) {
    const date = /^([^"]+)"/.exec(chunk)?.[1];
    const country = /data-country="([^"]*)"/.exec(chunk)?.[1] || '';
    const name = /data-name="([^"]*)"/.exec(chunk)?.[1] || '';
    const format = /data-format="([^"]*)"/.exec(chunk)?.[1] || '';
    const players = Number(/data-players="(\d+)"/.exec(chunk)?.[1] || 0);
    const idMatch = /\/tournaments\/(\d+)"/.exec(chunk);
    if (!date || !idMatch) continue;
    rows.push({ date, country, name, format, players, id: idMatch[1] });
  }
  return rows;
}

export function parseStandingsRows(html) {
  const rows = [];
  for (const chunk of html.split('<tr data-rank="').slice(1)) {
    const rank = Number(/^(\d+)"/.exec(chunk)?.[1] || 0);
    const name = /data-name="([^"]*)"/.exec(chunk)?.[1] || '';
    const country = /data-country="([^"]*)"/.exec(chunk)?.[1] || '';
    const teamMatch = /\/teams\/(\d+)"/.exec(chunk);
    if (!teamMatch) continue; // team not published for this player
    rows.push({ rank, name, country, teamId: teamMatch[1] });
  }
  return rows;
}

export function parseTeamPage(html) {
  const mons = [];
  for (const chunk of html.split('<div class="pkmn" data-id="').slice(1)) {
    const id = /^([^"]+)"/.exec(chunk)?.[1];
    if (!id) continue;
    const item = /<div class="item">([^<]*)<\/div>/.exec(chunk)?.[1]?.trim() || null;
    const ability = /<div class="ability">Ability:\s*([^<]*)<\/div>/.exec(chunk)?.[1]?.trim() || null;
    const nature = /<div class="nature">([^<]*?)\s*Nature<\/div>/.exec(chunk)?.[1]?.trim() || null;
    const movesBlock = /<ul class="moves">([\s\S]*?)<\/ul>/.exec(chunk)?.[1] || '';
    const moves = [...movesBlock.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1].trim());
    mons.push({ id, item, ability, nature, moves: moves.slice(0, 4) });
  }
  return mons.slice(0, 6);
}

/**
 * Crawls https://limitlessvgc.com/tournaments once and returns RawEvents grouped by
 * regulation (M-A/M-B/M-C). Player win/loss records are not available from this site
 * without executing the standings.limitlessvgc.com SvelteKit app's own API, so every
 * official-source row gets wins/losses/ties = 0 (documented limitation, see report).
 */
export async function fetchOfficialEvents(dex, opts = {}) {
  const existingKeys = opts.existingKeys || new Set();
  const log = opts.log || (() => {});
  const stats = { pagesScanned: 0, candidates: 0, included: 0, excludedRegMismatch: 0, excludedAlreadyHave: 0, excludedNotStarted: 0 };
  const byReg = { 'M-A': [], 'M-B': [], 'M-C': [] };
  const earliestStart = Object.values(REGULATIONS).map((w) => w.start).sort()[0];

  let stop = false;
  for (let page = 1; page <= 30 && !stop; page++) {
    const url = page === 1 ? `${BASE}/tournaments` : `${BASE}/tournaments?page=${page}`;
    const html = await fetchText(url, { ttl: LIST_TTL });
    stats.pagesScanned++;
    const rows = parseListingRows(html);
    if (!rows.length) break;
    for (const row of rows) {
      if (row.date < earliestStart) {
        stop = true;
        break;
      }
      const reg = FORMAT_TO_REG[row.format];
      if (!reg) continue;
      stats.candidates++;
      const key = `lvgc:${row.id}`;
      if (existingKeys.has(key)) {
        stats.excludedAlreadyHave++;
        continue;
      }
      if (row.date >= new Date().toISOString().slice(0, 10)) {
        stats.excludedNotStarted++;
        continue;
      }

      const eventHtml = await fetchText(`${BASE}/tournaments/${row.id}`, { ttl: PERMANENT });
      if (!new RegExp(`Regulation Set ${reg}\\b`).test(eventHtml)) {
        stats.excludedRegMismatch++;
        log(`  [official] SKIP ${row.name} (#${row.id}): page doesn't confirm Regulation Set ${reg}`);
        continue;
      }

      const standingsRows = parseStandingsRows(eventHtml);
      const rawRows = [];
      for (const sr of standingsRows) {
        const teamHtml = await fetchText(`${BASE}/teams/${sr.teamId}`, { ttl: PERMANENT });
        const mons = parseTeamPage(teamHtml)
          .filter((m) => m.id)
          .map((m) => ({
            species: normalizeSpecies(m.id, dex),
            item: m.item,
            ability: m.ability,
            moves: m.moves,
            nature: m.nature,
            sp: null, // official teamlists don't publish Stat Point spreads
          }));
        if (!mons.length) continue;
        rawRows.push({
          player: `${row.id}:${sr.rank}:${sr.name}`, // no stable username on this site; scope key to the event
          name: sr.name,
          country: sr.country,
          placing: sr.rank,
          wins: 0,
          losses: 0,
          ties: 0,
          mons,
        });
      }
      if (!rawRows.length) continue;

      byReg[reg].push({
        key,
        id: key,
        name: row.name,
        date: row.date,
        tier: tierFor(row.name),
        source: 'limitlessvgc',
        url: `${BASE}/tournaments/${row.id}`,
        players: row.players,
        cut: null, // this site's standings page only lists the players whose teams are
                   // published (a "Day 2" cut, not necessarily the single-elim top cut);
                   // not reliably derivable, so left null per instructions.
        rounds: null,
        rows: rawRows,
        matches: [], // no pairings data available from this site
      });
      stats.included++;
      log(`  [official] +${row.name} (${reg}, ${rawRows.length} teams)`);
    }
  }

  return { byReg, stats };
}
