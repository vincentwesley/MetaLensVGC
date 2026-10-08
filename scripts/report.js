// Prints the acceptance-test report: teams per regulation x tier, events per reg,
// SP/nature coverage, species count, matches count, top-12 usage vs the reference
// anchors. Read-only; does not write any files.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { VGC_IDS as REG_IDS } from './lib/regs.js';
import { megaKey } from '../public/js/lib/names.js';

const ANCHORS = {
  'M-A': [
    ['Basculegion', 51.5],
    ['Kingambit', 40.7],
    ['Garchomp', 40.5],
    ['Floette-Mega', 23.9],
    ['Sinistcha', 20.4],
    ['Whimsicott', 17.7],
  ],
  'M-C': [
    ['Rillaboom', 37.6],
    ['Sneasler', 36.6],
    ['Incineroar', 28.5],
    ['Salamence(-Mega)', 26],
    ['Kingambit', 25],
    ['Basculegion', 23.8],
    ['Golisopod(-Mega)', 21.7],
    ['Indeedee-F', 21.6],
  ],
};

async function readJSON(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function decodeMons(strings, monsRows, dex) {
  const str = (i) => (i == null || i < 0 ? null : strings[i]);
  return monsRows.map(([species, item, ability, moves, nature, sp]) => {
    const speciesName = str(species);
    const itemName = str(item);
    const mega = megaKey(speciesName, itemName, dex);
    return { species: speciesName, item: itemName, key: mega || speciesName, nature: str(nature), sp };
  });
}

export async function printReport(dataDir) {
  const dex = await readJSON(path.join(dataDir, 'dex.json'));
  const lines = [];
  const out = (s) => lines.push(s);

  for (const reg of REG_IDS) {
    const file = await readJSON(path.join(dataDir, `teams-${reg}.json`));
    if (!file) {
      out(`${reg}: no teams-${reg}.json`);
      continue;
    }
    const { strings, events, teams, matches } = file;
    out(`\n=== ${reg} ===`);
    out(`events: ${events.length}, teams: ${teams.length}, matches: ${matches.length}`);

    const byTier = {};
    teams.forEach((row) => {
      const tier = events[row[0]].tier;
      byTier[tier] = (byTier[tier] || 0) + 1;
    });
    out(`teams by tier: ${JSON.stringify(byTier)}`);

    let teamsWithSP = 0;
    let monsTotal = 0;
    let monsWithNature = 0;
    const usage = new Map();
    const speciesSet = new Set();
    teams.forEach((row) => {
      const mons = decodeMons(strings, row[7], dex);
      if (mons.some((m) => typeof m.sp === 'string')) teamsWithSP++;
      for (const m of mons) {
        monsTotal++;
        if (m.nature) monsWithNature++;
        speciesSet.add(m.key);
        usage.set(m.key, (usage.get(m.key) || 0) + 1);
      }
    });
    const n = teams.length || 1;
    out(`SP spread coverage: ${((teamsWithSP / n) * 100).toFixed(1)}% of teams`);
    out(`known-nature coverage: ${((monsWithNature / (monsTotal || 1)) * 100).toFixed(1)}% of mons`);
    out(`distinct display keys (species incl. Mega forms): ${speciesSet.size}`);

    const top12 = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    out('top 12 usage:');
    for (const [key, count] of top12) out(`  ${key}: ${((count / n) * 100).toFixed(1)}% (n=${count})`);

    const basculegionCombined = (usage.get('Basculegion') || 0) + (usage.get('Basculegion-F') || 0);
    out(`Basculegion + Basculegion-F combined: ${((basculegionCombined / n) * 100).toFixed(1)}%`);

    if (ANCHORS[reg]) {
      out('vs anchors (reference only):');
      for (const [name, anchorPct] of ANCHORS[reg]) {
        const base = name.replace('(-Mega)', '');
        // "(-Mega)" anchors count either form combined (the base species holding
        // its own mega stone shows up under the "-Mega" display key, see names.js).
        const count = name.includes('(-Mega)') ? (usage.get(base) || 0) + (usage.get(`${base}-Mega`) || 0) : usage.get(base) || 0;
        const ours = (count / n) * 100;
        out(`  ${name}: anchor ${anchorPct}%  vs  ours ${ours.toFixed(1)}%`);
      }
    }
  }

  const report = lines.join('\n');
  console.log(report);
  return report;
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  await printReport(path.join(process.cwd(), 'public', 'data'));
}
