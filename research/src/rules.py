"""Python port of MetaLens's hand-written archetype rules (public/js/lib/archetypes.js).

Used as the "community label" baseline that data-driven archetypes are compared against.
Keep in sync with archetypes.js: same rules, same priority order.
"""
from __future__ import annotations

from .load import Mon

ORDER = ["sala-fakeout", "big-six", "psy-tr", "trick-room", "sun", "rain", "sand", "snow", "tailwind"]
LABELS = {
    "sala-fakeout": "Salamence + Fake Out", "big-six": "Big Six", "psy-tr": "Psychic Terrain Trick Room",
    "trick-room": "Trick Room", "sun": "Sun", "rain": "Rain", "sand": "Sand", "snow": "Snow",
    "tailwind": "Tailwind", "other": "Other",
}


def _has_ability(mons: list[Mon], a: str) -> bool:
    return any(m.ability == a for m in mons)


def _has_move(mons: list[Mon], mv: str) -> bool:
    return any(mv in m.moves for m in mons)


def _slow_count(mons: list[Mon], dex: dict, max_spe: int = 60) -> int:
    n = 0
    for m in mons:
        sp = dex["species"].get(m.key) or dex["species"].get(m.species)
        if sp and sp["bs"][5] <= max_spe:
            n += 1
    return n


def classify(mons: list[Mon], dex: dict) -> list[str]:
    keys = {m.key for m in mons}
    psy_tr = _has_ability(mons, "Psychic Surge") and _has_move(mons, "Trick Room")
    tr = (not psy_tr) and _has_move(mons, "Trick Room") and _slow_count(mons, dex) >= 2
    tests = {
        "sala-fakeout": "Salamence-Mega" in keys and sum("Fake Out" in m.moves for m in mons) >= 2,
        "big-six": "Charizard-Mega-Y" in keys and "Floette-Mega" in keys,
        "psy-tr": psy_tr,
        "trick-room": tr,
        "sun": _has_ability(mons, "Drought"),
        "rain": _has_ability(mons, "Drizzle"),
        "sand": _has_ability(mons, "Sand Stream"),
        "snow": _has_ability(mons, "Snow Warning"),
        "tailwind": _has_move(mons, "Tailwind") and not tr,
    }
    ids = [k for k in ORDER if tests[k]]
    return ids or ["other"]
