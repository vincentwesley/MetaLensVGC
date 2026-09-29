# Testing MetaLens VGC

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

### Automated: unit (`npm test`, 129 tests)
- stats (SP formula incl. Jolly Garchomp 169, natures, Wilson, diversity), type chart, name
  normalization, archetype classification, paste export/parse, state hash codec, ranked helpers and out-of-window season handling.
- aggregate: decode, usage/kpis/typeUsage/attackingTypes/weaknesses/archetypeSplit/matrix/
  coUsage/cores/speciesDetail/weekly/movers/speedTiers/closestTeams/CSV/JSON, ladderMerge
  (+ display names with dex), items (itemsBySpecies, itemUsage, ladderItemUsage, mega-stone toggle).
- Cross-filter semantics: archetype chip = primary archetype; type/weak/movetype/item/move
  chips test one Pokémon; species + item = that Pokémon holding it; core; negatives;
  projectTeams (incl. `{keys:false}`); speciesChipFilter; archetypeMatrix vs opponents.
- `sanitizeState` (garbage hashes: unknown reg/source/place/skin/theme, bad/reversed dates,
  min-n out of range, unknown/duplicate/empty chips, one-key cores).
- `metaSpeed` source chain (sheets -> in-game ranked -> Smogon -> bounds).
- `lib/scan.js` (scanner evidence: similar teams, matchups, archetype fallback, items +
  item clause, teammate picks, weakest link) on synthetic fixtures.
- Chart defaults (`withChartDefaults`: confine, wrapping, aria) and `clampTip` positioning.
- WCAG contrast of `--ink`/`--ink-2`/`--muted` on every surface, text on `--accent`, and `--accent-2`
  links, in all four skin/theme combos (reads app.css).
- Cross-filter invariants on the real M-C file (`test/crossfilter.test.js`): after a type / weak /
  item / species / archetype / core chip, the chart it came from shows that selection at 100%;
  the weakness chart's buckets are real multipliers only (4, 2, 1, 1/2, 1/4, 0) and sum to 1.
- Background pixel field logic (`lib/pixelfield-core.js`): sprites, deterministic on-canvas placement.

### Automated: browser (`npm run e2e:cloud`, 28 checks in `e2e/app.spec.js`)
- No console errors loading each regulation × Tournaments/Ladder/Ranked.
- Leaderboard click adds a species chip and changes other sections; shift-click makes a NOT chip.
- Regulation switch changes the data; URL hash round-trips filters and chips on reload.
- Library copy produces a valid Showdown paste; drawer opens from a sprite and closes with Escape.
- Scanner accepts a pasted team; no horizontal scroll at 390px in both skins.
- Leaderboard sprite opens the drawer without adding a chip.
- Filter bar collapse: summary line, persists across reload, `F` toggles; defaults Pro + dark.
- Items section: per-Pokémon items render, item click adds a chip, search narrows the table.
- Both type charts add a plain `Type:` chip and the leaderboard then lists only that type.
- Hover sweep over the type charts: no NaN / undefined in any tooltip.
- Teammate rate uses tournament sheets when there is no ladder data (M-C) and a row adds a core chip.
- Species chip leaves one leaderboard row; archetype chip leaves one donut/table row.
- Active-filter bar stays pinned while scrolling; Clear all empties it and the hash.
- Every chart's tooltip (grid of hover points, 390px) and a long `[data-tip]` tip stay inside
  the viewport and inside their chart.
- Hand-edited hash is sanitized and rewritten canonically; no errors or NaN.
- Enter on an archetype row adds a chip; Shift+Enter on a leaderboard row adds a NOT chip.
- Regulation-shift table has no NaN at min-n 0.
- Back closes the deep-dive drawer (stays on the page); closing with X leaves history as it was.
- Scanner on M-C: speed position has data, all evidence cards render, item clause flagged.
- Data staleness notice: when manifest is >10 days old, notice appears under header (routed to test a stale manifest).

### Verified once, by hand or ad-hoc script (not in the suite)
- The weekly refresh Action end to end (run 36573240204: failure alert opened with correct step and log;
  run 36573679607: real refresh succeeded in 45.5 min, data commit rebased cleanly over concurrent code pushes,
  issue commented and closed).
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

UX round (2026-09-29, after the smoke pass; screenshots reviewed):
- Type section: 'usage: NaN%' tooltip fixed; the averaged-multiplier chart ("1.69×") removed; the
  weakness chart shows real multipliers (Ground filter: Water 2× 38%, 4× 10%, 1× 52%; Electric 100% immune).
- Click hints (`clickHint`) on every clickable chart/table: present once, survive filter changes,
  no horizontal scroll at 390px.
- Scanner evidence cards (archetype, Pokémon/archetype matchups, item check, teammate picks,
  weakest link) in M-A/M-B/M-C: no errors/NaN; 20-115 ms per scan; two-column layout from 1200px
  reviewed at 1440 and 1280, one column below.
- Green palettes (Pro = vwesley.dev tokens, Retro = Game Boy greens) screenshotted in all four
  combos; background pixel field visible behind 88%-opaque cards, pauses while rendering.
- Credits card (character art, fireflies, sparkles, name glow) in Pro dark/light, Retro, 390px.

Smoke/edge-case pass (2026-09-29; haiku sweeps + own probes; bugs found are fixed and in the suites above):
- Hash/filter edge cases: from > to, dates outside the reg, one side only, malformed dates;
  min-n 0/1/200/9999/-5/abc; all tiers off; unknown tiers; Winner + one small tier; chips
  matching 0 teams (every section shows its empty state); unknown reg/source/kind, bad
  percent-encoding, very long hash, 30 chips, duplicates; switching reg with chips that only
  exist in M-C; Ladder M-C and Ranked for every reg; rapid hash changes (last one wins);
  back/forward through chip changes. Found: NaN in the regulation-shift table (fixed).
- Tooltips: every chart at 390/768/1024/1440/2560 (now confined; `[data-tip]` tips were
  CSS-only and ran off-screen: replaced by `ui/tip.js`).
- Layout: no horizontal scroll at 390/768/1024/1440/2560 in both skins; 12+ long chips wrap
  (sticky bar ~4% of a phone screen); charts follow window resizes and filter-bar collapse;
  720px CSS width at 2x DPR.
- Keyboard: every focusable element shows a focus ring; drawer has role=dialog, aria-modal,
  focus trap, Escape, focus return. Found: archetype rows and deep-dive type pills not
  focusable, shift-table rows without Enter, focus hidden under the sticky bars (all fixed).
- Screen readers: landmarks, labelled regions (chips bar is a polite live region), labelled
  inputs (min-n slider was missing one, fixed); charts now carry ECharts' aria description.
- Contrast: `--muted` was 3.6–4.0:1 in the light themes (fixed, see unit test).
  `theme=auto` follows the OS; `prefers-reduced-motion` stops CSS animation.
- Scanner: empty/whitespace/prose pastes, 1/3/6/8 mons, duplicates, unknown species,
  nicknames, gender, EV spreads (dropped), SPs lines, Tera lines ignored, CRLF, 50 KB paste.
  Found: speed position empty on M-C (no sheet SP, no Smogon month; now uses in-game ranked
  spreads) and pasted mons without SP assumed 0 SP (now their species' most common spread).
- Library: empty / no-match / regex-character / accented / 1000-char searches, every sort,
  copy one / copy all (0 and many visible), long names at 390px.
- Downloads: JSON/CSV with default filters, many chips and 0 teams (`[]` / header only);
  CSV quoting of commas/quotes verified on real player names; counts match the view.
- Memory: 4 rounds through M-A/M-B/M-C: heap flat at ~155 MB after the first round.
- 4x CPU throttle: chip in the DOM <10 ms after a click and painted before the recompute.

## Not yet tested (candidates for the next pass)

- Real Cloudflare deploy: `_headers` (CSP allows fonts + sprites; JS/CSS `no-cache` revalidation),
  the sprite fallback chain with real network, the creator image and pixel field on a real device.
- Pixel field cost on low-end / mobile CPUs and battery (only desktop Chromium was profiled).
- Real screen readers (NVDA/VoiceOver) with the ECharts aria descriptions; real touch devices
  (tap tooltips, `[data-tip]`, Android back gesture on the drawer).
- Browser zoom via the real zoom control (only DPR emulation was used).
- A full smoke pass over everything changed in the UX round above (only targeted checks ran).
