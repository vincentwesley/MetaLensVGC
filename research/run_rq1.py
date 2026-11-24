"""RQ1: What archetypes really exist in Pokémon Champions VGC?

Builds the hierarchical archetype map and writes everything the paper's RQ1 section
needs into research/outputs/rq1/. Run from research/:  python run_rq1.py
Deterministic (seeded); ~5 minutes on a laptop.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.cluster.hierarchy import dendrogram, to_tree  # noqa: E402
from sklearn.manifold import TSNE  # noqa: E402
from sklearn.metrics import adjusted_mutual_info_score as ami  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from src.cluster import ArchetypeTree, embed, silhouette, soft_membership, stability  # noqa: E402
from src.features import BLOCK_WEIGHTS, binary_matrix, build  # noqa: E402
from src.load import load_all, snapshot_info  # noqa: E402
from src.rules import LABELS, classify  # noqa: E402

OUT = Path(__file__).parent / "outputs" / "rq1"
FIG = OUT / "figures"
KS = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48]
LEVELS = {"L1": 8, "L2": 16, "L3": 32}   # chosen from the stability peaks (see model_selection.csv)
SEED = 0
ABLATIONS = {
    "main": BLOCK_WEIGHTS,
    "equal_blocks": {"species": 1, "mega": 1, "moves": 1, "ability": 1},
    "no_mega_block": {"species": 1, "moves": 0.5, "ability": 0.5},
    "species_only": {"species": 1},
    "moves_abilities_only": {"moves": 1, "ability": 1},
}


def wilson(k, n, z=1.96):
    if n == 0:
        return (np.nan, np.nan)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def main():
    FIG.mkdir(parents=True, exist_ok=True)
    events, teams, matches, dex = load_all()
    print(f"teams={len(teams)} matches={len(matches)} players={teams.player.nunique()}")

    # ---- community baseline + Mega anchors -------------------------------------
    teams["rule"] = [classify(m, dex)[0] for m in teams["mons"]]
    teams["mega_set"] = ["+".join(sorted(m.key for m in ms if m.mega)) or "none" for ms in teams["mons"]]
    mega_freq = Counter(m.key for ms in teams["mons"] for m in ms if m.mega)

    def primary_mega(ms):
        megas = [m.key for m in ms if m.mega]
        return max(megas, key=lambda k: mega_freq[k]) if megas else "none"
    teams["mega_primary"] = [primary_mega(ms) for ms in teams["mons"]]

    # ---- main representation, tree, model selection --------------------------
    X, names, toks = build(teams)
    Z, svd = embed(X, 64, SEED)
    tree = ArchetypeTree(Z, 400, SEED)
    stab = stability(Z, KS, reps=10, seed=SEED)
    sel = pd.DataFrame([{
        "k": k, "silhouette_cosine": silhouette(Z, tree.labels(k)),
        "stability_ari_mean": stab[k][0], "stability_ari_sd": stab[k][1],
        "smallest_cluster": int(np.bincount(tree.labels(k)).min()),
    } for k in KS])
    sel.to_csv(OUT / "model_selection.csv", index=False)
    print(sel.round(3).to_string(index=False))

    for lvl, k in LEVELS.items():
        teams[lvl] = tree.labels(k)

    # ---- hybridity (soft membership at L1) ------------------------------------
    S, hybrid, second = soft_membership(Z, teams["L1"].values)
    teams["hybrid_L1"] = hybrid
    teams["second_L1"] = second

    # ---- alignment: data-driven archetypes vs Megas vs community labels -------
    # Same number of categories on both sides keeps the comparison fair: top-9 primary
    # Megas + "other" (10 classes) vs the 10 rule labels. AMI is chance-corrected.
    top9 = [m for m, _ in Counter(teams["mega_primary"]).most_common(9)]
    mega10 = np.where(teams["mega_primary"].isin(top9), teams["mega_primary"], "other")
    rows = []
    for name, w in ABLATIONS.items():
        if name == "main":
            labs = {lvl: teams[lvl].values for lvl in LEVELS}
        else:
            Xa, _, _ = build(teams, w)
            Za, _ = embed(Xa, 64, SEED)
            ta = ArchetypeTree(Za, 400, SEED)
            labs = {lvl: ta.labels(k) for lvl, k in LEVELS.items()}
        for lvl, k in LEVELS.items():
            rows.append({
                "representation": name, "level": lvl, "k": k,
                "AMI_vs_mega10": ami(mega10, labs[lvl]),
                "AMI_vs_rules10": ami(teams["rule"], labs[lvl]),
                "AMI_vs_main": ami(teams[lvl], labs[lvl]) if name != "main" else 1.0,
            })
    align = pd.DataFrame(rows)
    align.to_csv(OUT / "alignment_ablation.csv", index=False)
    print(align.round(3).to_string(index=False))
    rule_vs_mega = ami(mega10, teams["rule"])

    # ---- archetype atlas at L3 -------------------------------------------------
    B = binary_matrix(toks, names).tocsc()
    base = np.asarray(B.mean(0)).ravel()
    idx = {t: i for i, t in enumerate(teams["team_id"])}
    mm = matches[matches.result > 0]
    ia = mm["team_a"].map(idx).to_numpy()
    ib = mm["team_b"].map(idx).to_numpy()
    a_won = (mm["result"] == 1).to_numpy()

    def win_rate(lab_arr, c):
        A, Bq = lab_arr[ia] == c, lab_arr[ib] == c
        x, y = A & ~Bq, Bq & ~A          # non-mirror games only
        w = int(a_won[x].sum() + (~a_won[y]).sum())
        n = int(x.sum() + y.sum())
        return w, n

    l3 = teams["L3"].to_numpy()
    Bd = B.tocsr()
    atlas = []
    for c in range(LEVELS["L3"]):
        m = l3 == c
        P = np.asarray(Bd[m].mean(0)).ravel()
        lift = P - base
        def pick(prefix, lo, hi=1.01, n=8):
            ids = [i for i in np.argsort(-P) if names[i].startswith(prefix) and lo <= P[i] < hi]
            return [f"{names[i].split(':', 1)[1]} ({P[i]:.0%})" for i in ids[:n]]
        # Anchor Megas: Mega forms carried by >= 70% of the archetype's teams (can be two,
        # e.g. Big Six carries Charizardite Y and Floettite).
        mega_ids = sorted((i for i in range(len(names)) if names[i].startswith("mega:") and P[i] >= 0.7),
                          key=lambda i: -P[i])
        anchors = [names[i][5:].replace("-Mega-", " ").replace("-Mega", "") for i in mega_ids]
        top_mega = names[mega_ids[0]][5:] if mega_ids else "none"
        top_mega_share = float(P[mega_ids[0]]) if mega_ids else 0.0
        stone_of = {v["mega"]: v["megaOf"] for v in dex["items"].values() if v.get("mega")}
        anchor_species = {stone_of.get(names[i][5:], names[i][5:].split("-Mega")[0]) for i in mega_ids}
        partner = [names[i][3:] for i in np.argsort(-P) if names[i].startswith("sp:")
                   and P[i] >= 0.6 and names[i][3:] not in anchor_species]
        rules = teams.loc[m, "rule"].value_counts(normalize=True)
        mode = rules.index[0] if rules.iloc[0] >= 0.5 and rules.index[0] != "other" else None
        if anchors:
            name = "Mega " + " + Mega ".join(anchors)
            if partner:
                name += f" / {partner[0]}"
        else:
            name = "Unanchored (no dominant Mega)"
        if mode and mode not in ("big-six",):
            name += f" · {LABELS[mode]}"
        elif mode == "big-six":
            name += " · Big Six"
        w, n = win_rate(l3, c)
        lo, hi = wilson(w, n)
        sig = [f"{names[i].split(':', 1)[1]}" for i in np.argsort(-lift)
               if names[i][:3] in ("mv:", "ab:") and P[i] >= 0.4][:6]
        atlas.append({
            "archetype": c, "auto_name": name, "teams": int(m.sum()), "share": m.mean(),
            "L1_parent": int(teams.loc[m, "L1"].mode()[0]), "L2_parent": int(teams.loc[m, "L2"].mode()[0]),
            "share_M-A": (teams.loc[m, "reg"] == "M-A").sum() / (teams["reg"] == "M-A").sum(),
            "share_M-B": (teams.loc[m, "reg"] == "M-B").sum() / (teams["reg"] == "M-B").sum(),
            "share_M-C": (teams.loc[m, "reg"] == "M-C").sum() / (teams["reg"] == "M-C").sum(),
            "dominant_mega": top_mega, "dominant_mega_share": top_mega_share,
            "rule_label_mix": "; ".join(f"{LABELS[k]} {v:.0%}" for k, v in rules.head(3).items()),
            "core_slots": "; ".join(pick("sp:", 0.8)),
            "flex_slots": "; ".join(pick("sp:", 0.3, 0.8)),
            "signature_moves_abilities": "; ".join(sig),
            "nonmirror_games": n, "win_rate": w / n if n else np.nan, "wr_ci_lo": lo, "wr_ci_hi": hi,
            "median_hybrid_L1": float(np.median(hybrid[m])),
        })
    atlas = pd.DataFrame(atlas).sort_values("teams", ascending=False)
    atlas.to_csv(OUT / "atlas_L3.csv", index=False)

    # ---- per-team assignments (anonymized; no Pokémon data duplicated) ---------
    keep = ["team_id", "reg", "date", "tier", "player", "country", "wins", "losses", "ties",
            "rule", "mega_primary", "mega_set", "L1", "L2", "L3", "hybrid_L1", "second_L1"]
    teams[keep].to_csv(OUT / "team_archetypes.csv", index=False)

    # ---- figures -----------------------------------------------------------------
    plt.rcParams.update({"font.size": 9, "figure.dpi": 150})
    fig, ax1 = plt.subplots(figsize=(6.5, 3))
    ax1.plot(sel.k, sel.stability_ari_mean, "o-", label="Stability (mean ARI, 10 subsamples)")
    ax1.fill_between(sel.k, sel.stability_ari_mean - sel.stability_ari_sd,
                     sel.stability_ari_mean + sel.stability_ari_sd, alpha=.2)
    ax1.plot(sel.k, sel.silhouette_cosine, "s--", label="Silhouette (cosine)")
    for k in LEVELS.values():
        ax1.axvline(k, color="grey", lw=.6, ls=":")
    ax1.set_xlabel("number of archetypes k")
    ax1.set_ylim(0, 1)
    ax1.legend(frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(FIG / "model_selection.png")
    plt.close(fig)

    # dendrogram with the 32 L3 archetypes as leaves
    name_of = dict(zip(atlas.archetype, atlas.auto_name))
    size_of = dict(zip(atlas.archetype, atlas.teams))
    root, nodes = to_tree(tree.linkage, rd=True)
    fig, ax = plt.subplots(figsize=(7, 8))
    R = dendrogram(tree.linkage, truncate_mode="lastp", p=LEVELS["L3"], orientation="left",
                   no_plot=True)
    leaf_label = {}
    for nid in R["leaves"]:
        members = nodes[nid].pre_order()
        cl = Counter(teams["L3"].values[np.isin(tree.micro_lab, members)]).most_common(1)[0][0]
        leaf_label[nid] = f"{name_of[cl]}  (n={size_of[cl]:,})"
    dendrogram(tree.linkage, truncate_mode="lastp", p=LEVELS["L3"], orientation="left", ax=ax,
               leaf_label_func=lambda nid: leaf_label.get(nid, str(nid)), color_threshold=None,
               above_threshold_color="#555")
    ax.set_xlabel("Ward merge height")
    fig.tight_layout()
    fig.savefig(FIG / "archetype_tree.png")
    plt.close(fig)

    # 2-D map (t-SNE on a stratified sample)
    rng = np.random.default_rng(SEED)
    samp = rng.choice(len(teams), size=12000, replace=False)
    emb = TSNE(n_components=2, init="pca", perplexity=40, random_state=SEED).fit_transform(Z[samp])
    l1 = teams["L1"].to_numpy()[samp]
    l1_name = {}
    for c in range(LEVELS["L1"]):
        mm_ = teams["L1"] == c
        top = teams.loc[mm_, "mega_primary"].value_counts(normalize=True)
        l1_name[c] = (f"{top.index[0].replace('-Mega-', ' ').replace('-Mega', '')} ({top.iloc[0]:.0%})"
                      if top.iloc[0] >= 0.5 else "mixed Megas")
    fig, ax = plt.subplots(figsize=(7, 6))
    cmap = plt.get_cmap("tab10")
    for c in range(LEVELS["L1"]):
        s = l1 == c
        ax.scatter(emb[s, 0], emb[s, 1], s=2, alpha=.5, color=cmap(c),
                   label=f"L1-{c}: {l1_name[c]}  ({(teams['L1'] == c).mean():.0%})")
    ax.set_xticks([])
    ax.set_yticks([])
    ax.legend(markerscale=5, frameon=False, fontsize=7, loc="upper left", bbox_to_anchor=(1, 1))
    ax.set_title("12,000 teams, t-SNE of team vectors, coloured by L1 archetype")
    fig.tight_layout()
    fig.savefig(FIG / "team_map_tsne.png", bbox_inches="tight")
    plt.close(fig)

    # hybridity histogram
    fig, ax = plt.subplots(figsize=(5, 2.6))
    ax.hist(hybrid, bins=50, color="#3a7")
    ax.set_xlabel("hybrid score at L1 (2nd-closest / closest centroid similarity)")
    ax.set_ylabel("teams")
    fig.tight_layout()
    fig.savefig(FIG / "hybridity.png")
    plt.close(fig)

    # ---- summary ---------------------------------------------------------------
    main_align = align[align.representation == "main"].set_index("level")
    summary = {
        "data_snapshot": snapshot_info(),
        "n_teams": len(teams), "n_matches_decided": int(len(mm)), "n_players": int(teams.player.nunique()),
        "feature_vocab": len(names), "svd_variance_explained": float(svd.explained_variance_ratio_.sum()),
        "levels": LEVELS,
        "share_rule_other": float((teams.rule == "other").mean()),
        "AMI_rules_vs_mega10": rule_vs_mega,
        "AMI_main": main_align[["AMI_vs_mega10", "AMI_vs_rules10"]].to_dict("index"),
        "hybrid_share_ge_0.9": float((hybrid >= 0.9).mean()),
        "hybrid_share_ge_0.8": float((hybrid >= 0.8).mean()),
        "teams_without_mega_stone": float((teams.mega_primary == "none").mean()),
    }
    # Experience proxy for the unanchored archetype: how many events its players entered
    # (in the whole dataset). Lower values suggest newer players, which matters when its
    # win rate is read; the skill-adjusted model in RQ2 handles this properly.
    events_per_player = teams.groupby("player")["event_id"].nunique()
    teams["player_events"] = teams["player"].map(events_per_player)
    unanch = atlas.loc[atlas.auto_name.str.startswith("Unanchored"), "archetype"].tolist()
    is_un = teams["L3"].isin(unanch)
    summary["unanchored"] = {
        "archetypes": unanch,
        "share_by_reg": teams.groupby("reg").apply(lambda d: d["L3"].isin(unanch).mean()).to_dict(),
        "median_player_events_unanchored": float(teams.loc[is_un, "player_events"].median()),
        "median_player_events_other": float(teams.loc[~is_un, "player_events"].median()),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, default=float))
    print(json.dumps(summary, indent=2, default=float))


if __name__ == "__main__":
    main()
