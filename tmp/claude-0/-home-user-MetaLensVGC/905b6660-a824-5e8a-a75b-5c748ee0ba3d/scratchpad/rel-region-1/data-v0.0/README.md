# MetaLens VGC research data data-v0.0

Pokémon Champions VGC tournament data, Regulations M-A, M-B, M-C, compiled by Vincent Wesley (Vin's Atelier) for MetaLens VGC (https://metalensvgc.pages.dev).

See CODEBOOK.md for every table and column, RELEASE.json for provenance and SHA-256 checksums, and quality-<REG>.json for what was dropped or normalized per event.

Not included: Pokémon Champions Battle Data in-game ranked data (its API terms forbid redistribution) and Smogon ladder statistics.

Players are pseudonymized (salted HMAC ids), not anonymous: the source pages are public.

Country is grouped into world regions; groups under 5 lists per event are suppressed (see CODEBOOK.md, Country policy).

Reproduce: check out the git tag `data-v0.0` of https://github.com/vincentwesley/MetaLensVGC and run `node scripts/release.js verify data-v0.0`.
