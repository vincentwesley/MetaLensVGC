// WCAG contrast helpers (pure). `inkOn(bg)` picks dark or white text for a solid #rrggbb fill,
// whichever contrasts more: used where the fill comes from data (type colours, chart ramps).
const DARK = '#0d1409';

export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const inkOn = (bg) => (/^#[0-9a-f]{6}$/i.test(bg) && contrast(bg, DARK) > contrast(bg, '#ffffff') ? DARK : '#ffffff');
