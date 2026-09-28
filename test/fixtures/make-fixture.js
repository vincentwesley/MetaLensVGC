// One-off script: builds test/fixtures/teams-sample.json and dex-sample.json
// from real recon payloads (data-raw/recon/limitless/04-standings-big.json +
// 05-pairings-big.json), using the installed pokemon-showdown package for
// species/moves/items canonical data. Run: node test/fixtures/make-fixture.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Dex } = require('pokemon-showdown');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const standings = JSON.parse(readFileSync(join(root, 'data-raw/recon/limitless/04-standings-big.json'), 'utf8'));
const pairings = JSON.parse(readFileSync(join(root, 'data-raw/recon/limitless/05-pairings-big.json'), 'utf8'));

const players = standings.filter((p) => Array.isArray(p.decklist) && p.decklist.length > 0);

// --- string interning for teams-sample.json ---
const strings = [];
const strIdx = new Map();
function intern(s) {
  if (s == null || s === '') return -1;
  if (strIdx.has(s)) return strIdx.get(s);
  const i = strings.length;
  strings.push(s);
  strIdx.set(s, i);
  return i;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// --- dex-sample.json accumulation ---
const dexSpecies = {};
const dexItems = {};
const dexMoves = {};

function addSpecies(name) {
  if (dexSpecies[name]) return;
  const sp = Dex.species.get(name);
  if (!sp.exists) return;
  dexSpecies[name] = {
    id: sp.id,
    num: sp.num,
    types: sp.types,
    bs: [sp.baseStats.hp, sp.baseStats.atk, sp.baseStats.def, sp.baseStats.spa, sp.baseStats.spd, sp.baseStats.spe],
    abilities: [...new Set(Object.values(sp.abilities))],
    sprite: sp.spriteid,
    base: sp.baseSpecies,
  };
}

function addItem(name) {
  if (!name || dexItems[name]) return;
  const it = Dex.items.get(name);
  if (!it.exists) { dexItems[name] = {}; return; }
  if (it.megaStone) {
    const megaOf = Object.keys(it.megaStone)[0];
    const mega = it.megaStone[megaOf];
    dexItems[name] = { mega, megaOf };
    addSpecies(mega);
    if (dexSpecies[mega]) {
      dexSpecies[mega].megaOf = megaOf;
      dexSpecies[mega].stone = it.name;
    }
  } else {
    dexItems[name] = {};
  }
}

function addMove(name) {
  if (dexMoves[name]) return;
  const mv = Dex.moves.get(name);
  if (!mv.exists) return;
  dexMoves[name] = { type: mv.type, cat: mv.category, bp: mv.basePower, pri: mv.priority, target: mv.target };
}

// --- event (single tournament, all rows come from it) ---
const maxRound = pairings.reduce((m, p) => Math.max(m, p.round || 0), 0);
const event = {
  id: 'lt:fixture', name: 'Fixture Regional', date: '2026-06-01', tier: 'regional',
  source: 'limitless', url: 'https://play.limitlesstcg.com/tournament/fixture/standings',
  players: players.length, cut: 8, rounds: maxRound,
};

// --- team rows ---
const playerIdx = new Map(); // lowercase player id -> row index
const teams = players.map((p, i) => {
  playerIdx.set(p.player, i);
  const mons = p.decklist.map((m) => {
    const species = Dex.species.get(m.id);
    const speciesName = species.exists ? species.name : cap(m.id);
    addSpecies(speciesName);
    if (m.item) addItem(m.item);
    for (const mv of m.attacks || []) addMove(mv);
    const nature = m.nature ? cap(m.nature) : null;
    return [
      intern(speciesName),
      m.item ? intern(m.item) : -1,
      m.ability ? intern(m.ability) : -1,
      (m.attacks || []).map((mv) => intern(mv)),
      nature ? intern(nature) : -1,
      '0', // no open-team-sheet SP data in this recon payload
    ];
  });
  const rec = p.record || { wins: 0, losses: 0, ties: 0 };
  return [0, p.name, p.country || '', p.placing, rec.wins, rec.losses, rec.ties, mons];
});

// --- matches from pairings (only completed, both sides known) ---
const matches = [];
for (const pr of pairings) {
  if (!pr.player1 || !pr.player2) continue; // bye
  if (pr.winner === -1 || pr.winner == null) continue; // unresolved
  const a = playerIdx.get(pr.player1);
  const b = playerIdx.get(pr.player2);
  if (a == null || b == null) continue;
  const result = pr.winner === pr.player1 ? 1 : pr.winner === pr.player2 ? 2 : 0;
  matches.push([a, b, result]);
}

const teamsFile = {
  reg: 'M-C',
  generated: new Date().toISOString(),
  strings,
  events: [event],
  teams,
  matches,
};

writeFileSync(join(__dirname, 'teams-sample.json'), JSON.stringify(teamsFile));
writeFileSync(join(__dirname, 'dex-sample.json'), JSON.stringify({ species: dexSpecies, items: dexItems, moves: dexMoves }));

console.log('teams:', teams.length, 'matches:', matches.length, 'species:', Object.keys(dexSpecies).length, 'moves:', Object.keys(dexMoves).length, 'items:', Object.keys(dexItems).length);
