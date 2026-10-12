// compare.js — Compare Periods: two Smogon ladder months of the current regulation side by side.
// Top 20 by the newer month's usage, change in points, top item per month when it changed,
// plus biggest risers / fallers. Reads the raw view.ladder.months (not the merged range).
import { compareMonths } from '../lib/compare.js';
import { clickHint } from '../ui/meta.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function emptyState(title, msg) {
  const box = el('div', 'empty-state');
  box.append(el('div', 'empty-state__title', title), el('div', '', msg));
  return box;
}

export default {
  id: 'compare',
  title: 'Compare Periods',
  mount(host, ctx) {
    host.textContent = '';
    const card = el('div', 'card');
    const head = el('div', 'card__head');
    const meta = el('div', 'meta-line');
    head.append(el('h3', '', 'Compare ladder months'), meta);
    const body = el('div', 'card__body');
    card.append(head, body);
    host.appendChild(card);

    let view = null;
    let choice = { a: null, b: null }; // in-DOM only, not in the URL
    let monthKey = '';

    const controls = el('div', 'sb-controls cmp-controls');
    const selects = {};
    for (const [id, label] of [['a', 'Older month'], ['b', 'Newer month']]) {
      const wrap = el('label', 'cmp-pick');
      wrap.append(el('span', 'filterbar__label', label));
      const s = el('select');
      s.dataset.cmp = id;
      s.addEventListener('change', () => { choice[id] = s.value; render(); });
      selects[id] = s;
      wrap.appendChild(s);
      controls.appendChild(wrap);
    }
    const hint = clickHint('Usage of the top 20 Pokémon in the newer month against the older one. Click a row: show only that Pokémon. Shift-click to exclude.');
    const note = el('p', 'cmp-note');
    const out = el('div', 'cmp-out');
    body.append(controls, hint, note, out);

    function clickable(node, key) {
      const act = (e) => ctx.chip('species', key, e);
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.addEventListener('click', act);
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
    }

    function changeCell(r) {
      const td = el('td', 'num');
      if (r.dir == null) { td.textContent = '—'; return td; }
      if (r.isNew) { td.textContent = 'NEW'; td.classList.add('sb-stat--up'); return td; }
      const v = r.dir === 'flat' ? 0 : r.pts;
      td.textContent = `${r.dir === 'up' ? '▲ +' : r.dir === 'down' ? '▼ ' : '— '}${v.toFixed(1)}pt`;
      if (r.dir !== 'flat') td.classList.add(`sb-stat--${r.dir}`);
      return td;
    }

    function moverCol(title, rows, up) {
      const col = el('div', 'cmp-col');
      col.appendChild(el('div', 'sb-subhead', title));
      if (!rows.length) {
        col.appendChild(emptyState(up ? 'No risers' : 'No fallers', `Nothing ${up ? 'gained' : 'lost'} share between these months (species under 1% in both are left out).`));
        return col;
      }
      for (const r of rows.slice(0, 5)) {
        const row = el('div', 'sb-row sb-row--clickable');
        clickable(row, r.key);
        row.append(ctx.sprite(r.key, { size: 'xs' }), el('div', 'sb-names', r.key),
          el('div', `sb-stat ${up ? 'sb-stat--up' : 'sb-stat--down'}`, r.isNew ? 'NEW' : `${r.delta > 0 ? '+' : ''}${(r.delta * 100).toFixed(1)}pt`),
          el('div', 'sb-stat sb-stat--muted', `${ctx.fmt.pct(r.a ?? 0)}→${ctx.fmt.pct(r.b)}`));
        col.appendChild(row);
      }
      return col;
    }

    function render() {
      out.textContent = '';
      note.textContent = '';
      const months = view?.ladder?.months || [];
      if (!months.length) {
        controls.hidden = true;
        ctx.meta(meta, { source: 'Ladder (Smogon)', n: 0, unit: 'battles' });
        out.appendChild(emptyState('No ladder data', `No Smogon ladder months are published for ${view?.reg || 'this regulation'} yet, so there is nothing to compare.`));
        return;
      }
      const ids = months.map((m) => m.month);
      const key = ids.join();
      if (key !== monthKey || !ids.includes(choice.b) || !ids.includes(choice.a)) {
        monthKey = key;
        choice = { a: ids.length > 1 ? ids[ids.length - 2] : null, b: ids[ids.length - 1] };
      }
      const single = ids.length < 2;
      controls.hidden = single;
      for (const id of ['a', 'b']) {
        const s = selects[id];
        s.textContent = '';
        for (const m of ids) s.appendChild(new Option(m, m, false, m === choice[id]));
      }
      const r = compareMonths(months, single ? null : choice.a, choice.b, { dex: view.dex });
      const bm = months.find((m) => m.month === choice.b);
      ctx.meta(meta, { source: `Ladder (Smogon) · ${r.a ? `${r.a} vs ${r.b}` : r.b}`, n: bm?.battles || 0, unit: 'battles' });
      if (single) note.textContent = 'Only one Smogon month so far; the comparison appears when a second month is published.';
      else if (!r.a) note.textContent = 'Pick two different months to compare; showing the newer month only.';
      if (!r.rows.length) {
        out.appendChild(emptyState('Nothing in view', `${r.b} has no Pokémon matching the current filters.`));
        return;
      }
      const showChange = !!r.a;
      const wrap = el('div', 'table-wrap table-wrap--scroll');
      const table = el('table', 'data-table');
      table.innerHTML = `<thead><tr><th>#</th><th></th><th>Pokémon</th>${showChange ? `<th>${r.a}</th>` : ''}<th>${r.b}</th>${showChange ? '<th>Change</th>' : ''}<th>Top item</th></tr></thead><tbody></tbody>`;
      const tbody = table.querySelector('tbody');
      r.rows.forEach((x, i) => {
        const tr = el('tr');
        clickable(tr, x.key);
        const sp = el('td');
        sp.appendChild(ctx.sprite(x.key, { size: 'xs' }));
        tr.append(el('td', 'num', String(i + 1)), sp, el('td', '', x.key));
        if (showChange) tr.append(el('td', 'num', x.a == null ? '—' : ctx.fmt.pct(x.a)));
        tr.append(el('td', 'num', ctx.fmt.pct(x.b)));
        if (showChange) tr.append(changeCell(x));
        tr.append(el('td', '', x.itemChanged ? `${x.itemA} -> ${x.itemB}` : (x.itemB || '—')));
        tbody.appendChild(tr);
      });
      wrap.appendChild(table);
      out.appendChild(wrap);
      if (showChange) {
        const movers = el('div', 'cmp-movers');
        movers.append(moverCol('Biggest risers', r.risers, true), moverCol('Biggest fallers', r.fallers, false));
        out.appendChild(movers);
      }
    }

    return { update(v) { view = v; render(); } };
  },
};
