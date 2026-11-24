// Source: Limitless Play API (online tournaments, play.limitlesstcg.com/api).
// Produces RawEvent objects (see build-data.js) for a single regulation.
import { fetchJSON } from '../lib/http.js';
import { inWindow } from '../lib/regs.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';
import { ltKey } from '../lib/ids.js';

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
    const drops = { noDecklist: 0, emptyTeam: 0, overSix: 0 };
    for (const p of standings) {
      if (!p.decklist || !p.decklist.length) { drops.noDecklist++; continue; }
      if (p.decklist.length > 6) drops.overSix++;
      const mons = p.decklist.slice(0, 6).map((mon) => ({
        species: normalizeSpecies(mon.id || mon.name, dex),
        item: mon.item || null,
        ability: mon.ability || null,
        moves: mapMoves(mon.attacks),
        nature: mon.nature || null,
        sp: null, // Limitless online decklists don't carry Stat Points
      }));
      if (!mons.length) { drops.emptyTeam++; continue; }
      rows.push({
        player: ltKey(p.player), // source key: stable Limitless username
        dropped: p.drop ?? null,
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
    const { matches, pairingStats, cut } = limitlessMatches(pairings, details.phases);
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
      phases: eventPhases(details.phases),
      coverage: coverageOf(t.players, rows.length),
      rows,
      matches,
      pairingStats,
      drops,
    });
    stats.included++;
    log(`  [limitless ${reg}] +${t.name} (${t.players}p, ${rows.length} decklists)`);
  }

  return { rawEvents, stats };
}

// Phase types and match modes as Limitless publishes them (details.phases[]).
const PHASE = { SWISS: 1 }; // anything else (SINGLE_BRACKET, DOUBLE_BRACKET...) is top cut = 2
const BEST_OF = { BO1: 1, BO3: 3 };

/** details.phases -> [{phase, type, rounds, bo}] (bo 0 = not published). Pure, exported for testing. */
export function eventPhases(phases) {
  return (phases || []).map((ph) => ({ phase: ph.phase, type: ph.type || null, rounds: ph.rounds ?? null, bo: BEST_OF[ph.mode] || 0 }));
}

/** Coverage of published team lists: online events publish a list for every player who submitted one. */
export function coverageOf(players, lists) {
  const rate = players ? Math.min(1, lists / players) : null;
  return { players: players ?? null, lists, rate: rate == null ? null : Math.round(rate * 1000) / 1000, kind: rate != null && rate >= 0.95 ? 'complete' : 'published-subset' };
}

/**
 * Limitless pairings -> matches [keyA, keyB, result, round, phase, bo, games?] plus why pairings did not become a
 * result. result: 1/2 winner, 0 tie (winner 0), 3 no result (winner -1: double loss / unreported). phase 1 Swiss,
 * 2 top cut. games: [gamesWonByA, gamesWonByB] when the source lists per-game winners. Pure, exported for testing.
 */
export function limitlessMatches(pairings, phases) {
  const meta = new Map((phases || []).map((ph) => [ph.phase, ph]));
  const bracketPlayers = new Set();
  const stats = { total: 0, byes: 0, decisive: 0, ties: 0, noResult: 0 };
  const matches = [];
  for (const pr of pairings || []) {
    stats.total++;
    const ph = meta.get(pr.phase);
    const phase = ph ? (PHASE[ph.type] || 2) : (pr.phase >= 2 ? 2 : 1);
    if (phase === 2) {
      if (pr.player1) bracketPlayers.add(pr.player1);
      if (pr.player2) bracketPlayers.add(pr.player2);
    }
    if (!pr.player1 || !pr.player2) { stats.byes++; continue; }
    let result;
    if (pr.winner === pr.player1) result = 1;
    else if (pr.winner === pr.player2) result = 2;
    else if (pr.winner === 0 || pr.winner === '0') result = 0;
    else result = 3;
    if (result === 0) stats.ties++;
    else if (result === 3) stats.noResult++;
    else stats.decisive++;
    const m = [ltKey(pr.player1), ltKey(pr.player2), result, pr.round ?? 0, phase, BEST_OF[ph?.mode] || 0];
    const games = Object.values(pr.games || {});
    if (games.length) m.push([games.filter((g) => g.winner === pr.player1).length, games.filter((g) => g.winner === pr.player2).length]);
    matches.push(m);
  }
  return { matches, pairingStats: stats, cut: bracketPlayers.size || null };
}
