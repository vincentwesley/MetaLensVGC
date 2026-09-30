// Pure, browser-safe species/name normalization. No DOM, no fetch, no Node-only imports.
// Used by the data pipeline (Node) and the browser shell.

/** Showdown-style id: lowercase, strip everything but a-z0-9. */
// Search-box matcher: null for an empty box, else key => does the key contain the query (punctuation-insensitive).
// A query with characters but no letters/digits ("-", "é") matches nothing, never everything.
export function nameMatcher(raw) {
  if (raw == null || !String(raw).trim()) return null;
  const q = toID(raw);
  return (key) => !!q && toID(key).includes(q);
}

export function toID(s) {
  if (s == null) return '';
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Small dictionary for names whose canonical display form needs punctuation
// that hyphen/space title-casing can't reconstruct (apostrophes, periods, colon).
const PUNCTUATION_EXCEPTIONS = {
  mrmime: 'Mr. Mime',
  mrrime: 'Mr. Rime',
  mimejr: 'Mime Jr.',
  farfetchd: "Farfetch'd",
  sirfetchd: "Sirfetch'd",
  typenull: 'Type: Null',
  jangmoo: 'Jangmo-o',
  hakamoo: 'Hakamo-o',
  kommoo: 'Kommo-o',
  hooh: 'Ho-Oh',
  porygonz: 'Porygon-Z',
  nidoranm: 'Nidoran-M',
  nidoranf: 'Nidoran-F',
};

const REGIONAL_SUFFIX = {
  alolan: 'Alola',
  galarian: 'Galar',
  hisuian: 'Hisui',
  paldean: 'Paldea',
};

const ROTOM_APPLIANCES = new Set(['heat', 'wash', 'frost', 'fan', 'mow']);

// Rewrites English "prefix-style" display names into Showdown's suffix-hyphen form,
// e.g. "Alolan Raichu" -> "Raichu-Alola", "Wash Rotom" -> "Rotom-Wash".
function toCanonicalHyphenForm(raw) {
  let s = raw.trim();

  const regional = /^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i.exec(s);
  if (regional) {
    const suffix = REGIONAL_SUFFIX[regional[1].toLowerCase()];
    return `${regional[2]}-${suffix}`;
  }

  const rotom = /^(Heat|Wash|Frost|Fan|Mow)\s+Rotom$/i.exec(s);
  if (rotom && ROTOM_APPLIANCES.has(rotom[1].toLowerCase())) {
    return `Rotom-${rotom[1]}`;
  }

  if (/^Eternal\s+Flower\s+Floette$/i.test(s)) return 'Floette-Eternal';

  // "-female"/"-male" (Limitless decklist ids use "basculegion-female") -> "-F"/"-M"
  s = s.replace(/-female$/i, '-F').replace(/-male$/i, '-M');

  return s;
}

// Title-cases each hyphen/space-separated token; single-letter tokens (F, M, X, Y, Z)
// are kept uppercase. Idempotent on already-correct Showdown names.
function properCase(s) {
  return s.replace(/[^-\s]+/g, (word) => {
    if (word.length === 1) return word.toUpperCase();
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  });
}

const idIndexCache = new WeakMap();
function speciesIdIndex(dex) {
  const table = dex && dex.species;
  if (!table) return null;
  let idx = idIndexCache.get(table);
  if (!idx) {
    idx = new Map();
    for (const name in table) {
      const entry = table[name];
      idx.set((entry && entry.id) || toID(name), name);
    }
    idIndexCache.set(table, idx);
  }
  return idx;
}

/**
 * Normalize any raw species string (Limitless hyphen-id, English prefix-style display
 * name, or Smogon name) to the Showdown display name. When `dex` (an object with a
 * `species` map keyed by display name, each entry carrying its own `id`) is given,
 * resolution goes through it so the result matches exactly what's in the dex.
 */
export function normalizeSpecies(raw, dex) {
  if (raw == null) return '';
  const canonical = toCanonicalHyphenForm(String(raw));
  const id = toID(canonical);

  const idx = speciesIdIndex(dex);
  if (idx && idx.has(id)) return idx.get(id);

  if (PUNCTUATION_EXCEPTIONS[id]) return PUNCTUATION_EXCEPTIONS[id];

  return properCase(canonical);
}

/**
 * Returns the Mega form name if `item` is that species' own Mega Stone, else null.
 * `dex.items[item]` is expected to carry `{ mega, megaOf }` (single-species stones)
 * and/or `{ megaMap }` (stones shared by multiple forms, e.g. Meowsticite).
 */
export function megaKey(species, item, dex) {
  if (!dex || !dex.items || !item) return null;
  const entry = dex.items[item];
  if (!entry) return null;
  if (entry.megaMap) return entry.megaMap[species] || null;
  if (entry.megaOf && entry.megaOf === species) return entry.mega || null;
  return null;
}

const displayIndexCache = new WeakMap();
const DISPLAY_SPECIAL = { nothing: 'No item', noability: 'No ability' };
/**
 * Display name for a Showdown id (items, moves, abilities), e.g. "lifeorb" -> "Life Orb".
 * Smogon ladder stats key their item/ability/move tables by id; this resolves them
 * through the names already in `dex` (items, moves, every species' abilities).
 * Unknown ids come back unchanged; already-display names pass through.
 */
export function displayName(id, dex) {
  if (id == null || id === '') return id;
  if (DISPLAY_SPECIAL[id]) return DISPLAY_SPECIAL[id];
  if (!dex) return id;
  let idx = displayIndexCache.get(dex);
  if (!idx) {
    idx = new Map();
    for (const name in dex.items || {}) idx.set(toID(name), name);
    for (const name in dex.moves || {}) idx.set(toID(name), name);
    for (const sp of Object.values(dex.species || {})) for (const a of sp.abilities || []) idx.set(toID(a), a);
    displayIndexCache.set(dex, idx);
  }
  return idx.get(toID(id)) || id;
}

// Placeholder "items" some team sheets carry instead of leaving the slot empty.
const NO_ITEM_IDS = new Set(['', 'none', 'noitem', 'nothing', 'helditem', 'item']);
/**
 * Canonical display name for a held item, move or ability from a hand-typed team
 * sheet: fixes case/punctuation ("focus sash", "U-Turn", "King’s Shield") through
 * `dex`, maps placeholders ("None", "No Item", "Held Item:", "-") to null, and
 * leaves unknown spellings as typed (trimmed).
 */
export function normalizeTerm(raw, dex, kind = 'item') {
  if (raw == null) return null;
  const s = String(raw).trim();
  const id = toID(s);
  if (id === '' || (kind === 'item' && NO_ITEM_IDS.has(id))) return null;
  return displayName(s, dex);
}
