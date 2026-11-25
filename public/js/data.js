// Fetch + cache layer for public/data/*.json. No DOM, no decoding logic of its
// own beyond calling the supplied `decode` (from js/lib/aggregate.js) once per
// regulation, and caching the result so switching regs back and forth (needed
// for "previous period" comparisons) doesn't re-fetch or re-decode.

const rawCache = new Map(); // path -> parsed JSON
const decodedCache = new Map(); // reg -> { teams, events, matches }

async function fetchJSON(path) {
  if (rawCache.has(path)) return rawCache.get(path);
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const json = await res.json();
  rawCache.set(path, json);
  return json;
}

export function loadManifest() { return fetchJSON('data/manifest.json'); }
export function loadDex() { return fetchJSON('data/dex.json'); }
/** Base-game dex for the Showdown family (dex-natdex.json); the Champions one is data/dex.json. */
export function loadDexFile(family) { return fetchJSON(`data/dex-${family}.json`); }
export function loadTeamsFile(reg) { return fetchJSON(`data/teams-${reg}.json`); }
/** rating: Smogon rating cutoff; 1760 is ladder-<REG>.json, the others ladder-<REG>-<rating>.json (Showdown regs). */
export function loadLadderFile(reg, rating = '1760') {
  const file = String(rating) === '1760' ? `data/ladder-${reg}.json` : `data/ladder-${reg}-${rating}.json`;
  return fetchJSON(file).catch(() => ({ reg, source: 'smogon', cutoff: null, months: [] }));
}

/** Smogon sample teams + sets for a Showdown reg (samples-<REG>.json); null when absent. */
export function loadSamplesFile(reg) {
  return fetchJSON(`data/samples-${reg}.json`).catch(() => null);
}

/** Showdown ladder history + top-ladder replay sample (v1.9.1); null when the daily job hasn't produced them. */
export async function loadPlayersFiles(reg) {
  const [ladder, replays] = await Promise.all([
    fetchJSON(`data/showdown-ladder-${reg}.json`).catch(() => null),
    fetchJSON(`data/showdown-replays-${reg}.json`).catch(() => null),
  ]);
  return { ladder, replays };
}

export function loadRankedFile(reg) {
  return fetchJSON(`data/ranked-${reg}.json`).catch(() => ({ reg, source: 'championsbattledata', seasons: [] }));
}

/** Pokédex roster for a family ('vgc' | 'natdex'). Empty roster when missing, never throws. */
export function loadPokedexFile(family = 'vgc') {
  const path = `data/pokedex-${family}.json`;
  // failures are not cached (a transient error must not blank the Pokédex for the session);
  // the section asks once per family, so there is no re-request storm
  return fetchJSON(path).catch(() => ({ tierOrder: [], species: {} }));
}
/** Learnsets for a family, fetched only when a move filter first needs them. null when missing. */
export function loadLearnsetsFile(family = 'vgc') {
  return fetchJSON(`data/learnsets-${family}.json`).catch(() => null);
}

/** Decode (and cache) a regulation's teams file. Kept for the lifetime of the
 *  page so a previously-viewed reg's teams stay available for previousPeriod. */
const decoding = new Map(); // reg -> in-flight promise (a chunked decode yields, so a second caller must not start another)
export function getDecoded(reg, dex, decode) {
  if (decodedCache.has(reg)) return Promise.resolve(decodedCache.get(reg));
  if (!decoding.has(reg)) {
    decoding.set(reg, loadTeamsFile(reg)
      .then((file) => decode(file, dex)) // decode may be sync or return a promise (decodeChunked)
      .then((decoded) => { decodedCache.set(reg, decoded); return decoded; })
      .finally(() => decoding.delete(reg)));
  }
  return decoding.get(reg);
}

export function getDecodedSync(reg) { return decodedCache.get(reg) || null; }

// --- live Pokémon Showdown lookups (v1.9.1, Showdown "Players & replays") -------------------------------------
// The only requests that leave the site's own data: pokemonshowdown.com user JSON and replay.pokemonshowdown.com
// (both public, CORS-open; allowed in _headers connect-src). The user id is reduced to [a-z0-9] before it goes in a URL.
const PS_USER = 'https://pokemonshowdown.com/users/';
const PS_REPLAYS = 'https://replay.pokemonshowdown.com/';
const lookupCache = new Map();

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Public profile + recent replays of a Showdown user in `format`: { profile|null, replays: [{id, uploadtime, rating,
 * players}], games: parsed records (the newest `logs` replays, via parseReplay) }. Cached per user + format.
 */
export async function lookupShowdownUser(userid, format, { parseReplay, logs = 12 } = {}) {
  const id = String(userid || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!id) throw new Error('empty user id');
  const key = `${id}|${format}`;
  if (lookupCache.has(key)) return lookupCache.get(key);
  const job = (async () => {
    const profile = await getJSON(`${PS_USER}${id}.json`).catch(() => null);
    const replays = await getJSON(`${PS_REPLAYS}search.json?user=${id}&format=${encodeURIComponent(format)}`).catch(() => []);
    const list = (Array.isArray(replays) ? replays : []).filter((r) => !r.private && !r.password);
    const games = [];
    const ids = list.slice(0, logs).map((r) => r.id).filter((x) => /^[a-z0-9-]+$/.test(x));
    for (let i = 0; i < ids.length; i += 3) { // 3 at a time
      const batch = await Promise.all(ids.slice(i, i + 3).map((rid) => getJSON(`${PS_REPLAYS}${rid}.json`).catch(() => null)));
      for (const j of batch) { const g = j && parseReplay ? parseReplay(j) : null; if (g) games.push(g); }
    }
    return { id, profile, replays: list, games };
  })();
  lookupCache.set(key, job);
  job.catch(() => lookupCache.delete(key));
  return job;
}
