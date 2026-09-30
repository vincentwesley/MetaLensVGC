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

## Done in the last session (2026-09-30, all pushed)
- Flaky phone-tooltip e2e: a real bug. `ui/tip.js` hid a hovered `[data-tip]` tip on any scroll event, including the section
  nav re-centring itself sideways. Now unrelated scrollers are ignored (88e2d0e, regression e2e).
- Smogon M-C month readiness: the M-C explorer e2e expects the Smogon toggle only when `ladder-M-C.json` has months; a new
  e2e simulates the month (M-B file served as M-C) and checks Ladder mode, Teammate rate and the explorer (8fbe824).
- Spread explorer polish (3bcfb3c): stacked spread-type bar + legend, ranked natures shown once, SP column header, per-row
  share bar, `* Nature` assumption marker, "Change from M-B to M-C" / "NEW in M-C" wording.
- Owner added the Claude Code web setup (plugins, graphify hooks, skill triggers): ff8981c, 32182ba.

State: 141 unit tests, 41 e2e checks, all green. The weekly refresh runs Mondays 06:00 UTC.

## Next, in order (report after each)
0. **Check the session setup**: list your available skills and say which of frontend-design, modern-web-guidance,
   typescript-lsp, context7 and ponytail loaded, and whether `graphify-out/` exists (graph built). Report, don't fix
   `.claude/settings.json` yourself.
1. **Weekly refresh + Smogon M-C month** (if it's 2026-10-05 08:00 UTC or later): check the latest "Refresh data" run
   (GitHub MCP `actions_list` / `get_job_logs`) and any open "Weekly data refresh failed" issue. If `public/data/ladder-M-C.json`
   now has months, verify on the real data: Ladder mode on M-C, Teammate rate says "Ladder (Smogon)" under Source = Ladder,
   the deep dive's Spread explorer offers the Smogon option for M-C, and the scanner's speed position still works. If Smogon
   hasn't published yet, say so. Before that date, skip to step 2 and come back to this at the end if time allows.
2. **UI/UX improvements** (owner's ask): tasteful transition animations and visual additions that aren't overwhelming.
   Look at the real page first (1440 and 390, Pro + Retro, dark + light; `node scripts/slice-shots.mjs`), then propose a
   short list and implement the best ones. Ideas to verify, not a spec: section fade/slide-in on first reveal; smooth number
   changes in KPI tiles and leaderboard bars after a filter click; chip add/remove transitions; drawer open/close easing;
   hover lift on cards/rows; skeleton shimmer while a section is `aria-busy`; a small visual touch per section header.
   Rules: animate only opacity/transform, everything off under `prefers-reduced-motion`, nothing may delay the render after
   a click (see the rendering invariants and the 4x-throttle numbers in TESTING.md), no layout shift, keep contrast tests
   green. Screenshot before/after and send them.
3. **Owner calls pending: ask, don't decide.** Item shares as whole % vs usage with one decimal; sprite sizes vary 20-56px
   across sections (unify?); a per-country meta section (92% of M-C teams have a country; needs a new chip kind); an
   archetype share trend over the regulation.
4. Remaining "Not yet tested" items in `docs/TESTING.md` that a cloud session can cover.

When done, update `CLAUDE.md` (status, modules, invariants; leave the owner's sections alone) and `docs/TESTING.md`, then
report: found, fixed/built (with commits), tested and fine, left open with reasons.
