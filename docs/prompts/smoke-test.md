Full smoke test + edge-case pass on VGC MetaScope (branch `claude/pokemon-vgc-metagame-dashboard-9whe1a`).

Before anything else, read `CLAUDE.md` (especially "Chip semantics" and "Working in a cloud session") and `docs/TESTING.md`. The **Coverage ledger** there lists what is already verified. Don't re-test those items unless the code they cover has changed since. Work from the **"Not yet tested"** list and add anything you find along the way.

Goals, in this order:
1. **Find real bugs**: console/page errors, wrong numbers, filters that don't narrow what they claim to, states that break, "Insufficient data" where there should be data (or vice versa), and races between clicks and rendering. Look beyond the listed cases for the same *class* of bug. Recent examples: tooltips crashing on hover and swallowing clicks, a chart adding the wrong chip kind, a chart ignoring filters, a data file cached across deploys, a workflow push race.
2. **UI/UX problems**: tooltips going off-screen (set ECharts `confine: true` or equivalent everywhere it's needed, including custom tooltips and phone widths), overflow and clipping, unreadable contrast, unclear labels, missing hover/focus states, keyboard and screen-reader gaps, awkward mobile layouts, controls that are hard to find.
3. **Fix what you find**, at the root and in the shared code path (filter engine, `main.js` wrappers, shared CSS) rather than per chart. Add a regression test for every bug: unit where it's pure logic, `e2e/app.spec.js` where it needs a browser.

How to work:
- Use `npm test` and `npm run e2e:cloud` (preinstalled Chromium, third-party hosts stubbed). For exploratory probes, write throwaway Playwright scripts at the repo root and delete them after. Visually review screenshots of what you change at 1440px and 390px, in Pro and Retro, dark and light. Never commit the `screenshots/` shots taken offline.
- Orchestrate. Hand broad sweeps (hover/click/keyboard/viewport matrices, hash fuzzing) to `haiku` subagents and fixes to `sonnet` subagents, with self-contained briefs. Review their diffs and re-run the tests yourself before committing.
- Commit in logical steps and push to this branch. Don't open a PR. Use real data only; never invent numbers.
- When done, update `docs/TESTING.md`: move what you verified into the Coverage ledger, with how it was verified, and keep "Not yet tested" honest. Then give me a short report covering what you found, what you fixed (with commits), what you tested and found fine, and anything left open with the reason.
