// Source: Smogon chaos stats (ladder). Trims each ~13MB monthly file down to the
// SCHEMA.md shape: top 12 entries per sub-table (top 20 teammates), values converted
// from weighted counts to fractions of that Pokémon's total weighted usage.
import { fetchText } from '../lib/http.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';
import { REGULATIONS } from '../lib/regs.js';

const CUTOFF = 1760;
const ROLLING_MONTHS = 3; // showdown regs: current month + the 2 before
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

export function trimMon(raw, dex) {
  const counters = {};
  for (const [name, v] of Object.entries(raw['Checks and Counters'] || {})) {
    // Smogon leaves this empty for every M-A/M-B month observed during recon; pass
    // through defensively as [score, stdev] if it's ever populated.
    counters[normalizeSpecies(name, dex)] = Array.isArray(v) ? v.slice(0, 2) : [v, 0];
  }
  return {
    usage: raw.usage,
    raw: raw['Raw count'],
    items: topN(fractions(raw.Items || {}), 12),
    abilities: topN(fractions(raw.Abilities || {}), 12),
    moves: topN(fractions(raw.Moves || {}), 12),
    spreads: topN(fractions(raw.Spreads || {}), 12),
    teammates: topN(fractions(raw.Teammates || {}), 20),
    teraTypes: topN(fractions(raw['Tera Types'] || {}), 12), // {} for Champions (no Tera)
    counters,
  };
}

const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Showdown regs: the current month and the 2 before, oldest first. */
export function rollingMonths(now = new Date()) {
  const out = [];
  for (let i = ROLLING_MONTHS - 1; i >= 0; i--) out.push(ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

function vgcMonths(now = new Date()) {
  const out = [];
  for (let d = new Date(Date.UTC(2026, 3, 1)); ym(d) <= ym(now); d.setUTCMonth(d.getUTCMonth() + 1)) out.push(ym(d));
  return out;
}

/**
 * @param {string} reg any id in REGULATIONS
 * @param {object} dex
 * @param {{existingMonths?: Set<string>, log?: (s:string)=>void}} [opts]
 */
export async function fetchLadder(reg, dex, opts = {}) {
  const existingMonths = opts.existingMonths || new Set();
  const log = opts.log || (() => {});
  const { format, family } = REGULATIONS[reg];
  const showdown = family === 'showdown';
  const currentMonth = ym(new Date());
  const months = showdown ? rollingMonths() : vgcMonths();

  const results = [];
  for (const month of months) {
    if (existingMonths.has(month) && month !== currentMonth) continue; // refetch latest month only
    const url = `https://www.smogon.com/stats/${month}/chaos/${format}-${CUTOFF}.json`;
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
      mons[normalizeSpecies(name, dex)] = trimMon(raw, dex);
    }
    results.push({
      month,
      format: json.info?.metagame || format,
      battles: json.info?.['number of battles'] ?? 0,
      url,
      mons,
    });
    log(`  [ladder ${reg}] ${month}: ${Object.keys(mons).length} mons, ${json.info?.['number of battles']} battles`);
  }
  return results;
}
