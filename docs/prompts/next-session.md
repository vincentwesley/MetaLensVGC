Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, live at https://metalensvgc.pages.dev).
Handover written 2026-10-01. The project is **feature-complete and in maintenance mode**: everything is live, tests are
green, no open issues, and the data refreshes itself weekly. Only do what the owner asks in this session; the sections
below say what state things are in and what typically needs doing.

## Before anything
1. Local clone: `C:\Coding Projects\VGCMetaScope` (folder keeps the old name). `git pull --rebase` first: the weekly bot
   (`metalensvgc-bot`, "chore: refresh data") pushes to the same branch.
2. Read `CLAUDE.md` in full (hard rules, "Where the data is (and isn't)", "Chip semantics", "Invariants learned the hard
   way", "Working in a cloud session") and `docs/TESTING.md` (coverage ledger + "Not yet tested"). Don't re-verify what
   the ledger covers unless its code changed. Don't edit `.claude/settings.json`, `.gitattributes` or the graphify /
   skill-trigger parts of `CLAUDE.md`; the owner maintains those.

## How to work here
- **One branch**: `claude/pokemon-vgc-metagame-dashboard-9whe1a` is the repo's default branch and Cloudflare Pages'
  production branch. There is no `main`. Commit in logical steps and push to it (that deploys); no PR unless asked.
- **Ground rules**: real data only, never invented or "calibrated" numbers. Never blank a chart or card: when nothing
  clears a minimum sample, show the real smaller samples flagged "low sample" / "includes n < N"; an empty state only when
  there is truly nothing, worded with what is missing (never "Insufficient data"). Champions builds are Stat Points
  (66 total, max 32 per stat) + nature, Mega instead of Tera; all stat math through `js/lib/stats.js`. In-game ranked data
  (championsbattledata.com) needs attribution, publishes ranks (never a usage % from it) and must not be redistributed.
- **Owner preferences**: Claude orchestrates and reviews; coding goes to sonnet subagents, test runs/sweeps to haiku
  (sonnet for sweeps that must measure), with self-contained briefs. Review every diff and re-run the tests yourself
  before committing. Every bug fix gets a regression test (unit if pure logic, `e2e/app.spec.js` if it needs a browser).
  After a non-trivial change run `code-review` (low) before pushing. Defaults: Pro skin, dark theme, green palettes,
  "Made by Vin" credits.
- **Tests**: `npm test` (155 unit) and the browser suite (52 checks): `npm run e2e:cloud` in a cloud session; on the
  owner's Windows machine `E2E_OFFLINE=1 npx playwright test e2e/app.spec.js --workers=2 --timeout=120000` (slow box).
  Never kill all `node.exe` on Windows (it takes down MCP servers); kill the PID you started.

## Current state (2026-10-01)
- Live branch tip `ba3b610` (+ any later bot data commits). Sections, modules and invariants are in `CLAUDE.md`.
- Recent work, all live: weekly refresh hardening + failure alert + stale-data notice; smoke-pass fixes (NEW vs +pt,
  idle CPU, contrast, hints, aria); UX (section nav, tips strip, loading cue); Spread explorer (deep dive) + scanner SP
  check; cross-filters never blank; motion budget; Meta by country; Archetype share by week; Library "Filter" scans the
  team; leaderboard search + Change column; Copy link; scanner cards never say "Insufficient data" after a scan.
- **Weekly refresh** (`.github/workflows/refresh-data.yml`, Mondays 06:00 UTC + manual "Run workflow"): verified twice
  by hand (latest run 36710957061, 2026-09-30, success in 17.5 min with the restored `data-raw` cache; data commit
  touched only `public/data`). On any failure it opens/comments the GitHub issue "Weekly data refresh failed" (run link,
  failing step, log tail) and commits nothing, so the site keeps the last good data; the next success closes the issue.
  The site shows a "data may be out of date" notice when `manifest.generated` is over 10 days old.
  GitHub issue search via MCP 422s on this repo (renamed from VGCMetaScope); list issues instead, or use `gh`.

## Open items (none block "done")
1. **First scheduled run**: Monday 2026-10-05 06:00 UTC is the first time the cron itself fires (all runs so far were
   manual). Check it ran and succeeded (`gh run list -R vincentwesley/MetaLensVGC --workflow refresh-data.yml`).
2. **Smogon M-C month**: expected early October; picked up automatically. Once `ladder-M-C.json` has months, check
   Ladder mode on M-C, Teammate rate "Ladder (Smogon)", the Spread explorer's Smogon option and the scanner's speed
   position.
3. **Next regulation** (M-C ends 2026-12-02): when it's announced, add it to `scripts/lib/regs.js` (window), `SUFFIX`
   in `scripts/sources/ladder.js` (Smogon file suffix) and `current` in `scripts/build-data.js`, then run the workflow.
   Until then the updater keeps working but skips the new regulation's ranked seasons (`reg: null`, warned).
4. Optional: regenerate the committed `screenshots/*.png` with `npm run shot` on a machine with internet (they predate
   the latest features); real-device checks from "Not yet tested" in `docs/TESTING.md`; delete the merged branch
   `claude/ecstatic-babbage-wl3cor` if the owner agrees.

When you finish a piece of work, update `CLAUDE.md` (status, modules, invariants) and `docs/TESTING.md`, then report:
found, fixed/built (with commits), tested and fine, left open with reasons.
