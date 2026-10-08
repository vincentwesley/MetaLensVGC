// Update log, newest first. Shown by ui/changelog-dialog.js; VERSION must equal package.json "version" (test/changelog.test.js).
export const CHANGELOG = [
  {
    version: '1.3.0', date: '2026-10-09', title: 'Showdown mode: National Dex',
    notes: [
      { tag: 'NEW', text: 'VGC | Showdown switch in the header: National Dex and NatDex Doubles from the Smogon ladder (cutoff 1760).' },
      { tag: 'NEW', text: 'Showdown stats use EVs at Lv100; deep dive gains a Tera types card and Smogon EV spreads.' },
      { tag: 'NEW', text: 'Type usage, monthly trends, risers and fallers, and speed tiers work from ladder data.' },
      { tag: 'IMPROVED', text: 'Pokédex opens A–Z by default; National Dex uses official Showdown tiers, NatDex Doubles tiers by usage.' },
      { tag: 'FIX', text: 'Ladder leaderboard column renamed "Raw uses": Smogon usage % is weighted by player rating, so it can rank differently from the raw count.' },
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
