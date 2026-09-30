// teammates.js — co-usage heatmap of the top ~15 species (Raw % / Lift toggle,
// sprite axis labels), top 3-Pokémon cores, and a "teammate rate" list for a
// picked species: tournament team sheets by default, Smogon's ladder teammate %
// when Source = Ladder and that period has ladder data.
import { usage, atMinN, coUsage, cores, ladderMerge, rankedSeason, speciesDetail } from '../lib/aggregate.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

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

// Luminance-aware cell text: interpolate the *actual* rendered ramp colour
// at this cell (diverging for lift, sequential for raw %) and pick ink/white
// off its real luminance, with a thin halo of the opposite for legibility
// through a ramp's pale middle band.
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function mixRgb(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function relLuminance([r, g, b]) {
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function rampColorAt(stops, norm) {
  const rgbs = stops.map(hexToRgb);
  const t = Math.min(1, Math.max(0, norm)) * (rgbs.length - 1);
  const i = Math.min(rgbs.length - 2, Math.floor(t));
  return mixRgb(rgbs[i], rgbs[i + 1], t - i);
}
function cellLabelStyle(stops, norm) {
  const dark = relLuminance(rampColorAt(stops, norm)) > 0.45;
  return dark ? { fill: '#141008', halo: 'rgba(255,255,255,.85)' } : { fill: '#fbf8f0', halo: 'rgba(0,0,0,.55)' };
}

export default {
  id: 'teammates',
  title: 'Teammates & Cores',
  mount(el, ctx) {
    el.classList.add('sb-grid');

    const heat = card('Teammate co-usage');
    const coresCard = card('Top cores');
    const ladderCard = card('Teammate rate');
    heat.el.classList.add('sb-full');
    coresCard.el.classList.add('sb-full');
    ladderCard.el.classList.add('sb-full');
    el.append(heat.el, coresCard.el, ladderCard.el);

    // --- heatmap: Raw % / Lift toggle -------------------------------------
    const controls = document.createElement('div');
    controls.className = 'sb-controls';
    const modeSeg = document.createElement('div');
    modeSeg.className = 'segmented';
    modeSeg.setAttribute('role', 'radiogroup');
    modeSeg.setAttribute('aria-label', 'Co-usage metric');
    const btnRaw = document.createElement('button');
    btnRaw.type = 'button'; btnRaw.textContent = 'Raw %';
    const btnLift = document.createElement('button');
    btnLift.type = 'button'; btnLift.textContent = 'Lift';
    btnLift.setAttribute('data-tip', 'Lift = P(both) / (P(a) × P(b)). 1.0 = no relationship; >1 = seen together more than chance.');
    modeSeg.append(btnRaw, btnLift);
    controls.appendChild(modeSeg);
    const heatHint = clickHint('How often two Pokémon share a team. Click a cell: show only teams with both. Shift-click to exclude.');
    heat.body.append(heatHint, controls);

    const heatChartEl = document.createElement('div');
    heatChartEl.className = 'sb-chart sb-chart--tall';
    const heatEmptyEl = document.createElement('div');
    heat.body.append(heatChartEl, heatEmptyEl);
    const heatChart = ctx.echarts.init(heatChartEl);
    new ResizeObserver(() => heatChart.resize()).observe(heatChartEl);

    let mode = 'raw';
    function setMode(m) {
      mode = m;
      btnRaw.setAttribute('aria-pressed', String(m === 'raw'));
      btnLift.setAttribute('aria-pressed', String(m === 'lift'));
      if (lastView) renderHeat(lastView, ctx.chartTheme());
    }
    btnRaw.addEventListener('click', () => setMode('raw'));
    btnLift.addEventListener('click', () => setMode('lift'));

    let lastKeys = [];
    heatChart.on('click', (p) => {
      if (p.seriesIndex == null || !p.data) return;
      const [c, r] = p.data.value;
      if (r === c || !lastKeys[r] || !lastKeys[c]) return;
      ctx.chip('core', [lastKeys[r], lastKeys[c]], p.event?.event);
    });

    // In-game ranked: per-species teammate ORDER (the game publishes no teammate shares).
    const heatTitle = heat.el.querySelector('h3');
    let rankedPick = null;
    function teammateRow(name, mon, anim) {
      const row = document.createElement('div');
      row.className = 'sb-row sb-row--clickable';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Filter by ${name}`);
      const head = document.createElement('div');
      head.className = 'sb-sprites';
      head.appendChild(ctx.sprite(name, { size: 28, animated: anim }));
      const label = document.createElement('div');
      label.className = 'sb-stat';
      label.style.textAlign = 'left';
      label.textContent = mon.rank ? `#${mon.rank} ${name}` : name;
      const mates = document.createElement('div');
      mates.className = 'sb-sprites';
      for (const t of mon.teammates.slice(0, 6)) {
        const img = ctx.sprite(t, { size: 24, animated: anim });
        img.title = t;
        mates.appendChild(img);
      }
      const names = document.createElement('div');
      names.className = 'sb-names';
      names.textContent = mon.teammates.slice(0, 6).map((t, i) => `${i + 1}. ${t}`).join('  ');
      row.append(head, label, mates, names);
      const act = (e) => ctx.chip('species', name, e);
      row.addEventListener('click', act);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
      return row;
    }
    function renderRankedTeammates(view) {
      heatChartEl.style.display = 'none';
      controls.style.display = 'none';
      heatTitle.textContent = 'Ranked teammate order';
      heatHint.textContent = 'Each row is a Pokémon and its usual teammates. Click a row: show only that Pokémon and its teams.';
      heatEmptyEl.textContent = '';
      lastKeys = [];
      const season = rankedSeason(view.ranked, view.state.from, view.state.to);
      ctx.meta(heat.meta, { source: rankedSource(season), n: season ? Object.keys(season.mons).length : 0, unit: 'Pokémon' });
      if (!season) { heatEmptyEl.appendChild(emptyState('No in-game ranked season in the selected range.')); return; }
      const note = document.createElement('div');
      note.className = 'ddv-note';
      note.textContent = 'Top 6 teammates in the game’s rank order (1 = most common). The game publishes no teammate shares.';
      heatEmptyEl.appendChild(note);
      const ranking = (season.ranking || []).filter((k) => season.mons[k]);
      let names = ranking.slice(0, 12);
      if (!names.length) {
        note.textContent += ` Ranking not published for finished season ${season.season}: pick a Pokémon (A–Z).`;
        const all = Object.keys(season.mons).sort();
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Pokémon');
        for (const k of all) sel.appendChild(new Option(k, k));
        if (!all.includes(rankedPick)) rankedPick = all[0];
        sel.value = rankedPick;
        sel.addEventListener('change', () => { rankedPick = sel.value; renderHeat(lastView, ctx.chartTheme()); });
        const wrap = document.createElement('div');
        wrap.className = 'sb-controls';
        wrap.appendChild(sel);
        heatEmptyEl.appendChild(wrap);
        names = rankedPick ? [rankedPick] : [];
      }
      for (const k of names) if (season.mons[k].teammates.length) heatEmptyEl.appendChild(teammateRow(k, season.mons[k], view.state.anim));
    }

    function renderHeat(view, theme) {
      controls.style.display = '';
      heatTitle.textContent = 'Teammate co-usage';
      heatHint.textContent = 'How often two Pokémon share a team. Click a cell: show only teams with both. Shift-click to exclude.';
      if (view.state.source === 'ranked') { renderRankedTeammates(view); return; }
      if (view.state.source === 'ladder') {
        heatChartEl.style.display = 'none';
        heatEmptyEl.textContent = '';
        heatEmptyEl.appendChild(emptyState('Switch Source to Tournaments to see teammate co-usage.', 'Tournament-only view'));
        lastKeys = [];
        ctx.meta(heat.meta, { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      // A grid needs two Pokémon: below that, smaller samples come in (flagged in the meta line).
      const { rows, relaxed } = atMinN(usage(view.teams), view.state.minN, 2);
      ctx.meta(heat.meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams', relaxed });
      if (rows.length < 2) {
        heatChartEl.style.display = 'none';
        heatEmptyEl.textContent = '';
        heatEmptyEl.appendChild(emptyState('Insufficient data'));
        lastKeys = [];
        return;
      }
      heatChartEl.style.display = '';
      heatEmptyEl.textContent = '';
      const keys = rows.slice(0, 15).map((r) => r.key);
      lastKeys = keys;
      const co = coUsage(view.teams, keys);
      const div = theme.diverging;
      // First pass: raw values, so raw mode's colour scale (rawMax) is known
      // before we can compute each cell's luminance-aware label style.
      const cellVals = [];
      for (let r = 0; r < keys.length; r++) {
        for (let c = 0; c < keys.length; c++) {
          if (r === c) continue;
          cellVals.push({ r, c, n: co.n[r][c], val: mode === 'lift' ? co.lift[r][c] : co.pct[r][c] * 100 });
        }
      }
      const rawMax = Math.max(1, ...cellVals.map((d) => d.val));
      const stops = mode === 'lift' ? [div.neg2, div.neg1, div.mid, div.pos1, div.pos2] : theme.sequential;
      const good = [];
      const bad = [];
      // Render every off-diagonal cell (real co-usage data, even 0% —
      // that's still a real "never seen together" fact). Only the diagonal
      // (a species paired with itself) is excluded from the colour scale.
      for (const { r, c, n, val } of cellVals) {
        // Per-item static label colour, NOT a series-level label.color
        // callback: this vendored ECharts silently drops the label for most
        // points when label.color is a function on a heatmap series
        // (confirmed by direct canvas pixel sampling in dev). A plain
        // per-item override renders reliably.
        const style = cellLabelStyle(stops, mode === 'lift' ? val / 2 : val / rawMax);
        good.push({ value: [c, r, val, n], label: { color: style.fill, textBorderColor: style.halo } });
      }
      for (let i = 0; i < keys.length; i++) bad.push({ value: [i, i, null, co.n[i][i]] });
      // At 15 columns, a narrow (mobile) container can't fit full-size
      // sprites + in-cell percentage text without everything colliding —
      // shrink the icons and drop the in-cell numbers (still on the
      // tooltip/tap) rather than force full size into too little room.
      const narrow = heatChartEl.clientWidth > 0 && heatChartEl.clientWidth < 640;
      const spriteSize = narrow ? 16 : 28;
      const rich = {};
      for (const k of keys) rich[richKey(k)] = { height: spriteSize, width: spriteSize, backgroundColor: { image: ctx.spriteUrl(k) } };
      const axisLabel = { formatter: (v) => `{${richKey(v)}|}`, rich, margin: narrow ? 4 : 10, interval: 0 };
      heatChart.setOption({
        tooltip: {
          backgroundColor: theme.tooltipBg, borderColor: theme.border,
          textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
          formatter: (p) => {
            const [c, r, val, n] = p.data.value;
            if (r === c) return `<b>${keys[r]}</b><br/>solo usage n=${n}`;
            if (val == null) return `<b>${keys[r]}</b> + <b>${keys[c]}</b><br/>insufficient data (n=${n})`;
            const label = mode === 'lift' ? `lift ${val.toFixed(2)}×` : `${val.toFixed(1)}% of teams together`;
            return `<b>${keys[r]}</b> + <b>${keys[c]}</b><br/>${label} (n=${n})`;
          },
        },
        grid: { left: narrow ? 24 : 40, right: 20, top: 10, bottom: narrow ? 40 : 70, containLabel: false },
        xAxis: { type: 'category', data: keys, axisLabel, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        yAxis: { type: 'category', data: keys, axisLabel, axisLine: { lineStyle: { color: theme.axis } }, splitArea: { show: false } },
        // dimension must be explicit: this ECharts build doesn't auto-pick the
        // value dim (index 2) for heatmap series, and silently paints every
        // cell the same fallback color without it. Reported upstream.
        visualMap: mode === 'lift'
          ? {
            min: 0, max: 2, dimension: 2, seriesIndex: 0, show: true, calculable: false,
            orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
            text: ['often together', 'rarely together'],
            textStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 10 },
            inRange: { color: [div.neg2, div.neg1, div.mid, div.pos1, div.pos2] },
          }
          : {
            min: 0, max: rawMax, dimension: 2, seriesIndex: 0, show: true, calculable: false,
            orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 80,
            text: [`${rawMax.toFixed(0)}% together`, '0% together'],
            textStyle: { color: theme.muted, fontFamily: theme.fontFamily, fontSize: 10 },
            inRange: { color: theme.sequential },
          },
        series: [
          {
            type: 'heatmap', data: good,
            label: {
              show: !narrow,
              formatter: (p) => (mode === 'lift' ? p.data.value[2].toFixed(1) : `${p.data.value[2].toFixed(0)}%`),
              textBorderWidth: 1.2,
              // The body font (VT323 in retro) is a thin display face meant
              // for large text; at small sizes the label font (Silkscreen/
              // JetBrains Mono) is built for dense UI text and reads better.
              fontFamily: theme.labelFontFamily, fontSize: 10, fontWeight: 700,
            },
            itemStyle: { borderColor: theme.surface, borderWidth: 2 },
            emphasis: { itemStyle: { borderColor: theme.ink, borderWidth: 2 } },
          },
          {
            type: 'heatmap', data: bad, label: { show: false },
            itemStyle: { color: theme.grid, borderColor: theme.surface, borderWidth: 2 },
          },
        ],
      }, true);
    }

    // --- top cores ---------------------------------------------------------
    const coresWrap = document.createElement('div');
    coresCard.body.append(clickHint('Most common trios of Pokémon. Click a row: show only teams running all three.'), coresWrap);

    function renderCores(view) {
      coresWrap.textContent = '';
      if (view.state.source !== 'tournaments') {
        const ranked = view.state.source === 'ranked';
        coresWrap.appendChild(emptyState(ranked ? RANKED_NA : 'Switch Source to Tournaments to see top cores.', 'Tournament-only view'));
        ctx.meta(coresCard.meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'teams' });
        return;
      }
      // cores() filters before its top-10 cut, so min n applied afterwards is the same list.
      const { rows, relaxed } = atMinN(cores(view.teams, 3, 10, 1), view.state.minN);
      ctx.meta(coresCard.meta, { source: 'Tournaments', n: view.teams.length, unit: 'teams', relaxed });
      if (!rows.length) { coresWrap.appendChild(emptyState('No team in view has three Pokémon listed.', 'No cores')); return; }
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'sb-row sb-row--clickable';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        const sprites = document.createElement('div');
        sprites.className = 'sb-sprites';
        for (const k of r.keys) sprites.appendChild(ctx.sprite(k, { size: 28, animated: view.state.anim }));
        const names = document.createElement('div');
        names.className = 'sb-names sb-names--wrap';
        names.textContent = r.keys.join(' + ');
        const n = document.createElement('div');
        n.className = 'sb-stat sb-stat--muted';
        n.textContent = `n=${ctx.fmt.n(r.n)}`;
        const pct = document.createElement('div');
        pct.className = 'sb-stat';
        pct.textContent = ctx.fmt.pct(r.pct);
        const win = document.createElement('div');
        win.className = `sb-stat${r.winPct == null ? ' sb-stat--muted' : ''}`;
        win.textContent = r.winPct != null ? ctx.fmt.pct(r.winPct) : '—';
        row.append(sprites, names, n, pct, win);
        const act = (e) => ctx.chip('core', r.keys, e);
        row.addEventListener('click', act);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
        coresWrap.appendChild(row);
      }
    }

    // --- teammate rate for a picked species ----------------------------------
    // Tournament team sheets by default (every regulation has them); Smogon's
    // ladder teammate % only when Source = Ladder and that month exists.
    const ladderControls = document.createElement('div');
    ladderControls.className = 'sb-controls';
    const ladderLabel = document.createElement('span');
    ladderLabel.className = 'filterbar__label';
    ladderLabel.textContent = 'Pokémon';
    const ladderSelect = document.createElement('select');
    ladderSelect.setAttribute('aria-label', 'Pokémon to show teammates for');
    ladderControls.append(ladderLabel, ladderSelect);
    const rateHint = clickHint('Share of the picked Pokémon\'s teams that also run each teammate. Click a row: show only teams with both.');
    const ladderList = document.createElement('div');
    ladderCard.body.append(rateHint, ladderControls, ladderList);

    let rateView = null;
    let rateSource = null; // { kind: 'sheets' | 'ladder', merged? }
    function teammatesFor(key) {
      if (rateSource?.kind === 'ladder') {
        const mon = rateSource.merged.mons.find((m) => m.key === key);
        return { n: null, rows: (mon?.teammates || []).map((t) => ({ name: t.name, pct: t.pct })) };
      }
      const det = speciesDetail(rateView.teams, key, rateView.dex);
      return { n: det.n, rows: det.teammates.map((t) => ({ name: t.name, pct: t.pct, n: t.n })) };
    }
    function renderLadderList() {
      ladderList.textContent = '';
      const key = ladderSelect.value;
      if (!rateView || !key) {
        ladderList.appendChild(emptyState('No Pokémon with enough teams under the current filters.'));
        return;
      }
      const { n, rows } = teammatesFor(key);
      if (rateSource.kind === 'sheets' && !rateSource.relaxed && n < rateView.state.minN) {
        ladderList.appendChild(emptyState(`${key} is on ${n} team${n === 1 ? '' : 's'} in view (minimum ${rateView.state.minN}).`));
        return;
      }
      if (!rows.length) {
        ladderList.appendChild(emptyState(`No teammate data for ${key}.`));
        return;
      }
      for (const t of rows.slice(0, 12)) {
        const row = document.createElement('div');
        row.className = 'sb-row sb-row--clickable';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.dataset.tip = `Show only teams with ${key} and ${t.name}`;
        row.appendChild(ctx.sprite(t.name, { size: 24 }));
        const name = document.createElement('div');
        name.className = 'sb-names';
        name.textContent = t.name;
        const pct = document.createElement('div');
        pct.className = 'sb-stat';
        pct.textContent = ctx.fmt.pct(t.pct);
        row.append(name, pct);
        row.addEventListener('click', (e) => ctx.chip('core', [key, t.name], e));
        ladderList.appendChild(row);
      }
    }
    ladderSelect.addEventListener('change', renderLadderList);

    function renderLadder(view) {
      rateView = view;
      const merged = view.state.source === 'ladder' ? ladderMerge(view.ladder, view.state.from, view.state.to, view.dex) : null;
      let options;
      if (merged?.mons.length) {
        rateSource = { kind: 'ladder', merged };
        options = merged.mons.slice(0, 40).map((m) => m.key);
        ctx.meta(ladderCard.meta, { source: 'Ladder (Smogon)', n: merged.battles, unit: 'battles' });
      } else {
        rateSource = { kind: 'sheets' };
        const picked = atMinN(usage(view.teams), view.state.minN);
        rateSource.relaxed = picked.relaxed;
        options = picked.rows.slice(0, 40).map((r) => r.key);
        const note = view.state.source === 'ladder' ? 'Tournaments (no Smogon ladder data for this period)'
          : view.state.source === 'ranked' ? 'Tournaments (in-game ranked data has teammate ranks only, see the deep dive)' : 'Tournaments';
        ctx.meta(ladderCard.meta, { source: note, n: view.teams.length, unit: 'teams', relaxed: picked.relaxed });
      }
      const prevVal = ladderSelect.value;
      ladderSelect.textContent = '';
      for (const k of options) {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        ladderSelect.appendChild(opt);
      }
      if (options.includes(prevVal)) ladderSelect.value = prevVal;
      renderLadderList();
    }

    let lastView = null;
    ctx.onTheme(() => { if (lastView) renderHeat(lastView, ctx.chartTheme()); });
    setMode('raw');

    return {
      update(view) {
        lastView = view;
        renderHeat(view, ctx.chartTheme());
        renderCores(view);
        renderLadder(view);
      },
      highlight(key) {
        coresWrap.querySelectorAll('.sb-row').forEach((row) => {
          row.classList.toggle('is-hovered', !!key && row.textContent.includes(key));
        });
      },
    };
  },
};
