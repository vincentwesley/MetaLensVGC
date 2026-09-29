# MetaLens VGC — project conventions

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
- `names.js`: `toID(s)`, `normalizeSpecies(raw, dex?) → Showdown display name`, `megaKey(species, item, dex) → mega form | null`,
  `displayName(id, dex)` (Smogon ids like `lifeorb` → `Life Orb`), `normalizeTerm(raw, dex, 'item'|'move'|'ability')` (hand-typed sheet
  spellings → dex names; placeholder items → null). `decode()` and the pipeline both run items/moves/abilities through `normalizeTerm`.
- `archetypes.js`: `ARCHETYPES` (ordered array of `{id, label, desc, test(team, dex)}`), `classify(team, dex) → string[]` (matching ids, priority order; `["other"]` if none).
- `aggregate.js`: `decode(file, dex) → {teams, events, matches}` plus all aggregations (incl. `itemsBySpecies`, `itemUsage`,
  `ladderItemUsage`; pass `dex` as the 4th arg of `ladderMerge` to get display names) (usage, win rate with Wilson CI, co-usage/lift, cores, items/moves/sets/spreads per species, type landscape, archetype split and matchup matrix, weekly series). Every function takes an array of `Team` and returns plain data.
  Filtering: `filterTeams(teams, filters, chips, dex)` where `filters` is the state below and `chips` is `Chip[]`.
  **Chip semantics** (one rule for every chip; see the comment block in aggregate.js):
  Pokémon chips describe ONE Pokémon: species / mega / core (it is one of these keys), type, weak (weak to that attacking
  type), item, move, movetype (knows a move of that type). Positive ones are ANDed into a single slot test ("Rillaboom + Life
  Orb" = a Rillaboom holding Life Orb). Teams are kept when they have every species/core chip's Pokémon and a Pokémon passing
  the slot test; `projectTeams(teams, chips, dex)` keeps only the passing Pokémon for Pokémon-level views
  (`{keys:false}` = attribute chips only, for the deep dive). Negative Pokémon chips drop teams with any matching Pokémon.
  Team chips: archetype (PRIMARY archetype `arch[0]`, same as the donut), team. Ladder / ranked rows are per species:
  `speciesChipFilter(chips, dex)` applies species/mega/core/type/weak there (main filters `view.ladder` / `view.ranked`) and
  reports the rest as unsupported (shown under the chips). `archetypeMatrix(teams, matches, opponents)` counts the view's
  teams against `opponents` (main passes `view.base`). Every chart's click must add the chip kind that matches what it plots.
  Owner's call: both type charts add a plain `type` chip. The weakness chart shows only real multipliers
  (share of the field at 4×/2×/½×/¼×/0×), never an averaged multiplier (the old "1.69×" chart read as a type-chart value) (no weak-to / move-type variants from clicks;
  `weak` / `movetype` chips still work from old links).
- `paste.js`: `toPaste(team, dex) → Showdown text` (Showdown's Champions formats store SP in the `EVs:` line, e.g. `EVs: 32 Atk / 2 SpD / 32 Spe`), `parsePaste(text, dex) → Mon[]` (accepts `EVs:` and `SPs:` lines; a value above 32 means a classic EV spread, which is dropped as `sp: null`).
- `state-core.js`: `DEFAULT_STATE`, `toHash(state) → string`, `fromHash(hash, defaults) → state`,
  `sanitizeState(state, {regs})` (every state the store accepts goes through it; unknown values fall back).
- `scan.js`: the Team Scanner's evidence (`scanTeam` → archetype, matchups vs Pokémon/archetypes from real
  match results of "teams like yours", item check with item clause, teammate picks, weakest link). Thresholds in `LIMITS`.

### State (`public/js/state.js`)
```js
state = {
  reg: "M-C", source: "tournaments" | "ladder" | "ranked",
  tiers: ["worlds","international","regional","online"],   // enabled tiers
  place: "all" | "topcut" | "top8" | "winner",
  from: "" | "YYYY-MM-DD", to: "" | "YYYY-MM-DD", minN: 20,
  chips: [ { kind: "species"|"type"|"archetype"|"item"|"move"|"mega"|"core"|"team", value: string | string[], neg: false } ],
  skin: "pro" | "retro", theme: "dark" | "light" | "auto", anim: false,   // defaults: pro, dark
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
`{ state, reg, manifest, dex, teams /*bar filters + chips, whole teams*/, monTeams /*projected to Pokémon passing the Pokémon chips*/, ddTeams /*projected by attribute chips only*/, speciesFilter, base /*bar filters, no chips*/, prev /*previous period, same chips + projection*/, matches, ladder /*ladder-<reg>.json*/, ranked /*ranked-<reg>.json*/ }`.
Pokémon-level sections (snapshot, usage, quadrant, types, items, speed, trends, deepdive) read `monTeams`; team-level ones
(archetypes, teammates, library, scanner, methodology) read `teams`.
`ctx` gives `{ store, dex, echarts, sprite(key, opts) → HTMLImageElement, spriteUrl(key), openDrawer(key), chip(kind, value, event) /* shift/alt = neg */, hover(key|null), meta(el, {source, n, unit}) /* source/sample/updated line */, cssVar(name), fmt }`.
Sections never fetch and never mutate state except through `ctx.chip` / `store`.

## Commands
- `npm run data`: full pipeline (incremental: completed tournaments already in public/data are reused).
- `npm test`: unit tests. `npm run serve`: static server on :8080. `npm run e2e`: Playwright checks. `npm run shot`: screenshots.
- `npm run e2e:cloud`: the functional checks with the preinstalled Chromium and third-party hosts stubbed (cloud sessions).
- **`docs/TESTING.md`** is the test source of truth: how to run things, a coverage ledger of what's already verified, and
  what isn't yet. Update it whenever you test something. `docs/prompts/` holds reusable task prompts.

## Style
Plain modern JS, no TypeScript, no frameworks, no new runtime deps. Small modules. CSS custom properties for all colours;
type colours from `TYPE_COLORS`. Sprites: `image-rendering: pixelated`; fallback exact form → base species → type-coloured placeholder.

## Name
The site is **MetaLens VGC** (`metalensvgc.pages.dev`, repo `MetaLensVGC`). It was "VGC MetaScope" until
2026-09-29; the old `vgcmetascope` Pages project has been deleted. Use the new name everywhere.
Creator credits (owner's request): the "Credits" card at the end of `index.html` ("Made by Vin", no full name) links vwesley.dev, Instagram @vinnql
and X @Vin_Koe, with the owner's character art (`public/img/creator.webp`, white keyed out); the footer links vwesley.dev.

## Project status (handover, 2026-09-29, updated after the performance/filter/UX rounds)
- Live on Cloudflare Pages from branch `claude/pokemon-vgc-metagame-dashboard-9whe1a` (no `main` branch yet). Commit and push
  to this branch in logical steps; no PR unless asked. Owner preferences: default skin **Pro**, default theme **dark**.
- Data sources: Limitless online + limitlessvgc.com official (tournament teams), Smogon 1760 ladder, and the in-game ranked "Battle Data" via championsbattledata.com (`ranked-<REG>.json`). The last one **requires attribution** ("Battle data provided by Pokémon Champions Battle Data" + link, already in the footer, methodology and README) and forbids redistributing the data as a data service. It publishes ranks, not usage shares: never show a usage % from it.
- Owner decisions: ungendered official "Indeedee" counts as `Indeedee-F`. Orchestrate: `haiku` for fetch/validate/test runs, `sonnet` for coding. If a model keeps failing with 529/429, switch model instead of retrying.
- Where things stand: the in-game ranked data does not exist per team, so team-level sections show an explicit "not available" state under that source. Smogon M-C (September) stats are expected in early October and the weekly Action picks them up automatically.

### Invariants learned the hard way (keep them)
- **Rendering** (`main.js`): sections update on-screen first, yielding between them; off-screen ones are marked dirty and
  catch up in idle time or when scrolled near (IntersectionObserver). `<html data-rendering>` is set while anything is
  dirty. The previous regulation's file loads after first paint and only refreshes `snapshot` and `trends`.
- **Charts** are created via `ctx.echarts.init` (a wrapper that hides the tooltip before every `setOption`; ECharts
  throws if a notMerge redraw lands mid-hover). Tooltip formatters must handle every component that can trigger them
  (markLine, item vs axis params) and never throw: a throwing formatter also swallows clicks on that chart.
- **Every chart click must add the chip kind that matches what it plots** (see "Chip semantics"), and every clickable
  chart/table carries a `clickHint()` line saying what a click does. Teammate rate uses tournament sheets unless
  Source = Ladder has data (never an empty "ladder only" panel). New Pokémon-level
  sections read `view.monTeams`; team-level ones read `view.teams`.
- **Tooltips**: the chart wrapper (`withChartDefaults` in `ui/echarts-theme.js`) confines and wraps every ECharts
  tooltip; hover help is `data-tip="…"` on any element (shown by `ui/tip.js`, clamped to the viewport). Don't add
  CSS-only tooltips.
- **Keyboard**: make custom clickable rows/cards `tabIndex = 0`; `ui/keys.js` turns Enter/Space into a click
  (Shift kept). The deep-dive drawer owns a history entry (Back closes it).
- **Speed** of a species always comes from `metaSpeed()` (sheets -> in-game ranked -> Smogon -> bounds). No
  sheet has SP spreads, and Smogon months lag, so the ranked spreads are usually what's used.
- **Colours**: green palettes (owner's request). Pro = the owner's vwesley.dev tokens (portfolio repo, `restructure`
  branch), Retro = Game Boy greens. Text tokens, text on `--accent` and `--accent-2` must stay >= 4.5:1 on every
  surface (`test/contrast.test.js`). `--fx-1/2/3` colour the background pixel field (`ui/pixelfield.js` +
  `lib/pixelfield-core.js`, ported from the portfolio's fx-personal field; pauses while `data-rendering`, still under
  reduced motion). Cards are 88% opaque so the field shows through faintly.
- **Hand-typed sheet strings** go through `normalizeTerm` (decode + pipeline); ladder names through `ladderMerge(..., dex)`.
- **Hot aggregations** are memoized per filtered array (`usage`, `itemsBySpecies`); results are shared, so treat them as read-only.
- **UI chrome**: the filter bar and active-filter chips share one sticky wrapper (`.stickybar`); collapse state is a
  per-browser localStorage pref (`metalens.filtersCollapsed`), not part of the URL. `F` toggles it.
- **Caching**: no hashed filenames, so `_headers` serves `/js/*` and `/css/*` with `no-cache` (ETag revalidation).
  Don't lengthen it or visitors run stale code after a deploy.
- **Refresh workflow** rebases its data commit onto the latest branch tip before pushing (with retries). Pushes to the
  branch during a run are fine.

### Working in a cloud session
- The SessionStart hook runs `npm ci && npm test`. For browser checks use `npm run e2e:cloud` (preinstalled Chromium at
  `/opt/pw-browsers/chromium`; don't `playwright install`). Sprites and Google Fonts are unreachable there, so placeholders
  and fallback fonts are expected. See `docs/TESTING.md` for probe-script tips.
- `npm run data` needs outbound access to play.limitlesstcg.com, limitlessvgc.com, standings.limitlessvgc.com, smogon.com, championsbattledata.com and play.pokemonshowdown.com. The raw cache (`data-raw/`) is gitignored, so it starts empty. It still runs incrementally from the committed `public/data` (completed tournaments and finished ranked seasons are reused), so a refresh is minutes, not hours. The weekly GitHub Action does this anyway, so only run it if you need fresh data now.
- Visual review: `npm run serve`, then `node scripts/slice-shots.mjs "<hash>" <prefix> [width]` writes viewport-sized slices into `screenshots/tmp/` (gitignored). The committed full-page shots come from `npm run shot`.
