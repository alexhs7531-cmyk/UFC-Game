/* =====================================================================
   UFC Universe: God Mode
   database.js  -  data model, constants, fighter CRUD
   ---------------------------------------------------------------------
   Plain browser globals (no modules) so the game runs from file://.
   This file touches NO DOM and NO localStorage, so it can be tested
   headless. The single shared universe lives in the `state` object,
   which is mutated in place (never reassigned) so every file keeps the
   same reference.

   One weight class. One belt. One ranking. You are the matchmaker.
   ===================================================================== */

/* ----------------------------- attributes ---------------------------- */

const ATTR_KEYS = [
  'striking', 'power', 'strikingDefence', 'speed',
  'wrestling', 'takedownDefence', 'groundControl', 'submissions',
  'submissionDefence', 'clinch',
  'cardio', 'chin', 'strength',
  'fightIQ', 'heart', 'aggression'
];

const ATTR_LABELS = {
  striking: 'Striking', power: 'Power', strikingDefence: 'Striking Defence',
  speed: 'Speed', wrestling: 'Wrestling', takedownDefence: 'Takedown Defence',
  groundControl: 'Ground Control', submissions: 'Submissions',
  submissionDefence: 'Submission Defence', clinch: 'Clinch',
  cardio: 'Cardio', chin: 'Chin', strength: 'Strength',
  fightIQ: 'Fight IQ', heart: 'Heart', aggression: 'Aggression'
};

const ATTR_GROUPS = [
  { label: 'Striking', keys: ['striking', 'power', 'strikingDefence', 'speed'] },
  { label: 'Grappling', keys: ['wrestling', 'takedownDefence', 'groundControl', 'submissions', 'submissionDefence', 'clinch'] },
  { label: 'Physical', keys: ['cardio', 'chin', 'strength'] },
  { label: 'Mental', keys: ['fightIQ', 'heart', 'aggression'] }
];

/* MMA overall weights. Control wins fights: wrestling both ways, fight IQ,
   cardio and defensive skills carry the most; raw power and aggression win
   FINISHES more than fights, so they weigh less here (the fight engine is
   where they bite). */
const ATTR_WEIGHTS = {
  striking: 1.0, power: 0.6, strikingDefence: 1.0, speed: 0.8,
  wrestling: 1.1, takedownDefence: 1.1, groundControl: 0.9, submissions: 0.7,
  submissionDefence: 0.9, clinch: 0.5,
  cardio: 1.1, chin: 0.8, strength: 0.6,
  fightIQ: 1.2, heart: 0.6, aggression: 0.3
};

/* ------------------------------- styles ------------------------------ */

const STYLES = [
  'Striker', 'Counter Striker', 'Pressure Fighter', 'Wrestle-Boxer',
  'Wrestler', 'Grappler', 'Sprawl & Brawl', 'All-Rounder'
];

/* Style intent profiles read by the fight engine.
   tdIntent:  appetite for shooting takedowns (0..1)
   subHunt:   appetite for hunting submissions when on the ground
   gnp:       ground-and-pound emphasis when in top position
   volume:    standing strike output multiplier
   counter:   share of standing work that is countering
   pressure:  cardio drain forced on the opponent
   koThreat:  variance multiplier on flush-shot stoppages
   sprawl:    bonus to takedown defence from style
   scramble:  bonus to escaping bad positions
   decision:  edge on razor-thin judged rounds */
const STYLE_PROFILES = {
  'Striker':          { tdIntent: 0.06, subHunt: 0.20, gnp: 0.55, volume: 1.10, counter: 0.10, pressure: 0.04, koThreat: 1.18, sprawl: 0.04, scramble: 0.05, decision: 1.00 },
  'Counter Striker':  { tdIntent: 0.05, subHunt: 0.20, gnp: 0.50, volume: 0.88, counter: 0.32, pressure: 0.00, koThreat: 1.22, sprawl: 0.02, scramble: 0.03, decision: 1.02 },
  'Pressure Fighter': { tdIntent: 0.16, subHunt: 0.30, gnp: 0.80, volume: 1.16, counter: 0.02, pressure: 0.12, koThreat: 1.06, sprawl: 0.00, scramble: 0.04, decision: 0.98 },
  'Wrestle-Boxer':    { tdIntent: 0.30, subHunt: 0.30, gnp: 0.85, volume: 1.02, counter: 0.08, pressure: 0.08, koThreat: 1.02, sprawl: 0.05, scramble: 0.08, decision: 1.04 },
  'Wrestler':         { tdIntent: 0.52, subHunt: 0.30, gnp: 0.95, volume: 0.86, counter: 0.02, pressure: 0.10, koThreat: 0.88, sprawl: 0.08, scramble: 0.10, decision: 1.06 },
  'Grappler':         { tdIntent: 0.50, subHunt: 0.85, gnp: 0.45, volume: 0.82, counter: 0.02, pressure: 0.04, koThreat: 0.80, sprawl: 0.02, scramble: 0.12, decision: 0.98 },
  'Sprawl & Brawl':   { tdIntent: 0.04, subHunt: 0.15, gnp: 0.60, volume: 1.06, counter: 0.14, pressure: 0.06, koThreat: 1.16, sprawl: 0.14, scramble: 0.08, decision: 1.00 },
  'All-Rounder':      { tdIntent: 0.24, subHunt: 0.45, gnp: 0.75, volume: 1.00, counter: 0.10, pressure: 0.06, koThreat: 1.00, sprawl: 0.05, scramble: 0.08, decision: 1.03 }
};

const STANCES = ['Orthodox', 'Southpaw', 'Switch'];

/* ------------------- career archetypes (potential) -------------------
   From the design brief: what different career levels peak at, and what
   they tend to look like at 18-19. Used as presets on the create page —
   the commissioner can always type an exact potential instead. */
const ARCHETYPES = [
  { id: 'goat',       label: 'GOAT (Jones / GSP tier)',   peak: [98, 99], start: [68, 73] },
  { id: 'atg',        label: 'All-time great champion',   peak: [95, 97], start: [66, 71] },
  { id: 'multiChamp', label: 'Multi-time champion',       peak: [92, 94], start: [64, 69] },
  { id: 'elite',      label: 'Elite contender',           peak: [89, 91], start: [62, 67] },
  { id: 'ranked',     label: 'Ranked fighter',            peak: [85, 88], start: [60, 65] },
  { id: 'roster',     label: 'Average roster fighter',    peak: [80, 84], start: [58, 63] },
  { id: 'fringe',     label: 'Fringe roster fighter',     peak: [75, 79], start: [56, 61] },
  { id: 'regional',   label: 'Regional pro',              peak: [68, 74], start: [54, 59] }
];

/* --------------------------- nationalities ---------------------------
   Every UN member state, plus the UN observer states (Vatican City,
   Palestine), Kosovo, Taiwan and Puerto Rico — selectable for any fighter. */
const NATIONALITIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Puerto Rico',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'USA', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe'
];

const NICKNAMES = [
  'Bones', 'The Eagle', 'The Notorious', 'The Spider', 'Rush', 'The Reaper',
  'Stylebender', 'Blessed', 'The Predator', 'Gamebred', 'Borz', 'The Diamond',
  'El Cucuy', 'Cowboy', 'The Answer', 'Iron', 'The Machine', 'Thug', 'Suga',
  'The Assassin', 'Funk Master', 'The Great', 'Poatan', 'Do Bronx', 'Durinho',
  'The Nightmare', 'The Last Stylebender', 'Marreta', 'The Gorilla', 'Wonderboy',
  'The Hangman', 'The Killa', 'Tarzan', 'The Future', 'Platinum', 'The Mauler',
  'Lionheart', 'The Axe Murderer', 'Shogun', 'The Dragon', 'The Count',
  'The Immortal', 'Sandman', 'Smesh', 'The Highlight', 'Rumble', 'The Wolf'
];

/* --------------------------- math helpers --------------------------- */

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }
function rndi(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function round1(x) { return Math.round(x * 10) / 10; }
/* approx normal via sum of uniforms, centred on `mean`, clamped 1..99 */
function gaussAttr(mean, spread) {
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  return clamp(Math.round(mean + (r - 0.5) * 2 * spread), 1, 99);
}

/* ---------------------------- date helpers --------------------------- */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m is 1-12
function dateToStr(d) { return `${d.d} ${MONTH_NAMES[d.m - 1]} ${d.y}`; }
function dateToKey(d) { return d.y * 10000 + d.m * 100 + d.d; }
function dateCompare(a, b) { return dateToKey(a) - dateToKey(b); }
function cloneDate(d) { return { y: d.y, m: d.m, d: d.d }; }
function addDays(d, n) {
  let { y, m } = d, day = d.d + n;
  while (day > daysInMonth(y, m)) { day -= daysInMonth(y, m); m++; if (m > 12) { m = 1; y++; } }
  while (day < 1) { m--; if (m < 1) { m = 12; y--; } day += daysInMonth(y, m); }
  return { y, m, d: day };
}
function addMonths(d, n) {
  let total = (d.y * 12 + (d.m - 1)) + n;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  const day = Math.min(d.d, daysInMonth(y, m));
  return { y, m, d: day };
}
function daysBetween(a, b) {
  const da = new Date(a.y, a.m - 1, a.d), db = new Date(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86400000);
}
function monthsBetween(a, b) { return (b.y * 12 + b.m) - (a.y * 12 + a.m); }

/* --------------------------- universe state -------------------------- */

const state = {};

function createEmptyUniverse() {
  return {
    meta: { version: 1, created: Date.now(), universeName: 'UFC Universe' },
    settings: { autosave: true, compactSaved: false },
    date: { y: 2026, m: 1, d: 1 },
    fighters: {},
    fights: [],
    champion: null,          // fighter id or null (one division, one belt)
    titleHistory: [],        // { date, championId, formerId, fightId, vacated }
    counters: { fighter: 1, fight: 1 }
  };
}

/* replace the universe in place so the shared `state` reference is kept */
function replaceState(obj) {
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, obj);
}

function genId(kind) {
  if (!state.counters) state.counters = { fighter: 1, fight: 1 };
  const n = state.counters[kind] || 1;
  state.counters[kind] = n + 1;
  return `${kind[0]}${n}`;
}

/* --------------------------- fighter factory -------------------------- */

function defaultAttributes(level) {
  const m = level || 55;
  const a = {};
  ATTR_KEYS.forEach(k => { a[k] = m; });
  return a;
}

function deriveHidden(f) {
  const a = f.attributes;
  const ovr = overallFrom(a);
  return {
    potential: clamp(Math.round(ovr + rndi(4, 18)), ovr, 99),
    improvementRate: round1(rnd(0.85, 1.15)),   // natural learner or not
    primeStart: rndi(26, 28),                    // when growth flattens
    primeEnd: rndi(31, 33),                      // when decline begins
    durability: clamp(Math.round(a.chin * 0.55 + a.heart * 0.25 + a.strength * 0.2), 1, 99),
    damageAccumulation: 0,                       // career wear; accelerates decline
    careerMomentum: 0,                           // hot streaks speed development
    confidence: rndi(55, 70),
    legacyScore: 0,                              // GOAT points (monotonic)
    goatParts: null                              // last GOAT breakdown for the UI
  };
}

function makeFighter(p) {
  p = p || {};
  const today = (state.date && state.date.y) ? state.date : { y: 2026, m: 1, d: 1 };
  const attributes = Object.assign(defaultAttributes(55), p.attributes || {});
  ATTR_KEYS.forEach(k => { attributes[k] = clamp(Math.round(attributes[k]), 1, 99); });

  const age = p.age != null ? p.age : 22;
  const ovr = overallFrom(attributes);
  const f = {
    id: p.id || genId('fighter'),
    name: p.name || 'New Fighter',
    nickname: p.nickname || '',
    nationality: p.nationality || 'USA',
    hometown: p.hometown || '',
    age: age,
    birthYear: today.y - age,
    height: p.height || 180,               // cm
    reach: p.reach || 185,                 // cm
    stance: p.stance || 'Orthodox',
    style: p.style || 'All-Rounder',
    status: p.status || 'active',
    retiredDate: p.retiredDate || null,
    debutDate: p.debutDate || cloneDate(today),
    lastFightDate: p.lastFightDate || null,

    attributes: attributes,
    hidden: null,

    elo: Math.round(p.elo != null ? p.elo : seedElo(ovr)),
    peakElo: 0,
    peakOverall: ovr,
    peakOverallAge: age,

    record: Object.assign({ w: 0, l: 0, d: 0, nc: 0, ko: 0, sub: 0, dec: 0, koLoss: 0, subLoss: 0 }, p.record || {}),
    currentStreak: p.currentStreak || { type: null, count: 0 },
    bestWinStreak: p.bestWinStreak || 0,

    top10Wins: 0, top5Wins: 0, championScalps: 0,
    titleFightsW: 0, titleFightsL: 0, titleDefences: 0,
    titleReignDays: 0, reigns: [],         // { start, end|null, defences }
    finishOfNight: 0,                       // bonus-worthy finishes (POTN style)

    earnings: Math.max(0, Math.round(p.earnings || 0)),
    popularity: clamp(Math.round(p.popularity != null ? p.popularity : 25), 1, 99),
    peakPopularity: 0,

    fightHistory: [],
    eloHistory: [],
    overallHistory: [],                     // { y, age, ovr } — one point per year
    bestWinId: null, worstLossId: null,
    frozen: !!p.frozen,                     // frozen fighters never age or develop
    created: p.created || Date.now()
  };
  f.hidden = p.hidden ? Object.assign(deriveHidden(f), p.hidden) : deriveHidden(f);
  f.hidden.potential = clamp(Math.round(f.hidden.potential), ovr, 99);
  f.peakElo = f.elo;
  f.peakPopularity = f.popularity;
  f.eloHistory = [{ d: dateToStr(today), e: f.elo }];
  f.overallHistory = [{ y: today.y, age: f.age, ovr: ovr }];
  return f;
}

/* Debuting hype: a fighter built like a killer enters ranked above the
   scrubs, but nowhere near an earned championship ELO. */
function seedElo(ovr) {
  return clamp(Math.round(1000 + (ovr - 60) * 6), 850, 1250);
}

/* ------------------------------- CRUD -------------------------------- */

function addFighter(p) {
  const f = makeFighter(p);
  state.fighters[f.id] = f;
  return f;
}
function getFighter(id) { return state.fighters[id] || null; }
function allFighters() { return Object.values(state.fighters); }
function activeFighters() { return allFighters().filter(f => f.status === 'active'); }
function retiredFighters() { return allFighters().filter(f => f.status === 'retired'); }

function updateFighter(id, patch) {
  const f = state.fighters[id];
  if (!f) return null;
  Object.keys(patch).forEach(k => {
    if (k === 'attributes') Object.assign(f.attributes, patch.attributes);
    else if (k === 'hidden') Object.assign(f.hidden, patch.hidden);
    else if (k === 'record') Object.assign(f.record, patch.record);
    else f[k] = patch[k];
  });
  ATTR_KEYS.forEach(k => { f.attributes[k] = clamp(Math.round(f.attributes[k]), 1, 99); });
  if (f.age != null) f.birthYear = state.date.y - f.age;
  if (f.hidden) f.hidden.potential = clamp(Math.round(f.hidden.potential), 1, 99);
  return f;
}

function deleteFighter(id) {
  delete state.fighters[id];
  if (state.champion === id) state.champion = null;
}

function retireFighter(id) {
  const f = state.fighters[id];
  if (!f || f.status === 'retired') return;
  f.status = 'retired';
  f.retiredDate = cloneDate(state.date);
  if (state.champion === id) {
    // close the reign and vacate the belt
    closeReign(f, state.date);
    state.champion = null;
    state.titleHistory.push({ date: cloneDate(state.date), championId: null, formerId: id, fightId: null, vacated: true });
  } else {
    closeReign(f, state.date); // safe if no open reign
  }
}
function unretireFighter(id) {
  const f = state.fighters[id];
  if (!f) return;
  f.status = 'active';
  f.retiredDate = null;
}

/* close any open title reign, banking the days held */
function closeReign(f, onDate) {
  const open = f.reigns.find(r => !r.end);
  if (!open) return;
  open.end = cloneDate(onDate);
  f.titleReignDays += Math.max(0, daysBetween(open.start, onDate));
}
/* days the current champion has held the belt so far (open reign) */
function openReignDays(f, asOf) {
  const open = f.reigns.find(r => !r.end);
  return open ? Math.max(0, daysBetween(open.start, asOf || state.date)) : 0;
}
function totalReignDays(f) { return f.titleReignDays + openReignDays(f); }

/* --------------------------- ratings + format ------------------------ */

function overallFrom(a) {
  let sum = 0, tot = 0;
  ATTR_KEYS.forEach(k => { sum += a[k] * ATTR_WEIGHTS[k]; tot += ATTR_WEIGHTS[k]; });
  return Math.round(sum / tot);
}
function overall(f) { return overallFrom(f.attributes); }

function recordStr(f) {
  const r = f.record;
  return `${r.w}-${r.l}${r.d ? '-' + r.d : ''}${r.nc ? ' (' + r.nc + ' NC)' : ''}`;
}
function finishStr(f) {
  const r = f.record;
  return `${r.ko} KO · ${r.sub} SUB · ${r.dec} DEC`;
}
function totalFights(f) { const r = f.record; return r.w + r.l + r.d; }
function isUndefeated(f) { return f.record.l === 0 && totalFights(f) > 0; }
function finishRate(f) {
  const r = f.record;
  return r.w > 0 ? Math.round(((r.ko + r.sub) / r.w) * 100) : 0;
}
function isChampion(f) { return state.champion === f.id; }

/* tier label from ELO, used in UI */
function eloTier(elo) {
  if (elo >= 1900) return 'Pound-for-pound great';
  if (elo >= 1700) return 'Championship level';
  if (elo >= 1500) return 'Contender';
  if (elo >= 1350) return 'Ranked level';
  if (elo >= 1150) return 'Prospect';
  return 'Unproven';
}

/* archetype helpers for the create page */
function archetypeById(id) { return ARCHETYPES.find(a => a.id === id) || null; }
function rollPotential(archId) {
  const a = archetypeById(archId);
  if (!a) return null;
  return rndi(a.peak[0], a.peak[1]);
}

/* Build a believable young attribute set that lands on a target overall.
   Used by the "suggest attributes" helper on the create page — the
   commissioner can still hand-tune every slider afterwards. */
function suggestAttributes(targetOvr, style) {
  const prof = STYLE_PROFILES[style] || STYLE_PROFILES['All-Rounder'];
  const a = {};
  ATTR_KEYS.forEach(k => { a[k] = gaussAttr(targetOvr, 6); });
  // style flavour
  if (prof.tdIntent >= 0.4) { a.wrestling = gaussAttr(targetOvr + 8, 4); a.groundControl = gaussAttr(targetOvr + 6, 4); a.striking = gaussAttr(targetOvr - 6, 5); }
  if (prof.subHunt >= 0.7) { a.submissions = gaussAttr(targetOvr + 9, 4); a.submissionDefence = gaussAttr(targetOvr + 5, 4); a.power = gaussAttr(targetOvr - 7, 5); }
  if (prof.tdIntent <= 0.08) { a.striking = gaussAttr(targetOvr + 7, 4); a.power = gaussAttr(targetOvr + 5, 5); a.wrestling = gaussAttr(targetOvr - 8, 5); }
  if (style === 'Sprawl & Brawl') a.takedownDefence = gaussAttr(targetOvr + 8, 4);
  if (style === 'Counter Striker') { a.strikingDefence = gaussAttr(targetOvr + 7, 4); a.fightIQ = gaussAttr(targetOvr + 5, 4); }
  if (style === 'Pressure Fighter') { a.cardio = gaussAttr(targetOvr + 7, 4); a.heart = gaussAttr(targetOvr + 6, 4); }
  // young fighters: engine matures IQ/cardio later, so shade them slightly down
  a.fightIQ = clamp(a.fightIQ - 2, 1, 99);
  // nudge the set until the weighted overall matches the target exactly
  let guard = 0;
  while (overallFrom(a) !== targetOvr && guard++ < 240) {
    const diff = targetOvr - overallFrom(a);
    const k = pick(ATTR_KEYS);
    a[k] = clamp(a[k] + (diff > 0 ? 1 : -1), 1, 99);
  }
  return a;
}
