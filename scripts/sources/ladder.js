// Source: Smogon chaos stats (ladder). Trims each ~13MB monthly file down to the
// SCHEMA.md shape: top 12 entries per sub-table (top 20 teammates), values converted
// from weighted counts to fractions of that Pokémon's total weighted usage.
import { fetchText } from '../lib/http.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';
import { REGULATIONS } from '../lib/regs.js';

const CUTOFF = 1760; // default rating cutoff (VGC regs use only this one)
// Showdown regs: Smogon publishes four rating cutoffs per format; 1760 stays in ladder-<REG>.json, the others go to
// ladder-<REG>-<cutoff>.json, loaded only when picked (state.rating).
export const SHOWDOWN_CUTOFFS = [1760, 1630, 1500, 0];
export const ROLLING_MONTHS = 3; // showdown regs: the 3 newest PUBLISHED months (Smogon publishes a month early the next)
const PROBE_MONTHS = ROLLING_MONTHS + 1; // the current month is never published yet, so look one month further back
const MIN_USAGE = 0.001; // ponytail: showdown regs drop mons under 0.1% usage to keep files small; widen it if people ask for rare picks
const INDEX_TTL = 1000 * 60 * 60 * 6; // refetch each run (a month may still be filling in)

function topN(obj, n) {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));
}

function fractions(obj) {
  const sum = Object.values(obj).reduce((a, b) => a + b, 0);
  if (!sum) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v / sum;
  return out;
}

const MIN_COUNTER_N = 30;
// Showdown regs: keep each Pokémon's top counters by the deep dive's own ranking (p - 4d). Counters are ~70% of a
// lower-cutoff file (up to 463 per Pokémon at rating 0); the deep dive shows 12, Threats sums the top-12 Pokémon's.
export const MAX_COUNTERS = 40;

export function trimMon(raw, dex, { maxCounters = Infinity } = {}) {
  const counters = {};
  for (const [name, v] of Object.entries(raw['Checks and Counters'] || {})) {
    // Smogon: {n,p,d} (matchups, KO/switch prob, stddev); older files: [p,d]. Stored as [p,d,n].
    const [p, d, n] = Array.isArray(v) ? [v[0], v[1], undefined] : v && typeof v === 'object' ? [v.p, v.d, v.n] : [v, 0, undefined];
    if (n < MIN_COUNTER_N) continue; // ponytail: Smogon's own 30-matchup ceiling; undefined n (legacy) passes
    counters[normalizeSpecies(name, dex)] = [p, d, n];
  }
  const kept = Object.entries(counters).sort(([, a], [, b]) => (b[0] - 4 * (b[1] || 0)) - (a[0] - 4 * (a[1] || 0))).slice(0, maxCounters);
  return {
    usage: raw.usage,
    raw: raw['Raw count'],
    items: topN(fractions(raw.Items || {}), 12),
    abilities: topN(fractions(raw.Abilities || {}), 12),
    moves: topN(fractions(raw.Moves || {}), 12),
    spreads: topN(fractions(raw.Spreads || {}), 12),
    teammates: topN(fractions(raw.Teammates || {}), 20),
    teraTypes: topN(fractions(raw['Tera Types'] || {}), 12), // {} for Champions (no Tera)
    counters: Object.fromEntries(kept),
  };
}

const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Showdown regs: the months to probe (current month and the PROBE_MONTHS - 1 before), oldest first. */
export function rollingMonths(now = new Date(), n = PROBE_MONTHS) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

/** The newest n months of a month list (objects with `month`), oldest first. */
export function keepNewest(months, n = ROLLING_MONTHS) {
  return [...months].sort((a, b) => a.month.localeCompare(b.month)).slice(-n);
}

function vgcMonths(now = new Date()) {
  const out = [];
  for (let d = new Date(Date.UTC(2026, 3, 1)); ym(d) <= ym(now); d.setUTCMonth(d.getUTCMonth() + 1)) out.push(ym(d));
  return out;
}

/**
 * @param {string} reg any id in REGULATIONS
 * @param {object} dex
 * @param {{existingMonths?: Set<string>, log?: (s:string)=>void, cutoff?: number}} [opts]
 */
export async function fetchLadder(reg, dex, opts = {}) {
  const existingMonths = opts.existingMonths || new Set();
  const log = opts.log || (() => {});
  const { format, family } = REGULATIONS[reg];
  const showdown = family === 'showdown';
  const currentMonth = ym(new Date());
  const months = showdown ? rollingMonths() : vgcMonths();
  const cutoff = opts.cutoff ?? CUTOFF;

  const results = [];
  for (const month of months) {
    if (existingMonths.has(month) && month !== currentMonth) continue; // refetch latest month only
    const url = `https://www.smogon.com/stats/${month}/chaos/${format}-${cutoff}.json`;
    let text;
    try {
      text = await fetchText(url, { ttl: month === currentMonth ? INDEX_TTL : Infinity });
    } catch {
      continue; // 404 (or otherwise unavailable) = skip, per spec
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    const mons = {};
    for (const [name, raw] of Object.entries(json.data || {})) {
      if (!raw || !raw.usage) continue;
      if (showdown && raw.usage < MIN_USAGE) continue;
      mons[normalizeSpecies(name, dex)] = trimMon(raw, dex, showdown ? { maxCounters: MAX_COUNTERS } : {});
    }
    results.push({
      month,
      format: json.info?.metagame || format,
      battles: json.info?.['number of battles'] ?? 0,
      url,
      mons,
    });
    log(`  [ladder ${reg}${cutoff === CUTOFF ? '' : ` ${cutoff}+`}] ${month}: ${Object.keys(mons).length} mons, ${json.info?.['number of battles']} battles`);
  }
  return results;
}
