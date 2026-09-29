import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveSeasonMeta, transformRows, parseRankingTable } from '../scripts/sources/ranked.js';
import { REG_IDS } from '../scripts/lib/regs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ranked-sample.json'), 'utf8'));

test('deriveSeasonMeta: maps every in-game season to exactly one regulation, matching the known M1-M6 -> M-A/M-B/M-C layout', () => {
  const seasons = deriveSeasonMeta(fixture.dailyDataFolders);
  const byReg = {};
  for (const { season, reg } of seasons) (byReg[reg] ||= []).push(season);
  for (const reg of REG_IDS) assert.ok(byReg[reg], `expected some season in ${reg}`);

  assert.deepEqual(byReg['M-A'].sort(), ['M1', 'M2']);
  assert.deepEqual(byReg['M-B'].sort(), ['M3', 'M4', 'M5']);
  assert.deepEqual(byReg['M-C'].sort(), ['M6']);

  const m6 = seasons.find((s) => s.season === 'M6');
  assert.equal(m6.snapshot, '2026-09-29'); // latest of the 19 M6 daily folders
  const m4 = seasons.find((s) => s.season === 'M4');
  assert.equal(m4.snapshot, '2026-08-05'); // finished season: its one listed (final) day
});

test('deriveSeasonMeta: throws if a snapshot date falls outside every regulation window', () => {
  assert.throws(() => deriveSeasonMeta(['M0/01_01_2020']));
});

function close(a, b) {
  return Math.abs(a - b) < 1e-9;
}

test('transformRows: splits categories into the mon shape, converts percentage_value to a 0-1 fraction', () => {
  const mon = transformRows(fixture.battle.rows, null);
  assert.ok(close(mon.moves['Grassy Glide'], 0.974));
  assert.ok(close(mon.items['Miracle Seed'], 0.576));
  assert.ok(close(mon.abilities['Grassy Surge'], 0.999));
  assert.ok(close(mon.natures['Adamant'], 0.849));
  assert.ok(close(mon.spreads['32/32/0/0/0/2'], 0.114));
  assert.equal(mon.teammates[0], 'Incineroar');
  assert.equal(mon.teammates.length, 10);
  // teammate rows carry no percentage in this API (ranks only)
  assert.ok(Object.values(mon.moves).every((v) => v > 0 && v <= 1));
});

test('transformRows: orders spreads and teammates by rank, not row order', () => {
  const shuffled = [...fixture.battle.rows].reverse();
  const mon = transformRows(shuffled, null);
  assert.equal(mon.teammates[0], 'Incineroar');
  assert.equal(Object.keys(mon.spreads)[0], '32/32/0/0/0/2');
});

test('parseRankingTable: extracts rank-ordered names from the static SEO table', () => {
  const html = `<h2>Doubles usage ranking</h2><table class="data-table"><tbody>
    <tr><td data-label="Rank">1</td><td data-label="Pokemon"><a href="/pokemon/rillaboom/">Rillaboom</a></td></tr>
    <tr><td data-label="Rank">2</td><td data-label="Pokemon"><a href="/pokemon/sneasler/">Sneasler</a></td></tr>
  </tbody></table>`;
  assert.deepEqual(parseRankingTable(html), ['Rillaboom', 'Sneasler']);
});

test('parseRankingTable: returns null when the table is missing (e.g. page layout changed)', () => {
  assert.equal(parseRankingTable('<html><body>nothing here</body></html>'), null);
});

test('renormalizeRanked re-keys species through the dex spelling', async () => {
  const { renormalizeRanked } = await import('../scripts/sources/ranked.js');
  const dex = { species: { 'Farfetch’d': { id: 'farfetchd' }, Rillaboom: { id: 'rillaboom' } } };
  const file = { seasons: [{ ranking: ["Farfetch'd"], mons: { "Farfetch'd": { teammates: ['Rillaboom'] } } }] };
  renormalizeRanked(file, dex);
  assert.deepEqual(file.seasons[0].ranking, ['Farfetch’d']);
  assert.ok(file.seasons[0].mons['Farfetch’d']);
});
