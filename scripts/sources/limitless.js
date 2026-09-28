// Source: Limitless Play API (online tournaments, play.limitlesstcg.com/api).
// Produces RawEvent objects (see build-data.js) for a single regulation.
import { fetchJSON } from '../lib/http.js';
import { inWindow } from '../lib/regs.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';

const API = 'https://play.limitlesstcg.com/api';
const MIN_PLAYERS = 16;
const LIST_TTL = 1000 * 60 * 60 * 6; // tournament lists change often; short-ish TTL
const PERMANENT = Infinity; // completed tournaments' standings/pairings never change
export const SETTLED_BEFORE = new Date(Date.now() - 48 * 3600e3).toISOString();
export const RECENT_BEFORE = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();

async function listTournaments(format) {
  const out = [];
  for (let page = 1; ; page++) {
    const url = `${API}/tournaments?game=VGC&format=${format}&limit=100&page=${page}`;
    const batch = await fetchJSON(url, { ttl: LIST_TTL });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

function mapMoves(attacks) {
  return (attacks || []).filter(Boolean).slice(0, 4);
}

/**
 * @param {string} reg "M-A" | "M-B" | "M-C"
 * @param {object} dex built dex.json-shape object (for species normalization)
 * @param {{existingKeys?: Set<string>, maxTournaments?: number, log?: (s:string)=>void}} [opts]
 */
export async function fetchLimitlessOnline(reg, dex, opts = {}) {
  const existingKeys = opts.existingKeys || new Set();
  const log = opts.log || (() => {});
  const stats = { listed: 0, fetchedNew: 0, included: 0, excludedPlayers: 0, excludedNoDecklists: 0, excludedRegMismatch: 0, excludedAlreadyHave: 0 };
  const rawEvents = [];

  const list = await listTournaments(reg);
  stats.listed = list.length;

  let fetchedCount = 0;
  for (const t of list) {
    const key = `limitless:${t.id}`;
    if (existingKeys.has(key)) {
      stats.excludedAlreadyHave++;
      continue;
    }
    if (t.date >= SETTLED_BEFORE) continue; // skip events that may still be running
    // results of fresh events can still change; don't cache them forever
    const ttl = t.date >= RECENT_BEFORE ? 6 * 3600e3 : PERMANENT;
    if (t.players < MIN_PLAYERS) {
      stats.excludedPlayers++;
      continue;
    }
    const date = t.date.slice(0, 10);
    if (!inWindow(date, reg)) {
      stats.excludedRegMismatch++;
      continue;
    }
    if (opts.maxTournaments && fetchedCount >= opts.maxTournaments) break;
    fetchedCount++;
    stats.fetchedNew++;

    const details = await fetchJSON(`${API}/tournaments/${t.id}/details`, { ttl: ttl });
    if (!details.decklists) {
      stats.excludedNoDecklists++;
      continue;
    }

    const standings = await fetchJSON(`${API}/tournaments/${t.id}/standings`, { ttl: ttl });
    const rows = [];
    for (const p of standings) {
      if (!p.decklist || !p.decklist.length) continue;
      const mons = p.decklist.slice(0, 6).map((mon) => ({
        species: normalizeSpecies(mon.id || mon.name, dex),
        item: mon.item || null,
        ability: mon.ability || null,
        moves: mapMoves(mon.attacks),
        nature: mon.nature || null,
        sp: null, // Limitless online decklists don't carry Stat Points
      }));
      if (!mons.length) continue;
      rows.push({
        player: p.player,
        name: p.name,
        country: p.country || '',
        placing: p.placing ?? null,
        wins: p.record?.wins ?? 0,
        losses: p.record?.losses ?? 0,
        ties: p.record?.ties ?? 0,
        mons,
      });
    }
    if (!rows.length) {
      stats.excludedNoDecklists++;
      continue;
    }

    const pairings = await fetchJSON(`${API}/tournaments/${t.id}/pairings`, { ttl: ttl });
    const bracketPlayers = new Set();
    const matches = [];
    for (const pr of pairings) {
      if (pr.phase >= 2) {
        if (pr.player1) bracketPlayers.add(pr.player1);
        if (pr.player2) bracketPlayers.add(pr.player2);
      }
      if (!pr.player1 || !pr.player2) continue; // bye / unplayed
      let result = 0;
      if (pr.winner === pr.player1) result = 1;
      else if (pr.winner === pr.player2) result = 2;
      matches.push([pr.player1, pr.player2, result]);
    }
    const cut = bracketPlayers.size || null;
    const rounds = details.phases?.[0]?.rounds ?? null;

    rawEvents.push({
      key,
      id: `lt:${t.id}`,
      name: t.name,
      date,
      tier: 'online',
      source: 'limitless',
      url: `https://play.limitlesstcg.com/tournament/${t.id}/standings`,
      players: t.players,
      cut,
      rounds,
      rows,
      matches,
    });
    stats.included++;
    log(`  [limitless ${reg}] +${t.name} (${t.players}p, ${rows.length} decklists)`);
  }

  return { rawEvents, stats };
}
