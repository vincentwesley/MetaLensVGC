// Source: official events (limitlessvgc.com) — Worlds/Internationals/Regionals/Special
// Events. Produces RawEvent objects (see build-data.js), grouped by regulation.
import { fetchText } from '../lib/http.js';
import { REGULATIONS } from '../lib/regs.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';

const BASE = 'https://limitlessvgc.com';
const STANDINGS_BASE = 'https://standings.limitlessvgc.com';
const LIST_TTL = 1000 * 60 * 60 * 6;
const PERMANENT = Infinity;
const FORMAT_TO_REG = { 'm-a': 'M-A', 'm-b': 'M-B', 'm-c': 'M-C' };
// Budget for the standings site's per-round pairings fetches (one request/round).
// Beyond this, skip `matches` for the event rather than hammering the host.
const MAX_PAIRINGS_ROUNDS = 20;

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
    let id = /^([^"]+)"/.exec(chunk)?.[1];
    if (!id) continue;
    // data-id occasionally omits a gender/form suffix that the sprite filename
    // (sprites/home-sv/<id>.png) still discloses; prefer whichever is more specific.
    const spriteId = /sprites\/home-sv\/([a-z0-9-]+)\.png/.exec(chunk)?.[1];
    if (spriteId && spriteId.length > id.length && spriteId.startsWith(id)) id = spriteId;
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
 * The standings site (SvelteKit) embeds each `fetch()` it made server-side as
 * `<script type="application/json" data-sveltekit-fetched data-url="...">{"status":200,...,"body":"<json text>"}</script>`.
 * Finds the entry whose `data-url` contains `urlSubstring` and returns its parsed `body`.
 */
function extractFetchedJSON(html, urlSubstring) {
  const marker = 'data-sveltekit-fetched data-url="';
  let idx = 0;
  for (;;) {
    idx = html.indexOf(marker, idx);
    if (idx === -1) return null;
    const urlStart = idx + marker.length;
    const urlEnd = html.indexOf('"', urlStart);
    const url = html.slice(urlStart, urlEnd);
    const tagEnd = html.indexOf('>', urlEnd);
    if (!url.includes(urlSubstring)) {
      idx = tagEnd;
      continue;
    }
    const bodyStart = tagEnd + 1;
    const bodyEnd = html.indexOf('</script>', bodyStart);
    try {
      const outer = JSON.parse(html.slice(bodyStart, bodyEnd));
      return JSON.parse(outer.body);
    } catch {
      return null;
    }
  }
}

function extractStandingsCode(eventHtml) {
  return /standings\.limitlessvgc\.com\/(\d+)\/standings/.exec(eventHtml)?.[1] || null;
}

/**
 * Fetches standings.limitlessvgc.com's Masters-division standings page for `code`.
 * Returns `{ rounds, players }` where `players` is the raw per-player JSON array
 * (`{player_id, tp_id, name, country, placement, wins, losses, topcut, team, ...}`,
 * no `ties` field is published) or `null` if the page isn't available/parseable.
 */
async function fetchStandingsData(code, log) {
  try {
    const html = await fetchText(`${STANDINGS_BASE}/${code}/standings`, { ttl: PERMANENT });
    const tourney = extractFetchedJSON(html, 'vgc/tournament')?.message;
    const players = extractFetchedJSON(html, 'vgc/standings')?.message;
    if (!Array.isArray(players)) return null;
    return { rounds: tourney?.round ?? null, players };
  } catch (err) {
    log(`  [official] standings site fetch failed for ${code}: ${err.message}`);
    return null;
  }
}

function matchStandingRow(sr, players) {
  return (
    players.find((p) => p.name === sr.name && p.country === sr.country) ||
    players.find((p) => p.placement === sr.rank) ||
    null
  );
}

/** One request per round (SSR-embedded pairings for that round). Matches by tp_id. */
async function fetchOfficialMatches(code, rounds, tpIdToPlayer, log) {
  const matches = [];
  if (!rounds || rounds > MAX_PAIRINGS_ROUNDS) {
    log(`  [official] skip pairings for ${code} (rounds=${rounds ?? 'unknown'} exceeds ${MAX_PAIRINGS_ROUNDS}-request budget)`);
    return matches;
  }
  for (let round = 1; round <= rounds; round++) {
    const html = await fetchText(`${STANDINGS_BASE}/${code}/pairings?round=${round}`, { ttl: PERMANENT });
    const pairings = extractFetchedJSON(html, 'vgc/pairings')?.message;
    if (!Array.isArray(pairings)) continue;
    for (const pr of pairings) {
      const a = tpIdToPlayer.get(pr.player1);
      const b = tpIdToPlayer.get(pr.player2);
      if (!a || !b) continue; // bye, or one side has no published team row
      let result = 0;
      if (pr.winner === pr.player1) result = 1;
      else if (pr.winner === pr.player2) result = 2;
      matches.push([a, b, result]);
    }
  }
  return matches;
}

/**
 * Crawls https://limitlessvgc.com/tournaments and returns RawEvents grouped by
 * regulation (M-A/M-B/M-C). Every event is always fully rebuilt from the HTTP cache
 * (all requests below use ttl: PERMANENT, so a rerun costs disk reads, not network
 * calls) rather than skipped when already present, so a parser fix — like adding
 * real records here — takes effect on already-fetched events without a version bump.
 */
export async function fetchOfficialEvents(dex, opts = {}) {
  const log = opts.log || (() => {});
  const stats = {
    pagesScanned: 0,
    candidates: 0,
    included: 0,
    excludedRegMismatch: 0,
    excludedNotStarted: 0,
    withRecords: 0,
    withCut: 0,
    withMatches: 0,
  };
  const byReg = { 'M-A': [], 'M-B': [], 'M-C': [] };
  const earliestStart = Object.values(REGULATIONS).map((w) => w.start).filter(Boolean).sort()[0];

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
      const code = extractStandingsCode(eventHtml);
      const standingsData = code ? await fetchStandingsData(code, log) : null;
      const players = standingsData?.players || [];

      const rawRows = [];
      const tpIdToPlayer = new Map();
      let matchedRecords = 0;
      for (const sr of standingsRows) {
        const teamHtml = await fetchText(`${BASE}/teams/${sr.teamId}`, { ttl: PERMANENT });
        const mons = parseTeamPage(teamHtml)
          .filter((m) => m.id)
          .map((m) => ({
            // official lists sometimes omit Indeedee's gender; per owner's call, assume female
            species: ((s) => (s === 'Indeedee' ? 'Indeedee-F' : s))(normalizeSpecies(m.id, dex)),
            item: m.item,
            ability: m.ability,
            moves: m.moves,
            nature: m.nature,
            sp: null, // official teamlists don't publish Stat Point spreads
          }));
        if (!mons.length) continue;

        const match = players.length ? matchStandingRow(sr, players) : null;
        if (match) matchedRecords++;
        const player = `${row.id}:${sr.rank}:${sr.name}`; // no stable username on this site; scope key to the event
        rawRows.push({
          player,
          name: sr.name,
          country: sr.country,
          placing: sr.rank,
          wins: match?.wins ?? 0,
          losses: match?.losses ?? 0,
          ties: 0, // standings.limitlessvgc.com's player summary doesn't publish a ties field
          mons,
        });
        if (match) tpIdToPlayer.set(match.tp_id, player);
      }
      if (!rawRows.length) continue;
      if (players.length && matchedRecords < standingsRows.length) {
        log(`  [official] ${row.name}: matched records for ${matchedRecords}/${standingsRows.length} published teams`);
      }

      const cutCount = players.filter((p) => p.topcut === 1).length;
      const cut = cutCount || null;
      let matches = [];
      if (players.length) {
        matches = await fetchOfficialMatches(code, standingsData.rounds, tpIdToPlayer, log);
      }

      if (matchedRecords > 0) stats.withRecords++;
      if (cut != null) stats.withCut++;
      if (matches.length) stats.withMatches++;

      byReg[reg].push({
        key,
        id: key,
        name: row.name,
        date: row.date,
        tier: tierFor(row.name),
        source: 'limitlessvgc',
        url: `${BASE}/tournaments/${row.id}`,
        players: row.players,
        cut,
        rounds: standingsData?.rounds ?? null,
        rows: rawRows,
        matches,
      });
      stats.included++;
      log(`  [official] +${row.name} (${reg}, ${rawRows.length} teams, cut=${cut ?? 'n/a'}, ${matches.length} matches)`);
    }
  }

  return { byReg, stats };
}
