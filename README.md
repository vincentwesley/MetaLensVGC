# VGC MetaScope

An interactive, cross-filtering metagame dashboard for **Pokémon Champions, the VGC 2026 format**
(regulations M-A, M-B and M-C). It's a free static site built for Cloudflare Pages at
**https://vgcmetascope.pages.dev**.

Every number on the site is aggregated in your browser from real tournament team sheets and ladder
statistics fetched by the data pipeline in `scripts/`. Nothing is invented or "calibrated". When a
filter leaves too little data, the widget says **Insufficient data** instead of guessing.

## Features

- **Global filter bar** (sticky): regulation (M-A / M-B / M-C, defaults to the current one), source
  (Tournaments / Ladder), event tier (Worlds / Internationals / Regionals / Online), placement
  (All / Top Cut / Top 8 / Winners), date range and a minimum-sample slider.
- **Cross-filtering everywhere.** Click a Pokémon, type, archetype, item, move, Mega, core or team
  to add a filter chip, and every chart recomputes on "teams matching all chips".
  **Shift-click or Alt-click** excludes instead ("teams without X"). You can remove chips one by one
  or clear them all.
- **Shareable state.** All filters, chips, the skin and the theme live in the URL hash.
- **Hover links.** Hovering a Pokémon highlights it across charts.
- **Sections**
  - Meta Snapshot
  - Usage leaderboard with 95% Wilson intervals
  - Type landscape: usage, best attacking types against the current field, and common weaknesses
  - Archetypes: classification, split, and a matchup heatmap built from real pairings
  - Usage vs. win-rate quadrant
  - Teammate co-usage (raw % / lift) and top cores
  - Speed tier matrix with Tailwind, Scarf, ±1, paralysis and Trick Room toggles, plus a
    "my Pokémon" benchmark
  - Weekly trends with a brush that drives the date filter, risers and fallers, and the regulation shift
  - Team Sheet Library with one-click Showdown paste copy
  - My Team Scanner
  - Pokémon deep-dive drawer
  - Data & methodology, with JSON/CSV download
- **Two skins:** Retro (default: Press Start 2P, Silkscreen, VT323, CRT scanlines, pixel borders)
  and Pro (JetBrains Mono and Inter). Each comes in light and dark. The layout is responsive down to 390px.

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
| [`pokemon-showdown`](https://www.npmjs.com/package/pokemon-showdown) npm package (`champions` mod) | Dex: types, base stats, abilities, move data, Mega Stones | Covers every Champions and Z-A Mega, so no override table was needed |
| [Pokémon Showdown sprites](https://play.pokemonshowdown.com/sprites/) | gen5 sprites, plus gen5ani/ani animated sprites | Availability is resolved at build time, so the browser never requests missing sprites |

The data belongs to its sources and the sprites belong to Pokémon Showdown and their artists. This
repository's code is MIT-licensed. VGC MetaScope is a fan project and is not affiliated with
Nintendo, Game Freak, Creatures or The Pokémon Company.

## Decisions and known gaps

<!-- DECISIONS -->

## Local development

```bash
npm ci
npm run data     # full pipeline (incremental; first run takes ~3 h due to Limitless rate limits)
npm test         # node:test unit tests
npm run serve    # http://localhost:8080
npm run e2e      # Playwright checks against the local server
npm run shot     # screenshots of both skins, desktop + mobile, into screenshots/
```

Useful pipeline flags: `node scripts/build-data.js --reg M-C` (one regulation) and `--max-tournaments N`.

## How the data refresh works

`.github/workflows/refresh-data.yml` runs every Monday at 06:00 UTC, and you can also start it by hand
from the Actions tab. It:

1. runs `npm ci`, `npm run data` and `npm test`;
2. commits `public/data/` if anything changed, which makes Cloudflare Pages redeploy automatically.

The pipeline is **incremental**:

- It reads the committed `public/data/teams-*.json` and reuses every completed tournament already
  in them.
- It refetches online events from the last 7 days, because they may have been captured mid-event.
- It skips events that are less than 48 hours old.
- Raw responses are cached in `data-raw/` (gitignored). Requests are rate-limited per host and sent
  with a descriptive User-Agent.
- The build fails (and nothing is committed) if schema validation fails (`scripts/validate.js`).

## Deploying on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the GitHub repo **`vincentwesley/VGCMetaScope`**.
3. Project name: **`vgcmetascope`**, which gives the site `https://vgcmetascope.pages.dev`.
4. Production branch: the branch you deploy from (merge this branch into `main`, or pick this branch).
5. Framework preset: **None**. Build command: **leave empty**. Build output directory: **`public`**.
6. **Save and Deploy.** Every push to the production branch redeploys, including the weekly data commits.

`public/_headers` sets the cache and security headers (a CSP that allows only this site, Google
Fonts and Pokémon Showdown sprites).

## Project layout

See `CLAUDE.md` for conventions and module contracts, and `public/data/SCHEMA.md` for the data contract.
