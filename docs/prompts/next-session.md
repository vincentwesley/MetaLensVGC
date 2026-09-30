Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`,
live at https://metalensvgc.pages.dev). This is a handover from a local (Windows) session, 2026-09-30.

First `git pull`, then read `CLAUDE.md` in full (especially "Where the data is (and isn't)", "Chip semantics",
"Invariants learned the hard way", "Working in a cloud session") and `docs/TESTING.md` (coverage ledger + "Not yet
tested"). Don't re-verify what the ledger covers unless its code changed.

Ground rules: real data only (show "Insufficient data" + sample instead of inventing numbers); Champions builds are Stat
Points (66 total, max 32 per stat) + nature, Mega instead of Tera, all stat math via `js/lib/stats.js`; in-game ranked data
needs attribution, publishes ranks (never a usage % from it) and must not be redistributed as a data service. Orchestrate:
coding to sonnet subagents, sweeps/test runs to haiku (use sonnet for sweeps that must measure things; a haiku sweep once
reported PASS without measuring), self-contained briefs; review their diffs and re-run `npm test` + `npm run e2e:cloud`
yourself before committing. Commit in logical steps and push to this branch (it deploys; no PR). Every bug fix gets a
regression test.

## What happened in the local session (2026-09-29/30, all pushed)
1. **Weekly refresh**: verified end to end on GitHub (run 36573679607, 45.5 min from an empty cache; data commit touched
   only public/data and rebased over concurrent pushes). Failure alert: any failed step opens/comments the issue "Weekly
   data refresh failed" (run link, step, log tail); the next success closes it (tested via a temporary simulate_failure
   input, issue #1, since removed). Build step timeout 300 min < job 350 so a hang still alerts. `data-raw/` cached.
   Ranked seasons outside every regulation are skipped (`reg: null`) instead of failing the run. Site shows a stale-data
   notice when `manifest.generated` is > 10 days old.
2. **Smoke pass fixes**: "NEW" instead of "+54.7pt" for Pokémon absent / under min-n in the previous period
   (`changeVsPrev`, one rule for snapshot, shift table, movers); idle CPU at 4x throttle ~100% -> 7-9% (credits
   animations pause off-screen, pixel field is a 10 fps timer with a cached blob layer); contrast >= 4.5:1 everywhere
   (`--up/--down/--warn/--pill-*`, `inkOn()`); click hints hide over empty states; scanner hint + gibberish rejection;
   chart aria-labels without NaN; Items wording under Ladder M-C.
3. **UX**: sticky section jump nav (`ui/secnav.js`), first-visit tips strip, `aria-busy` cue on sections catching up,
   one "Change vs M-B (prev n=...)" line under the snapshot cards, hyphen-only Mega name breaks, quadrant corner labels.
4. **Spread explorer** (merged 2026-09-30, commits a6a2109 + a096c57): `lib/spreads.js`, the deep dive's "Spread explorer"
   card and the scanner's "SP check" card (see CLAUDE.md status). Rejected: a separate stat-benchmark section (the Speed
   section already has Tailwind/Scarf/TR), player lookup (library search covers it), per-Pokémon counters / Mega matchups
   from match results (team-level results confound them; Smogon counters are empty).

State: 141 unit tests, 39 e2e checks (one flaky, below). Weekly run next fires Monday 2026-10-05 06:00 UTC.

## Next, in order
1. **Flaky e2e**: "chart tooltips and [data-tip] tips stay inside the viewport on a phone" fails intermittently (3 of 5
   runs on the slow Windows box, predates the Spread explorer). Root-cause (likely a wait/timing issue in the test, not a
   real overflow) and fix; run it 5x to confirm.
2. **Smogon M-C month** (early October): after the Monday run, check `ladder-M-C.json` has months and that Ladder mode,
   Teammate rate (ladder), and the Spread explorer's Smogon option light up for M-C. If the weekly run fails, the issue
   alert says why.
3. **Spread explorer polish** (look at it on the live site first): rows are stacked blocks, not a table (drawer is
   ~450px); benchmark line is repeated per row; the "Shift M-A -> M-B" wording; consider a compact archetype bar.
4. **Owner calls pending** (ask, don't decide): item shares whole % vs usage one decimal; sprite sizes 20-56px across
   sections; per-country meta section (92% of M-C teams have a country, needs a new chip kind); archetype share trend
   over the regulation.
5. Remaining "Not yet tested" items in docs/TESTING.md (real devices / screen readers / real zoom).

When done, update `CLAUDE.md` (status, modules, invariants) and `docs/TESTING.md`, then report: found, fixed/built (with
commits), tested and fine, left open with reasons.
