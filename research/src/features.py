"""Team -> feature vector.

A team is described by four blocks of binary tokens:
  species  "sp:<species>"   every Pokémon on the sheet (battle species as listed)
  mega     "mega:<form>"    Mega forms the team can use (holding its own stone)
  moves    "mv:<move>"      every move known by anyone on the team
  ability  "ab:<ability>"   every effective ability on the team

Each block is TF-IDF weighted (so near-universal tokens like Protect count for little),
L2-normalized, scaled by its block weight and concatenated. The final vector is
L2-normalized, so Euclidean distance between teams is a monotone function of cosine
similarity, which is what K-Means and Ward linkage need.

Items other than Mega Stones are left out on purpose: they describe individual sets
more than the team's game plan. `BLOCK_WEIGHTS` is the knob the ablation study varies.
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

BLOCK_WEIGHTS = {"species": 1.0, "mega": 1.0, "moves": 0.5, "ability": 0.5}
MIN_TEAMS = 20  # drop tokens seen on fewer teams (typos, one-off techs)


def team_tokens(mons) -> dict[str, list[str]]:
    return {
        "species": sorted({f"sp:{m.species}" for m in mons}),
        "mega": sorted({f"mega:{m.key}" for m in mons if m.mega}),
        "moves": sorted({f"mv:{mv}" for m in mons for mv in m.moves}),
        "ability": sorted({f"ab:{m.ability}" for m in mons if m.ability}),
    }


def build(teams, weights: dict[str, float] | None = None):
    """Return (X sparse csr, feature_names list, per-team token dicts)."""
    weights = weights or BLOCK_WEIGHTS
    toks = [team_tokens(m) for m in teams["mons"]]
    blocks, names = [], []
    for block, w in weights.items():
        if w <= 0:
            continue
        docs = [t[block] for t in toks]
        vec = TfidfVectorizer(analyzer=lambda d: d, binary=True, min_df=MIN_TEAMS,
                              norm="l2", lowercase=False)
        try:
            Xb = vec.fit_transform(docs)
        except ValueError:  # block empty after pruning
            continue
        blocks.append(Xb * w)
        names.extend(vec.get_feature_names_out().tolist())
    X = normalize(sp.hstack(blocks).tocsr())
    return X, names, toks


def binary_matrix(toks: list[dict], vocab: list[str]):
    """Plain 0/1 presence matrix over `vocab` (for core/flex slot profiling)."""
    col = {t: i for i, t in enumerate(vocab)}
    rows, cols = [], []
    for r, t in enumerate(toks):
        for block in t.values():
            for tok in block:
                c = col.get(tok)
                if c is not None:
                    rows.append(r)
                    cols.append(c)
    data = np.ones(len(rows), dtype=np.float32)
    return sp.csr_matrix((data, (rows, cols)), shape=(len(toks), len(vocab)))
