Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`,
live at https://metalensvgc.pages.dev). Handover from a cloud session, 2026-09-30.

First `git pull --rebase`, then read `CLAUDE.md` in full (especially "Where the data is (and isn't)", "Chip semantics",
"Invariants learned the hard way", "Working in a cloud session", "Skill triggers") and `docs/TESTING.md` (coverage ledger +
"Not yet tested"). Don't re-verify what the ledger covers unless its code changed. Don't edit `.claude/settings.json`,
`.gitattributes` or the graphify / skill-trigger parts of `CLAUDE.md`; the owner maintains those.

Ground rules: real data only (show "Insufficient data" + sample instead of inventing numbers); Champions builds are Stat
Points (66 total, max 32 per stat) + nature, Mega instead of Tera, all stat math via `js/lib/stats.js`; in-game ranked data
needs attribution, publishes ranks (never a usage % from it) and must not be redistributed as a data service. Orchestrate:
coding to sonnet subagents, sweeps/test runs to haiku (sonnet for sweeps that must measure things), self-contained briefs;
review their diffs and re-run `npm test` + `npm run e2e:cloud` yourself before committing. `git pull --rebase` before each
commit (the owner and the weekly bot push to this branch too). Commit in logical steps and push (it deploys; no PR). Every
bug fix gets a regression test.

## Done in the last session (2026-09-30, second cloud session; all pushed to the live branch)
- Cross-filters never blank a chart: `atMinN()` + "includes n < N" on the meta line; the quadrant plots one Pokémon.
- Motion: drawer eases open and slides out, bars grow, skin/theme cross-fade, fireflies on the snapshot leader and on a
  newly added chip, scroll-progress hairline. Then an audit trimmed it to a motion budget (CLAUDE.md), guarded by an
  e2e allowlist. Chips no longer re-pop on every state change.
- Owner calls, decided by Claude on the owner's request ("just do it"): item shares one decimal (never "0%"); sprite
  scale 24/32/48/96; "Archetype share by week" (+ archetype colours follow the archetype); "Meta by country" section +
  Country chip.
- Fixes found on the way: Retro archetype table hid its numbers; slice-shots captured mid-render; grid sections grew to
  fit wide tables on phones.

State: 148 unit tests, 47 e2e checks, all green.

## IN PROGRESS when the last session stopped (2026-09-30, third batch) — finish this first
Branch `claude/ecstatic-babbage-wl3cor` holds a WIP commit on top of the live branch (NOT pushed live yet).
Built (owner's asks + extras):
- Library "Filter" now also loads that team into the Scanner and scans it (`ctx.scan` in main.js -> scanner `api.load`),
  toast with a "View scan" action (`toast(msg, { action })`). Scanner compares against `view.field` = current filters
  minus team chips (a team chip would otherwise make it compare the team with itself).
- Leaderboard search box (`toID` matching, "/" focuses it, Escape clears, searches all rows, keeps the real usage rank);
  Items search uses the same matcher.
- Leaderboard "Change" column (tournaments, when a previous period exists; `changeVsPrev`, sortable); `usage` added to
  main.js `PREV_USERS`; `prevLabel(view)` moved from snapshot.js to ui/meta.js.
- "Copy link" button next to Hide (copies the URL = the whole view); `ui/clipboard.js#copyText` shared by library,
  scanner, filterbar.
- Team chips named "Player · Event" via `ctx.teamLabel` (was the raw id); `lastView` in main.js now declared before ctx.
- Fix: `changeText` showed "▼ -0.0pt" for tiny drops; new `changeDir(change)` ('up'|'down'|'flat', as shown) drives
  arrows and colours in changeText, the leaderboard column and the snapshot cards.
State: `npm test` passed (148) before the last cleanup; e2e passed (49) before the simplify fixes (shared copyText in
scanner, changeDir, usageRank Map, chips labelFor(chip, ctx.teamLabel), lastView move).
To do, in order:
1. Add the `changeDir` unit test to test/ui-helpers.test.js (import changeDir; NEW -> up, 0.3 -> up, -0.04 -> flat,
   -2 -> down). Run `npm test` and `npm run e2e:cloud`; fix anything red.
2. Run `code-review` (low). Update CLAUDE.md (view.field, ctx.scan, ctx.teamLabel, changeDir, Copy link, "/" shortcut,
   PREV_USERS incl. usage, ui/clipboard.js) and docs/TESTING.md (e2e count 49, the two new checks).
3. Push to the live branch: `git push origin HEAD:claude/pokemon-vgc-metagame-dashboard-9whe1a`.
4. **Updater** (owner asked to make sure it works): the "Refresh data" workflow last ran 2026-09-29 (run 36573679607,
   success, 45 min, manual). It has never run on its cron yet (first: Mon 2026-10-05 06:00 UTC). Pipeline code
   (scripts/, lib/names.js) is unchanged since that success; ladder.js already maps M-C to `...regmc...`, so the Smogon
   M-C month is picked up when published. Remaining check: trigger it once manually (GitHub MCP
   `actions_run_trigger` run_workflow, workflow `refresh-data.yml`, ref = live branch) after step 3, confirm success
   (~45 min) and that its data commit rebased cleanly; after 2026-10-05 confirm the scheduled run fired.
   Note: GitHub issue search 422s on this repo name via MCP (repo renamed to MetaLensVGC); check issues by listing.

## Next, in order (report after each)
0. **Check the session setup**: list your skills; say whether graphify built its graph. Report, don't fix settings.
1. **Weekly refresh + Smogon M-C month** (2026-10-05 08:00 UTC or later): check the latest "Refresh data" run and any
   open "Weekly data refresh failed" issue. If `ladder-M-C.json` has months: verify Ladder mode on M-C, Teammate rate
   "Ladder (Smogon)", the Spread explorer's Smogon option, the scanner's speed position. Else say Smogon hasn't published.
2. **Real-network look** (needs sprites + fonts, so a machine with internet or `npm run shot`): the 96 px hero sprites,
   24 px chip sprites, fireflies around a real sprite, the country table with real sprites. Regenerate the committed
   screenshots with `npm run shot` there.
3. Remaining "Not yet tested" items in `docs/TESTING.md`.

When done, update `CLAUDE.md` (status, modules, invariants; leave the owner's sections alone) and `docs/TESTING.md`, then
report: found, fixed/built (with commits), tested and fine, left open with reasons.
