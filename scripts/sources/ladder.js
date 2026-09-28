// Source: Smogon chaos stats (ladder). Trims each ~13MB monthly file down to the
// SCHEMA.md shape: top 12 entries per sub-table (top 20 teammates), values converted
// from weighted counts to fractions of that Pokémon's total weighted usage.
import { fetchText } from '../lib/http.js';
import { normalizeSpecies } from '../../public/js/lib/names.js';

const CUTOFF = 1760;
const SUFFIX = { 'M-A': 'ma', 'M-B': 'mb', 'M-C': 'mc' };
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

function trimMon(raw, dex) {
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
    counters,
  };
}

/**
 * @param {string} reg "M-A" | "M-B" | "M-C"
 * @param {object} dex
 * @param {{existingMonths?: Set<string>, log?: (s:string)=>void}} [opts]
 */
export async function fetchLadder(reg, dex, opts = {}) {
  const existingMonths = opts.existingMonths || new Set();
  const log = opts.log || (() => {});
  const suffix = SUFFIX[reg];
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const months = [];
  for (let y = 2026, m = 4; `${y}-${String(m).padStart(2, '0')}` <= currentMonth; m++) {
    if (m > 12) { m = 1; y++; }
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  const results = [];
  for (const month of months) {
    if (existingMonths.has(month) && month !== currentMonth) continue; // refetch latest month only
    const url = `https://www.smogon.com/stats/${month}/chaos/gen9championsvgc2026reg${suffix}-${CUTOFF}.json`;
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
      mons[normalizeSpecies(name, dex)] = trimMon(raw, dex);
    }
    results.push({
      month,
      format: json.info?.metagame || `gen9championsvgc2026reg${suffix}`,
      battles: json.info?.['number of battles'] ?? 0,
      url,
      mons,
    });
    log(`  [ladder ${reg}] ${month}: ${Object.keys(mons).length} mons, ${json.info?.['number of battles']} battles`);
  }
  return results;
}
