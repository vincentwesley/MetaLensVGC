// spreads.js — pure helpers behind the Spread explorer (deep dive) and the scanner's SP check.
// Champions has no EVs/IVs: a build is 66 Stat Points (max 32 per stat) + a nature. Stat math is always
// stats.js. Nothing here invents numbers: shares are the sources' own, and every helper returns null /
// empty when its input is missing.
//
// Sources: in-game ranked (`ranked-<REG>.json`: top ~10 `spreads` keyed "hp/atk/def/spa/spd/spe" and `natures`
// as a SEPARATE distribution, so its stats assume the most common nature) and Smogon (joint
// "Nature:hp/atk/def/spa/spd/spe" spreads). Ranked shares are shares of that species' own players, never usage.
import { calcStats, parseSP } from './stats.js';
import { rankedEntries, metaSpeed } from './aggregate.js';

/**
 * Labels that describe the SP, not the player's intent. `spreadArchetype` returns the FIRST match in this
 * order: No Speed and Max Speed come first because Speed is the most decisive single stat (Trick Room
 * vs. speed control), then Bulk-heavy (HP+Def+SpD), then Offense (Atk or SpA), else Other.
 * Thresholds are exported so the UI can quote them.
 */
export const SPREAD_THRESHOLDS = { maxSpeed: 30, bulk: 44, offense: 30 };
export const SPREAD_ARCHETYPES = [
  { id: 'nospeed', label: 'No Speed', desc: 'Speed SP = 0', test: (sp) => sp[5] === 0 },
  { id: 'maxspeed', label: 'Max Speed', desc: `Speed SP >= ${SPREAD_THRESHOLDS.maxSpeed}`, test: (sp) => sp[5] >= SPREAD_THRESHOLDS.maxSpeed },
  { id: 'bulk', label: 'Bulk-heavy', desc: `HP + Def + SpD SP >= ${SPREAD_THRESHOLDS.bulk}`, test: (sp) => sp[0] + sp[2] + sp[4] >= SPREAD_THRESHOLDS.bulk },
  { id: 'offense', label: 'Offense', desc: `Atk or SpA SP >= ${SPREAD_THRESHOLDS.offense}`, test: (sp) => Math.max(sp[1], sp[3]) >= SPREAD_THRESHOLDS.offense },
  { id: 'other', label: 'Other', desc: 'none of the above', test: () => true },
];

/** Archetype id of an SP array. */
export function spreadArchetype(sp) {
  return SPREAD_ARCHETYPES.find((a) => a.test(sp)).id;
}

export const archetypeLabel = (id) => SPREAD_ARCHETYPES.find((a) => a.id === id)?.label ?? id;

const mkRow = (sp, share, nature, natureShare, natureJoint, bs) => ({
  sp, share, nature, natureShare, natureJoint, stats: calcStats(bs, sp, nature), arch: spreadArchetype(sp),
});

/**
 * Rows for one ranked mon entry (`season.mons[name]`), highest share first. `nature` is the species' most
 * common ranked nature and `natureJoint` is false: ranked natures are not joint with the spread, so `stats`
 * assume that nature. Malformed spread keys are skipped.
 */
export function rankedSpreadRows(mon, bs) {
  if (!mon || !bs) return [];
  const top = rankedEntries(mon.natures)[0];
  const nature = top?.name ?? null;
  const rows = [];
  for (const { name, pct } of rankedEntries(mon.spreads)) {
    const sp = parseSP(name);
    if (sp) rows.push(mkRow(sp, pct, nature, top?.pct ?? null, false, bs));
  }
  return rows;
}

/** Rows for one ladderMerge mon (`{spreads: [{name: "Nature:sp", pct}]}`), joint nature (`natureJoint: true`). */
export function smogonSpreadRows(ladderMon, bs) {
  if (!ladderMon || !bs) return [];
  const rows = [];
  for (const { name, pct } of ladderMon.spreads || []) {
    const ci = name.indexOf(':');
    const sp = ci > 0 ? parseSP(name.slice(ci + 1)) : null;
    if (sp) rows.push(mkRow(sp, pct, name.slice(0, ci), null, true, bs));
  }
  return rows;
}

/** `{ byArch: {id: share}, covered }`: summed shares per archetype of the LISTED rows; `covered` = their total. */
export function archetypeShares(rows) {
  const byArch = {};
  let covered = 0;
  for (const r of rows || []) {
    byArch[r.arch] = (byArch[r.arch] || 0) + r.share;
    covered += r.share;
  }
  return { byArch, covered };
}

/**
 * Where a Speed stat lands against `field` (`[{key, spe}]`, entries without a numeric spe are ignored).
 * nextFaster / nextSlower: the closest strictly faster / slower field entry (null if none).
 */
export function speedBenchmarks(spe, field) {
  let outspeeds = 0, ties = 0, underspeeds = 0, nextFaster = null, nextSlower = null;
  for (const f of field || []) {
    if (typeof f.spe !== 'number') continue;
    if (f.spe < spe) { outspeeds++; if (!nextSlower || f.spe > nextSlower.spe) nextSlower = { key: f.key, spe: f.spe }; }
    else if (f.spe > spe) { underspeeds++; if (!nextFaster || f.spe < nextFaster.spe) nextFaster = { key: f.key, spe: f.spe }; }
    else ties++;
  }
  return { outspeeds, ties, underspeeds, nextFaster, nextSlower };
}

/** Closest listed row by L1 distance over the 6 SP values (first, i.e. highest share, wins ties). null if no rows. */
export function nearestSpread(sp, rows) {
  let best = null;
  for (const row of rows || []) {
    const dist = row.sp.reduce((a, v, i) => a + Math.abs(v - sp[i]), 0);
    if (!best || dist < best.dist) best = { row, dist };
  }
  return best;
}

/** `[{key, spe}]` meta speeds (via metaSpeed) for a list of `{key, ...}` tiers; species without a real speed are dropped. */
export function metaSpeedField(tiers, { season, merged }, dex) {
  const sheetByKey = new Map(tiers.map((t) => [t.key, t]));
  return tiers.flatMap((t) => {
    const m = metaSpeed(t.key, { sheetByKey, season, merged }, dex);
    return m && m.spe != null ? [{ key: t.key, spe: m.spe }] : [];
  });
}

