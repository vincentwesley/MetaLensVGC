// methodology.js — Data & methodology: downloads of the current filtered
// view, source credits, per-reg counts, archetype rules and the stat/CI math
// used everywhere else, plus the last-refresh timestamp and disclaimers.
import { toCSV, toJSONRows } from '../lib/aggregate.js';
import { ARCHETYPES } from '../lib/archetypes.js';
import { RANKED_ATTRIBUTION } from '../ui/meta.js';

function elm(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function sectionCard(title) {
  const card = elm('div', 'card mth-block');
  const head = elm('div', 'card__head');
  head.appendChild(elm('h3', null, title));
  const body = elm('div', 'card__body');
  card.append(head, body);
  return { card, body };
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default {
  id: 'methodology',
  title: 'Data & Methodology',
  mount(el, ctx) {
    el.innerHTML = '';
    const card = elm('div', 'card');
    const head = elm('div', 'card__head');
    head.appendChild(elm('h3', null, 'Data & Methodology'));
    card.appendChild(head);
    const body = elm('div', 'card__body');
    card.appendChild(body);
    el.appendChild(card);

    // --- download the current filtered view ---
    const { card: dlCard, body: dlBody } = sectionCard('Download filtered teams');
    const dlActions = elm('div', 'mth-actions');
    const jsonBtn = elm('button', 'lib-btn', 'Download JSON');
    jsonBtn.type = 'button';
    const csvBtn = elm('button', 'lib-btn', 'Download CSV');
    csvBtn.type = 'button';
    dlActions.append(jsonBtn, csvBtn);
    dlBody.appendChild(dlActions);
    const dlNote = elm('div', 'ddv-note');
    dlBody.appendChild(dlNote);
    body.appendChild(dlCard);

    // --- sources ---
    const { card: srcCard, body: srcBody } = sectionCard('Sources');
    body.appendChild(srcCard);

    // --- per-regulation counts ---
    const { card: regCard, body: regBody } = sectionCard('Per-regulation counts');
    body.appendChild(regCard);

    // --- archetype rules ---
    const { card: archCard, body: archBody } = sectionCard('Archetype rules');
    const archList = elm('dl', 'mth-arch-list');
    for (const a of ARCHETYPES) {
      archList.appendChild(elm('dt', null, a.label));
      archList.appendChild(elm('dd', null, a.desc));
    }
    archBody.appendChild(archList);
    body.appendChild(archCard);

    // --- how stats are computed ---
    const { card: statCard, body: statBody } = sectionCard('How the numbers are computed');
    const facts = [
      ['Stat Points (SP)', 'Champions replaces EVs/IVs with SP: 0–32 per stat, 66 total. Lv50 HP = base + 75 + sp; every other stat = floor((base + 20 + sp) × nature multiplier), nature multiplier 1.1 / 1.0 / 0.9.'],
      ['Win % confidence', 'Every win rate is shown with its Wilson 95% score interval (not a normal-approximation interval), which stays well-behaved at small sample sizes.'],
      ['Win %', 'Game wins / (wins + losses) from event standings records; ties are excluded from the denominator. Teams with no recorded games show "—" rather than 0%.'],
      ['Effective species (meta diversity)', 'exp(Shannon entropy) of the usage-count distribution — the "effective number" of equally-common species that would produce the same entropy.'],
      ['Previous-period comparison', 'The prior window is the immediately preceding span of equal length within the same regulation. If that span is empty or starts before the regulation began, the immediately preceding regulation’s teams are used instead.'],
      ['Mega keying', 'A mon’s usage key is its Mega form (e.g. Charizard-Mega-Y) whenever it is shown holding its own Mega Stone, otherwise its battle species. A sheet can legally carry two different Mega Stones even though only one mon mega evolves in a given battle; Team.mega picks the first such mon in slot order, while archetypes that care about a second stone check every held key directly.'],
      ['Spread / speed source priority', 'Limitless does not publish SP for tournament sheets, so speed tiers come from tournament open sheets when present, otherwise the in-game ranked ladder (the season’s most common Speed SP from its top spread, with its most common nature — the game reports spreads and natures separately), otherwise the same regulation’s Smogon ladder (weighted by month battle counts), otherwise — for a single species with no data at all — a theoretical range (0 SP / Speed-lowering nature to 32 SP / Speed-boosting nature). Each figure is always labelled with which source it came from.'],
      ['In-game ranked source', 'The official Pokémon Champions ranked ladder “Battle Data” (Doubles), via Pokémon Champions Battle Data (championsbattledata.com). Per regulation it holds each in-game season’s last snapshot. The game publishes RANKS, not usage shares, so no usage % is shown or derived from it; move/item/ability/nature/spread shares are within that Pokémon’s ranked sets, and teammates are rank order only. A rank order is only published for the current season. Megas are tracked as the base species holding its Mega Stone. With a date range set, the latest season whose snapshot falls inside it is used. It has per-Pokémon sets but no teams, so team-level views (types, archetypes, quadrant, trends, library, scanner) are unavailable for it.'],
    ];
    const factsList = elm('dl', 'mth-fact-list');
    for (const [label, desc] of facts) {
      factsList.appendChild(elm('dt', 'mth-fact__label', label));
      factsList.appendChild(elm('dd', 'mth-fact__desc', desc));
    }
    statBody.appendChild(factsList);
    body.appendChild(statCard);

    // --- last refresh ---
    const { card: refCard, body: refBody } = sectionCard('Last refresh');
    body.appendChild(refCard);

    // --- credits ---
    const { card: credCard, body: credBody } = sectionCard('Credits');
    credBody.appendChild(elm('p', null, 'Sprites from Pokémon Showdown (play.pokemonshowdown.com).'));
    credBody.appendChild(elm('p', null, 'Data from Limitless (play.limitlesstcg.com), Limitless VGC (limitlessvgc.com) and Smogon (smogon.com).'));
    const rankedCredit = elm('p');
    const rankedLink = document.createElement('a');
    rankedLink.href = RANKED_ATTRIBUTION.url;
    rankedLink.target = '_blank';
    rankedLink.rel = 'noopener';
    rankedLink.textContent = RANKED_ATTRIBUTION.text;
    rankedCredit.append(rankedLink, document.createTextNode(' (in-game ranked ladder data).'));
    credBody.appendChild(rankedCredit);
    credBody.appendChild(elm('p', 'mth-disclaimer', 'VGC MetaScope is a fan project and is not affiliated with Nintendo, Game Freak, Creatures or The Pokémon Company.'));
    body.appendChild(credCard);

    let lastView = null;

    function render() {
      const view = lastView;
      if (!view) return;

      const today = new Date().toISOString().slice(0, 10);
      jsonBtn.onclick = () => download(`vgc-metascope-${view.reg}-${today}.json`, JSON.stringify(toJSONRows(view.teams), null, 2), 'application/json');
      csvBtn.onclick = () => download(`vgc-metascope-${view.reg}-${today}.csv`, toCSV(view.teams), 'text/csv');
      dlNote.textContent = `${ctx.fmt.n(view.teams.length)} teams in the current view (regulation ${view.reg}, current filters applied).`;

      srcBody.innerHTML = '';
      const sources = view.manifest.sources || [];
      if (!sources.length) {
        const box = elm('div', 'empty-state');
        box.appendChild(elm('div', 'empty-state__title', 'No source list in manifest'));
        srcBody.appendChild(box);
      } else {
        const list = elm('ul', 'mth-sources');
        for (const s of sources) {
          const li = elm('li');
          const a = document.createElement('a');
          a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = s.name;
          li.appendChild(a);
          list.appendChild(li);
        }
        srcBody.appendChild(list);
      }

      regBody.innerHTML = '';
      const regs = view.manifest.regs || [];
      const wrap = elm('div', 'table-wrap');
      const table = elm('table', 'data-table');
      const thead = elm('thead');
      const trh = elm('tr');
      const regCols = ['Reg', 'Teams', 'Events', 'Open sheets', 'Matches', 'Ladder months', 'Ranked seasons'];
      regCols.forEach((h, i) => trh.appendChild(elm('th', i > 0 ? 'num' : null, h)));
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = elm('tbody');
      for (const r of regs) {
        const tr = elm('tr');
        tr.append(
          elm('td', null, r.id),
          elm('td', 'num', ctx.fmt.n(r.teams)),
          elm('td', 'num', ctx.fmt.n(r.events)),
          elm('td', 'num', ctx.fmt.n(r.openSheets)),
          elm('td', 'num', ctx.fmt.n(r.matches)),
          elm('td', 'num', ctx.fmt.n((r.ladderMonths || []).length)),
          elm('td', 'num', (r.rankedSeasons || []).join(', ') || '—'),
        );
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      regBody.appendChild(wrap);

      refBody.innerHTML = '';
      const kpi = elm('div', 'kpi');
      kpi.append(elm('span', 'kpi__label', 'Data generated'), elm('span', 'kpi__value', ctx.fmt.date(view.manifest.generated)));
      refBody.appendChild(kpi);
    }

    return {
      update(view) { lastView = view; render(); },
    };
  },
};
