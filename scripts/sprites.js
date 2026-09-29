// Resolves which Showdown sprite URLs actually exist, at build time, so the browser
// never requests a URL that 404s (Chrome logs every 404 as a console error, and e2e
// requires zero). Mutates dex species entries in place: `sprite` becomes the spriteid
// to use (own, else base species', else null) and `ani` becomes the animated sprite's
// URL path segment (e.g. "gen5ani/charizard.gif"), or null if none exists.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PS = 'https://play.pokemonshowdown.com/sprites';
const CACHE_DIR = path.join(process.cwd(), 'data-raw', 'cache', 'sprites');
const USER_AGENT = 'MetaLensVGC/1.0 (+https://github.com/vincentwesley/MetaLensVGC)';
const SPACING_MS = 300; // play.pokemonshowdown.com

let lastRequestAt = 0;
async function waitForSlot() {
  const wait = lastRequestAt + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function cachePathFor(url) {
  const hash = createHash('sha1').update(url).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

// HEAD `url`, cached permanently on disk (existence rarely changes; a stale "missing"
// entry can be fixed by deleting data-raw/cache/sprites/ and re-running).
async function urlExists(url) {
  const cacheFile = cachePathFor(url);
  try {
    const entry = JSON.parse(await readFile(cacheFile, 'utf8'));
    return entry.ok;
  } catch {
    // no cache entry yet
  }
  await waitForSlot();
  let ok;
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } });
    ok = res.ok;
  } catch {
    ok = false;
  }
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify({ url, ok, fetchedAt: Date.now() }));
  return ok;
}

/**
 * @param {Record<string, object>} species dex.species, mutated in place.
 */
export async function resolveSprites(species) {
  for (const sp of Object.values(species)) {
    const ownId = sp.sprite;
    const baseId = sp.base && species[sp.base] ? species[sp.base].sprite : null;

    let resolvedId = null;
    if (ownId && (await urlExists(`${PS}/gen5/${ownId}.png`))) resolvedId = ownId;
    else if (baseId && baseId !== ownId && (await urlExists(`${PS}/gen5/${baseId}.png`))) resolvedId = baseId;
    sp.sprite = resolvedId;

    sp.ani = null;
    if (resolvedId) {
      if (await urlExists(`${PS}/gen5ani/${resolvedId}.gif`)) sp.ani = `gen5ani/${resolvedId}.gif`;
      else if (await urlExists(`${PS}/ani/${resolvedId}.gif`)) sp.ani = `ani/${resolvedId}.gif`;
    }
  }
  return species;
}
