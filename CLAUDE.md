# VGC MetaScope — project conventions

Static metagame dashboard for Pokémon Champions (VGC 2026, regulations M-A / M-B / M-C).
Cloudflare Pages serves `public/` as-is: no framework, no bundler, plain ES modules.

## Hard rules
- **Real data only.** Every number comes from `public/data/*.json`, which `npm run data` builds from fetched sources.
  Never hardcode, invent or "calibrate" stats. If a widget lacks data for the current filters, show "Insufficient data".
- Every view shows its source, sample size (n teams / n battles) and last-updated date.
- Champions mechanics: no Tera (Mega Evolution instead); no EVs/IVs, **Stat Points** instead:
  66 SP total, max 32 per stat. Lv50: `HP = base + 75 + sp`, other = `floor((base + 20 + sp) * nature)`.
  Always use `js/lib/stats.js`, never re-derive stat math elsewhere.
- Usage is counted per display key `Mon.k` (Mega forms separate: `Charizard-Mega-Y`, `Floette-Mega`).
- Name forms stay distinct (`Floette-Eternal` vs `Floette-Mega`, `Basculegion` vs `Basculegion-F`, `Indeedee` vs `Indeedee-F`). Normalize only through `js/lib/names.js`.

## Layout
```
scripts/            Node data pipeline (npm run data). Raw HTTP cache in data-raw/ (gitignored).
public/             The whole site (Pages output dir). Committed generated data in public/data/.
public/data/SCHEMA.md   Data contract. Read it before touching data or aggregation.
public/js/lib/      PURE modules (no DOM, no fetch). Shared by browser, pipeline and tests.
public/js/          Browser shell: main.js, state.js, data.js, ui/*.js
public/js/sections/ One module per dashboard section.
public/css/         app.css (tokens + layout), skins in the same file via [data-skin] / [data-theme].
public/vendor/      Vendored ECharts 5 (from npm). Don't load anything from CDNs except sprites and Google Fonts.
test/               node:test unit tests (npm test). e2e/ Playwright checks (npm run e2e) and screenshots (npm run shot).
```

## Module contracts

### Pure libs (`public/js/lib/`, ESM, importable from Node)
- `stats.js`: `NATURES` (name → `{plus, minus}` stat keys), `natureMult(nature, statIdx)`, `calcStat(base, sp, statIdx, nature)` (statIdx 0 = HP), `calcStats(bs, sp[6], nature) → number[6]`, `parseSP("0/32/0/0/2/32") → number[6]`, `wilson(k, n, z=1.96) → [lo, hi]`, `effectiveSpecies(counts[]) → exp(Shannon entropy)`.
- `types.js`: `TYPES` (18 names), `TYPE_COLORS`, `effectiveness(atkType, defTypes[]) → multiplier`.
- `names.js`: `toID(s)`, `normalizeSpecies(raw, dex?) → Showdown display name`, `megaKey(species, item, dex) → mega form | null`.
- `archetypes.js`: `ARCHETYPES` (ordered array of `{id, label, desc, test(team, dex)}`), `classify(team, dex) → string[]` (matching ids, priority order; `["other"]` if none).
- `aggregate.js`: `decode(file, dex) → {teams, events, matches}` plus all aggregations (usage, win rate with Wilson CI, co-usage/lift, cores, items/moves/sets/spreads per species, type landscape, archetype split and matchup matrix, weekly series). Every function takes an array of `Team` and returns plain data.
  Filtering: `filterTeams(teams, filters, chips, dex)` where `filters` is the state below and `chips` is `Chip[]`.
- `paste.js`: `toPaste(team, dex) → Showdown text` (Showdown's Champions formats store SP in the `EVs:` line, e.g. `EVs: 32 Atk / 2 SpD / 32 Spe`), `parsePaste(text, dex) → Mon[]` (accepts `EVs:` and `SPs:` lines; a value above 32 means a classic EV spread, which is dropped as `sp: null`).
- `state-core.js`: `DEFAULT_STATE`, `toHash(state) → string`, `fromHash(hash, defaults) → state`.

### State (`public/js/state.js`)
```js
state = {
  reg: "M-C", source: "tournaments" | "ladder" | "ranked",
  tiers: ["worlds","international","regional","online"],   // enabled tiers
  place: "all" | "topcut" | "top8" | "winner",
  from: "" | "YYYY-MM-DD", to: "" | "YYYY-MM-DD", minN: 20,
  chips: [ { kind: "species"|"type"|"archetype"|"item"|"move"|"mega"|"core"|"team", value: string | string[], neg: false } ],
  skin: "retro" | "pro", theme: "auto" | "light" | "dark", anim: false,
}
store.get(), store.set(patch), store.addChip(chip), store.removeChip(i), store.clearChips(), store.subscribe(fn)
```
All state round-trips through `location.hash` (`state-core.js`). Setting state re-renders every section.

### Sections (`public/js/sections/*.js`)
```js
export default {
  id: "usage", title: "Usage leaderboard",
  mount(el, ctx) { /* build DOM once */ return { update(view) {}, highlight(key) {} }; }
}
```
`view` is computed once per state change in `main.js`:
`{ state, reg, manifest, dex, teams /*bar filters + chips*/, base /*bar filters, no chips*/, prev /*previous period*/, matches, ladder /*ladder-<reg>.json*/, ranked /*ranked-<reg>.json*/ }`.
`ctx` gives `{ store, dex, echarts, sprite(key, opts) → HTMLImageElement, spriteUrl(key), openDrawer(key), chip(kind, value, event) /* shift/alt = neg */, hover(key|null), meta(el, {source, n, unit}) /* source/sample/updated line */, cssVar(name), fmt }`.
Sections never fetch and never mutate state except through `ctx.chip` / `store`.

## Commands
- `npm run data`: full pipeline (incremental: completed tournaments already in public/data are reused).
- `npm test`: unit tests. `npm run serve`: static server on :8080. `npm run e2e`: Playwright checks. `npm run shot`: screenshots.

## Style
Plain modern JS, no TypeScript, no frameworks, no new runtime deps. Small modules. CSS custom properties for all colours;
type colours from `TYPE_COLORS`. Sprites: `image-rendering: pixelated`; fallback exact form → base species → type-coloured placeholder.

## Project status (handover, 2026-09-29)
- Every GOAL_PROMPT.md "Definition of done" item is met on branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`: data for M-A/M-B/M-C committed, `npm test` (84) and `npm run e2e` (9 checks + screenshots) green, screenshots reviewed in both skins, README complete (decisions, coverage, Cloudflare steps). No PR has been opened; don't open one unless asked.
- Data sources: Limitless online + limitlessvgc.com official (tournament teams), Smogon 1760 ladder, and the in-game ranked "Battle Data" via championsbattledata.com (`ranked-<REG>.json`). The last one **requires attribution** ("Battle data provided by Pokémon Champions Battle Data" + link, already in the footer, methodology and README) and forbids redistributing the data as a data service. It publishes ranks, not usage shares: never show a usage % from it.
- Owner decisions: ungendered official "Indeedee" counts as `Indeedee-F`. Commit and push to this branch in logical steps. Orchestrate: `haiku` for fetch/validate/test runs, `sonnet` for coding. If a model keeps failing with 529/429, switch model instead of retrying.
- Where things stand: the in-game ranked data does not exist per team, so team-level sections show an explicit "not available" state under that source. Smogon M-C (September) stats are expected in early October and the weekly Action picks them up automatically.

### Working in a cloud session
- The SessionStart hook runs `npm ci && npm test`. Playwright needs a browser first: `npx playwright install --with-deps chromium`.
- `npm run data` needs outbound access to play.limitlesstcg.com, limitlessvgc.com, standings.limitlessvgc.com, smogon.com, championsbattledata.com and play.pokemonshowdown.com. The raw cache (`data-raw/`) is gitignored, so it starts empty. It still runs incrementally from the committed `public/data` (completed tournaments and finished ranked seasons are reused), so a refresh is minutes, not hours. The weekly GitHub Action does this anyway, so only run it if you need fresh data now.
- Visual review: `npm run serve`, then `node scripts/slice-shots.mjs "<hash>" <prefix> [width]` writes viewport-sized slices into `screenshots/tmp/` (gitignored). The committed full-page shots come from `npm run shot`.
