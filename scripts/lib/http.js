// Fetch wrapper: on-disk cache (data-raw/cache/, gitignored), per-host minimum
// request spacing, retry with exponential backoff on 429/5xx.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'data-raw', 'cache');
const USER_AGENT = 'VGCMetaScope/1.0 (+https://github.com/vincentwesley/VGCMetaScope)';

// Minimum ms between requests to the same host. Anything not listed uses DEFAULT_SPACING.
const HOST_SPACING = {
  'play.limitlesstcg.com': 6500, // 50 req / 5 min
  'limitlessvgc.com': 1500,
  'standings.limitlessvgc.com': 1500,
  'www.smogon.com': 500,
};
const DEFAULT_SPACING = 500;

const lastRequestAt = new Map();

async function waitForHostSlot(host) {
  const spacing = HOST_SPACING[host] ?? DEFAULT_SPACING;
  const last = lastRequestAt.get(host) || 0;
  const wait = last + spacing - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
}

function cachePathFor(url) {
  const hash = createHash('sha1').update(url).digest('hex');
  const host = new URL(url).host;
  return path.join(CACHE_DIR, host, `${hash}.json`);
}

async function readCache(url, ttlMs) {
  try {
    const raw = await readFile(cachePathFor(url), 'utf8');
    const entry = JSON.parse(raw);
    if (ttlMs === Infinity) return entry;
    if (Date.now() - entry.fetchedAt < ttlMs) return entry;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(url, entry) {
  const file = cachePathFor(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(entry));
}

/**
 * Fetch `url` as text, using the on-disk cache.
 * @param {string} url
 * @param {{ttl?: number, retries?: number}} [opts] ttl in ms (Infinity = permanent, 0 = never use cache). Default: 0.
 */
export async function fetchText(url, opts = {}) {
  const ttl = opts.ttl ?? 0;
  if (ttl !== 0) {
    const cached = await readCache(url, ttl);
    if (cached) return cached.body;
  }

  const host = new URL(url).host;
  const maxRetries = opts.retries ?? 5;
  let attempt = 0;
  for (;;) {
    await waitForHostSlot(host);
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await backoff(attempt++);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= maxRetries) {
        throw new Error(`${url} -> HTTP ${res.status} after ${attempt} retries`);
      }
      await backoff(attempt++, res.headers.get('retry-after'));
      continue;
    }
    if (!res.ok) {
      throw new Error(`${url} -> HTTP ${res.status}`);
    }
    const body = await res.text();
    if (ttl !== 0) await writeCache(url, { url, body, fetchedAt: Date.now() });
    return body;
  }
}

async function backoff(attempt, retryAfterHeader) {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
  const wait = Math.max(retryAfter, 1000 * 2 ** attempt);
  await new Promise((r) => setTimeout(r, wait));
}

/** Fetch `url` as JSON, using the on-disk cache. Same opts as fetchText. */
export async function fetchJSON(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}
