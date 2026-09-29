Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`, live at https://metalensvgc.pages.dev).

First read `CLAUDE.md` in full (especially "Where the data is (and isn't)", "Chip semantics", "Invariants learned the hard way")
and `docs/TESTING.md` (coverage ledger + "Not yet tested"). Don't re-verify what the ledger covers unless its code changed.

Ground rules: real data only (show "Insufficient data" + sample instead of inventing numbers); Champions builds are Stat
Points (66 total, max 32 per stat) + nature, Mega instead of Tera, all stat math via `js/lib/stats.js`; in-game ranked data
needs attribution, publishes ranks (never a usage % from it) and must not be redistributed as a data service. Orchestrate:
coding to sonnet subagents, sweeps/test runs to haiku, with self-contained briefs; review their diffs and re-run the tests
yourself before committing. Commit in logical steps and push to this branch (no PR). Every bug fix gets a regression test.

Done on 2026-09-29 (see git log): weekly refresh verified on GitHub with a failure-issue alert and a stale-data notice;
second smoke pass (NEW vs +pt, idle CPU, contrast, hints, aria); UX round (section nav, tips strip, loading cue, snapshot tidy).

Next, in order:

1. **Resume step 4 from branch `wip/sp-spread-explorer`** (parked mid-way, unreviewed, untested). It adds `lib/spreads.js`
   (SP archetypes: No Speed / Max Speed / Bulk-heavy / Offense / Other, ranked vs Smogon spread rows with Lv50 stats,
   archetype shares with coverage, speed benchmarks against the view's top-30 `metaSpeed()`, nearest spread), a
   "Spread explorer" card in the deep dive (source toggle ranked season / Smogon month when present, archetype strip,
   previous-regulation shift, meta line with source/sample/attribution) and a scanner "SP check" card. Review the diff
   against those goals, finish the unit + e2e tests, screenshot at 1440/390 in Pro and Retro, dark and light, then merge
   into this branch and delete the WIP branch. Ranked natures are a separate distribution: stats for ranked rows use the
   most common nature and must say so.
2. When Smogon publishes the M-C month (early October), check the weekly run picked it up (ladder-M-C.json months) and
   that Ladder mode, Teammate rate and the Spread explorer's Smogon option light up for M-C.
3. Candidates rejected or deferred last time (reconsider only with a reason): per-country meta (92% of M-C teams have a
   country, but it needs a new chip kind); archetype share trends over the regulation; consistency items left for the
   owner (item shares whole % vs usage one decimal; sprite sizes 20-56px across sections).

When done, update `CLAUDE.md` (status, modules, invariants) and `docs/TESTING.md`, then give a short report: found,
fixed/built (with commits), tested and fine, left open with reasons.
