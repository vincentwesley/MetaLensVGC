// scan.js — pure computations behind the My Team Scanner's evidence cards
// (matchups, item and team-comp suggestions). No DOM, no fetch; importable from Node.
// Everything is counted from real team rows (`Team`, see aggregate.js#decode) and real
// match results (`{a, b, result}` over `Team.i`). Nothing is modelled or invented:
// when a sample is below its threshold the function returns null / an `insufficient`
// marker and the UI says "Insufficient data".
import { wilson } from './stats.js';
import { effectiveness } from './types.js';
import { classify, ARCHETYPES } from './archetypes.js';
import { archetypeMatrix, itemsBySpecies, usage, rankedEntries } from './aggregate.js';
import { calcStat } from './stats.js';
import { rankedSpreadRows, speedBenchmarks, nearestSpread } from './spreads.js';

/** Thresholds, exported so the UI can quote them. */
export const LIMITS = {
  simMin: 4,          // preferred shared-species threshold for "teams like yours"
  simFallback: 3,     // used when fewer than `simTeams` teams share simMin
  simTeams: 30,
  matchGames: 20,     // min games for one matchup row
  totalGames: 100,    // min total games of "teams like yours" to trust the matchup cards
  itemSlots: 20,      // min slots of a species to compare items
  itemGames: 30,      // min team games for a per-item win rate
  pickTeams: 20,      // min teams for a teammate pick
  pickGames: 50,      // min games for its win rate
  linkGames: 100,     // min games on EACH side (with / without) for the weakest-link check
  weakMons: 3,        // a type is a "shared weakness" when at least this many members are weak to it
  listSize: 5,
  pickSize: 8,
};

/** Lower/upper 95% Wilson bounds and a verdict on whether the CI excludes 50%. */
export function verdict(w, l) {
  const n = w + l;
  if (n <= 0) return { n: 0, winPct: null, ci: [0, 0], call: 'none' };
  const ci = wilson(w, n);
  return { n, winPct: w / n, ci, call: ci[0] > 0.5 ? 'good' : ci[1] < 0.5 ? 'bad' : 'unclear' };
}

/** Human label for an archetype id (`other` has no ARCHETYPES entry). */
export function archLabel(id) {
  return ARCHETYPES.find((a) => a.id === id)?.label || (id === 'other' ? 'Other' : id);
}

/**
 * Archetype of a pasted team. Builds the Team-like object classify() needs
 * (mons with k / moves / ability / mega, plus `keys`).
 * @returns {{ids: string[], id: string, label: string}}
 */
export function teamArchetype(mons, dex) {
  const team = { mons, keys: mons.map((m) => m.k), species: new Set(mons.map((m) => m.k)) };
  const ids = classify(team, dex);
  return { ids, id: ids[0], label: archLabel(ids[0]) };
}

/** Per-team count of how many of `keys` (a Set) the team has. Aligned with `teams`. */
export function sharedCounts(teams, keys) {
  const list = [...keys];
  const out = new Uint8Array(teams.length);
  for (let i = 0; i < teams.length; i++) {
    const sp = teams[i].species;
    let c = 0;
    for (const k of list) if (sp.has(k)) c++;
    out[i] = c;
  }
  return out;
}

/**
 * "Teams like yours": teams sharing at least `simMin` (4) of the scanned species keys,
 * falling back to `simFallback` (3) when fewer than `simTeams` (30) qualify.
 * @returns {{teams: object[], threshold: number, fellBack: boolean}|null} null with < 3 distinct keys.
 */
export function similarTeams(base, keys, counts = sharedCounts(base, keys)) {
  if (keys.size < LIMITS.simFallback) return null;
  const pick = (min) => base.filter((_, i) => counts[i] >= min);
  let threshold = Math.min(LIMITS.simMin, keys.size);
  let teams = pick(threshold);
  let fellBack = false;
  if (teams.length < LIMITS.simTeams && threshold > LIMITS.simFallback) {
    threshold = LIMITS.simFallback;
    teams = pick(threshold);
    fellBack = true;
  }
  return { teams, threshold, fellBack };
}

/**
 * Games of `similar` teams against everyone else in `base`, grouped by opponent species
 * and by opponent primary archetype. Ties/unknown results are skipped, and matches where
 * both sides are "teams like yours" are skipped (they would count for and against).
 * @returns {{w: number, l: number, bySpecies: Map<string,{w:number,l:number}>, byArch: Map<string,{w:number,l:number}>}}
 */
export function similarGames(similar, base, matches) {
  const inS = new Set(similar.map((t) => t.i));
  const byIdx = new Map(base.map((t) => [t.i, t]));
  const bySpecies = new Map();
  const byArch = new Map();
  let w = 0;
  let l = 0;
  const bump = (map, key, win) => {
    let c = map.get(key);
    if (!c) map.set(key, (c = { w: 0, l: 0 }));
    if (win) c.w++; else c.l++;
  };
  for (const m of matches || []) {
    if (m.result !== 1 && m.result !== 2) continue;
    const ia = inS.has(m.a);
    const ib = inS.has(m.b);
    if (ia === ib) continue;
    const opp = byIdx.get(ia ? m.b : m.a);
    if (!opp) continue;
    const win = (m.result === 1) === ia;
    if (win) w++; else l++;
    for (const k of opp.species) bump(bySpecies, k, win);
    bump(byArch, opp.arch[0], win);
  }
  return { w, l, bySpecies, byArch };
}

/**
 * Best and worst opponent species for teams like yours. Candidates are species with
 * usage n >= minN in `base` and >= `matchGames` games. Best = highest Wilson lower bound,
 * worst = lowest Wilson upper bound.
 * @returns {{rows: object[], best: object[], worst: object[]}}
 */
export function speciesMatchups(games, base, minN = 20) {
  const meta = new Set(usage(base).filter((r) => r.n >= minN).map((r) => r.key));
  const rows = [];
  for (const [key, c] of games.bySpecies) {
    if (!meta.has(key) || c.w + c.l < LIMITS.matchGames) continue;
    rows.push({ key, w: c.w, l: c.l, ...verdict(c.w, c.l) });
  }
  const best = rows.slice().sort((a, b) => b.ci[0] - a.ci[0]).slice(0, LIMITS.listSize);
  const seen = new Set(best.map((r) => r.key));
  const worst = rows.filter((r) => !seen.has(r.key)).sort((a, b) => a.ci[1] - b.ci[1]).slice(0, LIMITS.listSize);
  return { rows, best, worst };
}

/**
 * Archetype matchups. From teams-like-yours games when there are enough, otherwise the
 * scanned team's own archetype row of the archetype matrix over `base`.
 * @returns {{source: 'similar'|'matrix'|null, rows: object[]}}  rows sorted by win % desc.
 */
export function archetypeMatchups(games, base, matches, myArch) {
  const toRows = (entries) => entries
    .filter(([, c]) => c.w + c.l >= LIMITS.matchGames)
    .map(([id, c]) => ({ id, label: archLabel(id), w: c.w, l: c.l, ...verdict(c.w, c.l) }))
    .sort((a, b) => b.winPct - a.winPct);
  if (games && games.w + games.l >= LIMITS.totalGames) {
    const rows = toRows([...games.byArch]);
    if (rows.length) return { source: 'similar', rows };
  }
  const mx = archetypeMatrix(base, matches, base);
  if (mx) {
    const acc = new Map();
    const add = (id, w, l) => {
      const c = acc.get(id) || { w: 0, l: 0 };
      c.w += w; c.l += l;
      acc.set(id, c);
    };
    for (const c of mx.cells) {
      if (c.a === c.b) continue; // mirror: counts for and against
      if (c.a === myArch) add(c.b, c.w, c.l);
      else if (c.b === myArch) add(c.a, c.l, c.w);
    }
    const rows = toRows([...acc]);
    if (rows.length) return { source: 'matrix', rows };
  }
  return { source: null, rows: [] };
}

/**
 * Item check per scanned Pokémon against real item usage of that species in `base`.
 * Item clause: duplicate items on the pasted team are reported, and an item another
 * member already holds is never proposed (it is listed as `blockedBy` instead).
 * @returns {{duplicates: {item:string, keys:string[]}[], mons: object[]}}
 */
export function itemSuggestions(mons, base) {
  const holders = new Map();
  for (const m of mons) {
    if (!m.item) continue;
    const id = m.item.toLowerCase();
    if (!holders.has(id)) holders.set(id, { item: m.item, keys: [] });
    holders.get(id).keys.push(m.k);
  }
  const duplicates = [...holders.values()].filter((h) => h.keys.length > 1);

  // Team-record win rate per (species, item), one pass, only for the scanned species.
  const want = new Set(mons.map((m) => m.k));
  const rec = new Map();
  for (const t of base) {
    for (const mo of t.mons) {
      if (!want.has(mo.k) || !mo.item) continue;
      const id = `${mo.k}|${mo.item}`;
      const c = rec.get(id) || { w: 0, l: 0 };
      c.w += t.w; c.l += t.l;
      rec.set(id, c);
    }
  }
  const bySp = itemsBySpecies(base);
  const rate = (key, item) => {
    const c = rec.get(`${key}|${item}`);
    const games = c ? c.w + c.l : 0;
    if (games < LIMITS.itemGames) return { games, winPct: null, ci: null };
    return { games, winPct: c.w / games, ci: wilson(c.w, games) };
  };
  const out = mons.map((m, idx) => {
    const sp = bySp.get(m.k);
    const base0 = { key: m.k, item: m.item || null, slotN: sp ? sp.n : 0 };
    if (m.mega) return { ...base0, status: 'fixed' };
    if (!sp || sp.n < LIMITS.itemSlots || !sp.items.length) return { ...base0, status: 'insufficient' };
    const top = sp.items.slice(0, 3);
    const mine = m.item ? sp.items.find((i) => i.name.toLowerCase() === m.item.toLowerCase()) : null;
    const others = mons.filter((_, j) => j !== idx);
    const decorate = (i) => {
      const holder = others.find((o) => o.item && o.item.toLowerCase() === i.name.toLowerCase());
      return { name: i.name, n: i.n, pct: i.pct, blockedBy: holder ? holder.k : null, ...rate(m.k, i.name) };
    };
    const current = m.item ? { name: m.item, n: mine ? mine.n : 0, pct: mine ? mine.pct : 0, ...rate(m.k, m.item) } : null;
    const inTop = !!mine && top.some((i) => i.name === mine.name);
    return { ...base0, status: inTop ? 'ok' : 'suggest', current, top: top.map(decorate) };
  });
  return { duplicates, mons: out };
}

/** Types that at least `weakMons` of the scanned Pokémon are weak to. */
export function sharedWeaknesses(mons, dex, types) {
  const out = [];
  for (const atk of types) {
    let n = 0;
    for (const m of mons) {
      const t = (dex.species[m.k] || dex.species[m.s])?.types;
      if (t && effectiveness(atk, t) > 1) n++;
    }
    if (n >= LIMITS.weakMons) out.push({ type: atk, n });
  }
  return out;
}

/**
 * Common teammate picks: among teams sharing >= 3 of your species, the other species
 * they run most often, with the win rate of those teams (team W-L records). Each pick
 * is tagged with the shared type weaknesses it resists and the worst-matchup opponents
 * whose STAB types it resists (both from `dex` type data).
 * @param {{weakTypes?: string[], worstKeys?: string[]}} cover
 * @returns {{poolTeams: number, poolWinPct: number|null, picks: object[]}|null} null with < 3 distinct species.
 */
export function teammatePicks(keys, base, dex, counts = sharedCounts(base, keys), cover = {}) {
  if (keys.size < LIMITS.simFallback) return null;
  const acc = new Map();
  let pw = 0;
  let pl = 0;
  let poolTeams = 0;
  for (let i = 0; i < base.length; i++) {
    if (counts[i] < LIMITS.simFallback) continue;
    const t = base[i];
    poolTeams++;
    pw += t.w; pl += t.l;
    for (const k of t.species) {
      if (keys.has(k)) continue;
      const c = acc.get(k) || { n: 0, w: 0, l: 0 };
      c.n++; c.w += t.w; c.l += t.l;
      acc.set(k, c);
    }
  }
  const typesOf = (k) => dex.species[k]?.types || null;
  const picks = [];
  for (const [key, c] of acc) {
    if (c.n < LIMITS.pickTeams) continue;
    const games = c.w + c.l;
    const ct = typesOf(key);
    const resists = ct ? (cover.weakTypes || []).filter((t) => effectiveness(t, ct) < 1) : [];
    const answers = ct ? (cover.worstKeys || []).filter((o) => {
      const ot = typesOf(o);
      return o !== key && ot && ot.every((t) => effectiveness(t, ct) < 1);
    }) : [];
    picks.push({
      key, n: c.n, share: poolTeams ? c.n / poolTeams : 0, games,
      winPct: games >= LIMITS.pickGames ? c.w / games : null,
      ci: games >= LIMITS.pickGames ? wilson(c.w, games) : null,
      resists, answers,
    });
  }
  picks.sort((a, b) => ((b.resists.length + b.answers.length > 0) - (a.resists.length + a.answers.length > 0)) || b.n - a.n);
  return { poolTeams, poolWinPct: pw + pl ? pw / (pw + pl) : null, poolGames: pw + pl, picks: picks.slice(0, LIMITS.pickSize) };
}

/**
 * Weakest link: for each member X, compare teams that share >= 3 of your OTHER species
 * and run X against those that do not (team W-L records). A row needs `linkGames` games
 * on both sides. `clear` is true when the two Wilson intervals do not overlap.
 * `replacement` is the most common outside species on the "without X" teams.
 * @returns {{rows: object[]}}  rows sorted by (without - with) win % desc.
 */
export function weakestLink(keys, base, counts = sharedCounts(base, keys)) {
  const rows = [];
  if (keys.size < 4) return { rows };
  for (const x of keys) {
    const withR = { w: 0, l: 0, n: 0 };
    const withoutR = { w: 0, l: 0, n: 0 };
    const repl = new Map();
    for (let i = 0; i < base.length; i++) {
      const t = base[i];
      const has = t.species.has(x);
      if (counts[i] - (has ? 1 : 0) < LIMITS.simFallback) continue;
      const r = has ? withR : withoutR;
      r.w += t.w; r.l += t.l; r.n++;
      if (!has) {
        for (const k of t.species) {
          if (keys.has(k)) continue;
          const c = repl.get(k) || { n: 0, w: 0, l: 0 };
          c.n++; c.w += t.w; c.l += t.l;
          repl.set(k, c);
        }
      }
    }
    if (withR.w + withR.l < LIMITS.linkGames || withoutR.w + withoutR.l < LIMITS.linkGames) continue;
    const a = verdict(withR.w, withR.l);
    const b = verdict(withoutR.w, withoutR.l);
    let replacement = null;
    for (const [key, c] of repl) {
      if (c.n < LIMITS.pickTeams) continue;
      if (!replacement || c.n > replacement.n) replacement = { key, n: c.n, w: c.w, l: c.l };
    }
    if (replacement) {
      const g = replacement.w + replacement.l;
      replacement = { key: replacement.key, n: replacement.n, games: g, winPct: g >= LIMITS.pickGames ? replacement.w / g : null };
    }
    rows.push({
      key: x, with: { teams: withR.n, ...a, w: withR.w, l: withR.l }, without: { teams: withoutR.n, ...b, w: withoutR.w, l: withoutR.l },
      diff: b.winPct - a.winPct,
      clear: b.ci[0] > a.ci[1] || a.ci[0] > b.ci[1],
      replacement,
    });
  }
  rows.sort((x, y) => y.diff - x.diff);
  return { rows };
}

/**
 * Run every scanner analysis in one go.
 * @param {{mons: object[], base: object[], matches: object[], dex: object, minN?: number, types: string[]}} args
 */
export function scanTeam({ mons, base, matches, dex, minN = 20, types }) {
  const keys = new Set(mons.map((m) => m.k));
  const arch = teamArchetype(mons, dex);
  const counts = sharedCounts(base, keys);
  const sim = similarTeams(base, keys, counts);
  const games = sim && sim.teams.length ? similarGames(sim.teams, base, matches) : null;
  const species = games ? speciesMatchups(games, base, minN) : { rows: [], best: [], worst: [] };
  const archM = archetypeMatchups(games, base, matches, arch.id);
  const weak = sharedWeaknesses(mons, dex, types);
  const picks = teammatePicks(keys, base, dex, counts, { weakTypes: weak.map((w) => w.type), worstKeys: species.worst.map((r) => r.key) });
  return {
    arch, sim, games, species, archMatchups: archM, weak,
    items: itemSuggestions(mons, base),
    picks, link: weakestLink(keys, base, counts),
  };
}

/** A pasted nature is flagged when fewer than this share of the species' ranked players use it. */
export const RARE_NATURE = 0.05;

/**
 * "SP check" for one pasted Pokémon against the in-game ranked spreads of its species.
 * @param mon    parsePaste Mon (`sp` array or null, `nature` or null)
 * @param entry  `{name, mon}` from rankedMon(season, key, dex) or null
 * @param field  `[{key, spe}]` meta speeds (own species is skipped)
 * @returns {{kind:'insufficient'|'assumed'|'exact'|'near', ...}}
 *  exact: `{rank, row}`; near: `{row, dist, diff: number[6], mySpe, commonSpe, changes:[{key, spe, mine, common}]}`;
 *  every kind but 'insufficient' also has `rows` and `rarity: null | {nature, share|null}`.
 */
export function spCheck(mon, entry, dex, field = []) {
  const bs = (dex.species[mon.k] || dex.species[mon.s])?.bs;
  const rows = bs && entry ? rankedSpreadRows(entry.mon, bs) : [];
  if (!rows.length) return { kind: 'insufficient' };
  const natShare = rankedEntries(entry.mon.natures).find((n) => n.name === mon.nature)?.pct ?? null;
  const rarity = mon.nature && (natShare ?? 0) < RARE_NATURE ? { nature: mon.nature, share: natShare } : null;
  const out = { rows, rarity };
  if (!mon.sp) return { kind: 'assumed', ...out };
  const near = nearestSpread(mon.sp, rows);
  if (near.dist === 0) return { kind: 'exact', rank: rows.indexOf(near.row) + 1, row: near.row, ...out };
  const rest = field.filter((f) => f.key !== mon.k);
  const mySpe = calcStat(bs[5], mon.sp[5], 5, mon.nature || near.row.nature);
  const commonSpe = near.row.stats[5];
  const rel = (spe, f) => (spe > f.spe ? 'outspeeds' : spe < f.spe ? 'underspeeds' : 'ties');
  const changes = rest.filter((f) => typeof f.spe === 'number' && rel(mySpe, f) !== rel(commonSpe, f))
    .sort((a, b) => b.spe - a.spe).map((f) => ({ key: f.key, spe: f.spe, mine: rel(mySpe, f), common: rel(commonSpe, f) }));
  return { kind: 'near', row: near.row, dist: near.dist, diff: mon.sp.map((v, i) => v - near.row.sp[i]), mySpe, commonSpe, changes, bench: speedBenchmarks(mySpe, rest), ...out };
}
