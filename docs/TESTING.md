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
| `node scripts/slice-shots.mjs "<hash>" <prefix> [width]` | viewport-sized slices of a long page into `screenshots/tmp/` (gitignored) for visual review; waits for rendering to settle | with `npm run serve` running; cloud: prefix `PW_CHROMIUM=/opt/pw-browsers/chromium E2E_OFFLINE=1` |

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

### Automated: unit (`npm test`, 155 tests)
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
  item clause, teammate picks, weakest link) on synthetic fixtures; never-blank rule: small samples come back
  flagged `low`/`relaxed` (weakest link ordering, `clear` false on low rows, sharing-2 fallback, truly empty).
- Chart defaults (`withChartDefaults`: confine, wrapping, aria) and `clampTip` positioning.
- WCAG contrast of `--ink`/`--ink-2`/`--muted` on every surface, text on `--accent`, and `--accent-2`
  links, in all four skin/theme combos (reads app.css).
- Cross-filter invariants on the real M-C file (`test/crossfilter.test.js`): after a type / weak /
  item / species / archetype / core chip, the chart it came from shows that selection at 100%;
  the weakness chart's buckets are real multipliers only (4, 2, 1, 1/2, 1/4, 0) and sum to 1.
- Background pixel field logic (`lib/pixelfield-core.js`): sprites, deterministic on-canvas placement.
- `atMinN` (min n with the cross-filter fallback) and `weekly` keeping weeks of a narrowly filtered view.

### Automated: browser (`npm run e2e:cloud`, 52 checks in `e2e/app.spec.js`)
- Third batch (2026-09-30): Library Filter loads + scans the team against the whole field (team chip named "Player · Event",
  "View scan" toast action); leaderboard search ("/" focuses, real usage rank kept, Escape clears, no-match state), Change
  column present with a previous period and never "-0.0"; Change column absent for M-A, ladder and ranked with no NaN;
  Copy link with the Clipboard API removed raises no uncaught error. Unit: `changeDir`, `nameMatcher` (punctuation-only query matches nothing), `fieldChips` (a negated team chip stays out of the Scanner field). e2e: "-" in the leaderboard and Items searches shows the no-match state.
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
- A hovered `[data-tip]` tip survives unrelated scrollers (the section nav re-centring) and hides when its anchor scrolls away.
- Smogon M-C month arriving (simulated by serving the M-B file as M-C): Ladder mode, Teammate rate ("Ladder (Smogon)")
  and the Spread explorer's Smogon toggle light up; the M-C explorer check expects the toggle only when M-C has months.
- Data staleness notice: when manifest is >10 days old, notice appears under header (routed to test a stale manifest).
- Cross-filters never blank a chart: a species chip leaves exactly that Pokémon on the quadrant; a rare species (Pikachu,
  9 teams) fills snapshot / usage / quadrant / items with the "includes n < 20" flag.
- Meta by country: rows per country (United States first on M-C); a row click adds "Country: Brazil", changes the
  snapshot, lands in the hash as `country:BR` and survives a reload (one row left). Unit: countrySplit, country chip in
  filterTeams (and NOT), sanitizeState keeps ISO-2 only.
- Archetype trend (M-B): 6 weekly lines covering every week; Tailwind has the same colour in donut and trend, and keeps it
  under a type chip that reorders the split; clicking a line adds an Archetype chip.
- Sprite scale: every rendered sprite is 24/32/48/96 px; item shares in the items table have one decimal and none reads 0.
- Fireflies: the snapshot's leader card carries 4 fireflies and the card is `is-live` only while on screen; only a newly
  added chip gets `chip--new` (earlier chips and non-chip changes animate nothing).
- Motion budget: after a filter click only allowlisted animations run on screen (new chip, bar-grow, ambient fireflies,
  scroll progress, busy bar); leaderboard bars run `bar-grow`; the drawer hides only after its slide-out.

### Verified once, by hand or ad-hoc script (not in the suite)
- The weekly refresh Action end to end (run 36573240204: failure alert opened with correct step and log;
  run 36573679607: real refresh succeeded in 45.5 min, data commit rebased cleanly over concurrent code pushes,
  issue commented and closed; run 36710957061 on 2026-09-30: success in 17.5 min with the restored HTTP cache,
  data commit only in public/data). The cron trigger itself has not fired yet (first: 2026-10-05).
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

Second smoke + UX round (2026-09-29, evening; sonnet sweep with measurements, fixes in the suites):
- NEW vs +pt: a Pokémon absent / under min-n in the previous period read "+54.7pt vs M-B" (Rillaboom,
  n=1 in M-B). One rule now (`changeVsPrev`) for snapshot, shift table and risers/fallers (unit + e2e).
- Idle CPU at 4x throttle: ~100% main thread -> 7-9% (desktop and 390px mobile). Causes: the credits
  name glow animated text-shadow nonstop, and the pixel field ran an always-on rAF loop. Credits
  animations now pause off-screen; the field runs a 10 fps timer (6 on weak devices), caches its blob
  layer, skips frames while scrolling. Pauses while rendering / reduced motion / hidden tab re-verified.
- Contrast in all four combos (library badges/tiers 1.4:1, speed pills 1.9:1, scanner 1x cell 1.15:1 in
  light, red/green deltas ~3.3:1): new --up/--down/--warn/pill tokens, `inkOn()` for text on type and
  heatmap fills; all >= 4.5:1 (test/contrast.test.js).
- Click hints hide over empty states (one observer in clickHint); scanner has a hint; a paste with no
  known Pokémon is rejected; chart aria-labels no longer contain NaN; Items under Ladder M-C says
  "No ladder data for this regulation yet"; Teammate rate rows are role=button.
- Verified fine (measured): type-chart clicks (plain type chip, leaderboard only that type, 36 hover
  tooltips clean), every chart click matches what it plots, Teammate rate fallbacks (M-C sheets, M-B
  ladder, M-C ladder -> sheets), scanner two columns at >= 1200px, credits links/image, no
  vgcmetascope leftovers, no overflow at 390 in six modes.
- UX: section jump nav (sticky, aria-current follows scroll), first-visit tips strip, aria-busy cue on
  sections catching up, snapshot change line, hyphen-only Mega name breaks, quadrant corner labels
  (all in e2e). Screenshots reviewed with real network: 390 pro dark, 1440 retro light, quadrant.

Spread explorer (2026-09-30): `lib/spreads.js` + `spCheck` unit-tested on real Rillaboom data; e2e: Rillaboom M-C
(>= 3 rows, 6 numeric stats, strip, shift "NEW in M-C", no Smogon toggle), Incineroar M-B (Smogon toggle -> meta line
with n battles), scanner SP check on an EVs:-style paste, no overflow at 390. Real-network screenshots reviewed
(1440/390, pro-dark/retro-light). Rillaboom's top ranked spreads cover only 38% of its players (shown as such).

Flaky phone-tooltip e2e (2026-09-30, cloud): root cause was real, not timing. `ui/tip.js` hid the tip on any
scroll event in the page, including the section nav's own horizontal re-centring, which lands a moment after
Playwright's hover scroll. Reproduced 6/6 fails in the cloud sandbox; after the fix 6/6 + 6/6 passes (with the new check).

Spread explorer polish (2026-09-30, cloud): stacked spread-type bar + legend (tips per segment), ranked natures shown
once (top 3), SP column header, per-row share bar, `* Nature` assumption marker, "Change from M-B to M-C" / "NEW in M-C"
wording. e2e updated (bar segments, natures line, cover line); screenshots reviewed at 1440 (M-C Rillaboom) and 390
(M-B Incineroar, Smogon).

Motion layer (2026-09-30, cloud; reveal, KPI tick and section fade later removed, see "Motion audit"): section reveal, bar grow, KPI tick, drawer easing + slide-out, row accent edge,
title markers, skin/theme cross-fade (`ui/motion.js`, "motion" block in app.css). Filmstrips reviewed at 1440 in Pro dark
and Retro light (frames taken by pausing `document.getAnimations()` at fixed times, composited in a page and
screenshotted: no image tools needed). 4x CPU throttle, placement clicks: longest task 161-234 ms after vs 202-267 ms
before (noise); all 43 e2e green. Found while reviewing: the section-nav jump landed 14 px under the sticky bar while the
target was mid-reveal (fixed: only the section's children move); the drawer snapped shut instead of sliding (visibility
flipped instantly; fixed); the Retro archetype legend table pushed n/share/win % out of view (names now wrap).
Old slice-shots taken before rendering settled showed empty quadrant / clipped tables: the script now waits.
The quadrant's points are sprite images, so offline they are invisible (expected in the sandbox).

No blank charts under cross-filters (2026-09-30, owner's ask): probed species Rillaboom, rare species, type Electric, item Life
Orb, archetype Rain, core Rillaboom+Incineroar, Rillaboom + Winner (35 teams). Before: quadrant empty for any single
Pokémon (it needed 2 points), and snapshot/usage/quadrant/items/teammates/cores/trend line empty whenever min n (or the
100-team week floor) hid everything. After: every chart draws; the only empty states left are real absences (no
movers when one Pokémon holds 100% both weeks, no previous period, no match results), each with a specific title.
Screenshots reviewed (sprites stubbed): quadrant with Rillaboom, Electric, Pikachu.

Fireflies (2026-09-30, cloud): snapshot leader halo + 4 fireflies, new-chip glow with fireflies lifting off, sprite
hop on hover, scroll-progress hairline (CSS scroll timeline), a still firefly on empty states; colours are the
`--ff-core/--ff-glow` tokens shared with Credits (also fixes theme=auto on a light OS). Reviewed at 1440 in Pro dark,
Pro light, Retro light, Retro dark (chip frozen mid-glow). Idle main thread at 4x throttle, snapshot on screen:
6.2% before, 8.6-9.1% after (inside the 7-9% range accepted earlier; back to baseline once the snapshot scrolls away).
Found on the way: every chip re-popped on every state change (now only new ones animate).

Motion audit (2026-09-30, owner: "make sure it isn't overwhelming"): counted running on-screen animations. Before:
idle top = halo + 4 fireflies; mid-scroll = 5 sections revealing at once; one filter click = ~8 effects at once (chip
pop/glow/fireflies, 5 KPI ticks, bars, 3 section fades, halo). Removed the reveal, the section fade, KPI ticks, the
breathing halo, whole-card hover lift and row-wide sprite hops. After: idle top = 4 fireflies; mid-scroll = nothing;
a click = the new chip + the bars. Guarded by the allowlist in the e2e motion check.

Owner calls built (2026-09-30): item shares one decimal (fmt.pct shows "<0.1%" for a nonzero share); sprite scale
24/32/48/96 (hero 48 on phones); archetype share by week (M-C has only 2 full weeks; M-A/M-B show the regulation);
meta by country (screenshots 1440 pro-dark, retro-light M-B, 390 stacked cards; no overflow). Found: grid sections had
min-width:auto, so a wide table grew the page instead of scrolling (fixed for every section). countrySplit on M-B
(33k teams): 52 ms.

Third batch review (2026-09-30, local Windows run, E2E_OFFLINE=1, --workers=2): 151 unit, 51 e2e all green (the phone
tooltip check passed in the full run). Reviewed the cleanup edits (shared copyText, changeDir, usageRank Map,
labelFor(chip, ctx.teamLabel), view.field, ctx.scan) and found no bugs; added the absent-column / no-clipboard check.

Scanner never-blank fix (2026-09-30): Weakest link used to say "Insufficient data" when a side had < 100 games. Repro on M-C
real data: `#tiers=regional&place=topcut` (36 teams) with Rillaboom/Incineroar/Sneasler/Salamence/Kingambit/Basculegion gave 0
rows (also place=winner: 67 teams). Now every member with games on both sides shows, flagged "low sample", plus the
"includes n < 100" meta tag; same rule for matchups, item check and teammate picks. E2E: default + that narrow view, no
"Insufficient data" in any scanner card. Screenshots (1440/390, pro-dark) reviewed.

### v1.1.0 (2026-10-08): 216 unit, 58 e2e green
- Unit: prefs never in the hash + legacy `#skin=` still parsed + bad palette -> grass; contrast for all 28 skin x theme x palette combos;
  clock math (`nextRefresh`, `daysLeft`, `fmtDuration`); changelog/package.json version sync; `statRange`, `defensiveBuckets`, `allSpecies`; Pokédex sort/filter.
- e2e: settings panel changes mode/style/palette, persists on reload, never enters the hash, fits 390px; What's new lists 1.1.0 and clears the
  gear dot; clock popover shows the refresh line; Pokédex card opens details with 0 chips, search + type filter narrow it, `P` focuses search,
  empty state hides "Show all", no overflow at 390px; deep dive Filter-dashboard adds one chip, Copy set pastes the species.
  Data-dependent checks (ladder-less M-C, team counts, ranks) now read the manifest/data instead of literals.
- Visual sweep (1440/390, 7 palettes, drawer, popovers) done once; items fixed. Not re-reviewed by eye: pro-light fire/ghost pills, 390px What's new.

### v1.2.0 (2026-10-09)
- Unit: Pokédex logic (tier order, stat sort, AND filters, usage tiers incl. ranked, suggest grouping, forme split), generated roster/learnset
  files (`test/pokedex-data.test.js`), contrast for 6 styles x 2 themes x 7 palettes, style enum.
- e2e: Pokédex (tier bars, stat sort, search suggestions -> filter tags, row opens details with 0 chips, unused species opens cleanly, empty state,
  no overflow at 390, `P` focus); tips strip pinned on scroll + Pokédex after the quadrant; animated sprite keeps a 52x87 aspect (stubbed image);
  each new style persists and fits 390px. Phone sticky bar stays under 15% of the screen with the tips strip.
- Not verified: glass frame rate in a real browser, offline font fallbacks for Newsreader/Nunito.

## Not yet tested (candidates for the next pass)

- Real Cloudflare deploy: `_headers` (CSP allows fonts + sprites; JS/CSS `no-cache` revalidation),
  the sprite fallback chain with real network, the creator image and pixel field on a real device.
- Pixel field cost on low-end / mobile CPUs and battery (only desktop Chromium was profiled).
- Real screen readers (NVDA/VoiceOver) with the ECharts aria descriptions; real touch devices
  (tap tooltips, `[data-tip]`, Android back gesture on the drawer).
- Browser zoom via the real zoom control (only DPR emulation was used).
- Retro type sizes with the real VT323 font at 390 (the UX probe had fonts stubbed).
- Motion with real network (sprites loading mid-animation), View Transitions cross-fade in Firefox/Safari (no API: instant
  switch expected), and the reveal on a real phone scroll.
