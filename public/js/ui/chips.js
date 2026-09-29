// Chip row: renders state.chips as pills with × remove + "Clear all".
// Species chips get a sprite; type chips get a type-coloured swatch; everything else a plain label.

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
  archetype: 'Archetype', core: 'Core', mega: 'Mega', team: 'Team',
};
const MON_KINDS = new Set(['species', 'mega', 'core', 'type', 'weak', 'item', 'move', 'movetype']);

function labelFor(chip) {
  const v = Array.isArray(chip.value) ? chip.value.join(' + ')
    : chip.kind === 'archetype' ? (ARCH_LABELS[chip.value] || chip.value)
    : String(chip.value);
  const kind = KIND_LABEL[chip.kind];
  return `${chip.neg ? 'Not ' : ''}${kind ? `${kind}: ` : ''}${v}`;
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
  return 'Pokémon views (leaderboard, types, items, speed, trends) count only the Pokémon matching the Pokémon chips together; teammates, archetypes and the team library show those whole teams.';
}

export function mountChips(el, ctx) {
  function render(state) {
    el.textContent = '';
    if (!state.chips.length) return;
    for (let i = 0; i < state.chips.length; i++) {
      const chip = state.chips[i];
      const pill = document.createElement('span');
      pill.className = `chip${chip.neg ? ' chip--neg' : ''}`;

      if (chip.kind === 'species' || chip.kind === 'mega') {
        pill.appendChild(ctx.sprite(chip.value, { size: 20 }));
      } else if (chip.kind === 'type' || chip.kind === 'weak' || chip.kind === 'movetype') {
        const sw = document.createElement('span');
        sw.className = 'chip__swatch';
        sw.style.background = TYPE_COLORS[chip.value] || 'var(--muted)';
        pill.appendChild(sw);
      }

      const label = document.createElement('span');
      label.className = 'chip__label';
      label.textContent = labelFor(chip);
      pill.appendChild(label);

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip__x';
      x.setAttribute('aria-label', `Remove ${labelFor(chip)} filter`);
      x.textContent = '×';
      x.addEventListener('click', () => ctx.store.removeChip(i));
      pill.appendChild(x);

      el.appendChild(pill);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'chips__clear';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', () => ctx.store.clearChips());
    el.appendChild(clear);
    const note = document.createElement('span');
    note.className = 'chips__note';
    note.textContent = scopeNote(state, ctx.dex);
    el.appendChild(note);
  }

  render(ctx.store.get());
  ctx.store.subscribe(render);
  return { update: render };
}
