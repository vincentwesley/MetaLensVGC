# VGC MetaScope — Goal Prompt

Paste everything below into a fresh Claude Code session (with open network access).

---

You are building **VGC MetaScope**. It's an interactive, cross-filtering metagame dashboard for **Pokémon Champions, the VGC 2026 format**. It will run as a free static site on **Cloudflare Pages**, from the GitHub repo `vincentwesley/VGCMetaScope`. It is its own standalone website, separate from my portfolio at vwesley.dev, so don't link it to or reference that domain. The Pages project should be named `vgcmetascope`, which gives the site `https://vgcmetascope.pages.dev`. The name is permanent, so use "VGC MetaScope" as the site's brand everywhere. I will not be involved: treat this as a goal and work autonomously until it is done, deployed-ready, tested, committed and pushed. Make reasonable decisions yourself and write them down in the README. Use a task list to track progress.

### 0. Non-negotiables
- **Accuracy over everything.** Every number shown must come from real data you fetched, never invented or "calibrated" synthetic data. If a stat isn't available, hide that widget for that filter state or say "insufficient data". Don't fake it. Every view shows the data source, the sample size (n teams / n battles) and the "last updated" date.
- **Verify format facts before coding** (web search or fetch). Here's what I believe as of late Sept 2026; correct it if it's wrong:
  - There are three regulations. **M-A** ran Apr 8 – Jun 17, 2026, with the first IRL event at Indianapolis Regionals, won by Arsal Puri. **M-B** ran Jun 17 – Sep 9, and Worlds (Aug 28–30, San Francisco, 395 players) was played under M-B. **M-C** runs Sep 9 – Dec 2, 2026 and is current; it's additive and brought in 36 new Pokémon plus Mega Salamence, Mega Golisopod, Mega Baxcalibur, Mega Garchomp Z, Mega Lucario Z and Mega Absol Z.
  - **There is no Tera.** The gimmick is **Mega Evolution**, so wherever a Tera widget would go, show Mega choice instead.
  - **There are no EVs or IVs; Stat Points (SP) replace them.** Each Pokémon gets 66 SP, with at most 32 in one stat. At Lv50, HP = Base + 75 + SP and every other stat = floor((Base + 20 + SP) × Nature), where Nature is 1.1, 1.0 or 0.9. All spreads, speed tiers and stat math must use this formula. Unit-test it: Jolly Garchomp with 32 Speed SP = floor(154 × 1.1) = 169.
  - **The item pool is restricted, and it differs by regulation.** M-A had no Life Orb, Choice Band/Specs, Assault Vest or Rocky Helmet. M-B added Life Orb. Verify what M-C adds.
  - **Anchor numbers to sanity-check what you scrape against:**
    - M-A (Pikalytics): Basculegion ~51.5%, Kingambit ~40.7%, Garchomp ~40.5%, Floette-Mega ~23.9%, Sinistcha ~20.4%, Whimsicott ~17.7%.
    - M-B: the top core is Charizard-Mega-Y + Garchomp, and the "Big Six" archetype dominated.
    - M-C: Rillaboom ~37.6%, Sneasler ~36.6%, Incineroar ~28.5%, Salamence ~26%, Kingambit ~25%, Basculegion ~23.8%, Golisopod ~21.7%, Indeedee-F ~21.6%. Mega Salamence plus double Fake Out (Rillaboom, Incineroar, Sneasler) is the dominant core.
    - Worlds 2026: champion Takuma Yamazaki with Floette-Mega, Dragonite-Mega, Kingambit (Chople Berry, Low Kick), Sneasler (Poison Touch, Feint), Basculegion (Life Orb) and Garchomp (Choice Scarf). Runner-up Hiroshi Onishi with a standard Big Six (Charizard-Y + Floette-Mega). Top 8 also included Zachary Weed, João Felipe Leite, Antonio Sánchez, Yuya Wakasugi, Stefano Greppi and Giovanni Piscitelli.

### 1. Data pipeline (real data, reproducible)
Build a Node data pipeline in `scripts/` that writes compact JSON into `public/data/`. Commit the generated data so the site is fully static.
- **Tournament teams (primary source, needed for cross-filtering).** Use the Limitless public API (`play.limitlesstcg.com/api` → tournaments → standings, which include team lists) for every Pokémon Champions / VGC 2026 tournament. Also pull official events (Regionals, Internationals, Worlds, Japan Nationals) from RK9, Victory Road or Pikalytics tournament pages where team lists are public. For each team, store:
  - player, event, event tier (Worlds / International / Regional / Online / Ladder)
  - date, regulation, placing, W-L record
  - 6 × {species, item, ability, 4 moves, nature, SP spread when open team sheets provide it, Mega flag}
- **Ladder usage (secondary).** Use Smogon/Showdown chaos stats (`smogon.com/stats/<YYYY-MM>/chaos/gen9championsvgc2026regm*-*.json`) and/or Pikalytics ladder and battle data. These give usage, items, abilities, moves, spreads, teammates and checks/counters per regulation and month. Keep them as a separate "Ladder" source.
- **Dex data** comes from the `pokemon-showdown` npm package or `@pkmn/dex`: types, base stats, abilities, move type/category/BP/priority. Add an override table for any Champions/Z-A Megas missing there, and verify those stats against Bulbapedia or Serebii.
- **Normalize names** so forms stay distinct: Floette-Eternal vs. Floette-Mega, Basculegion vs. Basculegion-F, Indeedee vs. Indeedee-F, Charizard-Mega-Y, and so on.
- **Dedupe and validate.** Print a data report (teams per regulation and tier, coverage of open team sheets, species count) and fail the build on schema errors.
- **Weekly refresh.** Add a GitHub Action (`.github/workflows/refresh-data.yml`, weekly cron plus manual dispatch) that re-runs the pipeline and commits the results, so Cloudflare redeploys automatically. Scrape politely: cache raw responses in `data-raw/` (gitignored), rate-limit requests, and send a descriptive User-Agent.
- All aggregation happens **client-side from team rows**. That's what makes cross-filtering genuine.

### 2. Tech stack
- A static site in `public/`, with no framework build step: HTML, CSS and ES modules. Cloudflare Pages settings: build command empty, output directory `public`. Add `public/_headers` for caching and security.
- **Apache ECharts 5**, vendored from npm into `public/vendor/`. Use it for heatmaps, sankey/sunburst, brush and dataZoom, `dispatchAction` highlight syncing, and rich-text axis labels with sprite images. Pick something else only if it's clearly better and still free/open source.
- **Sprites:**
  - Default: `https://play.pokemonshowdown.com/sprites/gen5/{id}.png`
  - Animated toggle: `gen5ani/{id}.gif` and `gen5ani-shiny/{id}.gif`
  - Always set `image-rendering: pixelated`.
  - Use a fallback chain of exact form → base species → a type-colored pixel placeholder, because new Champions Megas may not have gen5 sprites.
- **Fonts:**
  - **Retro skin (DEFAULT):** Press Start 2P for headers, Silkscreen for card titles and labels, VT323 for body. Add a subtle CRT scanline effect and pixel borders.
  - **Pro skin (toggle):** JetBrains Mono for headers and tags, Inter for body.
  - Support light and dark via CSS tokens. It must look **excellent**: think a polished Pokémon-handheld UI meets a Bloomberg terminal. Keep type colors consistent, spacing tight, micro-animations subtle, and the layout fully responsive down to 390px with no horizontal scroll. Load and follow any dataviz or frontend-design skill you have before writing chart code.

### 3. Interaction model
- **Global filter bar** (sticky):
  - Regulation (M-A / M-B / M-C; defaults to the current one)
  - Source (Tournaments / Ladder)
  - Event tier (Worlds / Internationals / Regionals / Online)
  - Placement (All / Top Cut / Top 8 / Winners)
  - Date range
  - Minimum-sample slider
- **Cross-filtering everywhere.** Clicking any datum adds a filter chip: a Pokémon, type, archetype, item, move, Mega, core or team. Every other chart then recomputes on "teams matching all chips". Shift-click or alt-click excludes instead ("teams WITHOUT X"). Chips can be removed individually, and there's a clear-all button.
- **Shareable state.** All filter state lives in the URL hash, so any view can be shared or bookmarked.
- **Hover links.** Hovering a Pokémon highlights it across all charts.

### 4. Sections
Keep what's useful. Add better ideas if you find them.
1. **Meta Snapshot (hero).**
   - The top 5–6 Pokémon as animated sprite cards, each with usage %, win %, and ▲/▼ change vs. the previous period.
   - KPI tiles: teams sampled, unique species, meta diversity (effective number of species = exp(Shannon entropy)), Mega share, and most-used Mega.
2. **Usage leaderboard.** Sortable, with sprite rows, usage %, win % and a 95% confidence interval (Wilson). Clicking a row filters.
3. **Type landscape.**
   - Type usage (clickable).
   - **"Best attacking types right now"**: for each attacking type, meta-weighted average effectiveness against the currently filtered field.
   - A defensive "most common weaknesses in the field" view.
4. **Archetypes.**
   - Auto-classify each team (Sun, Rain, Sand, Trick Room, Tailwind HO, Psychic Terrain/Indeedee TR, Big Six, Salamence plus double Fake Out, and so on) from its members and moves using documented rules.
   - A donut of the archetype split.
   - An **archetype-vs-archetype win-rate heatmap**, built from real match results where available and hidden where they aren't.
5. **Usage vs. win-rate quadrant.** A scatter with sprite markers, with quadrants labeled Meta Pillars / Hidden Gems / Overhyped / Fringe.
6. **Teammates and cores.**
   - A co-usage heatmap of the top ~15, toggling between raw % and lift. Clicking a cell filters on both Pokémon.
   - The top 3-Pokémon cores, with sprites.
7. **Pokémon deep dive** (a drawer that opens when you click a Pokémon). It shows:
   - items, abilities, and moves
   - the most common exact **4-move sets**
   - Mega usage
   - top **SP spreads plus natures**, with computed final stats and what they're built for (e.g. "outspeeds Jolly Garchomp")
   - teammates
   - win rate with vs. without the Pokémon
   - common checks and counters (from the ladder)
8. **Speed tier matrix.**
   - Top-used Pokémon at their real most-common spreads.
   - Toggles: Tailwind, Choice Scarf, +1, −1/Icy Wind, paralysis, and Trick Room order.
   - A "my Pokémon" benchmark line with SP and nature sliders.
9. **Trends and telemetry.**
   - Weekly usage lines with a brush that drives the date filter.
   - **Risers and fallers** week-over-week.
   - A regulation-shift view (M-A → M-B → M-C) showing what entered or left the top 20.
10. **Team Sheet Library.**
    - A searchable and filterable card grid: player, event, placing, record, 6 sprites, items.
    - **One-click copy of the Showdown paste**, plus "copy all visible".
    - Highlight the Worlds and major winners.
11. **My Team Scanner** (for competing).
    - Paste a Showdown or Champions team.
    - It shows weaknesses weighted by the meta's actual attacking-move distribution, the top meta threats the team has no answer to, where the team sits in the speed tiers against the meta, and the closest tournament teams.
12. **Data and methodology.** Download the filtered JSON or CSV, list the sources with links, explain how archetypes are classified, and show the last refresh time.

### 5. Project hygiene
- Add `package.json` scripts: `data` (full pipeline), `test`, `serve` (a local static server), and `shot` (Playwright screenshots).
- Write `node:test` unit tests for:
  - the SP stat formula
  - the type chart
  - name normalization
  - archetype classification
  - the aggregation and filter logic
  - paste export and parse
- Write a `README.md` covering the features, data sources and licensing notes, the Cloudflare Pages setup (connect the GitHub repo, set the project name to `vgcmetascope`, leave the build command empty, set the output dir to `public`, and the site goes live at `vgcmetascope.pages.dev`), and how the data refresh works.
- Write a `CLAUDE.md` with the project conventions for future sessions. Set up a SessionStart hook that runs `npm ci && npm test`.
- Show a footer credit that sprites belong to Pokémon Showdown and data belongs to its sources, with a note that this is a fan project not affiliated with Nintendo, Game Freak or The Pokémon Company.

### 6. Definition of done
1. `npm run data` fetches real data for all three regulations. The data report shows solid coverage, and scraped usage is within a few points of the anchors above (or you explain why they differ).
2. `npm test` passes.
3. Automated Playwright checks against the local server all pass:
   - no console errors
   - clicking a leaderboard bar adds a chip and changes the other charts' numbers
   - regulation switching works
   - the URL hash round-trips
   - copying a paste works
   - the deep-dive drawer opens
   - the scanner accepts a paste
   - the layout works at 390px
4. Screenshots in both skins, desktop and mobile. Review them critically and polish anything that doesn't look great.
5. Everything is committed and pushed. Finish with a short summary: what was built, the data coverage, any known gaps, and the exact Cloudflare Pages steps I need to click.
