// Team archetype classification. `team` is the decoded Team shape
// (js/lib/aggregate.js#decode); `dex` is dex.json.
//
// Ambiguity resolved: Mon.ability records the *battle species'* ability
// (what the recon source lists before mega evolving), but a Mega form has a
// single fixed ability of its own (e.g. Charizard-Mega-Y is always Drought,
// regardless of whether the sheet says Blaze or Solar Power). So weather/
// terrain checks use the *effective* ability: the Mega form's own ability
// when the mon is holding its own stone, else the recorded ability.

function effectiveAbility(mon, dex) {
  if (mon.mega) {
    const sp = dex.species[mon.k];
    if (sp && sp.abilities && sp.abilities.length) return sp.abilities[0];
  }
  return mon.ability;
}

function hasAbility(team, dex, ability) {
  return team.mons.some((m) => effectiveAbility(m, dex) === ability);
}

function hasMove(team, move) {
  return team.mons.some((m) => m.moves.includes(move));
}

function countMove(team, move) {
  return team.mons.filter((m) => m.moves.includes(move)).length;
}

function baseSpe(mon, dex) {
  const sp = dex.species[mon.k] || dex.species[mon.s];
  return sp ? sp.bs[5] : null;
}

function slowMonCount(team, dex, max = 60) {
  return team.mons.filter((m) => {
    const spe = baseSpe(m, dex);
    return spe != null && spe <= max;
  }).length;
}

const isPsyTR = (team, dex) => hasAbility(team, dex, 'Psychic Surge') && hasMove(team, 'Trick Room');
const isTrickRoom = (team, dex) =>
  !isPsyTR(team, dex) && hasMove(team, 'Trick Room') && slowMonCount(team, dex) >= 2;

export const ARCHETYPES = [
  {
    id: 'sala-fakeout',
    label: 'Salamence + Fake Out',
    desc: 'Mega Salamence (holding Salamencite) plus at least two Fake Out users.',
    test: (team) => team.keys.includes('Salamence-Mega') && countMove(team, 'Fake Out') >= 2,
  },
  {
    id: 'big-six',
    label: 'Big Six',
    desc: 'Mega Charizard-Y and Mega Floette (Floette-Eternal holding Floettite) on the same team. ' +
      'Checked via team.keys rather than the single Team.mega field, since a roster can legally carry ' +
      'two different Mega Stones even though only one mon actually mega evolves in battle.',
    test: (team) => team.keys.includes('Charizard-Mega-Y') && team.keys.includes('Floette-Mega'),
  },
  {
    id: 'psy-tr',
    label: 'Psychic Terrain Trick Room',
    desc: 'Psychic Surge (Indeedee/Indeedee-F) plus at least one Trick Room user.',
    test: (team, dex) => isPsyTR(team, dex),
  },
  {
    id: 'trick-room',
    label: 'Trick Room',
    desc: 'At least one Trick Room user and at least two mons with base Speed ≤ 60, and not already ' +
      'classified as psy-tr (which is Trick Room too, but built around Psychic Surge specifically).',
    test: (team, dex) => isTrickRoom(team, dex),
  },
  {
    id: 'sun',
    label: 'Sun',
    desc: 'At least one mon whose effective ability (post-Mega if applicable) is Drought. Covers both ' +
      'direct setters (Torkoal) and Charizard-Mega-Y, whose ability becomes Drought only after mega evolving.',
    test: (team, dex) => hasAbility(team, dex, 'Drought'),
  },
  {
    id: 'rain',
    label: 'Rain',
    desc: 'At least one mon with the ability Drizzle.',
    test: (team, dex) => hasAbility(team, dex, 'Drizzle'),
  },
  {
    id: 'sand',
    label: 'Sand',
    desc: 'At least one mon with the ability Sand Stream.',
    test: (team, dex) => hasAbility(team, dex, 'Sand Stream'),
  },
  {
    id: 'snow',
    label: 'Snow',
    desc: 'At least one mon with the ability Snow Warning.',
    test: (team, dex) => hasAbility(team, dex, 'Snow Warning'),
  },
  {
    id: 'tailwind',
    label: 'Tailwind',
    desc: 'At least one Tailwind user, and not already classified as trick-room (the two game plans ' +
      'are mutually exclusive: Tailwind wants your team fast, Trick Room wants it slow).',
    test: (team, dex) => hasMove(team, 'Tailwind') && !isTrickRoom(team, dex),
  },
];

// Priority order above is also match order: primary archetype = classify()[0].
export function classify(team, dex) {
  const ids = ARCHETYPES.filter((a) => a.test(team, dex)).map((a) => a.id);
  return ids.length ? ids : ['other'];
}
