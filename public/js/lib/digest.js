// digest.js: pure logic for the Weekly Digest. digestData(view) -> plain data (strings already formatted),
// digestText(data) -> Discord/Reddit-friendly plain text. No DOM, no fetch.
import { usage, atMinN, itemsBySpecies, changeVsPrev, ladderMerge, rankedSeason, rankedEntries } from './aggregate.js';
import { ladderMovers } from './ladder-field.js';
import { ARCHETYPES } from './archetypes.js';

const pct = (f) => (f > 0 && f < 0.001 ? '<0.1%' : `${(f * 100).toFixed(1)}%`);
const pts = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}pt`;
const nf = (n) => Number(n).toLocaleString('en-US');
const flat = (v) => Number(v.toFixed(1)) === 0;

// Top 3 each way from [{key, pct, pts}] (pts = change in percentage points, already real numbers).
function movers(rows) {
  const m = rows.filter((r) => Number.isFinite(r.pts) && !flat(r.pts));
  const row = (r) => ({ key: r.key, text: `${pct(r.pct)} (${pts(r.pts)})` });
  return {
    risers: m.filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map(row),
    fallers: m.filter((r) => r.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 3).map(row),
  };
}

export function digestData(view) {
  const st = view.state;
  const regMeta = (view.manifest?.regs || []).find((r) => r.id === st.reg);
  const out = {
    regLabel: regMeta?.label || st.reg, sourceLabel: '', n: 0, unit: 'teams', range: '', updated: view.manifest?.generated?.slice(0, 10) || '',
    top: [], risers: [], fallers: [], compare: null, note: null, item: null, arch: null, empty: null,
  };
  if (st.source === 'ranked') {
    out.sourceLabel = 'In-game ranked'; out.unit = 'Pokémon';
    const season = rankedSeason(view.ranked, st.from, st.to);
    if (!season) { out.empty = 'No in-game ranked season in the selected range'; return out; }
    const ranking = (season.ranking || []).filter((k) => season.mons[k]);
    out.n = Object.keys(season.mons).length; out.range = `season ${season.season}, ${season.snapshot}`;
    if (!ranking.length) { out.empty = `Ranking not published for season ${season.season}`; return out; }
    out.top = ranking.slice(0, 5).map((k) => ({ key: k, text: `rank #${season.mons[k].rank}` }));
    out.note = 'Ranked publishes ranks, not usage shares: no risers or fallers.';
    const it = rankedEntries(season.mons[ranking[0]].items)[0];
    if (it) out.item = { mon: ranking[0], item: it.name, text: pct(it.pct) };
    return out;
  }
  if (st.source === 'ladder') {
    out.sourceLabel = 'Ladder (Smogon)'; out.unit = 'battles';
    const merged = ladderMerge(view.ladder, st.from, st.to, view.dex);
    if (!merged || !merged.mons.length) { out.empty = 'No ladder data for this regulation yet'; return out; }
    const ms = merged.months;
    out.n = merged.battles; out.range = ms.length > 1 ? `${ms[0]} to ${ms[ms.length - 1]}` : ms[0];
    out.top = merged.mons.slice(0, 5).map((m) => ({ key: m.key, text: pct(m.usage) }));
    const lm = ladderMovers(view.ladder, st.from, st.to);
    if (lm) {
      out.compare = `${lm.monthPrev} to ${lm.monthLast}`;
      Object.assign(out, movers([...lm.risers, ...lm.fallers].map((r) => ({ key: r.key, pct: r.pctLast, pts: r.delta * 100 }))));
    }
    const it = merged.mons[0].items[0];
    if (it) out.item = { mon: merged.mons[0].key, item: it.name, text: pct(it.pct) };
    return out;
  }
  out.sourceLabel = 'Tournaments';
  const teams = view.monTeams || [];
  if (!teams.length) { out.empty = 'No tournament teams match these filters'; return out; }
  out.n = teams.length;
  const dates = teams.map((t) => t.date).filter(Boolean).sort();
  out.range = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : '';
  const rows = atMinN(usage(teams), st.minN).rows;
  out.top = rows.slice(0, 5).map((r) => ({ key: r.key, text: pct(r.pct) }));
  if (view.prev && view.prev.length) {
    const prev = new Map(usage(view.prev).map((r) => [r.key, r]));
    out.compare = view.prev[0].reg !== view.reg ? `vs ${view.prev[0].reg}` : 'vs the prior period';
    Object.assign(out, movers(rows.map((r) => {
      const c = changeVsPrev(r.pct, prev.get(r.key), st.minN);
      return { key: r.key, pct: r.pct, pts: c.isNew ? NaN : c.pts };
    })));
  }
  const it = rows[0] && itemsBySpecies(teams).get(rows[0].key)?.items[0];
  if (it) out.item = { mon: rows[0].key, item: it.name, text: pct(it.pct) };
  const top8 = teams.filter((t) => t.placing != null && t.placing <= 8 && t.arch?.length);
  if (top8.length) {
    const c = new Map();
    for (const t of top8) c.set(t.arch[0], (c.get(t.arch[0]) || 0) + 1);
    const [id, k] = [...c].sort((a, b) => b[1] - a[1])[0];
    out.arch = { label: ARCHETYPES.find((a) => a.id === id)?.label || id, text: `${k} of ${nf(top8.length)} top-8 teams (${pct(k / top8.length)})` };
  }
  return out;
}

export function digestText(d) {
  const L = [`MetaLens VGC weekly digest: ${d.regLabel}`];
  const head = [d.sourceLabel, d.n ? `${nf(d.n)} ${d.unit}` : '', d.range, d.updated ? `data updated ${d.updated}` : ''].filter(Boolean);
  L.push(head.join(' | '));
  if (d.empty) { L.push('', d.empty); return L.join('\n'); }
  L.push('', 'Top 5 by usage');
  d.top.forEach((r, i) => L.push(`${i + 1}. ${r.key} ${r.text}`));
  if (!d.compare) L.push('', d.note || 'No previous period yet');
  else {
    const list = (title, rows) => { L.push('', `${title} (${d.compare})`); L.push(...(rows.length ? rows.map((r) => `${r.key} ${r.text}`) : ['none'])); };
    list('Biggest risers', d.risers);
    list('Biggest fallers', d.fallers);
  }
  if (d.item) L.push('', `Most common item on ${d.item.mon}: ${d.item.item} (${d.item.text})`);
  if (d.arch) L.push(`Top 8 archetype: ${d.arch.label}, ${d.arch.text}`);
  return L.join('\n');
}
