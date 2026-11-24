# MetaLens Research

Analysis code for the paper:

> **The Geometry of a Metagame: Archetype Complexity, Matchup Cycles, and a Hierarchical Map of
> Pokémon Champions VGC**. Vincent Wesley (Vin), Vin's Atelier, Singapore.

It reads the data MetaLens VGC already publishes (`public/data/`, see `public/data/SCHEMA.md`)
and never writes back to the site.

## Research questions
- **RQ1: What archetypes really exist?** Data-driven, hierarchical archetype discovery,
  compared with community labels; hybridity. → `run_rq1.py` (done, preliminary)
- **RQ2: How do archetypes interact?** Skill-adjusted matchup matrix, transitive vs cyclic
  structure, rock-paper-scissors cycles, equilibrium mix vs actual usage. (next)
- **RQ3: How do archetypes evolve?** Weekly shares, adoption of new Pokémon, regulation
  shocks. (planned)

## Run
Python 3.11+.
```
cd research
pip install -r requirements.txt
python run_rq1.py        # about 3 minutes; writes outputs/rq1/
```
Runs are seeded and deterministic for a given data snapshot (recorded in
`outputs/rq1/summary.json`).

## Layout
```
src/load.py       decode team files, Mega forms, effective abilities, player anonymization
src/rules.py      Python port of public/js/lib/archetypes.js (community-label baseline)
src/features.py   team -> TF-IDF vector (species, Megas, moves, abilities blocks)
src/cluster.py    SVD embedding, micro-archetypes, size-weighted Ward tree, stability, hybridity
run_rq1.py        RQ1 pipeline: model selection, ablations, atlas, figures
outputs/rq1/      results (FINDINGS.md summarizes them)
```

## Method notes
- **Two-stage hierarchy.** K-Means makes 400 micro-archetypes, then a size-weighted Ward
  agglomeration (`weighted_ward`, checked to match scipy exactly) builds the tree. This
  avoids an O(n²) distance matrix on 79k teams.
- **Levels.** k = 8 / 16 / 32 are chosen where subsample stability peaks
  (`model_selection.csv`).
- **Fair comparisons.** Agreement scores use chance-corrected AMI with matched category
  counts (top-9 Megas + other vs the 10 rule labels).
- **Privacy.** Player names are replaced with hashed ids (`P00001`…) on load. No output
  contains a name. `team_archetypes.csv` is gitignored (rebuild it with the script).
- **Data terms.** Only Limitless tournament data is used. Pokémon Champions Battle Data is not
  used or redistributed, per its API rules.
