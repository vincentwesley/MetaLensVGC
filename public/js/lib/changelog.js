// Update log, newest first. Shown by ui/changelog-dialog.js; VERSION must equal package.json "version" (test/changelog.test.js).
export const CHANGELOG = [
  {
    version: '1.5.2', date: '2026-10-20', title: 'Tidier layout',
    notes: [
      { tag: 'IMPROVED', text: 'Wide screens: the trend cards pair up with Speed tiers, so no long empty column; paired cards end level.' },
      { tag: 'IMPROVED', text: 'Moves list uses the full width where there is no Tera card; Compare table is sized to its columns.' },
      { tag: 'FIX', text: 'Section nav jumps to Trends and (Showdown) Teammates again on wide screens.' },
      { tag: 'FIX', text: 'Chart axis labels no longer run together on phones; dropdowns match the other fields.' },
    ],
  },
  {
    version: '1.5.1', date: '2026-10-20', title: 'Smoother on phones',
    notes: [
      { tag: 'IMPROVED', text: 'Loading the team data no longer freezes the page: it is unpacked in small steps, so scrolling and taps keep working.' },
    ],
  },
  {
    version: '1.5.0', date: '2026-10-20', title: 'Steadier, snappier',
    notes: [
      { tag: 'FIX', text: 'The first screen no longer shifts down while data loads in.' },
      { tag: 'IMPROVED', text: 'On wide screens the filter bar is one row shorter: Copy link and Hide sit at the end of the first row.' },
      { tag: 'IMPROVED', text: 'Trend charts: hovering a line dims the others, and the tooltip lists the week’s leader first.' },
      { tag: 'IMPROVED', text: 'Leaderboard column sorting works with the keyboard and tells screen readers the sort order.' },
      { tag: 'IMPROVED', text: 'Buttons give slightly when pressed; new filter chips pop in with a small spring.' },
    ],
  },
  {
    version: '1.4.2', date: '2026-10-16', title: 'Less page jumping',
    notes: [
      { tag: 'FIX', text: 'The page no longer jumps while sections load in; filter bar and tips strip reserve their space.' },
      { tag: 'IMPROVED', text: 'Leaderboard and item rows are cleaner for screen readers.' },
    ],
  },
  {
    version: '1.4.1', date: '2026-10-16', title: 'Accessibility pass',
    notes: [
      { tag: 'FIX', text: 'Pokédex no longer scrolls sideways on tablet widths; labelled the Speed benchmark controls; screen-reader fixes.' },
    ],
  },
  {
    version: '1.4.0', date: '2026-10-12', title: 'Five new sections',
    notes: [
      { tag: 'NEW', text: 'Threats: which Pokémon check the most of the top 12 (from Smogon ladder counters).' },
      { tag: 'NEW', text: 'Moves & Tera: field-wide move usage, and Tera types in NatDex Doubles.' },
      { tag: 'NEW', text: 'Compare Periods: two Smogon months side by side with risers, fallers and item changes.' },
      { tag: 'NEW', text: 'Event Results: each tournament’s winner and top-cut archetype mix.' },
      { tag: 'NEW', text: 'Weekly Digest: a shareable text summary of the current view (copy or print).' },
      { tag: 'NEW', text: 'Showdown quadrant: rating-weighted usage vs equal-weight usage, labelled as not win rate.' },
    ],
  },
  {
    version: '1.3.1', date: '2026-10-12', title: 'Smoke-test fixes',
    notes: [
      { tag: 'FIX', text: 'Deep dive "Checks & counters" showed NaN%: Smogon changed its counter format; now shows the KO/switch rate with its spread.' },
      { tag: 'FIX', text: 'Pokédex now lists every species seen in the data (Rillaboom, many Megas and other missing Pokémon).' },
      { tag: 'FIX', text: 'Showdown mode no longer says "teams" in hints; team-only downloads and notes are hidden there; the jump bar follows the page order.' },
      { tag: 'IMPROVED', text: 'National Dex Tera card says Tera is banned instead of showing nothing.' },
    ],
  },
  {
    version: '1.3.0', date: '2026-10-09', title: 'Showdown mode: National Dex',
    notes: [
      { tag: 'NEW', text: 'VGC | Showdown switch in the header: National Dex and NatDex Doubles from the Smogon ladder (cutoff 1760).' },
      { tag: 'NEW', text: 'Showdown stats use EVs at Lv100; deep dive gains a Tera types card and Smogon EV spreads.' },
      { tag: 'NEW', text: 'Type usage, monthly trends, risers and fallers, and speed tiers work from ladder data.' },
      { tag: 'IMPROVED', text: 'Pokédex opens A–Z by default; National Dex uses official Showdown tiers, NatDex Doubles tiers by usage.' },
      { tag: 'NEW', text: 'Showdown mode: teammate co-usage heatmap and top pairs, built from Smogon’s teammate data.' },
      { tag: 'IMPROVED', text: 'Pokédex list scrolls inside a fixed-height box (the section is much shorter); Showdown mode re-orders its sections so there are no empty gaps.' },
      { tag: 'IMPROVED', text: 'Showdown Pokédex opens by tier: National Dex uses Showdown’s tiers (AG, Uber, OU…); NatDex Doubles uses Showdown’s Doubles tiers (DUber, DOU, DUU…).' },
      { tag: 'IMPROVED', text: 'Pokédex now follows the dashboard filters (type, Pokémon, weak-to chips) but clicking it still never adds one.' },
      { tag: 'FIX', text: 'Showdown leaderboard shows and sorts by usage % only (Smogon usage is rating-weighted, so the raw count ranked differently and was misleading).' },
      { tag: 'FIX', text: 'VGC ladder leaderboard column renamed "Raw uses": Smogon usage % is weighted by player rating, so it can rank differently from the raw count.' },
      { tag: 'IMPROVED', text: 'Team-sheet sections (quadrant, archetypes, countries, library, scanner) are hidden in Showdown mode.' },
    ],
  },
  {
    version: '1.2.0', date: '2026-10-09', title: 'Showdown-style Pokédex, more styles',
    notes: [
      { tag: 'NEW', text: 'Pokédex rebuilt like Pokémon Showdown’s teambuilder: tier rows, base stats, abilities, sort by tier, A–Z or any stat.' },
      { tag: 'NEW', text: 'Pokédex search finds Pokémon, types, abilities and moves; type, ability and move filters (moves match legal learnsets).' },
      { tag: 'NEW', text: 'Four more styles: Glass, Paper, Terminal and Soft (Pro stays the default).' },
      { tag: 'IMPROVED', text: 'Pokédex now sits below the usage leaderboard and quadrant.' },
      { tag: 'IMPROVED', text: 'The tips strip stays pinned while you scroll, until you dismiss it.' },
      { tag: 'FIX', text: 'Animated sprites keep their proportions (tall or wide Pokémon like Sneasler were stretched).' },
    ],
  },
  {
    version: '1.1.0', date: '2026-10-08', title: 'Settings, palettes, Pokédex',
    notes: [
      { tag: 'NEW', text: 'Settings panel (gear in the header): mode, style, palette, animated sprites, clock, tips.' },
      { tag: 'NEW', text: 'Seven colour palettes: Grass, Ghost (purple), Water (blue), Fire, Fairy (pink), Electric, Steel.' },
      { tag: 'NEW', text: 'Pokédex section, and a Pokémon search that opens details without filtering.' },
      { tag: 'NEW', text: 'Meta clock: local time, next data refresh, days left in the regulation.' },
      { tag: 'NEW', text: 'This update log.' },
      { tag: 'IMPROVED', text: 'Deep dive: type matchups, stat ranges, weekly usage and a copy-set button.' },
      { tag: 'IMPROVED', text: 'Look settings are saved per browser and no longer travel in shared links.' },
      { tag: 'IMPROVED', text: 'Weekly data refresh now runs Monday 08:00 GMT+8.' },
    ],
  },
  {
    version: '1.0.0', date: '2026-10-01', title: 'Feature-complete',
    notes: [
      { tag: 'NEW', text: 'Weekly automatic data refresh.' },
      { tag: 'NEW', text: 'Spread explorer in the deep dive and the Scanner\'s SP check.' },
      { tag: 'NEW', text: 'Team Scanner: weaknesses, matchups, item check and weakest link.' },
      { tag: 'NEW', text: 'Meta by country section and Country chip.' },
    ],
  },
  {
    version: '0.3.0', date: '2026-09-30', title: 'Cross-filters and motion',
    notes: [
      { tag: 'IMPROVED', text: 'Cross-filters never blank a chart; small samples are shown and flagged.' },
      { tag: 'NEW', text: 'Archetype share by week; item shares with one decimal.' },
      { tag: 'IMPROVED', text: 'Calmer motion: one signal per action, nothing moves while scrolling.' },
      { tag: 'NEW', text: 'Library filter scans the team, leaderboard search, Change column and Copy link.' },
    ],
  },
  {
    version: '0.2.0', date: '2026-09-29', title: 'Renamed to MetaLens VGC',
    notes: [
      { tag: 'IMPROVED', text: 'The site is now MetaLens VGC (it was VGC MetaScope).' },
      { tag: 'NEW', text: 'Item Usage section and in-game ranked (Battle Data) source.' },
      { tag: 'NEW', text: 'Collapsible filter bar with active-filter chips and Clear all.' },
      { tag: 'FIX', text: 'Type-chart clicks and tooltip crashes; tooltips stay on screen.' },
    ],
  },
  {
    version: '0.1.0', date: '2026-09-28', title: 'First release',
    notes: [
      { tag: 'NEW', text: 'Meta snapshot, usage leaderboard, type landscape and usage vs win rate.' },
      { tag: 'NEW', text: 'Archetypes, teammates and cores, speed tiers and weekly trends.' },
      { tag: 'NEW', text: 'Deep dive drawer, team sheet library and team scanner.' },
      { tag: 'NEW', text: 'Retro and Pro skins; filters saved in the link.' },
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
