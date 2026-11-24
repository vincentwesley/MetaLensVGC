// Research export (Vin's Atelier): tidy CSV tables + a generated codebook, built from the same committed data files
// the dashboard reads (teams-/rosters-/quality-<REG>.json). Used by `npm run data` (-> data-export/) and by
// scripts/release.js. Pure apart from what callers pass in.
//
// Never reads ranked-<REG>.json (Pokémon Champions Battle Data: its API rules forbid redistribution) or the Smogon
// ladder files. No display names: players appear only as salted pseudonymous ids (pid).
import { createHash } from 'node:crypto';
import { decode } from '../../public/js/lib/aggregate.js';
import { ARCHETYPES, ARCHETYPE_RULESET } from '../../public/js/lib/archetypes.js';
import { DEFAULT_COUNTRY_POLICY, REGIONS, REGION_MIN_GROUP, REGION_SCHEME, checkPolicy, countryColumn } from './geo-regions.js';

const RESULT = '1 = side A won, 2 = side B won, 0 = tie, 3 = no result (double loss / unreported). Rows built before ' +
  'MetaLens v1.7.0 use 0 for "tie or unknown".';
const PHASE = '1 = Swiss, 2 = top cut, 0 = unknown. Official events: a round is top cut when every player paired in it made top cut.';
const BO = '1 or 3 = best of, from the Limitless phase mode; 0 = not published by the source (always 0 for official events, ' +
  'although Play! Pokémon rules use best-of-three).';
const PID = 'Pseudonymous player id: first 16 hex characters of HMAC-SHA256(secret salt, source key). The same player has the ' +
  'same pid in every event of the same namespace. Empty when the row was built without the salt.';
const NS = '1 = Limitless username (online events), 2 = standings.limitlessvgc.com player id (official events), ' +
  '3 = event-scoped official id (no standings record; never links across events), 0 = unknown. Namespaces 1 and 2 cannot be linked.';

/** One schema drives the CSV headers and CODEBOOK.md. */
export const TABLES = {
  'events.csv': {
    desc: 'One row per tournament.',
    columns: [
      ['event_id', 'string', 'MetaLens event id: "lt:<Limitless id>" (online) or "lvgc:<limitlessvgc.com id>" (official).'],
      ['regulation', 'string', 'Regulation set (M-A, M-B, M-C...).'],
      ['name', 'string', 'Event name as published.'],
      ['date', 'date', 'Event start date (UTC), YYYY-MM-DD.'],
      ['tier', 'string', 'worlds | international | regional | online.'],
      ['source', 'string', 'limitless (play.limitlesstcg.com, online) | limitlessvgc (limitlessvgc.com + standings.limitlessvgc.com, official).'],
      ['url', 'string', 'Source page.'],
      ['players', 'integer', 'Entrants as published.'],
      ['lists', 'integer', 'Full team lists in teams.csv for this event.'],
      ['coverage_rate', 'number', 'lists / players (0-1); empty when unknown.'],
      ['coverage_kind', 'string', 'complete (lists for >= 95% of players: online events) | published-subset (official events: full lists for top finishers only; see roster_players.csv for everyone, species only).'],
      ['cut', 'integer', 'Top-cut size; empty when unknown.'],
      ['rounds', 'integer', 'Rounds as published (official: all rounds including top cut; online: Swiss rounds).'],
      ['fetched', 'date', 'Day the event was first built into MetaLens; empty for events built before v1.7.0.'],
      ['drop_reported', 'boolean', '1 if teams.csv drop_round is known for this event (empty drop_round = did not drop); 0 = built before MetaLens v1.8.2 or no standings record, drop_round unknown.'],
    ],
  },
  'teams.csv': {
    desc: 'One row per full team list (6 Pokémon with items, abilities and moves).',
    columns: [
      ['team_id', 'string', 'Release-scoped team id: <regulation>-<row number in teams-<REG>.json>.'],
      ['event_id', 'string', 'events.csv event_id.'],
      ['regulation', 'string', 'Regulation set.'],
      ['pid', 'string', PID],
      ['id_namespace', 'integer', NS],
      ['placing', 'integer', 'Final placing; empty when not published.'],
      ['top_cut', 'boolean', '1 if placing <= cut (cut unknown: placing <= 8).'],
      ['wins', 'integer', 'Match wins as published (official events: from the standings site).'],
      ['losses', 'integer', 'Match losses as published.'],
      ['ties', 'integer', 'Ties as published (the official standings site publishes none: 0).'],
      ['drop_round', 'integer', 'Online (Limitless): rounds played before the player dropped (a dropped player has no placing). Official: the standings site\'s drop_round. Empty = did not drop, when the event has drop_reported = 1; unknown otherwise (also for id_namespace 3 rows).'],
      // + the country column of the chosen policy (tablesFor): none, `region` or `country`.
    ],
  },
  'team_members.csv': {
    desc: 'One row per Pokémon on a full team list.',
    columns: [
      ['team_id', 'string', 'teams.csv team_id.'],
      ['slot', 'integer', 'Position on the sheet, 1-6.'],
      ['species', 'string', 'Battle species as listed (base or regional/gender form, never a Mega form).'],
      ['form', 'string', 'Mega form when the Pokémon holds its own Mega Stone (e.g. Charizard-Mega-Y), else the species.'],
      ['item', 'string', 'Held item, normalized to the game name; empty if none.'],
      ['ability', 'string', 'Ability as listed (the pre-Mega ability for Mega Stone holders), normalized.'],
      ['effective_ability', 'string', 'Ability in battle once Mega Evolved: the Mega form\'s own ability when the Pokémon holds its own Mega Stone, else the listed ability. A team carrying several stones Mega Evolves only one per battle; each holder gets its Mega ability here.'],
      ['move1', 'string', 'Move, normalized; empty if fewer moves were listed.'],
      ['move2', 'string', 'Move.'],
      ['move3', 'string', 'Move.'],
      ['move4', 'string', 'Move.'],
      ['holds_own_mega_stone', 'boolean', '1 if the item is this species\' own Mega Stone.'],
    ],
  },
  'matches.csv': {
    desc: 'One row per match between two full team lists of the same event (byes excluded).',
    columns: [
      ['match_id', 'string', 'Release-scoped id: <regulation>-m<row number>.'],
      ['event_id', 'string', 'events.csv event_id.'],
      ['team_a', 'string', 'teams.csv team_id of side A.'],
      ['team_b', 'string', 'teams.csv team_id of side B.'],
      ['result', 'integer', RESULT],
      ['round', 'integer', 'Round number from the source; 0 = unknown (rows built before v1.7.0).'],
      ['phase', 'integer', PHASE],
      ['best_of', 'integer', BO],
      ['games_a', 'integer', 'Games won by A when the source lists per-game winners; empty otherwise.'],
      ['games_b', 'integer', 'Games won by B; empty otherwise.'],
    ],
  },
  'team_archetypes.csv': {
    desc: 'Archetype labels of each full team under the rule set named in ruleset_version (public/js/lib/archetypes.js).',
    columns: [
      ['team_id', 'string', 'teams.csv team_id.'],
      ['ruleset_version', 'string', 'ARCHETYPE_RULESET.version used for these labels.'],
      ['archetypes', 'string', 'Every archetype the team matches, in rule priority order, "|"-separated; "other" if none.'],
      ['primary', 'string', 'The first of those (the label the dashboard\'s primary view uses).'],
      ['mega_stones_carried', 'integer', 'Pokémon holding their own Mega Stone (only one can Mega Evolve per battle).'],
    ],
  },
  'roster_players.csv': {
    desc: 'Official events only: every player on the standings site, with a species-only team (the source lists all teams; ' +
      'full lists exist only for the players also in teams.csv).',
    columns: [
      ['roster_id', 'string', 'Release-scoped id: <regulation>-r<event index>-<player index>.'],
      ['event_id', 'string', 'events.csv event_id.'],
      ['pid', 'string', PID],
      ['id_namespace', 'integer', NS],
      ['placing', 'integer', 'Final placing; empty when not published.'],
      ['wins', 'integer', 'Match wins.'],
      ['losses', 'integer', 'Match losses.'],
      ['drop_round', 'integer', 'Round the player dropped after; empty if they did not drop.'],
      ['top_cut', 'boolean', '1 if the player made top cut.'],
      ['day2', 'boolean', '1 if the player made day 2.'],
      ['team_id', 'string', 'teams.csv team_id of this player\'s full list; empty if none was published.'],
      ['species1', 'string', 'Species as listed (no Mega form: the roster has no items).'],
      ['species2', 'string', 'Species.'],
      ['species3', 'string', 'Species.'],
      ['species4', 'string', 'Species.'],
      ['species5', 'string', 'Species.'],
      ['species6', 'string', 'Species.'],
    ],
  },
  'roster_matches.csv': {
    desc: 'Official events only: every non-bye pairing between roster players (complete, unlike matches.csv for these events).',
    columns: [
      ['event_id', 'string', 'events.csv event_id.'],
      ['roster_a', 'string', 'roster_players.csv roster_id of side A.'],
      ['roster_b', 'string', 'roster_players.csv roster_id of side B.'],
      ['result', 'integer', RESULT],
      ['round', 'integer', 'Round number.'],
      ['phase', 'integer', PHASE],
    ],
  },
};

const cell = (v) => {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The teams.csv column each country policy adds ('drop' adds none). See scripts/lib/geo-regions.js.
const COUNTRY_COLUMN = {
  region: ['region', 'string', `World region of the country on the sheet: ${Object.keys(REGIONS).join(' | ')} (see "Country policy"); `
    + `"suppressed" when fewer than ${REGION_MIN_GROUP} full lists at the event share that region; empty if no country was published.`],
  raw: ['country', 'string', 'INTERNAL EXPORT ONLY, never released: ISO 3166-1 alpha-2 country as published; empty if none.'],
};

/** TABLES with the teams.csv country column of `policy` (default 'drop': no country column at all). */
export function tablesFor(policy = DEFAULT_COUNTRY_POLICY) {
  checkPolicy(policy);
  if (!COUNTRY_COLUMN[policy]) return TABLES;
  const teams = TABLES['teams.csv'];
  return { ...TABLES, 'teams.csv': { ...teams, columns: [...teams.columns, COUNTRY_COLUMN[policy]] } };
}

function table(tables, name) {
  const cols = tables[name].columns.map((c) => c[0]);
  const lines = [cols.join(',')];
  return { add: (row) => lines.push(cols.map((c) => cell(row[c])).join(',')), text: () => `${lines.join('\n')}\n` };
}

/**
 * regs: [{ reg, teams, rosters? }] (parsed teams-/rosters-<REG>.json), dex: dex.json.
 * opts.country: 'drop' (default) | 'region' | 'raw' (internal only), see geo-regions.js.
 * Returns { '<file>.csv': text, ... } in a fixed order, deterministic for the same input, with a non-enumerable
 * `countryStats` ({ policy, suppressed?, unmapped? } summed over regs) for the release record.
 */
export function buildExport(regs, dex, { country = DEFAULT_COUNTRY_POLICY } = {}) {
  const tables = tablesFor(country);
  const t = Object.fromEntries(Object.keys(tables).map((n) => [n, table(tables, n)]));
  const countryStats = { policy: country };
  for (const { reg, teams: file, rosters } of regs) {
    const { teams, events, matches } = decode(file, dex);
    const col = countryColumn(teams, country);
    for (const k of ['suppressed', 'unmapped']) if (k in col.stats) countryStats[k] = (countryStats[k] || 0) + col.stats[k];
    const colName = COUNTRY_COLUMN[country]?.[0];
    const lists = new Map();
    for (const tm of teams) lists.set(tm.ev.id, (lists.get(tm.ev.id) || 0) + 1);
    for (const ev of events) {
      t['events.csv'].add({ event_id: ev.id, regulation: reg, name: ev.name, date: ev.date, tier: ev.tier, source: ev.source, url: ev.url,
        players: ev.players, lists: lists.get(ev.id) || 0, coverage_rate: ev.coverage?.rate, coverage_kind: ev.coverage?.kind,
        cut: ev.cut, rounds: ev.rounds, fetched: ev.fetched, drop_reported: !!ev.dropReported });
    }
    const tid = (i) => `${reg}-${i}`;
    teams.forEach((tm, k) => {
      const row = file.teams[tm.i];
      t['teams.csv'].add({ team_id: tid(tm.i), event_id: tm.ev.id, regulation: reg, pid: row[8], id_namespace: row[9] ?? 0,
        placing: tm.placing, top_cut: tm.topCut, wins: tm.w, losses: tm.l, ties: tm.t, drop_round: row[10], ...(colName ? { [colName]: col.values[k] } : {}) });
      tm.mons.forEach((m, j) => {
        t['team_members.csv'].add({ team_id: tid(tm.i), slot: j + 1, species: m.s, form: m.k, item: m.item, ability: m.ability,
          effective_ability: m.mega ? dex.species[m.k]?.abilities?.[0] || m.ability : m.ability,
          move1: m.moves[0], move2: m.moves[1], move3: m.moves[2], move4: m.moves[3], holds_own_mega_stone: m.mega });
      });
      t['team_archetypes.csv'].add({ team_id: tid(tm.i), ruleset_version: ARCHETYPE_RULESET.version, archetypes: tm.arch.join('|'),
        primary: tm.arch[0], mega_stones_carried: tm.megas.length });
    });
    matches.forEach((m, i) => {
      t['matches.csv'].add({ match_id: `${reg}-m${i}`, event_id: teams[m.a].ev.id, team_a: tid(m.a), team_b: tid(m.b), result: m.result,
        round: m.round, phase: m.phase, best_of: m.bo, games_a: m.games?.[0], games_b: m.games?.[1] });
    });
    for (const ev of rosters?.events || []) {
      const rid = (p) => `${reg}-r${ev.event}-${p}`;
      ev.players.forEach(([pid, ns, placing, w, l, drop, topcut, day2, species, row], p) => {
        const sp = species.map((s) => rosters.strings[s]);
        t['roster_players.csv'].add({ roster_id: rid(p), event_id: ev.id, pid, id_namespace: ns, placing, wins: w, losses: l,
          drop_round: drop, top_cut: topcut === 1, day2: day2 === 1, team_id: row >= 0 ? tid(row) : '',
          ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => [`species${k + 1}`, sp[k]])) });
      });
      for (const [a, b, result, round, phase] of ev.matches) {
        t['roster_matches.csv'].add({ event_id: ev.id, roster_a: rid(a), roster_b: rid(b), result, round, phase });
      }
    }
  }
  const out = Object.fromEntries(Object.entries(t).map(([n, x]) => [n, x.text()]));
  Object.defineProperty(out, 'countryStats', { value: countryStats, enumerable: false });
  return out;
}

function countrySection(policy) {
  const out = ['## Country policy', ''];
  if (policy === 'drop') {
    out.push('Country is not included: teams.csv has no country or region column. The sheet\'s country, with the event and',
      'placing, could re-identify a player from a small country. (MetaLens uses the country internally, for example on the',
      "dashboard's Meta by country section; it is left out of the release on purpose.)", '');
  } else if (policy === 'region') {
    out.push(`The sheet's ISO 3166-1 alpha-2 country is grouped into world regions (${REGION_SCHEME}) in teams.csv \`region\`.`,
      `A region is published only when at least ${REGION_MIN_GROUP} full lists at the same event share it; otherwise the cell`,
      'reads "suppressed", so a small group cannot point back to a country and from there to a player. Taiwan (not listed',
      'by M49) is grouped with Eastern Asia, Kosovo (XK) with Southern Europe, and the sheet spelling UK with GB.', '',
      '| region | label | ISO 3166-1 alpha-2 codes |', '|---|---|---|');
    for (const [id, r] of Object.entries(REGIONS)) out.push(`| ${id} | ${r.label} | ${r.codes} |`);
    out.push('');
  } else {
    out.push('INTERNAL EXPORT: teams.csv `country` is the country as published. Never publish this export; releases',
      '(scripts/release.js) only accept the drop or region policy.', '');
  }
  return out;
}

// --- paper, source, licence, limitations (RELEASE.json, README and codebook share these) ---------------------------
export const PAPER = {
  title: 'The Geometry of a Metagame: Archetype Complexity, Matchup Cycles, and a Hierarchical Map of Pokémon Champions VGC',
  author: 'Vincent Wesley', affiliation: "Vin's Atelier", status: 'in preparation',
};
export const SOURCES = [
  { id: 'limitless', name: 'Limitless Play (online tournaments)', url: 'https://play.limitlesstcg.com' },
  { id: 'limitlessvgc', name: 'limitlessvgc.com (official events, team lists)', url: 'https://limitlessvgc.com' },
  { id: 'limitlessvgc-standings', name: 'standings.limitlessvgc.com (official standings, pairings, species-only teams)', url: 'https://standings.limitlessvgc.com' },
];
export const ATTRIBUTION = 'Tournament data from Limitless (play.limitlesstcg.com, limitlessvgc.com, standings.limitlessvgc.com).';
export const LICENCE = 'pending permission from Limitless';

/** Known limitations; onlineShare = share of full team lists from online events in this release (0-1). */
export function limitations(onlineShare) {
  return [
    `About ${Math.round(onlineShare * 100)}% of full team lists come from online (Limitless) events; official events are a small minority.`,
    'Official events publish full team lists for top finishers only (coverage_kind = published-subset); roster_players.csv / roster_matches.csv give every player at species level (no items, so no Mega forms).',
    'Open team lists show the six Pokémon registered, not the four brought to each game: no table says which four played.',
    'The data is pseudonymized, not anonymous: no names, but the source pages are public, so a team can be traced back through event and placing.',
  ];
}

// --- confirmation split (pre-registration) ------------------------------------------------------------------------
export const SPLIT_CONFIRM_SHARE = 0.3;
export const SPLIT_METHOD = 'Per regulation, events are ordered by SHA-256("<seed>:<event_id>") (hex, ascending); the first '
  + 'round(0.30 x events) are "confirm", the rest "explore". Whole events only (no tournament is split); stratified by regulation.';
const sha = (x) => createHash('sha256').update(x).digest('hex');

/** eventsByReg: [{ reg, ids: [event_id] }]. Returns { rows: [{event_id, regulation, split}], counts }. Deterministic in (ids, seed). */
export function confirmationSplit(eventsByReg, seed) {
  if (!seed) throw new Error('confirmation split needs a seed');
  const rows = [];
  const counts = {};
  for (const { reg, ids } of eventsByReg) {
    const order = [...new Set(ids)].sort().map((id) => [sha(`${seed}:${id}`), id]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const nConfirm = Math.round(order.length * SPLIT_CONFIRM_SHARE);
    const confirm = new Set(order.slice(0, nConfirm).map(([, id]) => id));
    counts[reg] = { events: order.length, explore: order.length - nConfirm, confirm: nConfirm };
    for (const id of [...new Set(ids)].sort()) rows.push({ event_id: id, regulation: reg, split: confirm.has(id) ? 'confirm' : 'explore' });
  }
  return { rows, counts };
}

export const SPLIT_TABLE = {
  'confirmation_split.csv': {
    desc: 'Pre-registered confirmation split, fixed at freeze: every event of the release is "explore" (70%) or "confirm" (30%). See "Confirmation split".',
    columns: [
      ['event_id', 'string', 'events.csv event_id.'],
      ['regulation', 'string', 'Regulation set (the stratum).'],
      ['split', 'string', 'explore | confirm.'],
    ],
  },
};

// --- aggregates-only content (fallback while redistribution permission is pending) ---------------------------------
const WEEK = 'Week starting Monday (UTC), YYYY-MM-DD, of the event date.';
export const AGG_TABLES = {
  'agg_usage_species.csv': {
    desc: 'Pokémon usage by regulation, week and split: full team lists including each display form (Mega forms separate).',
    columns: [
      ['regulation', 'string', 'Regulation set.'], ['week', 'date', WEEK], ['split', 'string', 'explore | confirm (confirmation_split.csv).'],
      ['form', 'string', 'Display form: the Mega form when the Pokémon holds its own Mega Stone, else the species.'],
      ['teams', 'integer', 'Full team lists including this form.'], ['week_teams', 'integer', 'Full team lists in this regulation, week and split (the denominator).'],
    ],
  },
  'agg_usage_archetype.csv': {
    desc: 'Archetype usage by regulation, week and split (rule set in "Archetype rule set").',
    columns: [
      ['regulation', 'string', 'Regulation set.'], ['week', 'date', WEEK], ['split', 'string', 'explore | confirm.'],
      ['archetype', 'string', 'Archetype id ("other" = no rule matched).'],
      ['teams_matching', 'integer', 'Teams matching the archetype in any position (a team can match several).'],
      ['teams_primary', 'integer', 'Teams whose primary (first-matching) archetype it is.'],
      ['week_teams', 'integer', 'Full team lists in this regulation, week and split.'],
    ],
  },
  'agg_archetype_matchups.csv': {
    desc: 'Archetype-vs-archetype results by regulation and split, from matches between two full lists. Every match is counted '
      + 'from both sides, so a mirror (archetype = opponent_archetype) counts twice and its wins equal its losses.',
    columns: [
      ['regulation', 'string', 'Regulation set.'], ['split', 'string', 'explore | confirm.'],
      ['counting', 'string', 'primary = each team counts under its primary archetype only; all = under every archetype it matches (one match counts once per pair).'],
      ['archetype', 'string', 'Archetype of the side counted.'], ['opponent_archetype', 'string', 'Archetype of the opponent.'],
      ['matches', 'integer', 'Matches.'], ['wins', 'integer', 'Matches the archetype side won.'], ['losses', 'integer', 'Matches it lost.'],
      ['no_winner', 'integer', 'Ties and matches with no result.'],
    ],
  },
};

const mondayOf = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day));
  return d.toISOString().slice(0, 10);
};
const sortedRows = (map, keys) => [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => ({ ...Object.fromEntries(keys.map((name, i) => [name, k.split('\u0000')[i]])), ...v }));

/** Aggregated tables only (no teams, matches or pids). splitOf(event_id) -> 'explore' | 'confirm'. Deterministic. */
export function buildAggregates(regs, dex, splitOf) {
  const species = new Map();
  const arch = new Map();
  const week = new Map();
  const mu = new Map();
  const K = (...p) => p.join('\u0000');
  const bump = (m, k, f) => { const v = m.get(k) || {}; f(v); m.set(k, v); };
  for (const { reg, teams: file } of regs) {
    const { teams, matches } = decode(file, dex);
    for (const tm of teams) {
      const w = mondayOf(tm.date);
      const sp = splitOf(tm.ev.id);
      week.set(K(reg, w, sp), (week.get(K(reg, w, sp)) || 0) + 1);
      for (const f of new Set(tm.keys)) bump(species, K(reg, w, sp, f), (v) => { v.teams = (v.teams || 0) + 1; });
      tm.arch.forEach((id, i) => bump(arch, K(reg, w, sp, id), (v) => {
        v.teams_matching = (v.teams_matching || 0) + 1;
        v.teams_primary = (v.teams_primary || 0) + (i === 0 ? 1 : 0);
      }));
    }
    for (const m of matches) {
      const A = teams[m.a];
      const B = teams[m.b];
      if (!A || !B) continue;
      const sp = splitOf(A.ev.id);
      for (const counting of ['all', 'primary']) {
        const ids = (t) => (counting === 'all' ? t.arch : t.arch.slice(0, 1));
        for (const a of ids(A)) {
          for (const b of ids(B)) {
            for (const [x, y, win, loss] of [[a, b, m.result === 1, m.result === 2], [b, a, m.result === 2, m.result === 1]]) {
              bump(mu, K(reg, sp, counting, x, y), (v) => {
                v.matches = (v.matches || 0) + 1;
                v.wins = (v.wins || 0) + (win ? 1 : 0);
                v.losses = (v.losses || 0) + (loss ? 1 : 0);
                v.no_winner = (v.no_winner || 0) + (!win && !loss ? 1 : 0);
              });
            }
          }
        }
      }
    }
  }
  const withWeek = (rows) => rows.map((r) => ({ ...r, week_teams: week.get(K(r.regulation, r.week, r.split)) }));
  const t = Object.fromEntries(Object.keys(AGG_TABLES).map((n) => [n, table(AGG_TABLES, n)]));
  for (const r of withWeek(sortedRows(species, ['regulation', 'week', 'split', 'form']))) t['agg_usage_species.csv'].add(r);
  for (const r of withWeek(sortedRows(arch, ['regulation', 'week', 'split', 'archetype']))) t['agg_usage_archetype.csv'].add(r);
  for (const r of sortedRows(mu, ['regulation', 'split', 'counting', 'archetype', 'opponent_archetype'])) t['agg_archetype_matchups.csv'].add(r);
  return Object.fromEntries(Object.entries(t).map(([n, x]) => [n, x.text()]));
}

/** events.csv only (the aggregates release keeps the event list for context and the split). */
const eventsOnly = (regs, dex) => buildExport(regs, dex)['events.csv'];

/** The tables a release of `content` ships, for the codebook. */
export function releaseTables({ country = DEFAULT_COUNTRY_POLICY, content = 'rows', split = false } = {}) {
  const base = content === 'aggregates' ? { 'events.csv': TABLES['events.csv'], ...AGG_TABLES } : tablesFor(country);
  return split ? { ...base, ...SPLIT_TABLE } : base;
}

/** CODEBOOK.md, generated from the table schemas and the archetype rule set (so it can't drift from the CSVs). */
export function codebook({ release = null, regs = [], country = DEFAULT_COUNTRY_POLICY, content = 'rows', split = null, onlineShare = null } = {}) {
  const tables = releaseTables({ country, content, split: !!split });
  const out = [];
  out.push('# MetaLens VGC research data: codebook', '');
  out.push("Compiled by Vincent Wesley (Vin's Atelier) for MetaLens VGC (metalensvgc.pages.dev).");
  if (release) out.push(`Release ${release}.`);
  if (regs.length) out.push(`Regulations: ${regs.join(', ')}.`);
  out.push(`Content: ${content === 'aggregates' ? 'aggregated tables only (no row-level teams, matches or player ids)' : 'row-level tables'}.`);
  out.push('', '## Paper', '', `${PAPER.author} (${PAPER.affiliation}), "${PAPER.title}", ${PAPER.status}.`, '',
    '## Source, attribution and licence', '', ATTRIBUTION,
    ...SOURCES.map((s) => `- ${s.name}: ${s.url}`), '', `Licence: ${LICENCE}.`, '');
  out.push('## Scope and caveats', '',
    '- Not included: Pokémon Champions Battle Data (championsbattledata.com) in-game ranked data, whose API terms forbid redistribution, and Smogon ladder statistics.',
    ...(onlineShare != null ? limitations(onlineShare).map((l) => `- ${l}`) : []),
    '- Archetype labels are computed from the full lists with the rule set below; they are not part of the source data.',
    ...(content === 'rows' ? ['- Ids ending in a row number (team_id, match_id, roster_id) are stable within one release only; join across releases on event_id + pid.'] : []),
    '- Text is exactly as published (UTF-8, RFC 4180 quoting). A cell starting with = + - or @ is left as is: import as text, not into a spreadsheet that evaluates formulas.',
    '', ...(content === 'rows' ? countrySection(country) : ['## Country policy', '', 'No country or region in an aggregates release.', '']));
  if (split) {
    out.push('## Confirmation split', '', SPLIT_METHOD, '', `Seed: \`${split.seed}\`. confirmation_split.csv SHA-256: \`${split.sha256}\`.`, '',
      '| regulation | events | explore | confirm |', '|---|---|---|---|');
    for (const [reg, c] of Object.entries(split.counts)) out.push(`| ${reg} | ${c.events} | ${c.explore} | ${c.confirm} |`);
    out.push('');
  }
  for (const [name, t] of Object.entries(tables)) {
    out.push(`## ${name}`, '', t.desc, '', '| column | type | description |', '|---|---|---|');
    for (const [c, type, d] of t.columns) out.push(`| \`${c}\` | ${type} | ${d.replace(/\|/g, '\\|')} |`);
    out.push('');
  }
  out.push(`## Archetype rule set ${ARCHETYPE_RULESET.version} (fingerprint ${ARCHETYPE_RULESET.fingerprint})`, '',
    'Rules are tested in this order; `primary` is the first match.', '', '| id | label | rule | label source |', '|---|---|---|---|');
  for (const a of ARCHETYPES) {
    const src = typeof a.source === 'string' ? a.source
      : a.source.map((s) => `${s.publisher}, "${s.title}" (${s.date}), ${s.url}, accessed ${s.accessed}: "${s.quote}"`).join('; ');
    out.push(`| ${a.id} | ${a.label} | ${a.desc.replace(/\|/g, '\\|')} | ${src.replace(/\|/g, '\\|')} |`);
  }
  out.push('', 'Rule set history:', '');
  for (const c of ARCHETYPE_RULESET.changes) out.push(`- ${c.version} (${c.date}, commit ${c.commit}): ${c.note}`);
  out.push('');
  return out.join('\n');
}

/**
 * Reads the committed files for `regs` from dataDir and writes the tables + CODEBOOK.md into outDir.
 * opts: release (version label), country (policy), content 'rows' | 'aggregates', splitSeed (writes confirmation_split.csv;
 * required for aggregates, which carry the split as a column).
 * Returns { files, country: countryStats, split: { seed, method, file, sha256, counts } | null, onlineShare }.
 */
export async function writeExport(dataDir, outDir, regs, { release = null, country = DEFAULT_COUNTRY_POLICY, content = 'rows', splitSeed = null } = {}) {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  if (!['rows', 'aggregates'].includes(content)) throw new Error(`content must be rows or aggregates (got "${content}")`);
  if (content === 'aggregates' && !splitSeed) throw new Error('an aggregates export needs a split seed');
  const read = async (f) => JSON.parse(await readFile(path.join(dataDir, f), 'utf8'));
  const readIf = (f) => read(f).catch(() => null);
  const dex = await read('dex.json');
  const input = [];
  for (const reg of regs) input.push({ reg, teams: await read(`teams-${reg}.json`), rosters: await readIf(`rosters-${reg}.json`) });
  await mkdir(outDir, { recursive: true });
  const all = input.flatMap(({ teams }) => teams.teams);
  const online = input.reduce((n, { teams }) => n + teams.teams.filter((r) => teams.events[r[0]]?.tier === 'online').length, 0);
  const onlineShare = all.length ? online / all.length : 0;
  const files = {};
  let split = null;
  let splitOf = null;
  if (splitSeed) {
    const { rows, counts } = confirmationSplit(input.map(({ reg, teams }) => ({ reg, ids: teams.events.map((e) => e.id) })), splitSeed);
    const st = table(SPLIT_TABLE, 'confirmation_split.csv');
    rows.forEach((r) => st.add(r));
    const text = st.text();
    files['confirmation_split.csv'] = text;
    split = { seed: splitSeed, method: SPLIT_METHOD, file: 'confirmation_split.csv', sha256: sha(text), counts };
    const byEvent = new Map(rows.map((r) => [r.event_id, r.split]));
    splitOf = (id) => byEvent.get(id);
  }
  let countryStats = { policy: country };
  if (content === 'aggregates') {
    Object.assign(files, { 'events.csv': eventsOnly(input, dex) }, buildAggregates(input, dex, splitOf));
    countryStats = { policy: 'drop' };
  } else {
    const csv = buildExport(input, dex, { country });
    Object.assign(files, csv);
    countryStats = csv.countryStats;
  }
  files['CODEBOOK.md'] = codebook({ release, regs, country: countryStats.policy, content, split, onlineShare });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(outDir, name), text);
  return { files: Object.keys(files), country: countryStats, split, onlineShare };
}
