// speed.js — Speed tier matrix for the top ~20 species. Per species, the real
// most-common speed comes from (1) open team sheets, (2) the in-game ranked
// ladder's top spread + top nature, (3) this reg's Smogon ladder spreads, or
// (4) a labelled theoretical [min,max] range from base stats when none exists. Toggles apply stage/field speed modifiers (combinable,
// floored after each step); a benchmark form compares a hypothetical mon
// against the field.
import { usage, speedTiers, ladderMerge, rankedSeason, rankedMon, rankedSpeed, rankedMegaKey } from '../lib/aggregate.js';
import { rankedSource } from '../ui/meta.js';
import { calcStat, parseSP } from '../lib/stats.js';

function card(title) {
  const el = document.createElement('div');
  el.className = 'card';
  const head = document.createElement('div');
  head.className = 'card__head';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  const meta = document.createElement('div');
  meta.className = 'meta-line';
  head.append(h3, meta);
  const body = document.createElement('div');
  body.className = 'card__body';
  el.append(head, body);
  return { el, body, meta };
}

function emptyState(msg, title = 'Insufficient data') {
  const div = document.createElement('div');
  div.className = 'empty-state';
  const t = document.createElement('div');
  t.className = 'empty-state__title';
  t.textContent = title;
  const p = document.createElement('div');
  p.textContent = msg;
  div.append(t, p);
  return div;
}

function richKey(k) { return `sp_${k.replace(/[^a-zA-Z0-9]/g, '_')}`; }

// Luminance-aware label colour: blend the bar's fill (which may be
// semi-transparent, e.g. theoretical-bounds bars) over the chart surface,
// then pick dark or light text off the resulting background's real
// luminance rather than guessing from the raw colour alone.
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function relLuminance([r, g, b]) {
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function labelStyleFor(fillHex, opacity, surfaceHex) {
  const fg = hexToRgb(fillHex);
  const bg = hexToRgb(surfaceHex || '#ffffff');
  const blended = fg.map((v, i) => Math.round(bg[i] + (v - bg[i]) * opacity));
  const dark = relLuminance(blended) > 0.45;
  return dark ? { fill: '#141008', halo: 'rgba(255,255,255,.85)' } : { fill: '#fbf8f0', halo: 'rgba(0,0,0,.55)' };
}

// Order documented in the toggle row's [data-tip]; each step floors before the next.
const MOD_STEPS = [
  ['paralysis', 0.5, 'Paralysis'],
  ['icy', 2 / 3, '−1 stage / Icy Wind'],
  ['plus1', 1.5, '+1 stage'],
  ['tailwind', 2, 'Tailwind'],
  ['scarf', 1.5, 'Choice Scarf'],
];
const MOD_ORDER_TIP = `Applied in order, flooring after each step: ${MOD_STEPS.map((m) => m[2]).join(' -> ')}. Trick Room reverses turn order instead of scaling Speed.`;

function applyMods(v, mods) {
  let x = v;
  for (const [key, mult] of MOD_STEPS) if (mods[key]) x = Math.floor(x * mult);
  return x;
}

// Species list: top 20 by in-game rank under source=ranked (when the season publishes a ranking),
// else top 20 tournament species. Mega-stone holders are shown as their Mega form.
function speciesList(view, dex, season) {
  if (view.state.source !== 'ranked' || !season?.ranking) return speedTiers(view.teams, dex, 20);
  const byKey = new Map(speedTiers(view.teams, dex, 99999).map((t) => [t.key, t]));
  return season.ranking.filter((name) => season.mons[name]).slice(0, 20).map((name) => {
    const key = rankedMegaKey(name, season.mons[name], dex) || name;
    return { ...(byKey.get(key) || { key, spe: null }), key, n: null, rank: season.mons[name].rank };
  });
}

// Real most-common speed per species: team sheets -> in-game ranked spread -> Smogon ladder -> bounds.
function buildRows(view, dex) {
  const season = rankedSeason(view.ranked, view.state.from, view.state.to);
  const tiers = speciesList(view, dex, season);
  const merged = ladderMerge(view.ladder, view.state.from, view.state.to);
  const rows = [];
  for (const t of tiers) {
    const bs = dex.species[t.key]?.bs;
    if (!bs) continue;
    if (t.spe != null) {
      rows.push({ key: t.key, n: t.n, rank: t.rank, source: 'sheet', detail: `${t.nature}, ${t.sp} SP (${Math.round(t.share * 100)}% of open sheets)`, min: t.spe, max: t.spe });
      continue;
    }
    const rm = rankedMon(season, t.key, dex);
    const rs = rm && rankedSpeed(rm.mon, bs);
    if (rs) {
      const of = rm.name === t.key ? '' : ` (${rm.name} data, all sets)`;
      rows.push({ key: t.key, n: t.n, rank: t.rank, source: 'ranked',
        detail: `${season.season}: top nature ${rs.nature} (${Math.round(rs.naturePct * 100)}%), top spread ${rs.sp} Spe SP (${Math.round(rs.spreadPct * 100)}%)${of}`,
        min: rs.spe, max: rs.spe });
      continue;
    }
    const mon = merged?.mons.find((m) => m.key === t.key);
    const spread = mon?.spreads?.[0];
    const ci = spread ? spread.name.indexOf(':') : -1;
    const sp = ci > 0 ? parseSP(spread.name.slice(ci + 1)) : null;
    if (spread && sp) {
      const nature = spread.name.slice(0, ci);
      const spe = calcStat(bs[5], sp[5], 5, nature);
      rows.push({ key: t.key, n: t.n, rank: t.rank, source: 'ladder', detail: `${nature}, ${sp[5]} SP (${Math.round(spread.pct * 100)}% of ladder sets)`, min: spe, max: spe });
      continue;
    }
    const max = calcStat(bs[5], 32, 5, 'Timid');
    const min = calcStat(bs[5], 0, 5, 'Sassy');
    rows.push({ key: t.key, n: t.n, rank: t.rank, source: 'bounds', detail: 'no open-sheet, ranked or ladder spread — theoretical range', min, max });
  }
  return rows;
}

const SOURCE_LABEL = { sheet: 'Team sheets', ranked: 'Ranked ladder spread', ladder: 'Smogon ladder', bounds: 'Theoretical bounds' };
const SOURCE_VAR = { sheet: 'var(--series-1)', ranked: 'var(--series-2)', ladder: 'var(--series-3)', bounds: 'var(--muted)' };
const BENCH_NATURES = { plus: 'Timid', neutral: 'Serious', minus: 'Sassy' };

export default {
  id: 'speed',
  title: 'Speed Tiers',
  mount(el, ctx) {
    el.classList.add('sb-grid');
    const main = card('Speed tier matrix');
    main.el.classList.add('sb-full');
    el.append(main.el);

    // --- toggles -------------------------------------------------------
    const controls = document.createElement('div');
    controls.className = 'sb-controls';
    controls.setAttribute('data-tip', MOD_ORDER_TIP);
    const mods = { paralysis: false, icy: false, plus1: false, tailwind: false, scarf: false, trickRoom: false };
    const TOGGLE_DEFS = [
      ['tailwind', 'Tailwind ×2'], ['scarf', 'Choice Scarf ×1.5'], ['plus1', '+1 ×1.5'],
      ['icy', '−1 / Icy Wind ×2/3'], ['paralysis', 'Paralysis ×0.5'], ['trickRoom', 'Trick Room (reverse order)'],
    ];
    for (const [key, label] of TOGGLE_DEFS) {
      const l = document.createElement('label');
      l.className = 'toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => { mods[key] = input.checked; render(); });
      const track = document.createElement('span');
      track.className = 'toggle__track';
      l.append(input, track, document.createTextNode(label));
      controls.appendChild(l);
    }
    main.body.appendChild(controls);

    // --- legend ----------------------------------------------------------
    const legend = document.createElement('div');
    legend.className = 'sb-controls';
    for (const [src, label] of Object.entries(SOURCE_LABEL)) {
      const item = document.createElement('span');
      item.className = 'pill';
      item.style.background = SOURCE_VAR[src];
      item.textContent = label;
      legend.appendChild(item);
    }
    main.body.appendChild(legend);

    const chartEl = document.createElement('div');
    chartEl.className = 'sb-chart--tall';
    chartEl.style.width = '100%';
    const emptyEl = document.createElement('div');
    main.body.append(chartEl, emptyEl);
    const chart = ctx.echarts.init(chartEl);
    new ResizeObserver(() => chart.resize()).observe(chartEl);

    // --- benchmark form ----------------------------------------------------
    const bench = document.createElement('div');
    bench.className = 'sb-bench';
    const benchLabelSp = document.createElement('span');
    benchLabelSp.className = 'filterbar__label';
    benchLabelSp.textContent = 'My Pokémon';
    const speciesInput = document.createElement('input');
    speciesInput.type = 'text';
    speciesInput.setAttribute('list', 'speed-species-list');
    speciesInput.placeholder = 'Species…';
    const datalist = document.createElement('datalist');
    datalist.id = 'speed-species-list';
    const spLabel = document.createElement('span');
    spLabel.className = 'filterbar__label';
    spLabel.textContent = 'Speed SP';
    const spSlider = document.createElement('input');
    spSlider.type = 'range'; spSlider.min = '0'; spSlider.max = '32'; spSlider.step = '1'; spSlider.value = '32';
    const spVal = document.createElement('span');
    spVal.className = 'filterbar__label';
    spVal.textContent = '32';
    const natureSelect = document.createElement('select');
    for (const [v, t] of [['plus', '+Spe nature'], ['neutral', 'Neutral nature'], ['minus', '−Spe nature']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; natureSelect.appendChild(o);
    }
    const result = document.createElement('div');
    result.className = 'sb-bench__result';
    bench.append(benchLabelSp, speciesInput, datalist, spLabel, spSlider, spVal, natureSelect, result);
    main.body.appendChild(bench);

    speciesInput.addEventListener('change', render);
    natureSelect.addEventListener('change', render);
    spSlider.addEventListener('input', () => { spVal.textContent = spSlider.value; render(); });

    let lastView = null;
    let lastDex = null;

    function benchmarkValue() {
      const key = speciesInput.value.trim();
      const sp = lastDex?.species?.[key];
      if (!sp) return null;
      const nature = BENCH_NATURES[natureSelect.value];
      const base = calcStat(sp.bs[5], Number(spSlider.value), 5, nature);
      return { key, base, modded: applyMods(base, mods) };
    }

    function render() {
      const view = lastView;
      if (!view) return;
      lastDex = view.dex;
      const rows = buildRows(view, view.dex);
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      if (view.state.source === 'ranked' && season?.ranking) {
        ctx.meta(main.meta, { source: `${rankedSource(season)} · top 20 by in-game rank · speeds: sheets > ranked > Smogon > bounds` });
      } else {
        const rankedTxt = season ? ` + ranked ladder ${season.season} (Pokémon Champions Battle Data)` : '';
        ctx.meta(main.meta, { source: `Team sheets${rankedTxt} + Smogon ladder + bounds (per species)`, n: view.teams.length, unit: 'teams' });
      }
      main.body.querySelector('.empty-state')?.remove();

      if (!datalist.childElementCount && view.dex?.species) {
        for (const key of Object.keys(view.dex.species)) {
          const o = document.createElement('option');
          o.value = key;
          datalist.appendChild(o);
        }
      }

      if (!rows.length) {
        chartEl.style.display = 'none';
        bench.style.display = 'none';
        controls.style.display = 'none';
        legend.style.display = 'none';
        main.body.appendChild(emptyState('Insufficient data'));
        return;
      }
      chartEl.style.display = '';
      bench.style.display = '';
      controls.style.display = '';
      legend.style.display = '';

      const modded = rows.map((r) => {
        const min = applyMods(r.min, mods);
        const max = applyMods(r.max, mods);
        return { ...r, modMin: min, modMax: max, modAvg: (min + max) / 2 };
      });
      modded.sort((a, b) => (mods.trickRoom ? a.modAvg - b.modAvg : b.modAvg - a.modAvg));

      chartEl.style.height = `${Math.max(220, modded.length * 26 + 70)}px`;
      chart.resize();

      const theme = ctx.chartTheme();
      const keys = modded.map((r) => r.key).reverse(); // ECharts category axis renders bottom-up
      const rowsRev = modded.slice().reverse();
      const rich = {};
      for (const k of keys) rich[richKey(k)] = { height: 20, width: 20, backgroundColor: { image: ctx.spriteUrl(k) } };
      const colorOf = (src) => ({ sheet: theme.series[0], ranked: theme.series[1], ladder: theme.series[2] }[src] || theme.muted);

      const bench0 = benchmarkValue();
      const markLine = bench0 ? {
        silent: false,
        symbol: 'none',
        lineStyle: { color: theme.status.warning, type: 'dashed', width: 2 },
        label: { formatter: `You (${bench0.key})`, color: theme.ink, fontFamily: theme.fontFamily, position: 'insideEndTop' },
        data: [{ xAxis: bench0.modded }],
      } : { data: [] };

      chart.setOption({
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border, textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const r = rowsRev[p.dataIndex];
            const rangeTxt = r.modMin === r.modMax ? `${r.modMin}` : `${r.modMin}–${r.modMax}`;
            return `<b>${r.key}</b><br/>Speed: ${rangeTxt}<br/>${SOURCE_LABEL[r.source]} — ${r.detail}<br/>${r.rank ? `in-game rank #${r.rank}` : `n=${ctx.fmt.n(r.n)}`}`;
          },
        },
        grid: { left: 30, right: 30, top: 10, bottom: 20, containLabel: false },
        xAxis: { type: 'value', name: 'Speed', nameLocation: 'middle', nameGap: 26, axisLine: { lineStyle: { color: theme.axis } }, axisLabel: { color: theme.muted, fontFamily: theme.fontFamily }, splitLine: { lineStyle: { color: theme.grid } } },
        yAxis: { type: 'category', data: keys, axisLabel: { formatter: (v) => `{${richKey(v)}|}`, rich, margin: 10 }, axisLine: { lineStyle: { color: theme.axis } } },
        series: [
          {
            // Invisible offset segment so the visible segment below floats
            // from modMin instead of starting at 0 — a real min-max range
            // bar for theoretical-bounds rows. Point rows (sheet/ladder) get
            // offset 0, so their bar is just the usual full-length bar.
            type: 'bar', stack: 'speed', barMaxWidth: 16, silent: true,
            itemStyle: { color: 'transparent' },
            data: rowsRev.map((r) => (r.source === 'bounds' ? r.modMin : 0)),
          },
          {
            type: 'bar', stack: 'speed', barMaxWidth: 16,
            data: rowsRev.map((r) => {
              const opacity = r.source === 'bounds' ? 0.55 : 1;
              const fill = colorOf(r.source);
              return {
                value: r.source === 'bounds' ? r.modMax - r.modMin : r.modAvg,
                itemStyle: { color: fill, opacity, borderRadius: [0, 3, 3, 0] },
                _labelStyle: labelStyleFor(fill, opacity, theme.surface),
              };
            }),
            label: {
              show: true, position: 'insideLeft', align: 'left', fontFamily: theme.fontFamily, fontSize: 11, fontWeight: 600,
              formatter: (p) => {
                const r = rowsRev[p.dataIndex];
                const val = r.modMin === r.modMax ? `${r.modMin}` : `${r.modMin}–${r.modMax}`;
                return `${r.key}  ${val}`;
              },
              color: (p) => p.data._labelStyle.fill,
              textBorderColor: (p) => p.data._labelStyle.halo,
              textBorderWidth: 1.2,
            },
            markLine,
          },
        ],
      }, true);

      if (bench0) {
        const cmp = mods.trickRoom
          ? modded.filter((r) => r.modAvg > bench0.modded).length
          : modded.filter((r) => r.modAvg < bench0.modded).length;
        const ties = modded.filter((r) => r.modAvg === bench0.modded).length;
        result.textContent = mods.trickRoom
          ? `Under Trick Room, acts before ${cmp} of ${modded.length} · ties ${ties} (Speed ${bench0.modded})`
          : `Outspeeds ${cmp} of ${modded.length} · ties ${ties} (Speed ${bench0.modded})`;
      } else {
        result.textContent = speciesInput.value.trim() ? 'Unknown species.' : 'Pick a species to benchmark it against the field.';
      }
    }

    ctx.onTheme(() => render());

    return {
      update(view) { lastView = view; render(); },
      highlight() {
        // Chart rows aren't individually addressable by hover from other sections.
      },
    };
  },
};
