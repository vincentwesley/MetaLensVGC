"""Load MetaLens team/match files into tidy pandas tables.

Reads the committed, generated files in public/data/ (see public/data/SCHEMA.md).
Player names are replaced by stable anonymous ids (P00001, ...) before anything
leaves this module, so no research output contains a real name.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
REGS = ("M-A", "M-B", "M-C")


@dataclass
class Mon:
    species: str          # battle species as listed (never a Mega form)
    key: str              # display key: Mega form when holding its own stone
    mega: bool
    item: str | None
    ability: str | None   # effective ability (Mega's own ability when it mega evolves)
    moves: tuple[str, ...]


def load_dex() -> dict:
    return json.loads((DATA / "dex.json").read_text(encoding="utf-8"))


def _mega_key(species: str, item: str | None, dex: dict) -> str | None:
    info = dex["items"].get(item or "", {})
    mega = info.get("mega")
    if mega and info.get("megaOf") == species:
        return mega
    return None


def _effective_ability(key: str, mega: bool, ability: str | None, dex: dict) -> str | None:
    if mega:
        sp = dex["species"].get(key)
        if sp and sp.get("abilities"):
            return sp["abilities"][0]
    return ability


def decode_reg(reg: str, dex: dict) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Return (events, teams, matches) for one regulation.

    teams has one row per team with a `mons` column holding a list[Mon].
    Team ids are globally unique strings "<reg>:<index>".
    """
    raw = json.loads((DATA / f"teams-{reg}.json").read_text(encoding="utf-8"))
    S = raw["strings"]
    g = lambda i: S[i] if i is not None and i >= 0 else None  # noqa: E731

    events = pd.DataFrame(raw["events"])
    events["reg"] = reg

    rows = []
    for idx, t in enumerate(raw["teams"]):
        ev_idx, player, country, placing, w, l, ties, mons_raw = t
        mons = []
        for m in mons_raw:
            species, item, ability = g(m[0]), g(m[1]), g(m[2])
            moves = tuple(sorted({g(x) for x in m[3] if g(x)}))
            mk = _mega_key(species, item, dex)
            key = mk or species
            mons.append(Mon(species, key, bool(mk), item,
                            _effective_ability(key, bool(mk), ability, dex), moves))
        ev = raw["events"][ev_idx]
        rows.append({
            "team_id": f"{reg}:{idx}",
            "reg": reg,
            "event_id": ev["id"],
            "date": ev["date"],
            "tier": ev["tier"],
            "event_players": ev.get("players"),
            "player_raw": player.strip().lower(),
            "country": country or None,
            "placing": placing,
            "wins": w, "losses": l, "ties": ties,
            "mons": mons,
        })
    teams = pd.DataFrame(rows)
    teams["date"] = pd.to_datetime(teams["date"])

    m = pd.DataFrame(raw["matches"], columns=["a", "b", "result"])
    m["team_a"] = reg + ":" + m["a"].astype(str)
    m["team_b"] = reg + ":" + m["b"].astype(str)
    matches = m[["team_a", "team_b", "result"]].assign(reg=reg)
    return events, teams, matches


def load_all(regs=REGS) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    dex = load_dex()
    evs, tms, mts = zip(*(decode_reg(r, dex) for r in regs))
    events = pd.concat(evs, ignore_index=True)
    teams = pd.concat(tms, ignore_index=True)
    matches = pd.concat(mts, ignore_index=True)

    # Anonymize: the same lowercased name gets the same id across regulations.
    # Ids are ordered by a hash, so they reveal nothing about first appearance.
    names = sorted(teams["player_raw"].unique(),
                   key=lambda s: hashlib.sha256(s.encode()).hexdigest())
    pid = {n: f"P{i:05d}" for i, n in enumerate(names, 1)}
    teams["player"] = teams["player_raw"].map(pid)
    teams = teams.drop(columns=["player_raw"])
    return events, teams, matches, dex


def snapshot_info() -> dict:
    """The data snapshot this run used (manifest build time + per-reg counts)."""
    man = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    return {
        "generated": man["generated"],
        "regs": {r["id"]: {k: r.get(k) for k in ("start", "end", "teams", "events", "matches")}
                 for r in man["regs"] if r["id"] in REGS},
    }
