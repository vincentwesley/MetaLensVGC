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
export function loadLadderFile(reg) {
  return fetchJSON(`data/ladder-${reg}.json`).catch(() => ({ reg, source: 'smogon', cutoff: null, months: [] }));
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
