# RQ1 findings (preliminary): what archetypes exist?

Working notes for the paper *The Geometry of a Metagame: Archetype Complexity, Matchup Cycles,
and a Hierarchical Map of Pokémon Champions VGC* (Vincent Wesley, Vin's Atelier).

**Status: preliminary.** Data snapshot `2026-11-23T07:44Z`; Regulation M-C is still running (ends
2026-12-02). Re-run `python run_rq1.py` after the final data freeze; every number below comes
from `summary.json`, `model_selection.csv`, `alignment_ablation.csv` and `atlas_L3.csv`.

## Data
79,128 open team lists from 1,201 events (M-A 24,057 · M-B 33,316 · M-C 21,755), 196,310
decided matches, 25,126 anonymized players. 98% of teams come from online Limitless events
(a limitation to state in the paper).

## 1. The archetype tree is stable at three levels
Clusters reproduce across 10 random 80% subsamples at every k tested (mean ARI 0.82–0.96).
Stability peaks at **k = 8, 16 and 32**, which become levels L1, L2 and L3 of the map
(`figures/model_selection.png`). Silhouette rises from 0.11 (k=8) to 0.32 (k=32): coarse
archetypes overlap heavily, while fine archetypes are well separated. *The meta is fuzzy at
the top and crisp at the bottom.* That is the core "complexity" result.

## 2. Archetypes form around Mega Evolutions
31 of the 32 L3 archetypes have an **anchor Mega** carried by at least 70% of their teams
(`atlas_L3.csv`). The one exception is an "Unanchored" group (see 4).
The tree's first split (`figures/archetype_tree.png`) separates a **Charizard Y family**
(Sun, Big Six, Mega Aerodactyl) from everything else.

**Caveat (must be in the paper):** how strongly the clusters follow Megas depends on the
representation. With the Mega block included, the match with the Megas is AMI 0.36–0.38. Without it, it
drops to 0.19–0.27, about equal to the match with community labels
(`alignment_ablation.csv`). Representations that drop whole blocks agree with the main one
only at AMI 0.22–0.45; the equal-weights variant agrees at 0.76–0.85. Decision needed:
justify the Mega block (Mega Evolution is the format's defining once-per-battle mechanic)
and report `equal_blocks` as the robustness check.

## 3. Community labels describe a different axis
Agreement between data archetypes and MetaLens's rule labels (Sun/Rain/Trick Room…) is only
AMI 0.25–0.27, and 9.7% of teams match no rule at all. The labels cut *across* Mega
archetypes: the Mega Aerodactyl archetype is 47% Trick Room, 26% Sun and 13% Tailwind.
**Interpretation to test:** a team has two coordinates, *identity* (its Mega core) and
*game plan* (speed control and weather). The community names the second. Data clustering
finds mostly the first. This two-axis picture is the "geometry" of the title.

## 4. The meta crystallized over the season
The Unanchored archetype (teams with no dominant Mega core) fell from **22% of teams in M-A
to 10% in M-B and 7% in M-C**. Its raw win rate is 43.2% (95% CI 42.7–43.7) in non-mirror
games, the lowest of all archetypes. Its players have entered fewer events (median 5 vs 7),
so part of the gap is player experience. **RQ2's skill-adjusted model must separate the two
before any claim is made.**

## 5. Some archetypes are pure, others are hybrids
Hybrid score = similarity to the second-closest L1 archetype divided by similarity to the
closest one. 13% of teams score ≥ 0.8 (they sit between two archetypes).
Most pure: Mega Blastoise Trick Room (median 0.29), Mega Gengar (0.32).
Most hybrid: Mega Staraptor (0.85), Mega Salamence (0.76).

## 6. Raw win rates (not skill-adjusted, do not report as-is)
Mega Floette Big Six has the highest raw non-mirror win rate (56.9%, CI 56.2–57.6), then
Mega Scovillain (54.0%) and Mega Aerodactyl (53.4%). These numbers are confounded by player
skill until RQ2.

## Next
1. Decide the representation (see 2).
2. RQ2: skill-adjusted archetype matchup matrix, transitive vs cyclic decomposition, RPS
   cycles, Nash mix vs actual usage.
3. RQ3: weekly archetype shares, adoption curves, regulation shocks.
4. Final data freeze after 2026-12-02, then re-run everything.
5. Rename archetypes by hand where the auto-names read badly (e.g. community names like
   "Big Six").
