// Pure filter + sort for the Pokédex grid. No DOM.
import { nameMatcher } from './names.js';

/** keys: display keys; dex: dex.json; use: Map key -> usage score (higher = more used; absent = no row);
 *  opts: { q: search text, types: [] (species must have all), sort: usage|name|dex|speed }. Returns a new sorted array. */
export function dexList(keys, dex, use, { q = '', types = [], sort = 'usage' } = {}) {
  const match = nameMatcher(q);
  const sp = (k) => dex.species?.[k];
  const out = keys.filter((k) => (!match || match(k)) && types.every((t) => sp(k)?.types?.includes(t)));
  const by = {
    usage: (a, b) => (use.get(b) ?? -Infinity) - (use.get(a) ?? -Infinity),
    dex: (a, b) => (sp(a)?.num ?? 1e9) - (sp(b)?.num ?? 1e9),
    speed: (a, b) => (sp(b)?.bs?.[5] ?? -1) - (sp(a)?.bs?.[5] ?? -1),
  }[sort] || (() => 0);
  return out.sort((a, b) => by(a, b) || a.localeCompare(b));
}
