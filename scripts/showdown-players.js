#!/usr/bin/env node
// Daily Showdown ladder + replay sample (v1.9.1), run by .github/workflows/showdown-players.yml (and by hand:
// `npm run showdown`). For each Showdown format (ND, NDD):
//   1. showdown-ladder-<REG>.json: today's top 500 from pokemonshowdown.com/ladder/<format>.json, merged into the
//      running history (peak Elo / best rank since tracking began; scripts/lib/showdown-ladder.js).
//   2. showdown-replays-<REG>.json: recent RATED public replays of the current top REPLAY_PLAYERS players, parsed to
//      compact game records (public/js/lib/replays.js), kept for the last WINDOW_DAYS days. Replays are immutable, so
//      only new ids are fetched.
// Public data only (Showdown's own ladder and replay pages); usernames are shown as Showdown shows them.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchJSON } from './lib/http.js';
import { REGULATIONS, SHOWDOWN_IDS } from './lib/regs.js';
import { updateLadderHistory } from './lib/showdown-ladder.js';
import { parseReplay } from '../public/js/lib/replays.js';

export const REPLAY_PLAYERS = 200; // top players whose recent replays are sampled (v1.11: 200 so niche Pokémon have users)
export const WINDOW_DAYS = 30;
export const MAX_GAMES = 2000; // per format, newest first
const DATA = path.join(process.cwd(), 'public', 'data');
const readIf = async (f) => JSON.parse(await readFile(path.join(DATA, f), 'utf8').catch(() => 'null'));
const log = (...a) => console.log(...a);

/** Replay records within the window, newest first, de-duplicated, capped. */
export function keepWindow(games, today, days = WINDOW_DAYS, max = MAX_GAMES) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const seen = new Set();
  return games.filter((g) => g && g.date >= from && !seen.has(g.id) && seen.add(g.id))
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : a.id < b.id ? -1 : 1)).slice(0, max);
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  for (const reg of SHOWDOWN_IDS) {
    const { format } = REGULATIONS[reg];
    // 1) ladder
    const ladder = await fetchJSON(`https://pokemonshowdown.com/ladder/${format}.json`, { ttl: 0 });
    const prevLadder = await readIf(`showdown-ladder-${reg}.json`);
    const manual = (await readFile(path.join(process.cwd(), 'data-manual', 'showdown-ladder-observations.json'), 'utf8')
      .then(JSON.parse).catch(() => ({ observations: [] }))).observations.filter((o) => o.reg === reg);
    const next = updateLadderHistory(prevLadder, { reg, format, toplist: ladder.toplist, date: today, manual });
    await writeFile(path.join(DATA, `showdown-ladder-${reg}.json`), JSON.stringify(next));
    log(`[${reg}] ladder: ${ladder.toplist?.length || 0} players, ${Object.keys(next.players).length} tracked since ${next.tracking.since}`);

    // 2) replays of the current top players
    const prevReplays = await readIf(`showdown-replays-${reg}.json`);
    const have = new Map((prevReplays?.games || []).map((g) => [g.id, g]));
    const ids = new Set();
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - WINDOW_DAYS * 86400000) / 1000;
    for (const p of next.top.slice(0, REPLAY_PLAYERS)) {
      const list = await fetchJSON(`https://replay.pokemonshowdown.com/search.json?user=${encodeURIComponent(p.userid)}&format=${format}`, { ttl: 1000 * 60 * 60 * 6 }).catch(() => []);
      for (const r of list || []) if (r.rating && !r.private && !r.password && r.uploadtime >= from) ids.add(r.id);
    }
    const games = [...have.values()];
    let fetched = 0;
    for (const id of [...ids].sort().reverse()) {
      if (have.has(id) || games.length >= MAX_GAMES * 1.2) continue;
      const json = await fetchJSON(`https://replay.pokemonshowdown.com/${id}.json`, { ttl: Infinity }).catch(() => null);
      const rec = json && parseReplay(json);
      if (rec) { games.push(rec); fetched++; }
    }
    const kept = keepWindow(games, today);
    await writeFile(path.join(DATA, `showdown-replays-${reg}.json`), JSON.stringify({
      reg, format, source: 'https://replay.pokemonshowdown.com', updated: today,
      sample: { players: Math.min(REPLAY_PLAYERS, next.top.length), windowDays: WINDOW_DAYS, rated: true }, games: kept,
    }));
    log(`[${reg}] replays: ${fetched} new, ${kept.length} in the last ${WINDOW_DAYS} days`);
  }
}

if (process.argv[1]?.endsWith('showdown-players.js')) run().catch((e) => { console.error(e); process.exit(1); });
