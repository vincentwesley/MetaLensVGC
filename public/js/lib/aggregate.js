// Core aggregation: every function takes Team[] (see decode()) and returns
// plain data. No DOM, no fetch.
import { parseSP, wilson, effectiveSpecies, calcStats, calcStat } from './stats.js';
import { TYPES, effectiveness } from './types.js';
import { classify } from './archetypes.js';
import { displayName, normalizeTerm } from './names.js';

// --- decode -----------------------------------------------------------
// Ambiguity resolved: a team sheet can legally hold two different Mega
// Stones (only one mon actually mega evolves per battle). Team.mega picks
// the *first* mon (slot order) holding its own stone; archetypes that need
// to know about a second stone (e.g. big-six) check team.keys directly
// instead of relying on this single field. Flagged for CLAUDE.md.
export function decode(file, dex) {
  const strings = file.strings;
  const str = (i) => (i == null || i < 0 ? null : strings[i]);
  // Team sheets are hand-typed ("focus sash", "U-Turn", "None"); resolve each
  // string index once to its canonical dex name (see names.normalizeTerm).
  const termMemo = { item: new Map(), move: new Map(), ability: new Map() };
  const term = (i, kind) => {
    if (i == null || i < 0) return null;
    const memo = termMemo[kind];
    if (!memo.has(i)) memo.set(i, normalizeTerm(strings[i], dex, kind));
    return memo.get(i);
  };
  const events = file.events;
  const teams = file.teams.map((row, i) => {
    const [evIdx, player, country, placing, w, l, t, monsRaw] = row;
    const ev = events[evIdx];
    const mons = monsRaw.map((mr) => {
      const [sIdx, itemIdx, abilityIdx, moveIdxs, natureIdx, spRaw] = mr;
      const s = str(sIdx);
      const item = term(itemIdx, 'item');
      const ability = term(abilityIdx, 'ability');
      const moves = moveIdxs.map((mi) => term(mi, 'move')).filter(Boolean);
      const nature = str(natureIdx);
      const sp = typeof spRaw === 'string' ? parseSP(spRaw) : null;
      const itemDex = item && dex.items ? dex.items[item] : null;
      const k = itemDex && itemDex.megaOf === s ? itemDex.mega : s;
      return { s, k, item, ability, moves, nature, sp, mega: k !== s };
    });
    const keys = mons.map((m) => m.k);
    const topCut = placing != null && (ev.cut != null ? placing <= ev.cut : placing <= 8);
    const megas = mons.filter((m) => m.mega).map((m) => m.k);
    const team = {
      i,
      // stable across incremental rebuilds (pipeline dedupes player per event), so shared URLs keep working
      id: `${ev.id}:${String(player).toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
      player, country, ev, reg: file.reg, date: ev.date, tier: ev.tier, placing,
      w, l, t,
      topCut,
      mons,
      keys,
      mega: megas[0] || null,
      megas,
      species: new Set(keys),
    };
    team.arch = classify(team, dex);
    return team;
  });
  const matches = (file.matches || []).map(([a, b, result]) => ({ a, b, result }));
  return { teams, events, matches };
}

// --- filtering ----------------------------------------------------------
function matchesChip(team, chip, dex) {
  const v = chip.value;
  let m;
  switch (chip.kind) {
    case 'species':
      m = team.keys.includes(v);
      break;
    case 'type': {
      m = team.mons.some((mon) => {
        const sp = dex.species[mon.k] || dex.species[mon.s];
        return sp && sp.types.includes(v);
      });
      break;
    }
    case 'archetype':
      m = team.arch.includes(v);
      break;
    case 'item':
      m = team.mons.some((mon) => mon.item === v);
      break;
    case 'move':
      m = team.mons.some((mon) => mon.moves.includes(v));
      break;
    case 'mega':
      m = team.megas.includes(v);
      break;
    case 'core': {
      const need = Array.isArray(v) ? v : [v];
      m = need.every((key) => team.keys.includes(key));
      break;
    }
    case 'team':
      m = team.id === v;
      break;
    default:
      m = false;
  }
  return chip.neg ? !m : m;
}

export function filterTeams(teams, filters = {}, chips = [], dex) {
  const { tiers, place, from, to } = filters;
  return teams.filter((team) => {
    if (tiers && tiers.length && !tiers.includes(team.tier)) return false;
    if (place === 'topcut' && !team.topCut) return false;
    if (place === 'top8' && !(team.placing != null && team.placing <= 8)) return false;
    if (place === 'winner' && team.placing !== 1) return false;
    if (from && team.date < from) return false;
    if (to && team.date > to) return false;
    return chips.every((c) => matchesChip(team, c, dex));
  });
}

function barFilter(t, filters) {
  if (filters.tiers && filters.tiers.length && !filters.tiers.includes(t.tier)) return false;
  if (filters.place === 'topcut' && !t.topCut) return false;
  if (filters.place === 'top8' && !(t.placing != null && t.placing <= 8)) return false;
  if (filters.place === 'winner' && t.placing !== 1) return false;
  return true;
}

// The window is explicit (filters.from/to) or implied by the reg's own date
// range. The "previous" window is the immediately preceding span of equal
// length, within the same reg. If that span is empty, or starts before the
// reg's earliest date, fall back to the previous regulation's teams (already
// bar-filtered by the caller) instead.
export function previousPeriod(teamsInReg, filters = {}, prevRegTeams = []) {
  const dates = teamsInReg.map((t) => t.date).filter(Boolean).sort();
  if (!dates.length) return prevRegTeams;
  const regStart = dates[0];
  const from = filters.from || regStart;
  const to = filters.to || dates[dates.length - 1];
  const lenMs = Math.max(0, new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`));
  const prevTo = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - lenMs);
  const prevToStr = prevTo.toISOString().slice(0, 10);
  const prevFromStr = prevFrom.toISOString().slice(0, 10);
  if (prevToStr < regStart) return prevRegTeams;
  const windowTeams = teamsInReg.filter((t) => barFilter(t, filters) && t.date >= prevFromStr && t.date <= prevToStr);
  return windowTeams.length ? windowTeams : prevRegTeams;
}

// --- basic aggregates -----------------------------------------------------
// Several sections ask for usage() of the same filtered array in one render;
// memoize per array identity. Callers get a fresh array (rows are shared and
// must be treated as read-only).
const usageMemo = new WeakMap();
export function usage(teams) {
  let rows = usageMemo.get(teams);
  if (!rows) { rows = usageUncached(teams); usageMemo.set(teams, rows); }
  return rows.slice();
}

function usageUncached(teams) {
  const n = teams.length;
  const counts = new Map();
  for (const team of teams) {
    for (const key of team.species || new Set(team.keys)) {
      const c = counts.get(key) || { n: 0, w: 0, l: 0 };
      c.n++;
      c.w += team.w;
      c.l += team.l;
      counts.set(key, c);
    }
  }
  const rows = [...counts.entries()].map(([key, c]) => {
    const games = c.w + c.l;
    return {
      key, n: c.n, pct: n ? c.n / n : 0, w: c.w, l: c.l,
      winPct: games > 0 ? c.w / games : null,
      ci: wilson(c.w, games),
    };
  });
  rows.sort((a, b) => b.n - a.n);
  return rows;
}

export function kpis(teams) {
  const speciesSet = new Set();
  const counts = new Map();
  const megaCounts = new Map();
  let megaTeams = 0;
  for (const team of teams) {
    for (const key of team.keys) {
      speciesSet.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (team.megas.length) megaTeams++;
    for (const m of team.megas) megaCounts.set(m, (megaCounts.get(m) || 0) + 1);
  }
  let topMega = null;
  for (const [key, c] of megaCounts) if (!topMega || c > topMega.n) topMega = { key, n: c };
  return {
    teams: teams.length,
    species: speciesSet.size,
    diversity: effectiveSpecies([...counts.values()]),
    megaShare: teams.length ? megaTeams / teams.length : 0,
    topMega: topMega ? { key: topMega.key, pct: teams.length ? topMega.n / teams.length : 0 } : null,
  };
}

function speciesTypesOf(mon, dex) {
  const sp = dex.species[mon.k] || dex.species[mon.s];
  return sp ? sp.types : [];
}

export function typeUsage(teams, dex) {
  let slots = 0;
  const counts = new Map();
  for (const team of teams) {
    for (const mon of team.mons) {
      slots++;
      for (const type of speciesTypesOf(mon, dex)) counts.set(type, (counts.get(type) || 0) + 1);
    }
  }
  return TYPES.map((type) => {
    const n = counts.get(type) || 0;
    return { type, n, pct: slots ? n / slots : 0 };
  }).sort((a, b) => b.n - a.n);
}

// Distinct defensive typings in the field with their slot counts. The field has
// tens of thousands of slots but only ~100 typings, so effectiveness is
// evaluated once per typing instead of once per slot.
function fieldTypings(teams, dex) {
  const combos = new Map();
  let n = 0;
  for (const team of teams) for (const mon of team.mons) {
    const sp = dex.species[mon.k] || dex.species[mon.s];
    if (!sp) continue;
    n++;
    const id = sp.types.length === 1 ? sp.types[0] : `${sp.types[0]}/${sp.types[1]}`;
    const c = combos.get(id);
    if (c) c.count++;
    else combos.set(id, { types: sp.types, count: 1 });
  }
  return { combos: [...combos.values()], n };
}

export function attackingTypes(teams, dex) {
  const { combos, n } = fieldTypings(teams, dex);
  return TYPES.map((atk) => {
    let sum = 0;
    let se = 0;
    for (const { types, count } of combos) {
      const mult = effectiveness(atk, types);
      sum += mult * count;
      if (mult > 1) se += count;
    }
    return { type: atk, score: n ? sum / n : 0, se: n ? se / n : 0 };
  }).sort((a, b) => b.score - a.score);
}

export function weaknesses(teams, dex) {
  const { combos, n } = fieldTypings(teams, dex);
  return TYPES.map((atk) => {
    let weak = 0;
    let resist = 0;
    let immune = 0;
    for (const { types, count } of combos) {
      const mult = effectiveness(atk, types);
      if (mult === 0) immune += count;
      else if (mult < 1) resist += count;
      else if (mult > 1) weak += count;
    }
    return { type: atk, weak: n ? weak / n : 0, resist: n ? resist / n : 0, immune: n ? immune / n : 0 };
  });
}

export function archetypeSplit(teams) {
  const n = teams.length;
  const groups = new Map();
  for (const team of teams) {
    const id = team.arch[0];
    const g = groups.get(id) || { n: 0, w: 0, l: 0 };
    g.n++;
    g.w += team.w;
    g.l += team.l;
    groups.set(id, g);
  }
  return [...groups.entries()]
    .map(([id, g]) => ({
      id, n: g.n, pct: n ? g.n / n : 0,
      winPct: g.w + g.l > 0 ? g.w / (g.w + g.l) : null,
    }))
    .sort((a, b) => b.n - a.n);
}

// Only matches where BOTH sides resolve within `teams` (indexed by Team.i)
// can be classified by archetype; matches touching a team outside the given
// set are skipped since its archetype is unknown. Returns null with no
// matches at all, or none resolvable.
export function archetypeMatrix(teams, matches) {
  if (!matches || !matches.length) return null;
  const byIdx = new Map(teams.map((t) => [t.i, t]));
  const cellMap = new Map();
  const idSet = new Set();
  let any = false;
  for (const m of matches) {
    const ta = byIdx.get(m.a);
    const tb = byIdx.get(m.b);
    if (!ta || !tb) continue;
    any = true;
    const ia = ta.arch[0];
    const ib = tb.arch[0];
    idSet.add(ia);
    idSet.add(ib);
    const key = `${ia}|${ib}`;
    const c = cellMap.get(key) || { a: ia, b: ib, w: 0, l: 0, n: 0 };
    c.n++;
    if (m.result === 1) c.w++;
    else if (m.result === 2) c.l++;
    cellMap.set(key, c);
  }
  if (!any) return null;
  return { ids: [...idSet], cells: [...cellMap.values()] };
}

export function coUsage(teams, keys) {
  const n = keys.length;
  const nTeams = teams.length;
  const index = new Map(keys.map((k, i) => [k, i]));
  const solo = new Array(n).fill(0);
  const both = Array.from({ length: n }, () => new Array(n).fill(0));
  // One pass over teams: collect which of `keys` each team holds, then bump
  // every pair among them (a team holds at most 6, so this is tiny per team).
  const present = [];
  for (const t of teams) {
    present.length = 0;
    for (const k of t.species || new Set(t.keys)) {
      const i = index.get(k);
      if (i !== undefined) present.push(i);
    }
    for (const i of present) {
      solo[i]++;
      for (const j of present) both[i][j]++;
    }
  }
  const nMat = [];
  const pctMat = [];
  const liftMat = [];
  for (let i = 0; i < n; i++) {
    const nRow = [];
    const pctRow = [];
    const liftRow = [];
    for (let j = 0; j < n; j++) {
      const c = both[i][j];
      const pct = nTeams ? c / nTeams : 0;
      const pa = nTeams ? solo[i] / nTeams : 0;
      const pb = nTeams ? solo[j] / nTeams : 0;
      nRow.push(c);
      pctRow.push(pct);
      liftRow.push(pa > 0 && pb > 0 ? pct / (pa * pb) : 0);
    }
    nMat.push(nRow);
    pctMat.push(pctRow);
    liftMat.push(liftRow);
  }
  return { keys, n: nMat, pct: pctMat, lift: liftMat };
}

function combinations(arr, k) {
  const result = [];
  const combo = [];
  (function go(start) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      go(i + 1);
      combo.pop();
    }
  })(0);
  return result;
}

export function cores(teams, size = 3, top = 10, minN = 1) {
  // Species keys get small int ids assigned in alphabetical order, so a numeric
  // sort gives the same alphabetical combo order as before and each combo gets
  // a numeric Map key instead of a joined string (6C3 = 20 combos per team adds
  // up over 30k teams).
  const names = [...new Set(teams.flatMap((t) => [...(t.species || t.keys)]))].sort();
  const ids = new Map(names.map((k, i) => [k, i]));
  const radix = Math.max(2, names.length);
  const counts = new Map();
  for (const team of teams) {
    const uniq = [...(team.species || new Set(team.keys))].map((k) => ids.get(k)).sort((x, y) => x - y);
    if (size === 3) {
      // Hot path (the only size the UI asks for): no per-combo allocation.
      const m = uniq.length;
      for (let x = 0; x < m - 2; x++) for (let y = x + 1; y < m - 1; y++) for (let z = y + 1; z < m; z++) {
        const id = (uniq[x] * radix + uniq[y]) * radix + uniq[z];
        const c = counts.get(id);
        if (c) { c.n++; c.w += team.w; c.l += team.l; }
        else counts.set(id, { combo: [uniq[x], uniq[y], uniq[z]], n: 1, w: team.w, l: team.l });
      }
      continue;
    }
    for (const combo of combinations(uniq, size)) {
      let id = 0;
      for (const x of combo) id = id * radix + x;
      const c = counts.get(id);
      if (c) { c.n++; c.w += team.w; c.l += team.l; }
      else counts.set(id, { combo, n: 1, w: team.w, l: team.l });
    }
  }
  const n = teams.length;
  return [...counts.values()]
    .filter((c) => c.n >= minN)
    .sort((a, b) => b.n - a.n)
    .slice(0, top)
    .map((c) => ({
      keys: c.combo.map((x) => names[x]), n: c.n, pct: n ? c.n / n : 0,
      winPct: c.w + c.l > 0 ? c.w / (c.w + c.l) : null,
    }));
}

function countValues(values) {
  const m = new Map();
  for (const v of values) if (v != null) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

function topFromCounts(counts, n, limit = 12) {
  return [...counts.entries()]
    .map(([name, c]) => ({ name, n: c, pct: n ? c / n : 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

// --- items -----------------------------------------------------------------
const itemsBySpeciesMemo = new WeakMap();
/**
 * Held-item split per species key, in one pass over `teams`:
 * Map<key, { n, items: [{ name, n, pct }] }> where n counts that key's slots and
 * pct is the share of those slots holding the item; items sorted by n desc. Memoized per array; treat the result as read-only.
 */
export function itemsBySpecies(teams) {
  let out = itemsBySpeciesMemo.get(teams);
  if (out) return out;
  const acc = new Map();
  for (const t of teams) {
    for (const m of t.mons) {
      let a = acc.get(m.k);
      if (!a) acc.set(m.k, (a = { n: 0, counts: new Map() }));
      a.n++;
      if (m.item) a.counts.set(m.item, (a.counts.get(m.item) || 0) + 1);
    }
  }
  out = new Map();
  for (const [key, a] of acc) {
    const items = [...a.counts].map(([name, c]) => ({ name, n: c, pct: a.n ? c / a.n : 0 })).sort((x, y) => y.n - x.n);
    out.set(key, { n: a.n, items });
  }
  itemsBySpeciesMemo.set(teams, out);
  return out;
}

/** True for a Mega Stone per dex.items. */
export function isMegaStone(item, dex) {
  const e = dex?.items?.[item];
  return !!(e && (e.megaOf || e.megaMap));
}

/**
 * Item usage across teams: [{ name, n, pct, slots, winPct, ci, holders: [{ key, n, pct }] }],
 * sorted by n. n / pct = teams carrying the item (at least once); holders' pct is the
 * share of this item's slots held by that species.
 * opts.megaStones=false drops Mega Stones (they just mirror Mega usage).
 */
export function itemUsage(teams, dex, opts = {}) {
  const { megaStones = true } = opts;
  const acc = new Map();
  for (const t of teams) {
    const seen = new Set();
    for (const m of t.mons) {
      if (!m.item) continue;
      if (!megaStones && isMegaStone(m.item, dex)) continue;
      let a = acc.get(m.item);
      if (!a) acc.set(m.item, (a = { n: 0, slots: 0, w: 0, l: 0, holders: new Map() }));
      a.slots++;
      a.holders.set(m.k, (a.holders.get(m.k) || 0) + 1);
      if (!seen.has(m.item)) { seen.add(m.item); a.n++; a.w += t.w; a.l += t.l; }
    }
  }
  const nTeams = teams.length;
  return [...acc].map(([name, a]) => {
    const games = a.w + a.l;
    return {
      name, n: a.n, pct: nTeams ? a.n / nTeams : 0, slots: a.slots,
      winPct: games > 0 ? a.w / games : null, ci: wilson(a.w, games),
      holders: [...a.holders].map(([key, c]) => ({ key, n: c, pct: c / a.slots })).sort((x, y) => y.n - x.n).slice(0, 5),
    };
  }).sort((x, y) => y.n - x.n);
}

/**
 * Ladder item usage from ladderMerge() output: share of all Pokemon slots holding
 * each item (Smogon's per-Pokemon usage sums to ~6 per team, so this is
 * sum(usage * itemShare) / sum(usage)). [{ name, pct, holders: [{ key, pct }] }].
 */
export function ladderItemUsage(merged, dex, opts = {}) {
  const { megaStones = true } = opts;
  if (!merged) return [];
  let total = 0;
  const acc = new Map();
  for (const mon of merged.mons) {
    total += mon.usage;
    for (const it of mon.items) {
      if (it.name === 'No item' || (!megaStones && isMegaStone(it.name, dex))) continue;
      let a = acc.get(it.name);
      if (!a) acc.set(it.name, (a = { w: 0, holders: [] }));
      const w = mon.usage * it.pct;
      a.w += w;
      a.holders.push({ key: mon.key, w });
    }
  }
  return [...acc].map(([name, a]) => ({
    name, pct: total ? a.w / total : 0,
    holders: a.holders.sort((x, y) => y.w - x.w).slice(0, 5).map((h) => ({ key: h.key, pct: a.w ? h.w / a.w : 0 })),
  })).sort((x, y) => y.pct - x.pct);
}

export function speciesDetail(teams, key, dex) {
  const withKey = teams.filter((t) => t.keys.includes(key));
  const n = withKey.length;
  const monsOf = (t) => t.mons.filter((m) => m.k === key);

  const items = topFromCounts(countValues(withKey.flatMap((t) => monsOf(t).map((m) => m.item))), n);
  const abilities = topFromCounts(countValues(withKey.flatMap((t) => monsOf(t).map((m) => m.ability))), n);
  const moves = topFromCounts(countValues(withKey.flatMap((t) => monsOf(t).flatMap((m) => m.moves))), n);
  const natures = topFromCounts(countValues(withKey.flatMap((t) => monsOf(t).map((m) => m.nature))), n);

  const setCounts = countValues(
    withKey.flatMap((t) => monsOf(t).filter((m) => m.moves.length).map((m) => [...m.moves].sort().join(' / '))),
  );
  const sets = topFromCounts(setCounts, n);

  const bs = dex.species[key]?.bs;
  const spreadCounts = new Map();
  for (const t of withKey) {
    for (const m of monsOf(t)) {
      if (!m.sp || !m.nature) continue;
      const id = `${m.nature}:${m.sp.join('/')}`;
      spreadCounts.set(id, (spreadCounts.get(id) || 0) + 1);
    }
  }
  const spreads = [...spreadCounts.entries()]
    .map(([id, c]) => {
      const [nature, spStr] = id.split(':');
      const sp = spStr.split('/').map(Number);
      return { nature, sp, n: c, stats: bs ? calcStats(bs, sp, nature) : null };
    })
    .sort((a, b) => b.n - a.n);

  const teammateCounts = countValues(withKey.flatMap((t) => [...new Set(t.keys)].filter((k) => k !== key)));
  const teammates = topFromCounts(teammateCounts, n);

  const baseName = dex.species[key]?.base ?? key;
  let totalBase = 0;
  let totalMega = 0;
  for (const t of teams) {
    for (const m of t.mons) {
      if (m.s === baseName) {
        totalBase++;
        if (m.mega) totalMega++;
      }
    }
  }
  const megaPct = totalBase ? totalMega / totalBase : 0;

  const sumRecord = (list) => list.reduce((a, t) => ({ w: a.w + t.w, l: a.l + t.l }), { w: 0, l: 0 });
  const winPctOf = (r) => (r.w + r.l > 0 ? r.w / (r.w + r.l) : null);
  const withRec = sumRecord(withKey);
  const withoutRec = sumRecord(teams.filter((t) => !t.keys.includes(key)));

  return {
    n, pct: teams.length ? n / teams.length : 0,
    items, abilities, moves, natures, sets, spreads, teammates,
    megaPct,
    withWinPct: winPctOf(withRec),
    withoutWinPct: winPctOf(withoutRec),
  };
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function groupByWeek(teams) {
  const byWeek = new Map();
  for (const t of teams) {
    if (!t.date) continue;
    const wk = mondayOf(t.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(t);
  }
  return byWeek;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Drop partial/small weeks (e.g. a currently-in-progress week, or a week with
// only one minor online event) so they don't distort weekly trend lines or
// week-over-week movers. A week qualifies when it has at least
// max(100, 25% of the median week's team count).
function qualifyingWeeks(byWeek) {
  const weeks = [...byWeek.keys()].sort();
  const counts = weeks.map((w) => byWeek.get(w).length);
  const threshold = Math.max(100, median(counts) * 0.25);
  return weeks.filter((w, i) => counts[i] >= threshold);
}

export function weekly(teams, keys) {
  const byWeek = groupByWeek(teams);
  const weeks = qualifyingWeeks(byWeek);
  const totals = weeks.map((w) => byWeek.get(w).length);
  const series = {};
  for (const key of keys) {
    series[key] = weeks.map((w, i) => {
      const c = byWeek.get(w).filter((t) => t.keys.includes(key)).length;
      return totals[i] ? c / totals[i] : 0;
    });
  }
  return { weeks, totals, series };
}

// Compares the last two *qualifying* ISO weeks present in the data (see
// qualifyingWeeks — a partial/small week, e.g. one still in progress, is
// skipped so it can't masquerade as a huge riser or faller). A mover must
// clear minN in BOTH compared weeks: a species with, say, n=0 in the prior
// week and n=21 in the latest week isn't a real "riser", it's just a sample
// too small to compare. weekLast/weekPrev (Monday-of-week dates) are
// returned so the UI can state exactly which weeks were compared.
export function movers(teams, minN) {
  const byWeek = groupByWeek(teams);
  const weeks = qualifyingWeeks(byWeek);
  if (weeks.length < 2) return { risers: [], fallers: [], weekLast: null, weekPrev: null };
  const weekLast = weeks[weeks.length - 1];
  const weekPrev = weeks[weeks.length - 2];
  const lastUsage = new Map(usage(byWeek.get(weekLast)).map((r) => [r.key, r]));
  const prevUsage = new Map(usage(byWeek.get(weekPrev)).map((r) => [r.key, r]));
  const keys = new Set([...lastUsage.keys(), ...prevUsage.keys()]);
  const rows = [];
  for (const key of keys) {
    const last = lastUsage.get(key) || { n: 0, pct: 0 };
    const prev = prevUsage.get(key) || { n: 0, pct: 0 };
    if (last.n < minN || prev.n < minN) continue;
    rows.push({ key, nLast: last.n, nPrev: prev.n, pctLast: last.pct, pctPrev: prev.pct, delta: last.pct - prev.pct });
  }
  const risers = rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta);
  const fallers = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  return { risers, fallers, weekLast, weekPrev };
}

// Most common speed nature+SP per species among open team sheets (mon.sp
// present). Species with no SP data anywhere get null fields rather than a
// guess, so the UI can label them "no open sheet data".
export function speedTiers(teams, dex, top = 20) {
  const bySpecies = new Map();
  const allKeys = new Set();
  for (const t of teams) {
    for (const m of t.mons) {
      allKeys.add(m.k);
      if (!m.sp || !m.nature) continue;
      if (!bySpecies.has(m.k)) bySpecies.set(m.k, []);
      bySpecies.get(m.k).push({ nature: m.nature, speSp: m.sp[5] });
    }
  }
  const nByKey = new Map(usage(teams).map((r) => [r.key, r.n]));
  const rows = [...allKeys].map((key) => {
    const spreads = bySpecies.get(key);
    const n = nByKey.get(key) || 0;
    if (!spreads || !spreads.length) return { key, n, nature: null, sp: null, spe: null, share: null };
    const counts = countValues(spreads.map((s) => `${s.nature}:${s.speSp}`));
    let bestId = null;
    let bestN = -1;
    for (const [id, c] of counts) if (c > bestN) { bestN = c; bestId = id; }
    const [nature, speSpStr] = bestId.split(':');
    const speSp = Number(speSpStr);
    const bs = dex.species[key]?.bs;
    const spe = bs ? calcStat(bs[5], speSp, 5, nature) : null;
    return { key, n, nature, sp: speSp, spe, share: bestN / spreads.length };
  });
  return rows.sort((a, b) => b.n - a.n).slice(0, top);
}

export function closestTeams(keys, teams, k = 5) {
  const query = new Set(keys);
  const scored = teams.map((t) => {
    const inter = [...t.species].filter((x) => query.has(x)).length;
    const union = new Set([...t.species, ...query]).size;
    return { team: t, sim: union ? inter / union : 0 };
  });
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, k);
}

export function toJSONRows(teams) {
  return teams.map((t) => ({
    id: t.id, player: t.player, country: t.country, date: t.date, tier: t.tier,
    placing: t.placing, wins: t.w, losses: t.l, ties: t.t,
    archetype: t.arch[0], mons: t.keys.join(', '),
  }));
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(teams) {
  const rows = toJSONRows(teams);
  const headers = ['id', 'player', 'country', 'date', 'tier', 'placing', 'wins', 'losses', 'ties', 'archetype', 'mons'];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return lines.join('\n');
}

// --- ladder (Smogon chaos, see SCHEMA ladder-<REG>.json) ------------------
// Merge the months inside [from, to] (YYYY-MM-DD, "" = open), weighting each month by its battle count.
// Returns null when no month qualifies. Sub-tables are weighted by the mon's usage share in each month.
/** Pass `dex` to get display names ("Life Orb") instead of Smogon ids ("lifeorb")
 *  in the items / abilities / moves tables. */
export function ladderMerge(ladder, from = '', to = '', dex = null) {
  const months = (ladder?.months || []).filter((m) => (!from || m.month >= from.slice(0, 7)) && (!to || m.month <= to.slice(0, 7)));
  if (!months.length) return null;
  const battles = months.reduce((a, m) => a + m.battles, 0);
  const acc = new Map();
  for (const m of months) {
    const w = m.battles / battles;
    for (const [key, d] of Object.entries(m.mons)) {
      let o = acc.get(key);
      if (!o) acc.set(key, (o = { key, usage: 0, raw: 0, tables: {} }));
      o.usage += d.usage * w;
      o.raw += d.raw;
      for (const t of ['items', 'abilities', 'moves', 'spreads', 'teammates']) {
        const dst = (o.tables[t] ||= {});
        for (const [name, v] of Object.entries(d[t] || {})) dst[name] = (dst[name] || 0) + v * d.usage * w;
      }
      const c = (o.tables.counters ||= {});
      for (const [name, v] of Object.entries(d.counters || {})) c[name] ||= v; // latest-first not guaranteed; keep first seen
    }
  }
  const mons = [...acc.values()].map((o) => {
    const norm = (tbl) => Object.entries(tbl || {}).map(([name, v]) => ({ name, pct: o.usage ? v / o.usage : 0 })).sort((a, b) => b.pct - a.pct);
    const named = (tbl) => {
      const rows = norm(tbl).filter((r) => r.name !== '');
      return dex ? rows.map((r) => ({ ...r, name: displayName(r.name, dex) })) : rows;
    };
    return { key: o.key, usage: o.usage, raw: o.raw, items: named(o.tables.items), abilities: named(o.tables.abilities), moves: named(o.tables.moves),
      spreads: norm(o.tables.spreads), teammates: norm(o.tables.teammates),
      counters: Object.entries(o.tables.counters).map(([name, [score, dev]]) => ({ name, score, dev })).sort((a, b) => b.score - a.score) };
  }).sort((a, b) => b.usage - a.usage);
  return { battles, months: months.map((m) => m.month), cutoff: ladder.cutoff, urls: months.map((m) => m.url), mons };
}

// --- ranked (official in-game Battle Data, see SCHEMA ranked-<REG>.json) --------
// The game publishes RANKS, not usage shares: nothing here derives a usage %.

/** Latest season in the file; with from/to ("" = open) the latest whose snapshot is in range. null if none. */
export function rankedSeason(ranked, from = '', to = '') {
  let best = null;
  for (const s of ranked?.seasons || []) {
    if ((from && s.snapshot < from) || (to && s.snapshot > to)) continue;
    if (!best || s.snapshot > best.snapshot) best = s;
  }
  return best;
}

/** `{name: fraction}` -> `[{name, pct}]`, highest first. */
export function rankedEntries(tbl) {
  return Object.entries(tbl || {}).map(([name, pct]) => ({ name, pct })).sort((a, b) => b.pct - a.pct);
}

/** Ranked entry for a display key; Mega keys map to their base (the game tracks Megas as base + stone). */
export function rankedMon(season, key, dex) {
  if (!season) return null;
  const name = season.mons[key] ? key : dex?.species?.[key]?.megaOf;
  return name && season.mons[name] ? { name, mon: season.mons[name] } : null;
}

/** Mega form key when the mon's top item is its own Mega Stone at >= 50%, else null. */
export function rankedMegaKey(name, mon, dex) {
  const top = rankedEntries(mon?.items)[0];
  const it = top && dex?.items?.[top.name];
  return it?.mega && it.megaOf === name && top.pct >= 0.5 ? it.mega : null;
}

/**
 * Speed from the top ranked spread's Spe SP + the top nature. The game reports those two as separate
 * marginals, so this is "most common SP with most common nature", labelled as such by callers.
 */
export function rankedSpeed(mon, bs) {
  const spread = rankedEntries(mon?.spreads)[0];
  const nat = rankedEntries(mon?.natures)[0];
  if (!spread || !nat || !bs) return null;
  const sp = parseSP(spread.name);
  if (!sp) return null;
  return { spe: calcStat(bs[5], sp[5], 5, nat.name), nature: nat.name, naturePct: nat.pct, sp: sp[5], spreadPct: spread.pct };
}
