"""Hierarchical archetype discovery.

Two-stage clustering (the standard way to get a Ward hierarchy on ~10^5 points
without an O(n^2) distance matrix):
  1. Reduce the TF-IDF team vectors with truncated SVD and re-normalize.
  2. K-Means into many small "micro-archetypes" (default 400).
  3. Size-weighted Ward agglomeration of the micro-archetype centroids gives a full
     tree; cutting it at k gives k archetypes for every team.

Everything is seeded, so a run is reproducible.
"""
from __future__ import annotations

import numpy as np
from scipy.cluster.hierarchy import fcluster
from sklearn.cluster import MiniBatchKMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import normalize


def embed(X, dims: int = 64, seed: int = 0):
    svd = TruncatedSVD(n_components=dims, random_state=seed)
    Z = normalize(svd.fit_transform(X))
    return Z, svd


def micro(Z, k: int = 400, seed: int = 0):
    km = MiniBatchKMeans(n_clusters=k, random_state=seed, batch_size=4096, n_init=5,
                         max_iter=300, reassignment_ratio=0.01)
    lab = km.fit_predict(Z)
    sizes = np.bincount(lab, minlength=k)
    keep = sizes > 0
    remap = -np.ones(k, dtype=int)
    remap[keep] = np.arange(keep.sum())
    return remap[lab], km.cluster_centers_[keep], sizes[keep]


def weighted_ward(C: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Ward agglomeration of points C with weights (sizes) w.

    Merge cost of clusters i, j is the increase in within-cluster sum of squares:
    n_i n_j / (n_i + n_j) * ||c_i - c_j||^2. Returns a scipy-style linkage matrix
    whose heights are sqrt(2 * cost), the same convention scipy uses for Ward.
    """
    n = len(C)
    cent = {i: C[i].astype(np.float64) for i in range(n)}
    size = {i: float(w[i]) for i in range(n)}
    count = {i: 1 for i in range(n)}
    active = list(range(n))
    Z = np.zeros((n - 1, 4))

    def cost_vec(i, others):
        d = np.array([cent[j] for j in others]) - cent[i]
        s = np.array([size[j] for j in others])
        return size[i] * s / (size[i] + s) * np.einsum("ij,ij->i", d, d)

    # dense pairwise cost matrix over active ids, indexed by position in `active`
    D = np.full((n, n), np.inf)
    for a in range(n):
        if a + 1 < n:
            D[a, a + 1:] = cost_vec(a, list(range(a + 1, n)))
            D[a + 1:, a] = D[a, a + 1:]
    ids = np.arange(n)  # position -> cluster id
    alive = np.ones(n, dtype=bool)
    nxt = n
    for step in range(n - 1):
        Dm = np.where(alive[:, None] & alive[None, :], D, np.inf)
        p, q = np.unravel_index(np.argmin(Dm), Dm.shape)
        i, j = ids[p], ids[q]
        c = Dm[p, q]
        Z[step] = [min(i, j), max(i, j), np.sqrt(2 * c), count[i] + count[j]]
        s = size[i] + size[j]
        cent[nxt] = (cent[i] * size[i] + cent[j] * size[j]) / s
        size[nxt] = s
        count[nxt] = count[i] + count[j]
        # reuse position p for the merged cluster, retire q
        ids[p] = nxt
        alive[q] = False
        D[q, :] = D[:, q] = np.inf
        others = [o for o in np.flatnonzero(alive) if o != p]
        if others:
            cv = cost_vec(nxt, [ids[o] for o in others])
            D[p, others] = cv
            D[others, p] = cv
        nxt += 1
    return Z


class ArchetypeTree:
    def __init__(self, Z_emb, n_micro: int = 400, seed: int = 0):
        self.Z_emb = Z_emb
        self.micro_lab, self.centers, self.sizes = micro(Z_emb, n_micro, seed)
        self.linkage = weighted_ward(self.centers, self.sizes)

    def labels(self, k: int) -> np.ndarray:
        """Archetype id (0..k-1) per team, for a cut into k clusters."""
        cut = fcluster(self.linkage, k, criterion="maxclust") - 1
        return cut[self.micro_lab]


def silhouette(Z_emb, labels, n: int = 8000, seed: int = 0) -> float:
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(labels), size=min(n, len(labels)), replace=False)
    if len(np.unique(labels[idx])) < 2:
        return float("nan")
    return float(silhouette_score(Z_emb[idx], labels[idx], metric="cosine"))


def stability(Z_emb, ks, reps: int = 10, frac: float = 0.8, n_micro: int = 400, seed: int = 0):
    """Mean/SD pairwise ARI between clusterings of random 80% subsamples, per k.

    Each pair of subsamples is compared on the teams they share. High ARI means the
    archetypes at that k are a property of the data, not of the random seed or sample.
    """
    rng = np.random.default_rng(seed)
    n = len(Z_emb)
    fits = []
    for r in range(reps):
        idx = np.sort(rng.choice(n, size=int(frac * n), replace=False))
        tree = ArchetypeTree(Z_emb[idx], n_micro, seed=seed + 1 + r)
        full = np.full((len(ks), n), -1)
        for a, k in enumerate(ks):
            full[a, idx] = tree.labels(k)
        fits.append(full)
    out = {}
    for a, k in enumerate(ks):
        aris = []
        for x in range(reps):
            for y in range(x + 1, reps):
                both = (fits[x][a] >= 0) & (fits[y][a] >= 0)
                aris.append(adjusted_rand_score(fits[x][a][both], fits[y][a][both]))
        out[k] = (float(np.mean(aris)), float(np.std(aris)))
    return out


def soft_membership(Z_emb, labels):
    """Cosine similarity of each team to each archetype centroid, plus a hybrid score.

    hybrid = sim(2nd closest centroid) / sim(closest). Near 1 means the team sits
    between two archetypes (plays two game plans); near 0 means it is a pure example.
    """
    k = labels.max() + 1
    cent = normalize(np.vstack([Z_emb[labels == c].mean(0) for c in range(k)]))
    S = Z_emb @ cent.T
    top2 = np.sort(S, axis=1)[:, -2:]
    hybrid = np.clip(top2[:, 0], 0, None) / np.clip(top2[:, 1], 1e-9, None)
    second = np.argsort(S, axis=1)[:, -2]
    return S, hybrid, second
