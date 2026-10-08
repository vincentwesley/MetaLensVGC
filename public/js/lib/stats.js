// Pure stat math for Pokémon Champions (VGC 2026): no EVs/IVs, Stat Points (SP)
// instead. 0-32 per stat, 66 total, Level 50.
//   HP = base + 75 + sp
//   other = floor((base + 20 + sp) * nature)
// Stat index order: [hp, atk, def, spa, spd, spe].

// name -> { plus: statIdx|null, minus: statIdx|null } (null/null = neutral)
export const NATURES = {
  Hardy: { plus: null, minus: null },
  Lonely: { plus: 1, minus: 2 },
  Brave: { plus: 1, minus: 5 },
  Adamant: { plus: 1, minus: 3 },
  Naughty: { plus: 1, minus: 4 },
  Bold: { plus: 2, minus: 1 },
  Docile: { plus: null, minus: null },
  Relaxed: { plus: 2, minus: 5 },
  Impish: { plus: 2, minus: 3 },
  Lax: { plus: 2, minus: 4 },
  Timid: { plus: 5, minus: 1 },
  Hasty: { plus: 5, minus: 2 },
  Serious: { plus: null, minus: null },
  Jolly: { plus: 5, minus: 3 },
  Naive: { plus: 5, minus: 4 },
  Modest: { plus: 3, minus: 1 },
  Mild: { plus: 3, minus: 2 },
  Quiet: { plus: 3, minus: 5 },
  Bashful: { plus: null, minus: null },
  Rash: { plus: 3, minus: 4 },
  Calm: { plus: 4, minus: 1 },
  Gentle: { plus: 4, minus: 2 },
  Sassy: { plus: 4, minus: 5 },
  Careful: { plus: 4, minus: 3 },
  Quirky: { plus: null, minus: null },
};

export function natureMult(nature, statIdx) {
  if (statIdx === 0) return 1; // HP is never affected by nature
  const n = NATURES[nature];
  if (!n) return 1;
  if (n.plus === statIdx) return 1.1;
  if (n.minus === statIdx) return 0.9;
  return 1.0;
}

// Stat rules. sp = Champions (Stat Points, Lv50); ev = Showdown classic (EVs, IV 31, Lv100).
export const RULES = {
  sp: { mode: 'sp', level: 50, max: 32, total: 66 },
  ev: { mode: 'ev', level: 100, max: 252, total: 510 },
};

/** Rules for a manifest reg entry ({level, family}); anything else is the VGC SP rules. */
export function rulesFor(reg) {
  return reg && (reg.level === 100 || reg.family === 'showdown') ? RULES.ev : RULES.sp;
}

export function calcStat(base, pts, statIdx, nature, rules = RULES.sp) {
  if (rules.mode === 'ev') {
    const core = Math.floor(((2 * base + 31 + Math.floor(pts / 4)) * rules.level) / 100);
    if (statIdx === 0) return core + rules.level + 10;
    return Math.floor((core + 5) * natureMult(nature, statIdx));
  }
  if (statIdx === 0) return base + 75 + pts;
  return Math.floor((base + 20 + pts) * natureMult(nature, statIdx));
}

export function calcStats(bs, pts, nature, rules = RULES.sp) {
  return bs.map((base, i) => calcStat(base, pts[i], i, nature, rules));
}

// "0/32/0/0/2/32" -> [0,32,0,0,2,32], or null if malformed / out of range.
export function parsePoints(str, rules = RULES.sp) {
  if (typeof str !== 'string') return null;
  const parts = str.split('/');
  if (parts.length !== 6) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > rules.max)) return null;
  return nums;
}

export const parseSP = (str) => parsePoints(str, RULES.sp);

// Wilson score interval for a binomial proportion k/n, as [lo, hi] fractions.
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const phat = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const adj = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return [(center - adj) / denom, (center + adj) / denom];
}

// exp(Shannon entropy) of usage counts, normalized to proportions.
export function effectiveSpecies(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return Math.exp(h);
}
