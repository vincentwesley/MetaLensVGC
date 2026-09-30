// Sprite <img> factory. dex.species[key].sprite/.ani are build-time-resolved (scripts/sprites.js):
// only URLs known to exist (via HEAD) ever get requested, so the client never triggers a 404.
// sprite: spriteid whose gen5 png exists (own or base species'), or null (placeholder only).
// ani: existing animated sprite's URL path segment, or null.
// Pulls TYPE_COLORS from js/lib/types.js (owned by the lib agent).
// ctx.sprite / ctx.spriteUrl in main.js bind `dex` so section modules call sprite(key, opts) only.

const PS = 'https://play.pokemonshowdown.com/sprites';

let TYPE_COLORS = {};
try {
  ({ TYPE_COLORS } = await import('../lib/types.js'));
} catch {
  // lib/types.js not built yet; placeholders fall back to a neutral grey.
}

// Drawn like a gen5 sprite: a 96 px canvas with the figure in the middle ~half, so a
// placeholder takes the same visual space as a real sprite at every SPRITE_SIZES step.
function placeholderDataUri(key, type) {
  const color = TYPE_COLORS[type] || '#6b6b6b';
  const letter = (key || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">`
    + `<rect x="22" y="22" width="52" height="52" rx="7" fill="${color}"/>`
    + `<text x="48" y="58" font-size="28" text-anchor="middle" font-family="monospace" fill="#fff">${letter}</text>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function candidates(key, dex, { animated = false } = {}) {
  const sp = dex?.species?.[key];
  const chain = [];
  if (animated && sp?.ani) chain.push(`${PS}/${sp.ani}`);
  if (sp?.sprite) chain.push(`${PS}/gen5/${sp.sprite}.png`);
  chain.push(placeholderDataUri(key, sp?.types?.[0] || 'Normal'));
  return chain;
}

// The one sprite scale: exact fractions of the 96 px gen5 sprites, so pixel art never
// shows uneven, doubled pixels. xs inline (chips, KPIs, small lists), sm rows,
// md the scanner's parsed-team grid, lg 1:1 (snapshot hero, deep dive).
export const SPRITE_SIZES = { xs: 24, sm: 32, md: 48, lg: 96 };

/** Build an <img> for `key` with the fallback chain wired via onerror. size: a SPRITE_SIZES name. */
export function sprite(key, dex, { size = 'sm', animated = false } = {}) {
  const chain = candidates(key, dex, { animated });
  const img = document.createElement('img');
  const px = SPRITE_SIZES[size];
  if (!px) throw new Error(`sprite size must be one of ${Object.keys(SPRITE_SIZES)}, got ${size}`);
  img.className = `sprite sprite--${size}`;
  img.width = px;
  img.height = px;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = key || '';
  img.style.imageRendering = 'pixelated';
  let i = 0;
  img.addEventListener('error', () => {
    i += 1;
    if (i < chain.length) img.src = chain[i];
  });
  img.src = chain[0];
  return img;
}

/** Static URL (no client-side fallback chain) for ECharts rich-text/markers. */
export function spriteUrl(key, dex, { animated = false } = {}) {
  const chain = candidates(key, dex, { animated });
  return chain[0];
}
