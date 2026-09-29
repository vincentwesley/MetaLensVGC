# Testing VGC MetaScope

What exists, how to run it, what has already been verified, and what hasn't.
Keep the "Coverage ledger" up to date whenever you test something, so later
sessions don't re-test it.

## How to run

| Command | What it does | Where it works |
|---|---|---|
| `npm test` | node:test unit tests (`test/*.test.js`), pure libs only | anywhere |
| `npm run serve` | static server for `public/` on :8080 | anywhere |
| `npm run e2e` | Playwright checks + screenshots (`e2e/`) with Playwright's own browser | machines with internet (`npx playwright install chromium` first) |
| `npm run e2e:cloud` | the functional checks (`e2e/app.spec.js`) with the preinstalled Chromium (`/opt/pw-browsers/chromium`, override with `PW_CHROMIUM`) and third-party hosts stubbed (`E2E_OFFLINE=1`) | Claude Code cloud sessions / offline sandboxes |
| `npm run shot` | regenerates the committed `screenshots/*.png` | only with internet (sprites + Google Fonts must load, or the shots are wrong; never commit shots taken offline) |
| `node scripts/slice-shots.mjs "<hash>" <prefix> [width]` | viewport-sized slices of a long page into `screenshots/tmp/` (gitignored) for visual review | with `npm run serve` running |

Cloud-session notes:
- The container can't reach play.pokemonshowdown.com or Google Fonts. Sprites show their
  type-coloured placeholder and text uses fallback fonts. That is expected, not a bug.
- Kill the server with `pkill -f "node scripts/serve.js"` **in its own command**. Putting
  `pkill -f` in a compound command can match and kill that shell itself.
- Ad-hoc probes: write throwaway Playwright scripts at the repo root (so `@playwright/test`
  resolves), launch with `executablePath: '/opt/pw-browsers/chromium'`, and delete them after.
  `page.route(/pokemonshowdown|googleapis|gstatic/, r => r.abort())` keeps them fast.
- Wait for rendering with `html:not([data-rendering])`. `<html data-rendering>` is present
  while any section (including off-screen ones catching up in idle time) is out of date.
- Chart instances: `echarts.getInstanceByDom(el)` on any `[_echarts_instance_]` element.
  To click a bar, use `inst.convertToPixel({seriesIndex}, [value, categoryIndex])`, and
  `scrollIntoView({block:'center'})` first, or the sticky header covers it.

## Coverage ledger (already verified; don't repeat unless the code changed)

### Automated: unit (`npm test`, 95 tests)
- stats (SP formula incl. Jolly Garchomp 169, natures, Wilson, diversity), type chart, name
  normalization, archetype classification, paste export/parse, state hash codec, ranked helpers.
- aggregate: decode, usage/kpis/typeUsage/attackingTypes/weaknesses/archetypeSplit/matrix/
  coUsage/cores/speciesDetail/weekly/movers/speedTiers/closestTeams/CSV/JSON, ladderMerge
  (+ display names with dex), items (itemsBySpecies, itemUsage, ladderItemUsage, mega-stone toggle).
- Cross-filter semantics: archetype chip = primary archetype; type/weak/movetype/item/move
  chips test one Pokémon; species + item = that Pokémon holding it; core; negatives;
  projectTeams (incl. `{keys:false}`); speciesChipFilter; archetypeMatrix vs opponents.

### Automated: browser (`npm run e2e:cloud`, 14 checks in `e2e/app.spec.js`)
- No console errors loading each regulation × Tournaments/Ladder/Ranked.
- Leaderboard click adds a species chip and changes other sections; shift-click makes a NOT chip.
- Regulation switch changes the data; URL hash round-trips filters and chips on reload.
- Library copy produces a valid Showdown paste; drawer opens from a sprite and closes with Escape.
- Scanner accepts a pasted team; no horizontal scroll at 390px in both skins.
- Leaderboard sprite opens the drawer without adding a chip.
- Filter bar collapse: summary line, persists across reload, `F` toggles; defaults Pro + dark.
- Items section: per-Pokémon items render, item click adds a chip, search narrows the table.
- Type charts add the matching chip kind (weak-to), and every leaderboard row matches it.
- Species chip leaves one leaderboard row; archetype chip leaves one donut/table row.
- Active-filter bar stays pinned while scrolling; Clear all empties it and the hash.

### Verified once, by hand or ad-hoc script (not in the suite)
- Performance profile (CPU profiler, 1440×900): longest main-thread block on first load
  1.2 s → 0.10 s, M-B switch 2.2 s → 0.22 s, filter change 0.6 s → 0.08 s. The previous
  regulation's file loads after first paint.
- Hover sweep over every chart (grid of points) in default / M-B Ladder / Ranked / Retro M-A:
  0 page errors.
- Click sweep: 308 clicks over every chart in 3 modes, including fast clicks mid-render:
  0 page errors; each chart adds the chip kind that matches what it plots.
- Workflow push race: simulated with a bare repo (the bot's data commit rebases onto a
  newer tip, including a conflicting data file; fresh data wins, other code is kept).
- Visual checks (screenshots reviewed) of: collapsed/expanded filter bar (desktop, 390px,
  both skins), Items section (desktop, 390px card layout, Ladder, Ranked), leaderboard
  top-item line, Retro dark/light palettes, Electric/Tailwind/weak-to/move-type filtered
  views, active-filter bar (desktop, collapsed, Retro, 390px).
- Data normalization: unknown item strings −80%, ~200 lowercase Mega Stones now recognized.

## Not yet tested (candidates for the next smoke/edge-case pass)

UI/UX
- Tooltips near viewport edges (ECharts `confine`, custom tooltips, long names, mobile).
- Keyboard-only use: tab order through filter bar → chips → sections → drawer; focus
  visibility; focus trap and return in the drawer; Enter/Space on every clickable row.
- Screen-reader labels (aria) on charts, chips, segmented controls, sticky bar landmarks.
- Contrast of Pro light and Retro light after the palette changes; `theme=auto` following OS.
- `prefers-reduced-motion`; the animated-sprites toggle; the sprite fallback chain with real network.
- Tablet widths (768–1100px), very wide (2560px), browser zoom 200%.
- Long content: many chips (10+) wrapping in the sticky bar; long Mega names; long player names.
- Charts resizing when the filter bar collapses/expands or the window resizes.

Filters and state edge cases
- Date range: from > to, dates outside the regulation, clearing one side; min-n at 0 and 200.
- All tiers unchecked; Winner placement with few teams; chips that match 0 teams (every
  section should show "Insufficient data", no errors).
- Hand-edited / garbage URL hashes (unknown reg, unknown chip kind, bad encoding, duplicate chips).
- Browser back/forward through chip and filter changes; the drawer and state.
- Switching regulation with chips that don't exist there (e.g. a Mega only in M-C).
- Ladder source with M-C (no months yet); ranked finished season without a published ranking.
- Deep dive opened for a Pokémon with no data under the current chips.
- Library search/sort edge cases; scanner with malformed paste, EV-style spreads, unknown species,
  fewer than 6 Pokémon, duplicates.
- Downloads (JSON/CSV) with chips and 0 teams; CSV escaping of commas/quotes in player names.

Platform
- Real Cloudflare deploy: `_headers` (CSP allows fonts + sprites; JS/CSS `no-cache` revalidation).
- The GitHub Action end to end (needs GitHub's network): `npm run data` → validate → rebase-push.
- CPU-throttled (4×) interaction latency; memory after switching regulations repeatedly.
