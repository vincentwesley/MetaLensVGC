// Chip row: renders state.chips as pills with × remove + "Clear all".
// Species chips get a sprite; type chips get a type-coloured swatch; everything else a plain label.

let TYPE_COLORS = {};
try {
  ({ TYPE_COLORS } = await import('../lib/types.js'));
} catch {
  // lib/types.js not built yet; swatches fall back to a neutral grey.
}

function labelFor(chip, dex) {
  if (Array.isArray(chip.value)) return chip.value.join(' + ');
  return String(chip.value);
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
      } else if (chip.kind === 'type') {
        const sw = document.createElement('span');
        sw.className = 'chip__swatch';
        sw.style.background = TYPE_COLORS[chip.value] || 'var(--muted)';
        pill.appendChild(sw);
      }

      const label = document.createElement('span');
      label.className = 'chip__label';
      label.textContent = labelFor(chip, ctx.dex);
      pill.appendChild(label);

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip__x';
      x.setAttribute('aria-label', `Remove ${labelFor(chip, ctx.dex)} filter`);
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
  }

  render(ctx.store.get());
  ctx.store.subscribe(render);
  return { update: render };
}
