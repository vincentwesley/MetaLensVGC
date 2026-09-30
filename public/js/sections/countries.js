// countries.js — Meta by country: per country (ISO-2 from the team sheets) its share of the
// teams that list one, win rate with a Wilson CI, most-used Pokémon, and the Pokémon it
// plays clearly more than the view as a whole. Team-level: reads view.teams.
// A row click adds a Country chip.
import { countrySplit, atMinN, COUNTRY_LIMITS } from '../lib/aggregate.js';
import { RANKED_NA, rankedSource, clickHint } from '../ui/meta.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function emptyState(parent, title, detail) {
  parent.textContent = '';
  const box = el('div', 'empty-state');
  box.append(el('div', 'empty-state__title', title));
  if (detail) box.append(el('div', null, detail));
  parent.appendChild(box);
}

export default {
  id: 'countries',
  title: 'Meta by country',
  mount(root, ctx) {
    root.innerHTML = '';
    const card = el('div', 'card');
    const head = el('div', 'card__head');
    const meta = el('span');
    head.append(el('h3', null, 'Meta by country'), meta);
    const body = el('div', 'card__body');
    const hint = clickHint('What each country brings. Click a row: show only teams from that country. Shift-click to exclude.');
    const note = el('p', 'ddv-note');
    const wrap = el('div', 'table-wrap table-wrap--scroll');
    body.append(hint, wrap, note);
    card.append(head, body);
    root.appendChild(card);

    const pokemon = (list, extra) => {
      const cell = el('div', 'cty-mons');
      for (const m of list) {
        const item = el('span', 'cty-mon');
        item.append(ctx.sprite(m.key, { size: 'xs' }), el('span', null, `${m.key} ${extra(m)}`));
        cell.appendChild(item);
      }
      return cell;
    };

    return {
      update(view) {
        note.textContent = '';
        if (view.state.source !== 'tournaments') {
          const ranked = view.state.source === 'ranked';
          ctx.meta(meta, ranked ? { source: rankedSource(null) } : { source: 'Tournaments', n: 0, unit: 'teams' });
          emptyState(wrap, 'Tournament-only view', ranked ? RANKED_NA : 'Countries come from tournament team sheets. Switch Source to Tournaments.');
          return;
        }
        const split = countrySplit(view.teams);
        const { rows, relaxed } = atMinN(split.rows, view.state.minN);
        ctx.meta(meta, { source: 'Tournaments', n: split.total, unit: 'teams with a country', relaxed });
        if (split.unknown) note.textContent = `${ctx.fmt.n(split.unknown)} of ${ctx.fmt.n(view.teams.length)} teams in view list no country and are left out. "Plays more": used on at least ${COUNTRY_LIMITS.minMon} of its teams and ${COUNTRY_LIMITS.minLift}× the share in the whole view.`;
        if (!rows.length) { emptyState(wrap, 'No countries', 'None of the teams in view lists a country.'); return; }

        const table = el('table', 'data-table cty-table');
        table.innerHTML = '<thead><tr><th>Country</th><th>Teams</th><th class="num">Win % (95% CI)</th><th>Most used</th><th>Plays more than the field</th></tr></thead>';
        const tbody = el('tbody');
        const maxPct = rows[0].pct || 1;
        for (const r of rows) {
          const tr = el('tr');
          tr.tabIndex = 0;
          tr.addEventListener('click', (e) => ctx.chip('country', r.code, e));

          const tdName = el('td', 'cty-name');
          tdName.append(el('span', null, ctx.fmt.country(r.code)), el('span', 'cty-code', r.code));

          const bar = el('div', 'usage-bar');
          const track = el('div', 'usage-bar__track');
          const fill = el('div', 'usage-bar__fill');
          fill.style.width = `${(r.pct / maxPct) * 100}%`;
          fill.style.background = 'var(--accent)';
          track.appendChild(fill);
          bar.append(track, el('span', 'usage-bar__label', `${ctx.fmt.n(r.n)} · ${ctx.fmt.pct(r.pct)}`));
          const tdN = el('td', 'col-usage');
          tdN.appendChild(bar);

          const tdWin = el('td', 'num cty-win', r.winPct == null ? '—'
            : `${ctx.fmt.pct(r.winPct)} (${(r.ci[0] * 100).toFixed(1)}–${(r.ci[1] * 100).toFixed(1)})`);

          const tdTop = el('td', 'cty-top');
          tdTop.dataset.label = 'Most used';
          tdTop.appendChild(pokemon(r.top, (m) => ctx.fmt.pct(m.pct)));
          const tdOver = el('td', 'cty-over');
          tdOver.dataset.label = 'Plays more';
          if (r.over.length) {
            tdOver.appendChild(pokemon(r.over, (m) => `×${m.lift.toFixed(1)}`));
            tdOver.dataset.tip = r.over.map((m) => `${m.key}: on ${ctx.fmt.pct(m.pct)} of ${ctx.fmt.country(r.code)}'s teams, ${m.lift.toFixed(1)}× its share in the whole view`).join(' · ');
          } else tdOver.textContent = '—';

          tr.append(tdName, tdN, tdWin, tdTop, tdOver);
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.textContent = '';
        wrap.appendChild(table);
      },
      highlight() { /* rows are countries, not Pokémon */ },
    };
  },
};
