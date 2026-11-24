// Country policy for the research export (Vin's Atelier). Pure, pipeline-only: the dashboard keeps the sheet's
// ISO-2 country (Meta by country) and never imports this.
//
// The public release must not carry the country as published: country + event + placing can re-identify a player
// from a small country. A release either drops it ('drop', the default) or groups it into world regions ('region').
// 'raw' (as published) exists only for the internal export `npm run data` writes to data-export/ (gitignored);
// scripts/release.js refuses it.

export const COUNTRY_POLICIES = ['drop', 'region', 'raw'];
export const RELEASE_COUNTRY_POLICIES = ['drop', 'region'];
export const DEFAULT_COUNTRY_POLICY = 'drop';

// A region is published for a team only when at least this many full lists at the same event share it;
// otherwise the cell reads "suppressed" (a region holding one country, e.g. Africa = South Africa in these data,
// would otherwise name the country).
export const REGION_MIN_GROUP = 5;

export const REGION_SCHEME = 'UN M49 regions (unstats.un.org/unsd/methodology/m49), with the Americas split into its '
  + 'M49 sub-regions Northern America and Latin America and the Caribbean';

// M49 region -> ISO 3166-1 alpha-2 codes. Taiwan (not listed by M49) is filed under Eastern Asia, Kosovo (XK, a
// user-assigned code) under Southern Europe, and the sheet spelling UK under Europe with GB.
export const REGIONS = {
  africa: { label: 'Africa', codes: 'DZ EG LY MA SD TN EH IO BI KM DJ ER ET KE MG MW MU YT MZ RE RW SC SO SS TF UG TZ ZM ZW AO CM CF TD CG CD GQ GA ST BW SZ LS NA ZA BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG' },
  'northern-america': { label: 'Northern America', codes: 'BM CA GL PM US' },
  'latin-america-caribbean': { label: 'Latin America and the Caribbean', codes: 'AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI BZ CR SV GT HN MX NI PA AR BO BV BR CL CO EC FK GF GY PY PE GS SR UY VE' },
  asia: { label: 'Asia', codes: 'KZ KG TJ TM UZ CN HK MO KP JP MN KR TW BN KH ID LA MY MM PH SG TH TL VN AF BD BT IN IR MV NP PK LK AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE' },
  europe: { label: 'Europe', codes: 'BY BG CZ HU PL MD RO RU SK UA AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB UK AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES XK AT BE FR DE LI LU MC NL CH' },
  oceania: { label: 'Oceania', codes: 'AU CX CC HM NZ NF FJ NC PG SB VU GU KI MH FM NR MP PW UM AS CK PF NU PN WS TK TO TV WF' },
};

const BY_CODE = new Map(Object.entries(REGIONS).flatMap(([id, r]) => r.codes.split(' ').map((c) => [c, id])));

/** Region id for an ISO-2 code ('' for none or a code outside the table). */
export const regionOf = (code) => (code ? BY_CODE.get(String(code).toUpperCase()) || '' : '');

export function checkPolicy(policy, allowed = COUNTRY_POLICIES) {
  if (!allowed.includes(policy)) throw new Error(`country policy must be one of ${allowed.join(', ')} (got "${policy}")`);
  return policy;
}

/**
 * Per-team value of the export's country column under `policy`, for teams = [{ ev: {id}, country }].
 * Returns { values: string[] aligned with teams, stats }. 'drop' returns no values (the column is left out).
 */
export function countryColumn(teams, policy) {
  checkPolicy(policy);
  if (policy === 'drop') return { values: null, stats: { policy } };
  if (policy === 'raw') return { values: teams.map((t) => t.country || ''), stats: { policy } };
  const region = teams.map((t) => regionOf(t.country));
  const group = new Map();
  teams.forEach((t, i) => { if (region[i]) { const k = `${t.ev.id}|${region[i]}`; group.set(k, (group.get(k) || 0) + 1); } });
  let suppressed = 0;
  let unmapped = 0;
  const values = teams.map((t, i) => {
    if (!region[i]) { if (t.country) unmapped++; return ''; }
    if (group.get(`${t.ev.id}|${region[i]}`) < REGION_MIN_GROUP) { suppressed++; return 'suppressed'; }
    return region[i];
  });
  return { values, stats: { policy, suppressed, unmapped } };
}
