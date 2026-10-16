Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, live at https://metalensvgc.pages.dev).
Handover updated 2026-10-12 after v1.3.1 (smoke-test fixes). Everything is live and tests are green. Only do what the owner asks.

## Before anything
1. Local clone: `C:\Coding Projects\VGCMetaScope`. `git pull --rebase` first: the weekly bot (`metalensvgc-bot`, "chore: refresh data") pushes to the same branch.
2. Read `CLAUDE.md` in full (hard rules, data notes, "v1.1.0 / v1.2.0 / v1.3.0 additions") and `docs/TESTING.md` (coverage ledger). Don't re-verify what the ledger covers unless its code changed. Don't edit `.gitattributes` or the graphify / skill-trigger parts of `CLAUDE.md`.

## How to work here
- **One branch**: `claude/pokemon-vgc-metagame-dashboard-9whe1a` is the default branch and Cloudflare Pages' production branch (no `main`). Commit in logical steps and push to it (that deploys).
- **Ground rules**: real data only, never invented numbers; never blank a card (show real smaller samples flagged, or a worded empty state, never "Insufficient data"); all stat math through `js/lib/stats.js` (`RULES.sp` Champions, `RULES.ev` Showdown); in-game ranked data needs attribution, publishes ranks only. Every shipped batch bumps `package.json` version + `lib/changelog.js` (a test asserts they match) and is documented in CLAUDE.md + TESTING.md.
- **Owner preferences**: Claude orchestrates and reviews; coding goes to sonnet subagents with self-contained briefs; review every diff and re-run tests before committing; run `simplify` + `code-review` (low) before pushing non-trivial work. Defaults: Pro style, dark theme, green palette. Terse reports. Never kill all `node.exe` (kill the PID you started; `pkill` doesn't exist here, use `netstat -ano` + `taskkill //PID`).
- **Tests**: `npm test` (354 unit); browser suite `E2E_OFFLINE=1 npx playwright test e2e/app.spec.js --workers=2 --timeout=120000 --output "$TEMP/pw"` (64 checks, ~5 min). Data: `npm run data` (network; slow first run for sprite HEAD checks, cached after).

## Current state (v1.3.0, 2026-10-09)
- v1.1.0 settings gear / 7 palettes / clock / update log; v1.2.0 Showdown-teambuilder-style Pokédex + 6 styles; v1.3.0 **VGC | Showdown mode** (header switch; regs `ND` National Dex and `NDD` NatDex Doubles; Smogon ladder only, cutoff 1760, rolling 3 months; EV Lv100 rules; Tera card).
- Mode = family of `state.reg` (`SHOWDOWN_REGS` in `lib/state-core.js`; `ui/modeswitch.js`; `<html data-family>`). Team-sheet sections (quadrant, archetypes, countries, library, scanner) and tournament filters are hidden in Showdown mode (CSS + `TEAM_ONLY` in `main.js`). Showdown sections reorder in CSS so 6-wide cards pair with no gaps (teammate cards join the main grid >=1100px via `display: contents`).
- Showdown ladder branches: types, trends (monthly lines, risers/fallers), snapshot, speed, teammates heatmap + top pairs (derived from Smogon teammate data, labelled), deep dive (Tera card, no win-rate/sets). Leaderboard shows usage % only, sorted by usage (Smogon usage is rating-weighted, raw count is not comparable).
- Pokédex: A-Z by default in VGC, Tier by default in Showdown (ND official tiers; NDD uses Showdown's Doubles tiers DUber/DOU/DUU since NatDex Doubles has no list); follows dashboard chips (species/type/weak/core) but clicking it never adds a chip; list scrolls in a fixed-height box.
- Weekly refresh: `.github/workflows/refresh-data.yml`, Mondays 00:00 UTC; also refreshes ND/NDD (Smogon months appear once published; October 2026 not out yet at time of writing).

## Known gaps / ideas (none block "done")
1. Showdown has no usage x win-rate quadrant (Smogon publishes no win rates). Offered but not built: a quadrant of rating-weighted usage vs raw usage share ("favoured by top players"), clearly labelled as not win rate.
2. (done in 1.3.1) hint wording.
3. (done in 1.3.1) jump bar order.
4. Smogon raw counts in our `ladder-*.json` ("Raw count" field of the chaos JSON) run ~8% above the `.txt` stats page; usage % matches exactly. Not investigated.
5. Review leftovers not applied (minor): `view.rules || RULES.sp` fallbacks repeated in sections; `ladderWeaknesses` recomputes per species instead of per typing; in-place dex swap in `main.js#ensureDex`; family list duplicated in `state-core.js` and `scripts/lib/regs.js` (a parity test would pin it); `modeswitch.js` hand-builds a segmented control.
6. Next regulation (M-C ends 2026-12-02): add it to `scripts/lib/regs.js` (window + `format`), `current` in `scripts/build-data.js`, then run the workflow.
7. Not verified in real browsers/devices: glass style frame rate, header switch on a phone, offline font fallbacks.

When you finish a piece of work, update `CLAUDE.md` and `docs/TESTING.md`, then report tersely: found, built (commits), tested, left open.

## QA pass 2026-10-16 (v1.4.1-1.4.2): open findings
- Desktop CLS ~0.7 (Lighthouse): card heights change when the previous-period file loads / on regulation switch (snapshot, usage re-render). Reserve card heights.
- Mobile performance is low (Lighthouse mobile perf under 10 headless/throttled; main-thread work decoding ~9 MB data). Profile `data.js` decode.
- Owner: disable Cloudflare Pages Web Analytics (the injected beacon is blocked by the CSP and logs a console error).
- No section-by-section design review done (full-page screenshots in qa-output/ are too tall); slice with `scripts/slice-shots.mjs`.
- Minor axe: `empty-table-header` (usage table).
