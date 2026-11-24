# MetaLens VGC research data: codebook

Compiled by Vincent Wesley (Vin's Atelier) for MetaLens VGC (metalensvgc.pages.dev).
Release data-v0.0.
Regulations: M-A, M-B, M-C.

## Scope and caveats

- Sources: Limitless Play (play.limitlesstcg.com, online tournaments), limitlessvgc.com and standings.limitlessvgc.com (official events).
- Not included: Pokémon Champions Battle Data (championsbattledata.com) in-game ranked data, whose API terms forbid redistribution, and Smogon ladder statistics.
- Players are pseudonymized, not anonymous: no names are included, but the source pages are public, so a team can be traced back through event and placing. Country: see "Country policy".
- Official events publish full team lists for top finishers only (`coverage_kind = published-subset`); use roster_players.csv and roster_matches.csv for complete, species-level data on those events.
- Archetype labels are computed from the full lists with the rule set below; they are not part of the source data.
- Ids ending in a row number (team_id, match_id, roster_id) are stable within one release only; join across releases on event_id + pid.
- Text is exactly as published (UTF-8, RFC 4180 quoting). A cell starting with = + - or @ is left as is: import as text, not into a spreadsheet that evaluates formulas.

## Country policy

The sheet's ISO 3166-1 alpha-2 country is grouped into world regions (UN M49 regions (unstats.un.org/unsd/methodology/m49), with the Americas split into its M49 sub-regions Northern America and Latin America and the Caribbean) in teams.csv `region`.
A region is published only when at least 5 full lists at the same event share it; otherwise the cell
reads "suppressed", so a small group cannot point back to a country and from there to a player. Taiwan (not listed
by M49) is grouped with Eastern Asia, Kosovo (XK) with Southern Europe, and the sheet spelling UK with GB.

| region | label | ISO 3166-1 alpha-2 codes |
|---|---|---|
| africa | Africa | DZ EG LY MA SD TN EH IO BI KM DJ ER ET KE MG MW MU YT MZ RE RW SC SO SS TF UG TZ ZM ZW AO CM CF TD CG CD GQ GA ST BW SZ LS NA ZA BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG |
| northern-america | Northern America | BM CA GL PM US |
| latin-america-caribbean | Latin America and the Caribbean | AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI BZ CR SV GT HN MX NI PA AR BO BV BR CL CO EC FK GF GY PY PE GS SR UY VE |
| asia | Asia | KZ KG TJ TM UZ CN HK MO KP JP MN KR TW BN KH ID LA MY MM PH SG TH TL VN AF BD BT IN IR MV NP PK LK AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE |
| europe | Europe | BY BG CZ HU PL MD RO RU SK UA AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB UK AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES XK AT BE FR DE LI LU MC NL CH |
| oceania | Oceania | AU CX CC HM NZ NF FJ NC PG SB VU GU KI MH FM NR MP PW UM AS CK PF NU PN WS TK TO TV WF |

## events.csv

One row per tournament.

| column | type | description |
|---|---|---|
| `event_id` | string | MetaLens event id: "lt:<Limitless id>" (online) or "lvgc:<limitlessvgc.com id>" (official). |
| `regulation` | string | Regulation set (M-A, M-B, M-C...). |
| `name` | string | Event name as published. |
| `date` | date | Event start date (UTC), YYYY-MM-DD. |
| `tier` | string | worlds \| international \| regional \| online. |
| `source` | string | limitless (play.limitlesstcg.com, online) \| limitlessvgc (limitlessvgc.com + standings.limitlessvgc.com, official). |
| `url` | string | Source page. |
| `players` | integer | Entrants as published. |
| `lists` | integer | Full team lists in teams.csv for this event. |
| `coverage_rate` | number | lists / players (0-1); empty when unknown. |
| `coverage_kind` | string | complete (lists for >= 95% of players: online events) \| published-subset (official events: full lists for top finishers only; see roster_players.csv for everyone, species only). |
| `cut` | integer | Top-cut size; empty when unknown. |
| `rounds` | integer | Rounds as published (official: all rounds including top cut; online: Swiss rounds). |
| `fetched` | date | Day the event was first built into MetaLens; empty for events built before v1.7.0. |

## teams.csv

One row per full team list (6 Pokémon with items, abilities and moves).

| column | type | description |
|---|---|---|
| `team_id` | string | Release-scoped team id: <regulation>-<row number in teams-<REG>.json>. |
| `event_id` | string | events.csv event_id. |
| `regulation` | string | Regulation set. |
| `pid` | string | Pseudonymous player id: first 16 hex characters of HMAC-SHA256(secret salt, source key). The same player has the same pid in every event of the same namespace. Empty when the row was built without the salt. |
| `id_namespace` | integer | 1 = Limitless username (online events), 2 = standings.limitlessvgc.com player id (official events), 3 = event-scoped official id (no standings record; never links across events), 0 = unknown. Namespaces 1 and 2 cannot be linked. |
| `placing` | integer | Final placing; empty when not published. |
| `top_cut` | boolean | 1 if placing <= cut (cut unknown: placing <= 8). |
| `wins` | integer | Match wins as published (official events: from the standings site). |
| `losses` | integer | Match losses as published. |
| `ties` | integer | Ties as published (the official standings site publishes none: 0). |
| `region` | string | World region of the country on the sheet: africa \| northern-america \| latin-america-caribbean \| asia \| europe \| oceania (see "Country policy"); "suppressed" when fewer than 5 full lists at the event share that region; empty if no country was published. |

## team_members.csv

One row per Pokémon on a full team list.

| column | type | description |
|---|---|---|
| `team_id` | string | teams.csv team_id. |
| `slot` | integer | Position on the sheet, 1-6. |
| `species` | string | Battle species as listed (base or regional/gender form, never a Mega form). |
| `form` | string | Mega form when the Pokémon holds its own Mega Stone (e.g. Charizard-Mega-Y), else the species. |
| `item` | string | Held item, normalized to the game name; empty if none. |
| `ability` | string | Ability as listed (the pre-Mega ability for Mega Stone holders), normalized. |
| `move1` | string | Move, normalized; empty if fewer moves were listed. |
| `move2` | string | Move. |
| `move3` | string | Move. |
| `move4` | string | Move. |
| `holds_own_mega_stone` | boolean | 1 if the item is this species' own Mega Stone. |

## matches.csv

One row per match between two full team lists of the same event (byes excluded).

| column | type | description |
|---|---|---|
| `match_id` | string | Release-scoped id: <regulation>-m<row number>. |
| `event_id` | string | events.csv event_id. |
| `team_a` | string | teams.csv team_id of side A. |
| `team_b` | string | teams.csv team_id of side B. |
| `result` | integer | 1 = side A won, 2 = side B won, 0 = tie, 3 = no result (double loss / unreported). Rows built before MetaLens v1.7.0 use 0 for "tie or unknown". |
| `round` | integer | Round number from the source; 0 = unknown (rows built before v1.7.0). |
| `phase` | integer | 1 = Swiss, 2 = top cut, 0 = unknown. Official events: a round is top cut when every player paired in it made top cut. |
| `best_of` | integer | 1 or 3 = best of, from the Limitless phase mode; 0 = not published by the source (always 0 for official events, although Play! Pokémon rules use best-of-three). |
| `games_a` | integer | Games won by A when the source lists per-game winners; empty otherwise. |
| `games_b` | integer | Games won by B; empty otherwise. |

## team_archetypes.csv

Archetype labels of each full team under the rule set named in ruleset_version (public/js/lib/archetypes.js).

| column | type | description |
|---|---|---|
| `team_id` | string | teams.csv team_id. |
| `ruleset_version` | string | ARCHETYPE_RULESET.version used for these labels. |
| `archetypes` | string | Every archetype the team matches, in rule priority order, "\|"-separated; "other" if none. |
| `primary` | string | The first of those (the label the dashboard's primary view uses). |
| `mega_stones_carried` | integer | Pokémon holding their own Mega Stone (only one can Mega Evolve per battle). |

## roster_players.csv

Official events only: every player on the standings site, with a species-only team (the source lists all teams; full lists exist only for the players also in teams.csv).

| column | type | description |
|---|---|---|
| `roster_id` | string | Release-scoped id: <regulation>-r<event index>-<player index>. |
| `event_id` | string | events.csv event_id. |
| `pid` | string | Pseudonymous player id: first 16 hex characters of HMAC-SHA256(secret salt, source key). The same player has the same pid in every event of the same namespace. Empty when the row was built without the salt. |
| `id_namespace` | integer | 1 = Limitless username (online events), 2 = standings.limitlessvgc.com player id (official events), 3 = event-scoped official id (no standings record; never links across events), 0 = unknown. Namespaces 1 and 2 cannot be linked. |
| `placing` | integer | Final placing; empty when not published. |
| `wins` | integer | Match wins. |
| `losses` | integer | Match losses. |
| `drop_round` | integer | Round the player dropped after; empty if they did not drop. |
| `top_cut` | boolean | 1 if the player made top cut. |
| `day2` | boolean | 1 if the player made day 2. |
| `team_id` | string | teams.csv team_id of this player's full list; empty if none was published. |
| `species1` | string | Species as listed (no Mega form: the roster has no items). |
| `species2` | string | Species. |
| `species3` | string | Species. |
| `species4` | string | Species. |
| `species5` | string | Species. |
| `species6` | string | Species. |

## roster_matches.csv

Official events only: every non-bye pairing between roster players (complete, unlike matches.csv for these events).

| column | type | description |
|---|---|---|
| `event_id` | string | events.csv event_id. |
| `roster_a` | string | roster_players.csv roster_id of side A. |
| `roster_b` | string | roster_players.csv roster_id of side B. |
| `result` | integer | 1 = side A won, 2 = side B won, 0 = tie, 3 = no result (double loss / unreported). Rows built before MetaLens v1.7.0 use 0 for "tie or unknown". |
| `round` | integer | Round number. |
| `phase` | integer | 1 = Swiss, 2 = top cut, 0 = unknown. Official events: a round is top cut when every player paired in it made top cut. |

## Archetype rule set 1.0 (fingerprint c98b06a4254ae8b6)

Rules are tested in this order; `primary` is the first match.

| id | label | rule | label source |
|---|---|---|---|
| sala-fakeout | Salamence + Fake Out | Mega Salamence (holding Salamencite) plus at least two Fake Out users. | MetaLens definition (Vin's Atelier); no published community source found |
| big-six | Big Six | Mega Charizard-Y and Mega Floette (Floette-Eternal holding Floettite) on the same team. Checked via team.keys rather than the single Team.mega field, since a roster can legally carry two different Mega Stones even though only one mon actually mega evolves in battle. | The Big Lead, "Pokémon Champions best teams in Regulation M-B" (2026-07-11), https://www.thebiglead.com/?p=198754, accessed 2026-11-24: "Known as Sunflower, Big Six, or Zard Slop, this team is one of the most popular in Pokémon Champions" |
| psy-tr | Psychic Terrain Trick Room | Psychic Surge (Indeedee/Indeedee-F) plus at least one Trick Room user. | MetaLens definition (Vin's Atelier); no published community source found |
| trick-room | Trick Room | At least one Trick Room user and at least two mons with base Speed ≤ 60, and not already classified as psy-tr (which is Trick Room too, but built around Psychic Surge specifically). | The Big Lead, "Pokémon Champions best teams in Regulation M-B" (2026-07-11), https://www.thebiglead.com/?p=198754, accessed 2026-11-24: "This team uses the Hard Trick Room strategy"; BlueStacks, "Pokemon Champions - Best Teams Built and Used by Pros" (2026-06-30), https://www.bluestacks.com/blog/game-guides/pokemon-champions/pkcs-best-teams-en.html, accessed 2026-11-24: "Gardevoir Trick Room Team" |
| sun | Sun | At least one mon whose effective ability (post-Mega if applicable) is Drought. Covers both direct setters (Torkoal) and Charizard-Mega-Y, whose ability becomes Drought only after mega evolving. | BlueStacks, "Pokemon Champions - Best Teams Built and Used by Pros" (2026-06-30), https://www.bluestacks.com/blog/game-guides/pokemon-champions/pkcs-best-teams-en.html, accessed 2026-11-24: "Charizard-Y Sun Offense"; The Big Lead, "Pokémon Champions best teams in Regulation M-B" (2026-07-11), https://www.thebiglead.com/?p=198754, accessed 2026-11-24: "Thanks to how popular Charizard Y and sun is" |
| rain | Rain | At least one mon with the ability Drizzle. | BlueStacks, "Pokemon Champions - Best Teams Built and Used by Pros" (2026-06-30), https://www.bluestacks.com/blog/game-guides/pokemon-champions/pkcs-best-teams-en.html, accessed 2026-11-24: "Rain teams use Pelipper to automatically activate Rain when it enters battle."; The Big Lead, "Pokémon Champions best teams in Regulation M-B" (2026-07-11), https://www.thebiglead.com/?p=198754, accessed 2026-11-24: "Mega Swampert and rain has risen in popularity" |
| sand | Sand | At least one mon with the ability Sand Stream. | BlueStacks, "Pokemon Champions - Best Teams Built and Used by Pros" (2026-06-30), https://www.bluestacks.com/blog/game-guides/pokemon-champions/pkcs-best-teams-en.html, accessed 2026-11-24: "Sand teams activate through Mega Tyranitar's Sand Stream ability" |
| snow | Snow | At least one mon with the ability Snow Warning. | MetaLens definition (Vin's Atelier); no published community source found |
| tailwind | Tailwind | At least one Tailwind user, and not already classified as trick-room (the two game plans are mutually exclusive: Tailwind wants your team fast, Trick Room wants it slow). | The Big Lead, "Pokémon Champions best teams in Regulation M-B" (2026-07-11), https://www.thebiglead.com/?p=198754, accessed 2026-11-24: "This team often leads Whimsicott and the Mega Evolution of choice to set up Tailwind" |

Rule set history:

- 1.0 (2026-09-28, commit 0ebe92c): First rule set: nine archetypes in this priority order. Unchanged since (checked against git history on 2026-11-24).
