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
    // [label, text, family]: 'vgc' (Champions), 'showdown' (Smogon ladder formats) or 'both'.
    const facts = [
      ['Stat Points (SP)', 'Champions replaces EVs/IVs with SP: 0–32 per stat, 66 total. Lv50 HP = base + 75 + sp; every other stat = floor((base + 20 + sp) × nature multiplier), nature multiplier 1.1 / 1.0 / 0.9.', 'vgc'],
      ['Stats (Showdown formats)', 'National Dex formats use EVs and IVs at level 100: HP = floor((2 × base + IV + floor(EV / 4)) × 100 / 100) + 110; every other stat = floor((floor((2 × base + IV + floor(EV / 4)) × 100 / 100) + 5) × nature). IVs are taken as 31 unless a set says otherwise; EVs are at most 252 per stat, 510 total.', 'showdown'],
      ['Ladder usage', 'Smogon’s monthly usage statistics for the format at the chosen rating cutoff (All, 1500+, 1630+ or 1760+): usage is weighted by player rating, so it is a rating-weighted share of usage, not a win rate. Pokémon under 0.1% usage are left out, and each table keeps its top 12 entries (top 20 teammates, top 40 checks and counters). The 3 newest months Smogon has published are shown; a month appears early in the following month.', 'showdown'],
      ['Sample teams and sets', 'Smogon’s sample teams and recommended sets for the format, via the pkmn/smogon data mirror (refreshed daily, picked up by the weekly refresh). They are © Smogon and their authors; MetaLens shows them with credit and links back to Smogon.', 'showdown'],
      ['Win % confidence', 'Every win rate is shown with its Wilson 95% score interval (not a normal-approximation interval), which stays well-behaved at small sample sizes.', 'vgc'],
      ['Win %', 'Game wins / (wins + losses) from event standings records; ties are excluded from the denominator. Teams with no recorded games show "—" rather than 0%.', 'vgc'],
      ['Effective species (meta diversity)', 'exp(Shannon entropy) of the usage distribution — the "effective number" of equally-common species that would produce the same entropy.', 'both'],
      ['Previous-period comparison', 'The prior window is the immediately preceding span of equal length within the same regulation. If that span is empty or starts before the regulation began, the immediately preceding regulation’s teams are used instead.', 'vgc'],
      ['Change vs previous month', 'Showdown formats compare the newest published month with the one before it, at the same rating cutoff. Rows absent or rare the month before show NEW.', 'showdown'],
      ['Mega keying', 'A mon’s usage key is its Mega form (e.g. Charizard-Mega-Y) whenever it is shown holding its own Mega Stone, otherwise its battle species. A sheet can legally carry two different Mega Stones even though only one mon mega evolves in a given battle; Team.mega picks the first such mon in slot order, while archetypes that care about a second stone check every held key directly.', 'vgc'],
      ['Spread / speed source priority', 'Limitless does not publish SP for tournament sheets, so speed tiers come from tournament open sheets when present, otherwise the in-game ranked ladder (the season’s most common Speed SP from its top spread, with its most common nature — the game reports spreads and natures separately), otherwise the same regulation’s Smogon ladder (weighted by month battle counts), otherwise — for a single species with no data at all — a theoretical range (0 SP / Speed-lowering nature to 32 SP / Speed-boosting nature). Each figure is always labelled with which source it came from.', 'vgc'],
      ['Spreads and speed (Showdown formats)', 'EV spreads and natures come from the Smogon ladder (joint “Nature:EVs” entries), weighted by each month’s battle count; speed tiers use each Pokémon’s most common spread.', 'showdown'],
      ['In-game ranked source', 'The official Pokémon Champions ranked ladder “Battle Data” (Doubles), via Pokémon Champions Battle Data (championsbattledata.com). Per regulation it holds each in-game season’s last snapshot. The game publishes RANKS, not usage shares, so no usage % is shown or derived from it; move/item/ability/nature/spread shares are within that Pokémon’s ranked sets, and teammates are rank order only. A rank order is only published for the current season. Megas are tracked as the base species holding its Mega Stone. With a date range set, the latest season whose snapshot falls inside it is used. It has per-Pokémon sets but no teams, so team-level views (types, archetypes, quadrant, trends, library, scanner) are unavailable for it.', 'vgc'],
    ];
    const factsList = elm('dl', 'mth-fact-list');
    for (const [label, desc, fam] of facts) {
      for (const e of [elm('dt', 'mth-fact__label', label), elm('dd', 'mth-fact__desc', desc)]) { e.dataset.fam = fam; factsList.appendChild(e); }
    }
    statBody.appendChild(factsList);
    body.appendChild(statCard);

    // --- last refresh ---
    const { card: refCard, body: refBody } = sectionCard('Last refresh');
    body.appendChild(refCard);

    // --- credits ---
    const { card: credCard, body: credBody } = sectionCard('Data credits');
    credBody.appendChild(elm('p', null, "Pokémon and its characters and sprites are trademarks and copyrighted works of Nintendo, Game Freak, Creatures Inc. and The Pokémon Company. Sprites are hot-linked from Pokémon Showdown's sprite server (play.pokemonshowdown.com); the Showdown project does not own them."));
    const vgcCredit = elm('p', null, 'Data from Limitless (play.limitlesstcg.com), Limitless VGC (limitlessvgc.com) and Smogon (smogon.com).');
    credBody.appendChild(vgcCredit);
    const sdCredit = elm('p', null, 'Usage statistics from Smogon (smogon.com/stats). Sample teams and recommended sets © Smogon and their authors, via the pkmn/smogon data mirror (github.com/pkmn/smogon).');
    credBody.appendChild(sdCredit);
    const rankedCredit = elm('p');
    const rankedLink = document.createElement('a');
    rankedLink.href = RANKED_ATTRIBUTION.url;
    rankedLink.target = '_blank';
    rankedLink.rel = 'noopener';
    rankedLink.textContent = RANKED_ATTRIBUTION.text;
    rankedCredit.append(rankedLink, document.createTextNode(' (in-game ranked ladder data).'));
    credBody.appendChild(rankedCredit);
    credBody.appendChild(elm('p', 'mth-disclaimer', 'MetaLens VGC is an unofficial, non-commercial fan project and is not affiliated with Nintendo, Game Freak, Creatures Inc. or The Pokémon Company.'));
    body.appendChild(credCard);

    let lastView = null;

    function render() {
      const view = lastView;
      if (!view) return;

      const vgc = view.family === 'vgc';
      dlCard.hidden = !vgc;
      archCard.hidden = !vgc;
      for (const e of statBody.querySelectorAll('[data-fam]')) e.hidden = e.dataset.fam !== 'both' && e.dataset.fam !== (vgc ? 'vgc' : 'showdown');
      vgcCredit.hidden = !vgc;
      rankedCredit.hidden = !vgc;
      sdCredit.hidden = vgc;
      regCard.querySelector('h3').textContent = vgc ? 'Per-regulation counts' : 'Formats';
      const today = new Date().toISOString().slice(0, 10);
      jsonBtn.onclick = () => download(`metalens-vgc-${view.reg}-${today}.json`, JSON.stringify(toJSONRows(view.teams), null, 2), 'application/json');
      csvBtn.onclick = () => download(`metalens-vgc-${view.reg}-${today}.csv`, toCSV(view.teams), 'text/csv');
      dlNote.textContent = `${ctx.fmt.n(view.teams.length)} teams in the current view (regulation ${view.reg}, current filters applied).`;

      srcBody.innerHTML = '';
      // Showdown formats use Smogon only (+ the sample-team mirror); the Champions sources stay on the VGC page.
      const sources = vgc ? (view.manifest.sources || []) : [
        ...(view.manifest.sources || []).filter((s) => s.id === 'smogon'),
        { name: 'Smogon sample teams and sets (pkmn/smogon mirror)', url: 'https://github.com/pkmn/smogon' },
      ];
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
      const regs = (view.manifest.regs || []).filter((r) => (r.family === 'showdown') === !vgc);
      const wrap = elm('div', 'table-wrap');
      wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', vgc ? 'Regulations' : 'Formats');
      const table = elm('table', 'data-table');
      const thead = elm('thead');
      const trh = elm('tr');
      const cols = vgc ? ['Reg', 'Teams', 'Events', 'Open sheets', 'Matches', 'Ladder months', 'Ranked seasons'] : ['Format', 'Ladder months', 'Ratings', 'Sample teams'];
      cols.forEach((h, i) => trh.appendChild(elm('th', i > 0 ? 'num' : null, h)));
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = elm('tbody');
      for (const r of regs) {
        const tr = elm('tr');
        if (vgc) {
          tr.append(
            elm('td', null, r.id),
            elm('td', 'num', ctx.fmt.n(r.teams)),
            elm('td', 'num', ctx.fmt.n(r.events)),
            elm('td', 'num', ctx.fmt.n(r.openSheets)),
            elm('td', 'num', ctx.fmt.n(r.matches)),
            elm('td', 'num', ctx.fmt.n((r.ladderMonths || []).length)),
            elm('td', 'num', (r.rankedSeasons || []).join(', ') || '—'),
          );
        } else {
          tr.append(
            elm('td', null, r.label || r.id),
            elm('td', 'num', (r.ladderMonths || []).join(', ') || '—'),
            elm('td', 'num', (r.ladderCutoffs || [1760]).map((c) => (c === 0 ? 'All' : `${c}+`)).join(', ')),
            elm('td', 'num', r.samples ? ctx.fmt.n(r.samples.teams) : '—'),
          );
        }
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
