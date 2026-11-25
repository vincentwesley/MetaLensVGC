// replays.js (lib) — Pokémon Showdown replay logs -> compact game records, and aggregates over them (v1.9.1).
// Pure: used by scripts/showdown-players.js (daily top-ladder sample) and by the browser's player lookup (live).
// A record keeps only what the analyses need: each side's team preview (6), the Pokémon actually sent out ("brought"),
// the opening lead(s), Mega Evolution and Terastallization, and the winner. Keys are species as shown at team
// preview (a Mega shows as its base species there; `mega` names the form it became).
import { wilson } from './stats.js';

export const toUserId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const species = (details) => String(details || '').split(',')[0].trim().replace(/-\*$/, '');
// Team preview can hide a form ("Urshifu-*"); the switch details then name it. Compare on the base name.
const baseOf = (s) => species(s).split('-')[0];

/**
 * Showdown replay JSON ({id, log, uploadtime, rating, players, formatid}) -> record, or null if the log has no team
 * preview (e.g. random formats). doubles: leads are the first two Pokémon out, else one.
 */
export function parseReplay(json) {
  const log = String(json?.log || '').split('\n');
  const sides = { p1: { name: null, six: [], brought: [], lead: [], mega: null, tera: null }, p2: { name: null, six: [], brought: [], lead: [], mega: null, tera: null } };
  const nick = {}; // "p1a: Nick" -> species
  let winner = null;
  let turn = 0;
  let doubles = /doubles/i.test(json?.formatid || json?.format || '');
  for (const line of log) {
    const parts = line.split('|');
    const tag = parts[1];
    if (tag === 'player' && sides[parts[2]] && parts[3]) sides[parts[2]].name = parts[3];
    else if (tag === 'gametype') doubles = parts[2] === 'doubles';
    else if (tag === 'poke' && sides[parts[2]]) sides[parts[2]].six.push(species(parts[3]));
    else if (tag === 'turn') turn = Number(parts[2]) || turn;
    else if (tag === 'switch' || tag === 'drag') {
      const side = parts[2]?.slice(0, 2);
      if (!sides[side]) continue;
      const sp = species(parts[3]);
      nick[parts[2].replace(/^(p[12])[a-c]:/, '$1:')] = sp;
      const s = sides[side];
      // match a hidden-form preview entry ("Urshifu" for "Urshifu-Rapid-Strike") so brought/lead use preview names
      const pre = s.six.find((x) => x === sp) || s.six.find((x) => baseOf(x) === baseOf(sp)) || sp;
      if (!s.brought.includes(pre)) s.brought.push(pre);
      if (turn === 0 && s.lead.length < (doubles ? 2 : 1)) s.lead.push(pre);
    } else if (tag === 'detailschange' || tag === '-mega') {
      const side = parts[2]?.slice(0, 2);
      if (!sides[side]) continue;
      const before = nick[parts[2].replace(/^(p[12])[a-c]:/, '$1:')];
      if (tag === 'detailschange' && /-Mega/.test(parts[3] || '')) sides[side].mega = { species: before ? (sides[side].six.find((x) => baseOf(x) === baseOf(before)) || before) : baseOf(parts[3]), form: species(parts[3]) };
    } else if (tag === '-terastallize') {
      const side = parts[2]?.slice(0, 2);
      if (!sides[side]) continue;
      const sp = nick[parts[2].replace(/^(p[12])[a-c]:/, '$1:')];
      sides[side].tera = { species: sp ? (sides[side].six.find((x) => baseOf(x) === baseOf(sp)) || sp) : null, type: parts[3] || null };
    } else if (tag === 'win') winner = toUserId(parts[2]);
  }
  if (!sides.p1.six.length || !sides.p2.six.length) return null;
  const p = ['p1', 'p2'].map((k) => {
    const s = sides[k];
    return { u: toUserId(s.name), name: s.name, six: s.six, brought: s.brought, lead: s.lead, mega: s.mega, tera: s.tera };
  });
  const w = winner == null ? null : winner === p[0].u ? 0 : winner === p[1].u ? 1 : null;
  const date = json.uploadtime ? new Date(json.uploadtime * 1000).toISOString().slice(0, 10) : null;
  return { id: json.id, date, rating: Number.isFinite(json.rating) ? json.rating : null, p, w };
}

/**
 * Aggregates over game records (both sides count). opts.side(game, i) -> bool limits to some sides (player lookup:
 * only that player's side). Returns { games, sides, mons: [{key, games, wins, losses, winPct, ci, brought, broughtPct,
 * led, ledPct, mega}], leads: [{pair, games, wins, winPct}] } sorted by games.
 */
export function aggregateReplays(games, { side = () => true, minLead = 1 } = {}) {
  const mons = new Map();
  const leads = new Map();
  let sides = 0;
  for (const g of games || []) {
    g.p.forEach((s, i) => {
      if (!side(g, i)) return;
      sides++;
      const won = g.w === i;
      const decided = g.w === 0 || g.w === 1;
      for (const sp of s.six) {
        const m = mons.get(sp) || { key: sp, games: 0, wins: 0, losses: 0, brought: 0, led: 0, mega: 0 };
        m.games++;
        if (decided) { if (won) m.wins++; else m.losses++; }
        if (s.brought.includes(sp)) m.brought++;
        if (s.lead.includes(sp)) m.led++;
        if (s.mega?.species === sp) m.mega++;
        mons.set(sp, m);
      }
      if (s.lead.length) {
        const pair = [...s.lead].sort().join(' + ');
        const l = leads.get(pair) || { pair, games: 0, wins: 0, decided: 0 };
        l.games++;
        if (decided) { l.decided++; if (won) l.wins++; }
        leads.set(pair, l);
      }
    });
  }
  const monRows = [...mons.values()].map((m) => {
    const n = m.wins + m.losses;
    return { ...m, winPct: n ? m.wins / n : null, ci: n ? wilson(m.wins, n) : null, broughtPct: m.games ? m.brought / m.games : 0, ledPct: m.games ? m.led / m.games : 0 };
  }).sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
  const leadRows = [...leads.values()].filter((l) => l.games >= minLead)
    .map((l) => ({ pair: l.pair, games: l.games, wins: l.wins, winPct: l.decided ? l.wins / l.decided : null }))
    .sort((a, b) => b.games - a.games || a.pair.localeCompare(b.pair));
  return { games: (games || []).length, sides, mons: monRows, leads: leadRows };
}

/**
 * One page of Showdown's replay search (it returns size + 1 rows when more exist): { rows, before } where `before` is
 * the uploadtime to ask for the next page with (`&before=`), or null on the last page.
 */
export function replayPage(rows, size = 50) {
  const list = Array.isArray(rows) ? rows : [];
  return { rows: list.slice(0, size), before: list.length > size ? list[size - 1].uploadtime : null };
}
