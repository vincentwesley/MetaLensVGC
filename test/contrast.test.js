import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inkOn, contrast } from '../public/js/lib/contrast.js';
import { TYPE_COLORS } from '../public/js/lib/types.js';

// Text tokens must stay readable (WCAG AA, 4.5:1) on every surface in every
// skin/theme. Reads the colour tokens straight from app.css + palettes.css.
const css = ['app', 'palettes'].map((f) => readFileSync(new URL(`../public/css/${f}.css`, import.meta.url), 'utf8')).join('\n');

// Tokens of every rule whose selector is exactly `selector` (merged in source order).
function block(selector) {
  let bodies = '';
  for (let i = css.indexOf(`${selector} {`); i >= 0; i = css.indexOf(`${selector} {`, i + 1)) {
    if (i === 0 || css[i - 1] === '\n') bodies += css.slice(i, css.indexOf('}', i));
  }
  return Object.fromEntries([...bodies.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Resolve tokens like the cascade: :root -> skin -> theme -> palette (palettes.css), by exact selector.
// grass (the default palette) has no rules, so it resolves to the app.css tokens.
const PALETTES = ['grass', 'ghost', 'water', 'fire', 'fairy', 'electric', 'steel'];
const tokens = (skin, theme, pal) => {
  const p = `:root[data-palette="${pal}"]`;
  return {
    ...block(':root'), ...block(`[data-skin="${skin}"]`),
    ...(theme === 'dark' ? { ...block(':root[data-theme="dark"]'), ...block(`[data-skin="${skin}"][data-theme="dark"]`) } : {}),
    ...block(p), ...block(`${p}[data-skin="${skin}"]`),
    ...(theme === 'dark' ? block(`${p}[data-skin="${skin}"][data-theme="dark"]`) : {}),
  };
};

for (const pal of PALETTES) {
  for (const skin of ['pro', 'retro']) {
    for (const theme of ['light', 'dark']) {
      const name = `${pal} ${skin} ${theme}`;
      const t = tokens(skin, theme, pal);
      test(`contrast: ${name} text tokens >= 4.5:1 on every surface`, () => {
        // Selected buttons / chips: --surface-1 text on --accent. Links and focus rings: --accent-2.
        const { accent } = t, accent2 = t['accent-2'];
        assert.ok(ratio(t['surface-1'], accent) >= 4.5, `${name}: text on --accent ${accent} is ${ratio(t['surface-1'], accent).toFixed(2)}:1`);
        for (const bg of ['surface-0', 'surface-1', 'surface-2']) {
          assert.ok(ratio(accent2, t[bg]) >= 4.5, `${name}: --accent-2 ${accent2} on --${bg} is ${ratio(accent2, t[bg]).toFixed(2)}:1`);
        }
        for (const fg of ['ink', 'ink-2', 'muted']) {
          for (const bg of ['surface-0', 'surface-1', 'surface-2']) {
            assert.ok(t[fg] && t[bg], `${name}: missing --${fg} or --${bg}`);
            const r = ratio(t[fg], t[bg]);
            assert.ok(r >= 4.5, `${name}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
          }
        }
      });

      // Status text (--up / --down / --warn), badges and pills.
      test(`contrast: ${name} status text, badges and pills >= 4.5:1`, () => {
        for (const fg of ['up', 'down', 'warn']) {
          for (const bg of ['surface-0', 'surface-1', 'surface-2']) {
            assert.ok(t[fg], `${name}: missing --${fg}`);
            assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: --${fg} ${t[fg]} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}:1`);
          }
        }
        // .lib-badge / .lib-tier / .lib-arch: --surface-1 text on --accent, --accent-2 or --muted fills.
        for (const fill of ['accent', 'accent-2', 'muted']) {
          assert.ok(ratio(t['surface-1'], t[fill]) >= 4.5, `${name}: --surface-1 on --${fill} is ${ratio(t['surface-1'], t[fill]).toFixed(2)}:1`);
        }
        // Speed legend pills: --pill-ink-N on --pill-N.
        for (const n of [1, 2, 3, 4]) {
          const r = ratio(t[`pill-ink-${n}`], t[`pill-${n}`]);
          assert.ok(r >= 4.5, `${name}: --pill-ink-${n} on --pill-${n} is ${r.toFixed(2)}:1`);
        }
      });
    }
  }
}

test('contrast: inkOn gives >= 4.5:1 on every type colour and diverging ramp colour', () => {
  const div = { ...block(':root'), ...block(':root[data-theme="dark"]') };
  const fills = [...Object.values(TYPE_COLORS), ...['div-neg-2', 'div-neg-1', 'div-mid', 'div-pos-1', 'div-pos-2'].map((k) => div[k]), '#f0efec'];
  for (const bg of fills) assert.ok(contrast(inkOn(bg), bg) >= 4.5, `${bg}: ${contrast(inkOn(bg), bg).toFixed(2)}:1`);
});
