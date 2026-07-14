/* =====================================================================
   app.js  -  boot, time control, navigation
   ===================================================================== */

let lastAgeingReport = null;   // shown on the Time page after a year turns

function updateTopbar() {
  const d = state.date;
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = `${MONTHS[d.m - 1]} ${d.d}, ${d.y}`;
  const nm = document.getElementById('topbar-universe');
  if (nm) nm.textContent = state.meta.universeName || 'UFC Universe';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* advance the universe clock; fighters age on every 1 January crossed */
function advanceTime(unit) {
  const before = cloneDate(state.date);
  let after;
  if (unit === 'week') after = addDays(state.date, 7);
  else if (unit === 'month') after = addMonths(state.date, 1);
  else if (unit === 'quarter') after = addMonths(state.date, 3);
  else if (unit === 'half') after = addMonths(state.date, 6);
  else after = addMonths(state.date, 12);

  const yearsCrossed = after.y - before.y;
  state.date = after;

  if (yearsCrossed > 0) {
    let combined = [];
    for (let i = 0; i < yearsCrossed; i++) combined = combined.concat(ageAllForYear());
    // if several years crossed at once, keep each fighter's net change
    const byId = {};
    combined.forEach(r => {
      if (!byId[r.id]) byId[r.id] = Object.assign({}, r);
      else { byId[r.id].to = r.to; byId[r.id].age = r.age; byId[r.id].delta = byId[r.id].to - byId[r.id].from; }
    });
    lastAgeingReport = { year: after.y, rows: Object.values(byId).sort((a, b) => b.delta - a.delta) };
  }

  autosave();
  updateTopbar();
  render(currentRoute, currentParams); // refresh whatever page is open
}

/* ----- drawer ----- */
function toggleDrawer(force) {
  const d = document.getElementById('drawer');
  const s = document.getElementById('scrim');
  const open = force != null ? force : !d.classList.contains('open');
  d.classList.toggle('open', open);
  s.classList.toggle('show', open);
}

function boot() {
  const loaded = loadUniverse();
  if (!loaded) { replaceState(createEmptyUniverse()); saveUniverse(); }
  recomputeAllGoat();

  document.getElementById('menu-btn').addEventListener('click', () => toggleDrawer());
  document.getElementById('scrim').addEventListener('click', () => toggleDrawer(false));

  // drawer navigation (event delegation)
  document.getElementById('drawer').addEventListener('click', e => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    toggleDrawer(false);
    render(btn.dataset.route);
  });

  updateTopbar();
  render(allFighters().length ? 'dashboard' : 'create');
}

window.addEventListener('DOMContentLoaded', boot);
