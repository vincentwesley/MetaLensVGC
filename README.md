# MetaLens VGC

An interactive, cross-filtering metagame dashboard for **Pokémon Champions, the VGC 2026 format**
(regulations M-A, M-B and M-C). It's a free static site built for Cloudflare Pages at
**https://metalensvgc.pages.dev**.

Every number on the site is aggregated in your browser from real tournament team sheets and ladder
statistics fetched by the data pipeline in `scripts/`. Nothing is invented or "calibrated". When a
filter leaves too little data, the widget says **Insufficient data** instead of guessing.

## Features

- **Global filter bar** (sticky): regulation (M-A / M-B / M-C, defaults to the current one), source
  (Tournaments / Smogon Ladder / Ranked in-game), event tier (Worlds / Internationals / Regionals / Online), placement
  (All / Top Cut / Top 8 / Winners), date range and a minimum-sample slider.
- **Cross-filtering everywhere.** Click a Pokémon, type, archetype, item, move, Mega, core or team
  to add a filter chip, and every chart recomputes. Type, item and move chips describe a Pokémon:
  with **Electric** selected, the leaderboard, types, items, speed tiers and trends count only Electric
  Pokémon (and "Electric + Life Orb" means an Electric Pokémon holding Life Orb), while teammates,
  archetypes and the team library show those whole teams. Pokémon, core, Mega, archetype and team
  chips pick teams; an archetype chip means teams whose main archetype it is (the donut slice you clicked).
  **Shift-click or Alt-click** excludes instead ("teams without X"). You can remove chips one by one
  or clear them all.
- **Shareable state.** All filters, chips, the skin and the theme live in the URL hash.
- **Hover links.** Hovering a Pokémon highlights it across charts.
- **Sections**
  - Meta Snapshot
  - Usage leaderboard with 95% Wilson intervals
  - Type landscape: type usage, and which move types the field is weak to, by real multiplier (4×, 2×, ½×, ¼×, 0×)
  - Item usage: which held items the field runs (share of teams, win rate, who holds them; Mega Stones
    optional) and the most common items for every Pokémon, searchable. The leaderboard also shows each
    Pokémon's top item under its name. Hand-typed sheet spellings ("focus sash", "U-Turn", "None") are
    normalized to dex names when the data loads.
  - Archetypes: classification, split, and a matchup heatmap built from real pairings
  - Usage vs. win-rate quadrant
  - Teammate co-usage (raw % / lift), top cores, and teammate rate for any Pokémon
  - Speed tier matrix with Tailwind, Scarf, ±1, paralysis and Trick Room toggles, plus a
    "my Pokémon" benchmark
  - Weekly trends with a brush that drives the date filter, risers and fallers, and the regulation shift
  - Team Sheet Library with one-click Showdown paste copy
  - My Team Scanner: paste a team to see its weaknesses, unanswered threats and speed position, plus
    evidence from real matches of similar teams: best and worst matchups (Pokémon and archetypes),
    an item check (with item clause), common teammate picks and the weakest link
  - Pokémon deep-dive drawer
  - Credits (made by Vin: vwesley.dev, Instagram @vinnql, X @Vin_Koe)
  - Data & methodology, with JSON/CSV download
- **Two skins, green palettes:** Pro (default: JetBrains Mono and Inter, the palette of vwesley.dev) and Retro
  (Press Start 2P, Silkscreen, VT323, CRT scanlines, pixel borders, Game Boy greens). Each comes in light and dark;
  dark is the default. A faint animated pixel field sits behind the page (still under reduced motion).
- **Every chart says what a click does** in a one-line hint under it.
  The layout is responsive down to 390px.
- **Active filters always visible.** Chips sit in a highlighted bar pinned under the filter bar, with a count and
  a Clear all button, so you always know what the page is filtered by.
- **Collapsible filter bar.** "▲ Hide" (or the **F** key) folds the filters and the header settings
  into a one-line summary; the choice is remembered per browser. Small screens start collapsed.

## Champions mechanics used

- **No Tera.** Mega Evolution is the gimmick, so the Mega choice appears where a Tera widget would
  normally go.
- **Stat Points (SP) replace EVs/IVs.** Each Pokémon gets 66 SP, with at most 32 in one stat. At Level 50:
  - HP = base + 75 + SP
  - every other stat = floor((base + 20 + SP) × nature), where nature is 1.1, 1.0 or 0.9
  - This is implemented and unit-tested in `public/js/lib/stats.js`. For example, Jolly Garchomp
    with 32 Speed SP has 169 Speed.
- **Usage is keyed by display form.** A Pokémon holding its own Mega Stone counts as the Mega form
  (`Charizard-Mega-Y`, `Floette-Mega`, …), the same way Smogon and Pikalytics count it. Gendered and
  regional forms stay distinct (`Basculegion` / `Basculegion-F`, `Indeedee` / `Indeedee-F`,
  `Floette-Eternal` / `Floette-Mega`).

## Data sources

| Source | Used for | Notes |
|---|---|---|
| [Limitless Play API](https://play.limitlesstcg.com) (`/api/tournaments`, `/standings`, `/pairings`) | Online tournament teams (open team lists), W-L records, top cut, match results | Formats `M-A`, `M-B`, `M-C`. Public API with a 50 requests / 5 min limit |
| [Limitless VGC](https://limitlessvgc.com) + [standings.limitlessvgc.com](https://standings.limitlessvgc.com) | Official events (Regionals, Special Events, Internationals, Worlds): published team lists, records, top cut, pairings | RK9 team lists are disallowed by RK9's robots.txt, so RK9 is not used |
| [Smogon usage stats](https://www.smogon.com/stats) (chaos JSON, `gen9championsvgc2026reg{ma,mb,mc}-1760`) | "Ladder" source: usage, items, abilities, moves, SP spreads, teammates | Kept separate from tournament data. Cutoff 1760, non-Bo3 ladder |
| [Pokémon Champions Battle Data](https://championsbattledata.com/) (`/api`, `/api/battle/Doubles/<id>?season=`) | "Ranked (in-game)" source: the official in-game ranked ladder's Battle Data (usage rank, and per-Pokémon moves, items, abilities, natures, SP spreads, teammate order) | Doubles only, last snapshot of each in-game season (M1–M2 = M-A, M3–M5 = M-B, M6 = M-C). The game publishes ranks, not usage shares, so none are shown. **Battle data provided by Pokémon Champions Battle Data**, used under its [API rules](https://championsbattledata.com/api-rules/) (attribution; no redistribution as a data service) |
| [`pokemon-showdown`](https://www.npmjs.com/package/pokemon-showdown) npm package (`champions` mod) | Dex: types, base stats, abilities, move data, Mega Stones | Covers every Champions and Z-A Mega, so no override table was needed |
| [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/) | gen5 sprites, plus gen5ani/ani animated sprites | Availability is resolved at build time, so the browser never requests missing sprites |

The data belongs to its sources and the sprites belong to Pokémon Showdown and their artists. This
repository's code is MIT-licensed. MetaLens VGC is a fan project and is not affiliated with
Nintendo, Game Freak, Creatures or The Pokémon Company.

## Decisions and known gaps

Decisions made while building, and the gaps they leave:

- **Which online events count.** A Limitless Play tournament is included when it has ≥16 players,
  open decklists, and its date falls inside the regulation's window. The regulation is decided by
  date, not by the organizer's format label, so events tagged with the wrong format are dropped.
  Events less than 48 hours old are skipped as possibly still running. Events from the last 7 days
  are refetched on every run.
- **Official events** come from limitlessvgc.com: Indianapolis, Turin and NAIC (M-A), Worlds (M-B), and Baltimore,
  Frankfurt and Brisbane (M-C). Records, top cut and pairings come from the standings pages on
  standings.limitlessvgc.com. RK9 is not used because its robots.txt disallows the team-list pages.
- **Tiers.** Special Events and Japanese events count as *Regionals*. NAIC counts as an *International*.
- **Top cut.** Online top cut is the set of players in bracket (phase ≥ 2) pairings. Official top cut
  comes from the standings' top-cut flags. When the cut is unknown, top 8 counts as top cut.
- **Win rates** come from each team's standings record (W-L-T). Matchup cells come from real
  pairings where both players have a team sheet in the data.
- **No Stat Points from tournaments.** Limitless doesn't publish SP spreads, so no tournament team
  has one. Spread and speed data comes from the Smogon 1760 ladder where it exists. Otherwise the
  site shows theoretical min–max speeds, labelled as such.
- **Ladder gaps.** Smogon's "Checks and Counters" tables are empty for these formats, so that widget
  shows an explicit empty state. M-C has no ladder month published yet, so the Ladder source is
  unavailable for M-C.
- **Mega keying.** A Pokémon holding its own Mega Stone counts as the Mega form. A few sheets list two
  Mega Stones; every one of them is counted (`team.megas`).
- **Indeedee.** A few official-event team lists give plain "Indeedee" with no gender. These are
  counted as `Indeedee-F`, since the female form is the one played in doubles. Online Limitless sheets
  are taken as listed.
- **Archetypes** are rule-based: each archetype's rules live in `public/js/lib/archetypes.js`.
  A team can match several archetypes; the first match is its primary one.
- **"vs previous period" deltas** compare against a window of the same length immediately before the
  selected one, inside the same regulation. If that window starts before the regulation does, the
  comparison is against the whole previous regulation. The previous sample size is shown, and deltas
  from small samples are flagged.
- **Ranked (in-game) source.** This data covers individual Pokémon, not teams, so the team-level views
  (types, archetypes, quadrant, trends, library, scanner) say they are unavailable instead of guessing.
  Speed tiers prefer a real source in this order: team-sheet SP, then the ranked ladder's most common
  spread with its most common nature, then the Smogon ladder, then theoretical bounds. The game reports
  spreads and natures separately, so pairing the top spread with the top nature is an approximation,
  and the chart labels it as one.
- **Stable team ids** are `eventId:playername`, so shared links and chips survive data rebuilds.
- **Differences from other usage sites.** The numbers here are an open-team-list tournament sample,
  dominated by online Limitless events. Pikalytics and similar sites mix in other sources and time
  windows. See *Data coverage* below for how far apart they are.


## Data coverage

Numbers from the build on 2026-09-29. Online teams are events with ≥16 players; official teams are published top lists.

| Regulation | Window | Events | Teams | Official teams | Matches | Ladder (Smogon) | Ranked (in-game) |
|---|---|---|---|---|---|---|---|
| M-A | Apr 8 – Jun 17 | 328 | 24,057 | 436 (Indianapolis, Turin, NAIC) | 64,335 | Apr–Jun | seasons M1–M2 |
| M-B | Jun 17 – Sep 9 | 464 | 33,316 | 57 (Worlds) | 85,114 | Jun–Aug | seasons M3–M5 |
| M-C | Sep 9 – now | 59 | 3,576 | 365 (Baltimore, Frankfurt, Brisbane) | 8,953 | none yet (September stats land in early October) | season M6 (daily) |

No tournament team has an SP spread, because Limitless doesn't publish them. Natures are known for
16% of M-A mons (early Limitless sheets omitted them) and for 100% in M-B and M-C.

**How the tournament numbers compare with the reference usage figures** from the brief (Pikalytics-style):

- **M-C.** The 8 reference Pokémon are the same 8 at the top of the in-game ranked ladder, in nearly
  the same order. Our tournament sample agrees on Sneasler (38.7% vs 36.6%), Incineroar (30.9% vs
  28.5%), Salamence-Mega (27.7% vs 26%) and Kingambit (22.2% vs 25%). It runs much higher on Rillaboom
  (54.7% vs 37.6%) and lower on Basculegion (13.8% vs 23.8%), Golisopod (13.0% vs 21.7%) and
  Indeedee-F (17.4% vs 21.6%). The M-C sample covers only about two and a half weeks of
  mostly-online events, where the Rillaboom-plus-double-Fake-Out core is even more dominant than on
  the ladder. The site's *Ranked (in-game)* source shows the ladder view next to it.
- **M-A.** Garchomp (39.3% vs 40.5%), Sinistcha (25.1% vs 20.4%) and Whimsicott (15.2% vs 17.7%) are
  close. Basculegion (34.1% vs 51.5%), Kingambit (33.8% vs 40.7%) and Floette-Mega (14.1% vs 23.9%)
  are lower. 57% of our M-A teams come from April, the launch month, when Basculegion was at 27%. It
  climbed to 45.5% in May, reaches 43.6% among top-cut teams and 55.5% among official-event teams.
  The reference numbers track that later, more competitive meta. The *Top Cut* filter and the date
  brush on the site reproduce these slices.
- **M-B.** Charizard-Mega-Y and Garchomp are both in the top 6 (25.3% and 32.1%), consistent with the
  "Big Six" reference.

## Local development

```bash
npm ci
npm run data     # full pipeline (incremental; first run takes ~3 h due to Limitless rate limits)
npm test         # node:test unit tests
npm run serve    # http://localhost:8080
npm run e2e      # Playwright checks against the local server
npm run e2e:cloud # same checks with a preinstalled Chromium, third-party hosts stubbed (offline sandboxes)
npm run shot     # screenshots of both skins, desktop + mobile, into screenshots/
```

Useful pipeline flags: `node scripts/build-data.js --reg M-C` (one regulation) and `--max-tournaments N`.

## How the data refresh works

`.github/workflows/refresh-data.yml` runs every **Monday at 00:00 UTC (08:00 GMT+8)**, and you can also start it by hand:
**Actions → Refresh data → Run workflow**.

**What it does:**
1. Checks out the branch, restores the `data-raw/` HTTP cache, runs `npm ci`, `npm run data` and `npm test`.
2. Commits and pushes `public/data/` (if anything changed), which triggers a Cloudflare Pages redeploy.
   Before pushing, the data commit rebases onto the branch's latest tip (with retries). Other commits pushed
   during the run don't cause failures; runs never overlap.

The pipeline is **incremental**: it reuses every completed tournament and finished ranked season already in the
committed `public/data`, refetches online events from the last 7 days (they may have been captured mid-event),
skips events under 48 hours old, and rate-limits requests per host with a descriptive User-Agent.

**Failure handling:**
- If any step fails, a github-script step opens an issue titled "**Weekly data refresh failed**" (or comments
  on the open one) with the run link, trigger name, failing step, and the last 40 log lines of that step.
  Nothing is committed on failure, so the site keeps serving the last good data.
- A hang fails the build step at 300 min, allowing the alert to still run (a job-level timeout would cancel it).
- On the next successful run, the issue is commented "Refresh succeeded in <run>" and closed.
- The repo owner is notified of new issues by default. To ensure notifications reach you, go to **GitHub →
  Settings → Notifications**, enable "Issues" for email and/or GitHub Mobile push, and "Watch" the repo
  (at minimum "Issues"). Scheduled workflows are disabled after 60 days without activity; the weekly data
  commit counts as activity, but if the site goes quiet, re-enable it in the Actions tab.

**Data staleness:**
- When `manifest.generated` is more than 10 days old, a notice under the page header says "**Data last refreshed
  <date> — the weekly update may have failed; figures may be out of date.**" (`lib/stale.js`; an e2e check
  verifies this notice).

**Pipeline robustness:**
- A new in-game ranked season that starts after the last known regulation (`scripts/lib/regs.js`) is skipped with
  a warning instead of failing the run. When a new regulation is announced, add it to `scripts/lib/regs.js` (and
  update `SUFFIX` in `scripts/sources/ladder.js`, and `manifest.current` in `scripts/build-data.js`).
- Smogon's monthly stats (e.g., 2026-09) land in early October; the pipeline automatically tries each month
  up to the current one and skips 404s. Schema validation failures still fail the run.

**Performance:**
- From an empty `data-raw/` cache on GitHub's runner: ~47 min total (official events ~21 min, Limitless online
  ~15 min, ranked M-C ~5 min, sprite checks ~6 min). No host blocked or rate-limited the runner.
- The cache (~5 MB) is saved only after a successful run.

See `docs/TESTING.md` for test coverage and what has been verified.

## Deploying on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the GitHub repo **`vincentwesley/MetaLensVGC`**.
3. Project name: **`metalensvgc`**, which gives the site `https://metalensvgc.pages.dev`.
4. Production branch: the branch you deploy from (merge this branch into `main`, or pick this branch).
5. Framework preset: **None**. Build command: **leave the field blank** (don't type anything; if it
   can't be saved blank, use `exit 0`). Build output directory: **`public`**.
   Optional: environment variable `SKIP_DEPENDENCY_INSTALL` = `1` skips the unneeded `npm ci`.
6. **Save and Deploy.** Every push to the production branch redeploys, including the weekly data commits.

`public/_headers` sets the cache and security headers (a CSP that allows only this site, Google
Fonts and Pokémon Showdown sprites).

## Project layout

See `CLAUDE.md` for conventions and module contracts, and `public/data/SCHEMA.md` for the data contract.
