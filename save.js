/* =====================================================================
   save.js  -  persistence (localStorage) + JSON import / export
   ---------------------------------------------------------------------
   Built for a game played across months. The working copy lives in
   localStorage and autosaves after every change. Because localStorage is
   capped (~5MB), if it ever fills we trim the oldest fights' verbose
   play-by-play (keeping the result, scorecards, stats and all rating
   changes) so the universe never fails to save. Export a JSON backup any
   time to keep absolutely everything.
   ===================================================================== */

const STORAGE_KEY = 'ufc-universe-god-mode-v1';
let _saveTimer = null;
let _lastSaveInfo = { ok: true, trimmed: 0, at: null };

function serializeState() { return JSON.stringify(state); }

/* fill in any fields missing from an older save so upgrades don't break */
function migrateState(s) {
  if (!s.meta) s.meta = { version: 1, created: Date.now(), universeName: 'UFC Universe' };
  if (!s.settings) s.settings = { autosave: true, compactSaved: false };
  if (s.settings.autosave == null) s.settings.autosave = true;
  if (!s.date) s.date = { y: 2026, m: 1, d: 1 };
  if (!s.fighters) s.fighters = {};
  if (!s.fights) s.fights = [];
  if (s.champion === undefined) s.champion = null;
  if (!s.titleHistory) s.titleHistory = [];
  if (!s.counters) s.counters = { fighter: 1, fight: 1 };
  // per-fighter forward-compat
  Object.values(s.fighters).forEach(f => {
    if (f.earnings == null) f.earnings = 0;
    if (f.peakElo == null) f.peakElo = f.elo;
    if (f.peakOverall == null) f.peakOverall = overallFrom(f.attributes);
    if (f.peakOverallAge == null) f.peakOverallAge = f.age;
    if (f.peakPopularity == null) f.peakPopularity = f.popularity || 25;
    if (f.popularity == null) f.popularity = 25;
    if (!f.currentStreak) f.currentStreak = { type: null, count: 0 };
    if (f.bestWinStreak == null) f.bestWinStreak = 0;
    if (f.top10Wins == null) f.top10Wins = 0;
    if (f.top5Wins == null) f.top5Wins = 0;
    if (f.championScalps == null) f.championScalps = 0;
    if (f.titleFightsW == null) f.titleFightsW = 0;
    if (f.titleFightsL == null) f.titleFightsL = 0;
    if (f.titleDefences == null) f.titleDefences = 0;
    if (f.titleReignDays == null) f.titleReignDays = 0;
    if (!f.reigns) f.reigns = [];
    if (f.finishOfNight == null) f.finishOfNight = 0;
    if (!f.fightHistory) f.fightHistory = [];
    if (!f.eloHistory) f.eloHistory = [{ d: dateToStr(s.date), e: f.elo }];
    if (!f.overallHistory) f.overallHistory = [{ y: s.date.y, age: f.age, ovr: overallFrom(f.attributes) }];
    if (f.frozen == null) f.frozen = false;
    if (!f.record.nc) f.record.nc = 0;
    ['ko', 'sub', 'dec', 'koLoss', 'subLoss'].forEach(k => { if (f.record[k] == null) f.record[k] = 0; });
    if (f.attributes) ATTR_KEYS.forEach(k => { if (f.attributes[k] == null) f.attributes[k] = 55; if (f.attributes[k] > 99) f.attributes[k] = 99; });
    if (!f.hidden) {
      f.hidden = {
        potential: clamp(overallFrom(f.attributes) + 8, 1, 99), improvementRate: 1,
        primeStart: 27, primeEnd: 32, durability: 60, damageAccumulation: 0,
        careerMomentum: 0, confidence: 60, legacyScore: 0, goatParts: null
      };
    }
    if (f.hidden.legacyScore == null) f.hidden.legacyScore = 0;
  });
  return s;
}

/* ----- core save / load ----- */
function saveUniverse() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState());
    _lastSaveInfo = { ok: true, trimmed: 0, at: Date.now() };
    return _lastSaveInfo;
  } catch (err) {
    // quota exceeded -> trim oldest verbose detail and retry
    let trimmed = 0;
    while (trimmed < state.fights.length) {
      const batch = trimOldestDetail(60);
      if (batch === 0) break;
      trimmed += batch;
      try {
        localStorage.setItem(STORAGE_KEY, serializeState());
        state.settings.compactSaved = true;
        _lastSaveInfo = { ok: true, trimmed, at: Date.now() };
        return _lastSaveInfo;
      } catch (e2) { /* keep trimming */ }
    }
    _lastSaveInfo = { ok: false, trimmed, at: Date.now() };
    return _lastSaveInfo;
  }
}

/* strip play-by-play from the n oldest fights that still carry it */
function trimOldestDetail(n) {
  const withDetail = state.fights
    .filter(f => f.result && f.result.events && f.result.events.length)
    .sort((a, b) => dateCompare(a.date, b.date));
  let count = 0;
  for (const f of withDetail) {
    if (count >= n) break;
    f.result.events = [];
    f.result.rounds = null;
    f.result._trimmed = true;
    count++;
  }
  return count;
}

function loadUniverse() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    replaceState(migrateState(parsed));
    return true;
  } catch (err) {
    console.warn('Could not load saved universe:', err);
    return false;
  }
}

function autosave() {
  if (!state.settings || !state.settings.autosave) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveUniverse, 400);
}

function resetUniverse() {
  replaceState(createEmptyUniverse());
  saveUniverse();
}

function storageFootprintKB() {
  try { return Math.round((serializeState().length * 2) / 1024); } catch (e) { return 0; }
}

/* ----- file download / upload ----- */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportUniverse() {
  const d = state.date;
  downloadJSON(state, `ufc-universe-${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}.json`);
}

function importUniverseFromFile(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.fighters) throw new Error('This file does not look like a UFC Universe save.');
      replaceState(migrateState(parsed));
      recomputeAllGoat();
      saveUniverse();
      cb(null);
    } catch (err) { cb(err); }
  };
  reader.onerror = () => cb(new Error('Could not read the file.'));
  reader.readAsText(file);
}

/* ----- individual fighter import / export (share fighters) ----- */
function exportFighters(ids) {
  const list = ids.map(getFighter).filter(Boolean).map(f => JSON.parse(JSON.stringify(f)));
  downloadJSON({ type: 'ufc-universe-fighters', version: 1, fighters: list }, `fighters-${Date.now()}.json`);
}

function importFightersFromText(text) {
  const parsed = JSON.parse(text);
  let arr = [];
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed.fighters) arr = parsed.fighters;
  else if (parsed.attributes) arr = [parsed]; // single fighter object
  else throw new Error('No fighters found in that JSON.');

  const added = [];
  arr.forEach(raw => {
    // arrive as a freshly created fighter in THIS universe: keep identity
    // and attributes, but clear anything referencing fights that do not exist here
    const clean = Object.assign({}, raw);
    delete clean.id;
    clean.fightHistory = [];
    clean.eloHistory = null;
    clean.overallHistory = null;
    clean.bestWinId = null; clean.worstLossId = null;
    clean.reigns = [];
    clean.titleReignDays = 0;
    clean.record = { w: 0, l: 0, d: 0, nc: 0, ko: 0, sub: 0, dec: 0, koLoss: 0, subLoss: 0 };
    added.push(addFighter(clean));
  });
  saveUniverse();
  return added;
}
