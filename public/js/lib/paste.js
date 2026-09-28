// Showdown import/export text <-> decoded Mon.
// Mon = { s, k, item, ability, moves, nature, sp, mega } (see aggregate.js#decode).

const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const STAT_INDEX = { HP: 0, Atk: 1, Def: 2, SpA: 3, SpD: 4, Spe: 5 };

function keyOf(species, item, dex) {
  const it = item && dex.items ? dex.items[item] : null;
  if (it && it.megaOf === species) return it.mega;
  return species;
}

export function toPaste(team, dex) {
  return team.mons.map((m) => monToPaste(m, dex)).join('\n\n');
}

function monToPaste(m) {
  const lines = [m.item ? `${m.s} @ ${m.item}` : m.s];
  if (m.ability) lines.push(`Ability: ${m.ability}`);
  lines.push('Level: 50');
  if (m.sp) {
    const parts = m.sp
      .map((v, i) => (v > 0 ? `${v} ${STAT_LABELS[i]}` : null))
      .filter(Boolean);
    if (parts.length) lines.push(`EVs: ${parts.join(' / ')}`);
  }
  if (m.nature) lines.push(`${m.nature} Nature`);
  for (const mv of m.moves) lines.push(`- ${mv}`);
  return lines.join('\n');
}

function parseHeader(line) {
  const at = line.indexOf(' @ ');
  const left = (at === -1 ? line : line.slice(0, at)).trim();
  const item = at === -1 ? null : line.slice(at + 3).trim();
  const parens = [...left.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const nonGender = parens.filter((p) => p !== 'M' && p !== 'F');
  const species = nonGender.length ? nonGender[0].trim() : left.replace(/\([MF]\)/g, '').trim();
  return { species, item };
}

function parseStatLine(rest) {
  const sp = [0, 0, 0, 0, 0, 0];
  let overflow = false;
  for (const chunk of rest.split('/')) {
    const m = chunk.trim().match(/^(\d+)\s+(\w+)$/);
    if (!m) continue;
    const val = Number(m[1]);
    const idx = STAT_INDEX[m[2]];
    if (idx == null) continue;
    if (val > 32) overflow = true;
    sp[idx] = val;
  }
  return overflow ? null : sp;
}

function parseMonBlock(block, dex) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const { species, item } = parseHeader(lines[0]);
  let ability = null;
  let nature = null;
  let sp = null;
  const moves = [];
  for (const line of lines.slice(1)) {
    if (/^Ability:/i.test(line)) ability = line.replace(/^Ability:/i, '').trim();
    else if (/^(EVs|SPs):/i.test(line)) sp = parseStatLine(line.replace(/^(EVs|SPs):/i, ''));
    else if (/^Level:/i.test(line) || /^IVs:/i.test(line) || /^Tera Type:/i.test(line) || /^Shiny:/i.test(line)) {
      // ignored
    } else if (/\sNature$/i.test(line)) nature = line.replace(/\s*Nature$/i, '').trim();
    else if (line.startsWith('-')) moves.push(line.replace(/^-\s*/, '').trim());
  }
  const k = keyOf(species, item, dex);
  return { s: species, k, item, ability, moves, nature, sp, mega: k !== species };
}

export function parsePaste(text, dex) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => parseMonBlock(block, dex));
}
