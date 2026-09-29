Continue work on **MetaLens VGC** (repo `vincentwesley/MetaLensVGC`, branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`, live at https://metalensvgc.pages.dev).

First read `CLAUDE.md` in full (especially "Where the data is (and isn't)", "Chip semantics", "Invariants learned the hard way" and "Working in a cloud session") and `docs/TESTING.md` (the coverage ledger and "Not yet tested"). Don't re-verify what the ledger already covers unless its code has changed.

Ground rules (from CLAUDE.md, repeated because they matter most):
- Real data only; never invent or "calibrate" numbers. Show "Insufficient data" and the sample size instead.
- Pokémon Champions has **no EVs/IVs and no Tera**: builds are Stat Points (66 total, max 32 per stat) + nature, and Mega Evolution. Use `js/lib/stats.js` for all stat math.
- In-game ranked data needs attribution, publishes ranks (never show a usage % from it) and must not be redistributed as a data service.
- Orchestrate: hand broad sweeps / test runs to `haiku` subagents and coding to `sonnet` subagents with self-contained briefs; review their diffs and re-run the tests yourself before committing.
- Commit in logical steps and push to this branch (it is the default branch; Cloudflare deploys from it). No PR.
- Every bug fixed gets a regression test (unit if pure logic, `e2e/app.spec.js` if it needs a browser). Keep `npm test` and `npm run e2e:cloud` green.

Work through these in order and report after each:

## 1. Make sure the weekly data refresh works
`.github/workflows/refresh-data.yml` (Mondays 06:00 UTC + manual dispatch). Its only run so far failed at the push (a race, since fixed with rebase + retries); the fixed version has never run on GitHub.
- Check the latest runs (GitHub MCP tools: `actions_list` / `get_job_logs`). If a run failed, root-cause it from the logs, fix it, and ask me to trigger "Run workflow" (or trigger it if you can).
- Review the pipeline for things that break on a real schedule: the 350-minute timeout vs how long `npm run data` really takes from an empty `data-raw/` cache, rate limits / blocked hosts from GitHub's runners, schema validation failing the whole run, what happens when Smogon publishes the M-C month (early October) or a new ranked season or regulation appears, and the data commit touching only `public/data`.
- If this sandbox can reach the data hosts, run `npm run data` once to measure it; if not, say so and reason from the code.
- **Add a failure fallback so I find out when it breaks:**
  - On any failed step, the workflow opens (or comments on) a GitHub issue titled e.g. "Weekly data refresh failed", with the run link and the failing step's last log lines. Use `actions/github-script` with the built-in `GITHUB_TOKEN` (`issues: write`), no new secrets. GitHub then emails and pushes the issue to me, the repo owner. A later successful run closes that issue with a comment.
  - The site keeps serving the last good data, because nothing is committed on failure. Verify this stays true.
  - Add a small "data may be out of date" notice on the site when `manifest.generated` is older than ~10 days, so visitors (and I) can see a stale refresh.
  - Test the failure path: temporarily make a step fail on a throwaway branch or with a `workflow_dispatch` input like `simulate_failure`, confirm the issue appears, then remove the test trigger.
- Document the outcome (and anything I need to do in GitHub settings, e.g. notification preferences) in README and `docs/TESTING.md`.

## 2. Full smoke test and edge cases
Follow `docs/prompts/smoke-test.md`, focusing on what changed since the last pass (listed under "UX round" in `docs/TESTING.md`): the two type charts, click hints, Teammate rate, the scanner's evidence cards and two-column layout, green palettes in all four skin/theme combos, the background pixel field (CPU cost with 4x throttling, pausing while rendering, reduced motion, mobile), the credits card, and the removal of the old-domain redirect. Also check this oddity seen on the live page: the Meta Snapshot shows "Rillaboom +54.7pt vs M-B". If a Pokémon wasn't legal (or wasn't used) in the previous regulation, the change should read "NEW" rather than a +pt jump from 0; check how `prev` handles Pokémon that are new to the regulation, in every section that shows a change. Look for the same classes of bug as before: NaN/undefined in text or tooltips, filters that don't narrow what they claim, a chart whose click doesn't match what it plots, empty panels where data exists, overflow at 390px, contrast.

## 3. UI/UX improvements
Propose, then implement, the highest-value improvements. Starting ideas (verify each against the real page first):
- Onboarding: a short "how to use" strip or first-visit hint (click anything to filter, shift-click to exclude, paste a team in the scanner).
- Section navigation (sticky mini-nav / jump links); the page is long.
- Loading states while a section catches up; empty states that say what to change.
- Mobile: chart heights, tap targets, the sticky bar height, the scanner on phones.
- Consistency pass: card headers, meta lines, hint lines, number formatting, sprite sizes.
Screenshot every change at 1440px and 390px in Pro and Retro, dark and light, and look at them. Keep the owner's decisions in CLAUDE.md (Pro + dark defaults, green palettes, "Made by Vin" credits, type clicks = plain type filter).

## 4. Stat Point (SP) spread analysis and new sections
Champions has no EVs/IVs; the equivalent is the SP spread + nature. Team sheets carry no spreads; spreads come from the in-game ranked data (natures and spreads as separate distributions, all regulations) and Smogon (joint nature+spread, M-A/M-B only until the M-C month is out). Read `public/data/SCHEMA.md` first and design around what really exists.
Candidates (pick the ones the data supports, explain what you rejected and why):
- **Spread explorer** (in the deep dive or a new section): a species' most common SP spreads and natures with their share and source, final Lv50 stats for each, and what each spread is built for (speed benchmarks it outspeeds / underspeeds, bulk investment), with the M-B vs M-C shift.
- **Stat benchmarks:** "who outspeeds whom" at common spreads, under Tailwind / Trick Room / Scarf (reuse the Speed section's `metaSpeed()`).
- **Spread archetypes:** e.g. max Speed vs bulky vs Trick Room (0 Speed, -Spe nature) share per species.
- **Scanner:** compare the pasted SP line to the common spreads for each Pokémon and flag outliers.
- Other useful sections backed by real data: Mega usage and Mega matchups, counters/checks per Pokémon from match results, tournament/event browser and player lookup, per-country / per-tier meta differences, archetype trends over the regulation.
Every new chart follows the cross-filter rule (its click adds the chip kind matching what it plots), has a `clickHint`, a source/sample/updated meta line, "Insufficient data" states, tests, and a TESTING.md ledger entry.

When done, update `CLAUDE.md` (status, new modules, invariants) and `docs/TESTING.md`, then give me a short report: what you found, what you fixed or built (with commits), what you tested and found fine, and anything left open with the reason.
