// Chip row: renders state.chips as pills with × remove + "Clear all".
// Species chips get a sprite; type chips get a type-coloured swatch; everything else a plain label.
import { fireflies } from './motion.js';
import { fmt } from './fmt.js';

let TYPE_COLORS = {};
try {
  ({ TYPE_COLORS } = await import('../lib/types.js'));
} catch {
  // lib/types.js not built yet; swatches fall back to a neutral grey.
}

let speciesChipFilter = null;
try {
  ({ speciesChipFilter } = await import('../lib/aggregate.js'));
} catch { /* lib not built */ }

let ARCH_LABELS = {};
try {
  const { ARCHETYPES } = await import('../lib/archetypes.js');
  ARCH_LABELS = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a.label]));
} catch { /* fall back to ids */ }

const KIND_LABEL = {
  type: 'Type', weak: 'Weak to', item: 'Item', move: 'Move', movetype: 'Move type',
  archetype: 'Archetype', core: 'Core', mega: 'Mega', team: 'Team', country: 'Country',
};
const MON_KINDS = new Set(['species', 'mega', 'core', 'type', 'weak', 'item', 'move', 'movetype']);

// teamLabel(id): team ids are opaque ("lt:6ab47b…:player"); ctx.teamLabel names the team once data is loaded.
function labelFor(chip, teamLabel = () => null) {
  const v = Array.isArray(chip.value) ? chip.value.join(' + ')
    : chip.kind === 'archetype' ? (ARCH_LABELS[chip.value] || chip.value)
    : chip.kind === 'country' ? fmt.country(chip.value)
    : chip.kind === 'team' ? (teamLabel(chip.value) || chip.value)
    : String(chip.value);
  const kind = KIND_LABEL[chip.kind];
  return `${kind ? `${kind}: ` : ''}${v}`; // negation is shown by the chip style ("NOT")
}

// One line under the chips saying what they do to the page.
function scopeNote(state, dex) {
  if (state.source !== 'tournaments') {
    const un = speciesChipFilter ? speciesChipFilter(state.chips, dex).unsupported : state.chips;
    if (!un.length) return 'Ladder and in-game ranked rows are per Pokémon: only the Pokémon matching the chips are shown.';
    return `${un.map(labelFor).join(', ')} need${un.length === 1 ? 's' : ''} tournament team sheets and ${un.length === 1 ? 'is' : 'are'} ignored for this source; switch Source to Tournaments to apply ${un.length === 1 ? 'it' : 'them'}.`;
  }
  const mon = state.chips.filter((c) => MON_KINDS.has(c.kind) && !c.neg);
  if (!mon.length) return 'Showing teams that match every chip.';
  return 'Pokémon charts count only the matching Pokémon · team views (teammates, archetypes, library) show their whole teams.';
}

// Identity of a chip, to tell a newly added one from one that was already there.
const chipSig = (c) => `${c.neg ? '!' : ''}${c.kind}:${[].concat(c.value).join('+')}`;

export function mountChips(el, ctx) {
  // Chips already present at load (from the URL) don't animate; later additions do.
  let seen = new Set(ctx.store.get().chips.map(chipSig));
  function render(state) {
    el.textContent = '';
    const before = seen;
    seen = new Set(state.chips.map(chipSig));
    if (!state.chips.length) return;
    const title = document.createElement('span');
    title.className = 'chips__title';
    const count = document.createElement('span');
    count.className = 'chips__count';
    count.textContent = String(state.chips.length);
    title.append('Active filters', count);
    el.appendChild(title);
    for (let i = 0; i < state.chips.length; i++) {
      const chip = state.chips[i];
      const pill = document.createElement('span');
      pill.className = `chip${chip.neg ? ' chip--neg' : ''}`;
      // A new chip pops in with a brief firefly glow (css .chip--new); the rest stay still.
      if (!before.has(chipSig(chip))) {
        pill.classList.add('chip--new');
        pill.appendChild(fireflies([[18, 20], [50, 0], [82, 30], [66, 90]]));
      }

      if (chip.kind === 'species' || chip.kind === 'mega') {
        pill.appendChild(ctx.sprite(chip.value, { size: 'xs' }));
      } else if (chip.kind === 'type' || chip.kind === 'weak' || chip.kind === 'movetype') {
        const sw = document.createElement('span');
        sw.className = 'chip__swatch';
        sw.style.background = TYPE_COLORS[chip.value] || 'var(--muted)';
        pill.appendChild(sw);
      }

      const label = document.createElement('span');
      label.className = 'chip__label';
      label.textContent = labelFor(chip, ctx.teamLabel);
      pill.appendChild(label);

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip__x';
      x.setAttribute('aria-label', `Remove ${chip.neg ? 'NOT ' : ''}${labelFor(chip, ctx.teamLabel)} filter`);
      x.title = 'Remove this filter';
      x.textContent = '×';
      x.addEventListener('click', () => ctx.store.removeChip(i));
      pill.appendChild(x);

      el.appendChild(pill);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'chips__clear';
    clear.textContent = '✕ Clear all';
    clear.title = 'Remove every filter chip';
    clear.addEventListener('click', () => ctx.store.clearChips());
    el.appendChild(clear);
    const note = document.createElement('span');
    note.className = 'chips__note';
    note.textContent = scopeNote(state, ctx.dex);
    title.title = note.textContent; // the note is hidden on phones
    el.appendChild(note);
  }

  render(ctx.store.get());
  ctx.store.subscribe(render);
  return { update: render };
}
