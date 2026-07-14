/* =====================================================================
   ui.js  -  all views and rendering
   ---------------------------------------------------------------------
   Views live in the VIEWS object: each has html(params) returning markup
   and wire(params) attaching events after render. render(route, params)
   swaps #app-content.
   ===================================================================== */

let currentRoute = 'dashboard';
let currentParams = null;

/* ------------------------------ helpers ----------------------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function money(n) { return '$' + Math.round(n).toLocaleString(); }
function initials(f) {
  const p = f.name.trim().split(/\s+/);
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function ratingClass(v) {
  if (v >= 92) return 'rt-elite';
  if (v >= 85) return 'rt-great';
  if (v >= 78) return 'rt-good';
  if (v >= 68) return 'rt-avg';
  return 'rt-low';
}
function octAvatar(f, cls) {
  const champ = isChampion(f) ? ' champ' : '';
  return `<div class="oct ${cls || ''}${champ}">${esc(initials(f))}</div>`;
}
function attrBarHtml(label, v, cls) {
  return `<div class="attr-row">
    <span class="lbl">${esc(label)}</span>
    <div class="bar ${cls || ''}"><i style="width:${clamp(v, 0, 99)}%"></i></div>
    <span class="val">${Math.round(v)}</span>
  </div>`;
}
function chipRes(res) {
  if (res === 'W') return '<span class="chip win">W</span>';
  if (res === 'L') return '<span class="chip loss">L</span>';
  return '<span class="chip draw">D</span>';
}
function sparkline(points, w, h, cls) {
  if (!points || points.length < 2) return '<span class="faint small">not enough data yet</span>';
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1, max - min);
  const W = w || 220, H = h || 44, pad = 3;
  const step = (W - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, H - pad - ((p - min) / span) * (H - pad * 2)]);
  const d = 'M' + xy.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  const area = d + ` L${xy[xy.length - 1][0].toFixed(1)} ${H - pad} L${xy[0][0].toFixed(1)} ${H - pad} Z`;
  return `<svg class="spark ${cls || ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path class="area" d="${area}"></path><path d="${d}"></path></svg>`;
}
function fighterLink(f, extra) {
  return `<span class="click-fighter" data-fid="${f.id}" style="cursor:pointer">${esc(f.name)}${extra || ''}</span>`;
}
function wireFighterLinks(root) {
  $all('.click-fighter', root).forEach(el =>
    el.addEventListener('click', e => { e.stopPropagation(); render('profile', { id: el.dataset.fid }); }));
}
function ageingDateNote() {
  return `<div class="small faint">Fighters develop or decline every 1 January when you advance time.</div>`;
}
function styleOptions(sel) {
  return STYLES.map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('');
}
function countryOptions(sel) {
  return NATIONALITIES.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
}
function rankLabel(f) {
  if (isChampion(f)) return 'C';
  const r = rankOf(f);
  return r && r <= 15 ? '#' + r : '—';
}

/* ------------------------------ router ------------------------------ */
function render(route, params) {
  const v = VIEWS[route];
  if (!v) return;
  currentRoute = route; currentParams = params || null;
  $('#app-content').innerHTML = v.html(params || {});
  if (v.wire) v.wire(params || {});
  window.scrollTo(0, 0);
}

/* ===================================================================== */
const VIEWS = {};

/* ------------------------------ DASHBOARD --------------------------- */
VIEWS.dashboard = {
  html() {
    const act = activeFighters();
    const champ = state.champion ? getFighter(state.champion) : null;
    const recent = state.fights.slice(-5).reverse();
    const { contenders } = officialRankings(5);

    const champHtml = champ ? `
      <div class="champ-card click-fighter" data-fid="${champ.id}" style="cursor:pointer">
        ${octAvatar(champ, 'lg')}
        <div style="min-width:0">
          <div class="belt-tag">Undisputed Champion</div>
          <div class="ovr" style="font-size:24px">${esc(champ.name)}</div>
          <div class="mono small muted">${recordStr(champ)} &middot; ${esc(champ.nationality)} &middot; ELO ${champ.elo}</div>
          <div class="small muted">${champ.titleDefences} title defence${champ.titleDefences === 1 ? '' : 's'}</div>
        </div>
        <div class="right ovr big ${ratingClass(overall(champ))}">${overall(champ)}</div>
      </div>`
      : `<div class="panel center"><div class="belt-tag">The belt is vacant</div>
         <div class="small muted" style="margin-top:6px">Book a title fight to crown the first champion.</div></div>`;

    return `<div class="grid">
      ${champHtml}

      <div class="tiles">
        <div class="tile"><div class="k">Active Fighters</div><div class="v">${act.length}</div></div>
        <div class="tile"><div class="k">Retired</div><div class="v">${retiredFighters().length}</div></div>
        <div class="tile"><div class="k">Fights Held</div><div class="v">${state.fights.length}</div></div>
        <div class="tile"><div class="k">Title Changes</div><div class="v">${state.titleHistory.length}</div></div>
      </div>

      <div class="grid grid-2">
        <div class="panel">
          <h2>Top Contenders</h2>
          ${contenders.length ? contenders.map((f, i) => `
            <div class="rank-row click-fighter" data-fid="${f.id}">
              <div class="pos">${i + 1}</div>
              ${octAvatar(f, 'sm')}
              <div class="who"><div class="nm">${esc(f.name)}</div>
                <div class="small faint mono">${recordStr(f)}</div></div>
              <div class="stat">ELO ${f.elo}<br><span class="${ratingClass(overall(f))}">${overall(f)} OVR</span></div>
            </div>`).join('') : '<div class="faint small">No fighters yet — create some.</div>'}
        </div>

        <div class="panel">
          <h2>Recent Results</h2>
          ${recent.length ? recent.map(ft => {
            const a = getFighter(ft.aId), b = getFighter(ft.bId);
            if (!a || !b) return '';
            const res = ft.result;
            const wName = res.draw ? 'Draw' : esc(getFighter(res.winnerId).name);
            return `<div class="rank-row" data-goto-fight="${ft.id}">
              <div class="who"><div class="nm">${esc(a.name)} <span class="vs">vs</span> ${esc(b.name)}${ft.titleFight ? ' <span class="chip gold">TITLE</span>' : ''}</div>
              <div class="small faint mono">${res.draw ? res.method : wName + ' by ' + res.method} &middot; R${res.round} ${res.timeStr}</div></div>
            </div>`;
          }).join('') : '<div class="faint small">No fights yet — book the first one.</div>'}
        </div>
      </div>

      <div class="btn-row">
        <button class="btn primary" data-go="book">Book a Fight</button>
        <button class="btn" data-go="create">Create Fighter</button>
        <button class="btn" data-go="time">Advance Time</button>
      </div>
    </div>`;
  },
  wire() {
    wireFighterLinks();
    $all('[data-go]').forEach(b => b.addEventListener('click', () => render(b.dataset.go)));
    $all('[data-goto-fight]').forEach(r => r.addEventListener('click', () => render('fightResult', { id: +r.dataset.gotoFight })));
  }
};

/* ------------------------------ ROSTER ------------------------------ */
let rosterState = { q: '', scope: 'active', sort: 'ovr' };
VIEWS.roster = {
  html() {
    const s = rosterState;
    let list = s.scope === 'active' ? activeFighters() : s.scope === 'retired' ? retiredFighters() : allFighters();
    if (s.q) {
      const q = s.q.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.nickname || '').toLowerCase().includes(q) || f.nationality.toLowerCase().includes(q) || f.style.toLowerCase().includes(q));
    }
    const sorters = {
      ovr: (a, b) => overall(b) - overall(a),
      elo: (a, b) => b.elo - a.elo,
      age: (a, b) => a.age - b.age,
      wins: (a, b) => b.record.w - a.record.w,
      name: (a, b) => a.name.localeCompare(b.name),
      pop: (a, b) => b.popularity - a.popularity
    };
    list.sort(sorters[s.sort] || sorters.ovr);

    return `<div class="grid">
      <div class="panel">
        <h2>Fighter Database <span class="faint mono small">(${list.length})</span></h2>
        <div class="flex flex-wrap" style="margin-bottom:10px">
          <input type="text" id="roster-q" placeholder="Search name, country, style…" value="${esc(s.q)}" style="max-width:280px">
          <select id="roster-scope" style="max-width:130px">
            <option value="active" ${s.scope === 'active' ? 'selected' : ''}>Active</option>
            <option value="retired" ${s.scope === 'retired' ? 'selected' : ''}>Retired</option>
            <option value="all" ${s.scope === 'all' ? 'selected' : ''}>All</option>
          </select>
          <select id="roster-sort" style="max-width:150px">
            <option value="ovr" ${s.sort === 'ovr' ? 'selected' : ''}>Sort: Overall</option>
            <option value="elo" ${s.sort === 'elo' ? 'selected' : ''}>Sort: ELO</option>
            <option value="wins" ${s.sort === 'wins' ? 'selected' : ''}>Sort: Wins</option>
            <option value="age" ${s.sort === 'age' ? 'selected' : ''}>Sort: Age</option>
            <option value="pop" ${s.sort === 'pop' ? 'selected' : ''}>Sort: Popularity</option>
            <option value="name" ${s.sort === 'name' ? 'selected' : ''}>Sort: Name</option>
          </select>
          <button class="btn primary sm right" data-go="create">+ New Fighter</button>
        </div>
        <div class="tbl-scroll"><table class="tbl">
          <thead><tr><th></th><th>Fighter</th><th>Rank</th><th class="num">OVR</th><th class="num">ELO</th><th>Record</th><th class="num">Age</th><th>Style</th></tr></thead>
          <tbody>
            ${list.map(f => `<tr class="click" data-fid="${f.id}">
              <td style="width:44px">${octAvatar(f, 'sm')}</td>
              <td><div style="font-family:var(--font-display);text-transform:uppercase;letter-spacing:.04em;font-size:15px">${esc(f.name)}</div>
                <div class="small faint">${esc(f.nationality)}${f.status === 'retired' ? ' · <span class="chip">RETIRED</span>' : ''}</div></td>
              <td class="mono">${f.status === 'active' ? rankLabel(f) : '—'}</td>
              <td class="num"><b class="${ratingClass(overall(f))}">${overall(f)}</b></td>
              <td class="num">${f.elo}</td>
              <td class="mono">${recordStr(f)}</td>
              <td class="num">${f.age}</td>
              <td class="small muted">${esc(f.style)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        ${list.length ? '' : '<div class="faint center" style="padding:24px">No fighters here yet.</div>'}
      </div>
    </div>`;
  },
  wire() {
    $('#roster-q').addEventListener('input', e => { rosterState.q = e.target.value; render('roster'); setTimeout(() => { const el = $('#roster-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 0); });
    $('#roster-scope').addEventListener('change', e => { rosterState.scope = e.target.value; render('roster'); });
    $('#roster-sort').addEventListener('change', e => { rosterState.sort = e.target.value; render('roster'); });
    $all('tr[data-fid]').forEach(tr => tr.addEventListener('click', () => render('profile', { id: +tr.dataset.fid })));
    $all('[data-go]').forEach(b => b.addEventListener('click', () => render(b.dataset.go)));
  }
};

/* --------------------------- CREATE / EDIT -------------------------- */
VIEWS.create = {
  html(params) {
    const editing = params.editId ? getFighter(params.editId) : null;
    const f = editing || {
      name: '', nickname: '', nationality: 'United States of America', hometown: '',
      age: 21, height: 180, reach: 183, stance: 'Orthodox', style: 'All-Rounder',
      attributes: defaultAttributes(62), hidden: { potential: 84, improvementRate: 1 }
    };
    const groups = ATTR_GROUPS.map(g => `
      <div class="panel">
        <h2>${esc(g.label)}</h2>
        ${g.keys.map(k => `
          <div class="attr-row">
            <span class="lbl">${esc(ATTR_LABELS[k])}</span>
            <input type="range" min="30" max="99" step="1" value="${Math.round(f.attributes[k])}" data-attr="${k}">
            <span class="val mono" id="av-${k}">${Math.round(f.attributes[k])}</span>
          </div>`).join('')}
      </div>`).join('');

    return `<div class="grid">
      <div class="panel">
        <h2>${editing ? 'Edit Fighter' : 'Create Fighter'}</h2>
        <div class="grid grid-2">
          <label class="fld"><span>Full Name *</span><input type="text" id="cf-name" value="${esc(f.name)}" placeholder="e.g. Marcus Silva"></label>
          <label class="fld"><span>Nickname</span><input type="text" id="cf-nick" value="${esc(f.nickname || '')}" placeholder="e.g. The Hurricane"></label>
          <label class="fld"><span>Country</span><select id="cf-nat">${countryOptions(f.nationality)}</select></label>
          <label class="fld"><span>Hometown</span><input type="text" id="cf-town" value="${esc(f.hometown || '')}" placeholder="optional"></label>
          <label class="fld"><span>Age (at creation)</span><input type="number" id="cf-age" min="18" max="45" value="${f.age}" ${editing ? 'disabled' : ''}></label>
          <label class="fld"><span>Fighting Style</span><select id="cf-style">${styleOptions(f.style)}</select></label>
          <label class="fld"><span>Height (cm)</span><input type="number" id="cf-height" min="150" max="215" value="${f.height}"></label>
          <label class="fld"><span>Reach (cm)</span><input type="number" id="cf-reach" min="150" max="220" value="${f.reach}"></label>
          <label class="fld"><span>Stance</span><select id="cf-stance">${STANCES.map(s => `<option ${s === f.stance ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="fld"><span>Hidden Potential (god mode) *</span><input type="number" id="cf-pot" min="40" max="99" value="${Math.round(f.hidden.potential)}"></label>
        </div>
        <div class="small muted">* Potential is the ceiling this fighter can develop towards. It is never shown on their public profile — only you know it.</div>
      </div>

      <div class="panel">
        <h2>Quick Build (optional)</h2>
        <div class="flex flex-wrap">
          <select id="cf-arch" style="max-width:280px">
            ${ARCHETYPES.map(a => `<option value="${a.id}">${esc(a.label)} — peak ${a.peak[0]}–${a.peak[1]}</option>`).join('')}
          </select>
          <button class="btn sm" id="cf-roll">Roll Archetype</button>
          <span class="small faint">Sets starting attributes + a hidden potential for the chosen archetype. Then fine-tune below.</span>
        </div>
      </div>

      ${groups}

      <div class="panel gold">
        <div class="flex">
          <div>
            <div class="section-title" style="margin:0">Starting Overall</div>
            <div class="small faint">Weighted by what actually wins MMA fights</div>
          </div>
          <div class="right ovr big" id="cf-ovr">–</div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn primary" id="cf-save">${editing ? 'Save Changes' : 'Create Fighter'}</button>
        <button class="btn ghost" id="cf-cancel">Cancel</button>
      </div>
    </div>`;
  },
  wire(params) {
    const editing = params.editId ? getFighter(params.editId) : null;
    const readAttrs = () => {
      const attrs = {};
      $all('input[data-attr]').forEach(r => attrs[r.dataset.attr] = +r.value);
      return attrs;
    };
    const refreshOvr = () => {
      const o = overallFrom(readAttrs());
      const el = $('#cf-ovr');
      el.textContent = o;
      el.className = 'right ovr big ' + ratingClass(o);
    };
    $all('input[data-attr]').forEach(r => r.addEventListener('input', () => {
      $('#av-' + r.dataset.attr).textContent = r.value;
      refreshOvr();
    }));
    refreshOvr();

    $('#cf-roll').addEventListener('click', () => {
      const arch = archetypeById($('#cf-arch').value);
      const startOvr = rndi(arch.start[0], arch.start[1]);
      const pot = rollPotential(arch.id);
      const attrs = suggestAttributes(startOvr, $('#cf-style').value);
      Object.entries(attrs).forEach(([k, v]) => {
        const slider = $(`input[data-attr="${k}"]`);
        slider.value = Math.round(v);
        $('#av-' + k).textContent = Math.round(v);
      });
      $('#cf-pot').value = pot;
      refreshOvr();
      toast(`${arch.label}: start ${startOvr}, hidden potential ${pot}`);
    });

    $('#cf-save').addEventListener('click', () => {
      const name = $('#cf-name').value.trim();
      if (!name) { toast('Give the fighter a name.'); return; }
      const data = {
        name, nickname: $('#cf-nick').value.trim(),
        nationality: $('#cf-nat').value, hometown: $('#cf-town').value.trim(),
        style: $('#cf-style').value, stance: $('#cf-stance').value,
        height: clamp(+$('#cf-height').value || 180, 150, 215),
        reach: clamp(+$('#cf-reach').value || 183, 150, 220),
        attributes: readAttrs()
      };
      const pot = clamp(+$('#cf-pot').value || 84, 40, 99);

      if (editing) {
        Object.assign(editing, data);
        editing.hidden.potential = Math.max(pot, overall(editing));
        recomputeGoat(editing);
        autosave();
        toast('Fighter updated.');
        render('profile', { id: editing.id });
      } else {
        data.age = clamp(+$('#cf-age').value || 21, 18, 45);
        const f = addFighter(data);
        f.hidden.potential = Math.max(pot, overall(f));
        autosave();
        toast(`${f.name} joins the roster.`);
        render('profile', { id: f.id });
      }
    });
    $('#cf-cancel').addEventListener('click', () => render(editing ? 'profile' : 'roster', editing ? { id: editing.id } : undefined));
  }
};

/* ------------------------------ PROFILE ----------------------------- */
function fmtD(d) { return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.m - 1]} ${d.d}, ${d.y}`; }

VIEWS.profile = {
  html({ id }) {
    const f = getFighter(id);
    if (!f) return '<div class="panel">Fighter not found.</div>';
    const ovr = overall(f);
    const champ = isChampion(f);
    const rank = f.status === 'active' ? rankLabel(f) : '—';
    const hist = f.fightHistory.map(fid => state.fights.find(x => x.id === fid)).filter(Boolean).reverse();
    const bestWin = f.bestWinId != null ? state.fights.find(x => x.id === f.bestWinId) : null;
    const worstLoss = f.worstLossId != null ? state.fights.find(x => x.id === f.worstLossId) : null;
    const gp = f.hidden.goatParts;

    const streak = f.currentStreak.count >= 2
      ? `<span class="chip ${f.currentStreak.type === 'W' ? 'win' : 'loss'}">${f.currentStreak.count} ${f.currentStreak.type === 'W' ? 'wins' : 'losses'} in a row</span>` : '';

    const reignsHtml = f.reigns.length ? `<div class="panel gold"><h2>Title Reigns</h2>
      ${f.reigns.map((r, i) => {
        const days = openReignDays(r);
        return `<div class="flex small" style="padding:4px 0">
          <span class="mono">#${i + 1}</span>
          <span>${fmtD(r.start)} — ${r.end ? fmtD(r.end) : '<span class="chip gold">current</span>'}</span>
          <span class="right mono muted">${r.defences} def · ${days.toLocaleString()} days</span></div>`;
      }).join('')}
      <div class="hr"></div>
      <div class="small mono muted">${f.titleDefences} total defences · ${totalReignDays(f).toLocaleString()} total days as champion</div>
    </div>` : '';

    const goatHtml = gp ? `<div class="panel"><h2>GOAT Score Breakdown <span class="mono faint">— ${f.hidden.legacyScore}</span></h2>
      ${(() => {
        const parts = [['Win quality', gp.quality], ['Big scalps', gp.scalps], ['Titles', gp.titles], ['Reign length', gp.reign], ['Peak level', gp.peak], ['Finishes', gp.finishes], ['Longevity', gp.longevity], ['Losses', -gp.losses], ['Bonus', gp.bonus || 0]];
        const mx = Math.max(20, ...parts.map(p => Math.abs(p[1])));
        return parts.map(([k, v]) => `<div class="goat-part">
          <span class="k">${k}</span>
          <div class="bar ${v < 0 ? '' : 'gold'}" style="flex:1"><i style="width:${Math.round(Math.abs(v) / mx * 100)}%"></i></div>
          <span class="v ${v < 0 ? 'corner-red' : ''}">${v >= 0 ? '+' : ''}${Math.round(v)}</span></div>`).join('');
      })()}
      <div class="small faint" style="margin-top:6px">Legacy score is a high-water mark — a bad late run can't erase what was earned.</div>
    </div>` : '';

    return `<div class="grid">
      <div class="panel ${champ ? 'gold' : ''}">
        <div class="flex" style="align-items:flex-start">
          ${octAvatar(f, 'lg')}
          <div style="min-width:0;flex:1">
            ${champ ? '<div class="belt-tag">Undisputed Champion</div>' : ''}
            <div class="ovr" style="font-size:26px">${esc(f.name)}</div>
            ${f.nickname ? `<div class="muted">"${esc(f.nickname)}"</div>` : ''}
            <div class="small muted" style="margin-top:4px">${esc(f.nationality)}${f.hometown ? ' · ' + esc(f.hometown) : ''} · ${esc(f.style)} · ${esc(f.stance)}</div>
            <div class="small mono muted">${f.height} cm · ${f.reach} cm reach · age ${f.age}${f.status === 'retired' ? ' · RETIRED' : ''}${f.frozen ? ' · DEVELOPMENT FROZEN' : ''}</div>
            <div style="margin-top:8px" class="flex flex-wrap">
              <span class="chip">${recordStr(f)}</span>
              <span class="chip">${finishStr(f)}</span>
              ${streak}
            </div>
          </div>
          <div class="center">
            <div class="ovr big ${ratingClass(ovr)}">${ovr}</div>
            <div class="small faint">OVERALL</div>
          </div>
        </div>
      </div>

      <div class="tiles">
        <div class="tile"><div class="k">Rank</div><div class="v">${rank}</div></div>
        <div class="tile"><div class="k">ELO</div><div class="v">${f.elo}</div></div>
        <div class="tile"><div class="k">Peak ELO</div><div class="v">${f.peakElo}</div></div>
        <div class="tile"><div class="k">Peak OVR</div><div class="v">${f.peakOverall} <span class="small faint">at ${f.peakOverallAge}</span></div></div>
        <div class="tile"><div class="k">Popularity</div><div class="v">${f.popularity}</div></div>
        <div class="tile"><div class="k">Career Earnings</div><div class="v">${money(f.earnings)}</div></div>
        <div class="tile"><div class="k">Top 10 Wins</div><div class="v">${f.top10Wins}</div></div>
        <div class="tile"><div class="k">Champion Scalps</div><div class="v">${f.championScalps}</div></div>
      </div>

      <div class="grid grid-2">
        <div class="panel"><h2>ELO History</h2>${sparkline(f.eloHistory.map(p => p.e), 300, 64)}
          <div class="small mono faint">${f.eloHistory.length} data points</div></div>
        <div class="panel"><h2>Overall by Age</h2>${sparkline(f.overallHistory.map(p => p.ovr), 300, 64, 'red')}
          <div class="small mono faint">${f.overallHistory.map(p => p.age + ':' + p.ovr).slice(-8).join('  ')}</div></div>
      </div>

      ${reignsHtml}

      <div class="panel">
        <h2>Attributes</h2>
        <div class="grid grid-2">
          ${ATTR_GROUPS.map(g => `<div>
            <div class="section-title">${esc(g.label)}</div>
            ${g.keys.map(k => attrBarHtml(ATTR_LABELS[k], f.attributes[k], champ ? 'gold' : '')).join('')}
          </div>`).join('')}
        </div>
      </div>

      ${bestWin || worstLoss ? `<div class="grid grid-2">
        ${bestWin ? `<div class="panel"><h2>Best Win</h2><div class="small">${esc(bestWin.result.summary)}</div>
          <div class="small faint mono">${fmtD(bestWin.date)}</div></div>` : ''}
        ${worstLoss ? `<div class="panel"><h2>Worst Loss</h2><div class="small">${esc(worstLoss.result.summary)}</div>
          <div class="small faint mono">${fmtD(worstLoss.date)}</div></div>` : ''}
      </div>` : ''}

      ${goatHtml}

      <div class="panel">
        <h2>Fight History <span class="mono faint">(${hist.length})</span></h2>
        ${hist.length ? `<div class="tbl-scroll"><table class="tbl"><thead>
          <tr><th></th><th>Opponent</th><th>Result</th><th class="num">ELO</th><th>Date</th></tr></thead><tbody>
          ${hist.map(ft => {
            const oppId = ft.aId === f.id ? ft.bId : ft.aId;
            const opp = getFighter(oppId);
            const res = ft.result;
            const rchar = res.draw ? 'D' : res.winnerId === f.id ? 'W' : 'L';
            const myElo = ft.aId === f.id ? res.eloChange.a : res.eloChange.b;
            return `<tr class="click" data-fight="${ft.id}">
              <td style="width:36px">${chipRes(rchar)}</td>
              <td>${opp ? esc(opp.name) : 'Deleted fighter'}${ft.titleFight ? ' <span class="chip gold">TITLE</span>' : ''}</td>
              <td class="small">${esc(res.method)} R${res.round}${res.timeStr !== 'Decision' ? ' ' + res.timeStr : ''}</td>
              <td class="num ${myElo >= 0 ? '' : 'corner-red'}">${myElo >= 0 ? '+' : ''}${myElo}</td>
              <td class="small mono muted">${fmtD(ft.date)}</td></tr>`;
          }).join('')}
        </tbody></table></div>` : '<div class="faint small">No fights yet.</div>'}
      </div>

      <div class="panel">
        <h2>Actions</h2>
        <div class="btn-row">
          ${f.status === 'active' ? `<button class="btn primary" id="pf-book">Book a Fight</button>` : ''}
          <button class="btn" id="pf-edit">Edit</button>
          ${f.status === 'active'
            ? `<button class="btn" id="pf-retire">Retire</button>`
            : `<button class="btn" id="pf-unretire">Bring Out of Retirement</button>`}
          <button class="btn" id="pf-freeze">${f.frozen ? 'Unfreeze Development' : 'Freeze Development'}</button>
          <button class="btn" id="pf-export">Export JSON</button>
          <button class="btn danger" id="pf-delete">Delete</button>
        </div>
        <div class="small faint" style="margin-top:8px">Retiring locks the career for the all-time books. Only you decide when a fighter hangs them up — ratings keep sliding if they fight on.</div>
      </div>
    </div>`;
  },
  wire({ id }) {
    const f = getFighter(id);
    if (!f) return;
    $all('tr[data-fight]').forEach(tr => tr.addEventListener('click', () => render('fightResult', { id: +tr.dataset.fight })));
    const el = sel => $(sel);
    if (el('#pf-book')) el('#pf-book').addEventListener('click', () => render('book', { preA: f.id }));
    el('#pf-edit').addEventListener('click', () => render('create', { editId: f.id }));
    if (el('#pf-retire')) el('#pf-retire').addEventListener('click', () => {
      if (!confirm(`Retire ${f.name}? Their career moves to the all-time books.`)) return;
      retireFighter(f.id); recomputeGoat(f); autosave(); render('profile', { id: f.id });
    });
    if (el('#pf-unretire')) el('#pf-unretire').addEventListener('click', () => {
      unretireFighter(f.id); autosave(); render('profile', { id: f.id });
    });
    el('#pf-freeze').addEventListener('click', () => {
      f.frozen = !f.frozen; autosave(); render('profile', { id: f.id });
    });
    el('#pf-export').addEventListener('click', () => exportFighters([f.id]));
    el('#pf-delete').addEventListener('click', () => {
      if (!confirm(`Permanently delete ${f.name}? This cannot be undone (their past fights remain in history).`)) return;
      deleteFighter(f.id); autosave(); toast('Deleted.'); render('roster');
    });
  }
};

/* ------------------------------- BOOK -------------------------------- */
let bookSel = { a: null, b: null, title: false, rounds: 3, event: '' };
/* fighter picker: sort options + streak helper + in-place list repaint */
const BK_SORTS = {
  elo:    { label: 'Sort: ELO',         fn: (x, y) => y.elo - x.elo },
  ovr:    { label: 'Sort: Overall',     fn: (x, y) => overall(y) - overall(x) || y.elo - x.elo },
  wins:   { label: 'Sort: Most wins',   fn: (x, y) => y.record.w - x.record.w || y.elo - x.elo },
  streak: { label: 'Sort: Win streak',  fn: (x, y) => bkStreak(y) - bkStreak(x) || y.elo - x.elo },
  fights: { label: 'Sort: Most fights', fn: (x, y) => totalFights(y) - totalFights(x) || y.elo - x.elo },
  young:  { label: 'Sort: Youngest',    fn: (x, y) => x.age - y.age || y.elo - x.elo },
  name:   { label: 'Sort: Name A\u2013Z', fn: (x, y) => x.name.localeCompare(y.name) }
};
function bkStreak(f) { return f.currentStreak && f.currentStreak.type === 'W' ? f.currentStreak.count : 0; }

/* repaints only the candidate list — typing never loses keyboard focus */
function bkRenderList() {
  const listEl = $('#bk-list'), cntEl = $('#bk-count');
  if (!listEl) return;
  const other = bookSel.picking === 'a' ? bookSel.b : bookSel.a;
  const q = (bookSel.q || '').trim().toLowerCase();
  let pool = activeFighters().filter(f => f.id !== other);
  if (q) pool = pool.filter(f =>
    `${f.name} ${f.nickname || ''} ${f.nationality} ${f.style}`.toLowerCase().includes(q));
  pool.sort((BK_SORTS[bookSel.sort] || BK_SORTS.elo).fn);
  const total = pool.length, shown = Math.min(total, 40);
  cntEl.textContent = total === 0 ? 'No fighters match.'
    : total > shown ? `Showing ${shown} of ${total} \u2014 type to narrow it down`
    : `${total} fighter${total === 1 ? '' : 's'}`;
  listEl.innerHTML = pool.slice(0, shown).map(f => {
    const st = bkStreak(f), rl = rankLabel(f);
    return `<button class="pick-row" data-pick="${f.id}">
      <span class="pr-rank mono ${isChampion(f) ? 'champ' : 'faint'}">${rl}</span>
      <span class="nm">${esc(f.name)}${f.nickname ? ` <span class="small faint">\u2018${esc(f.nickname)}\u2019</span>` : ''}<br>
        <span class="small faint">${esc(f.nationality)} \u00b7 ${esc(f.style)} \u00b7 age ${f.age}</span></span>
      <span class="pr-meta mono small">${overall(f)} \u00b7 ${f.elo}<br>${recordStr(f)}${st >= 2 ? ` <span class="pr-w">W${st}</span>` : ''}</span>
    </button>`;
  }).join('');
}

VIEWS.book = {
  html(params) {
    if (params.preA) { bookSel = { a: params.preA, b: null, title: false, rounds: 3, event: '' }; }
    bookSel.q = bookSel.q || '';
    bookSel.sort = bookSel.sort || 'elo';
    bookSel.picking = bookSel.picking || null;

    const a = bookSel.a ? getFighter(bookSel.a) : null;
    const b = bookSel.b ? getFighter(bookSel.b) : null;
    const champInvolved = state.champion && (bookSel.a === state.champion || bookSel.b === state.champion);
    const vacant = !state.champion;
    const canTitle = champInvolved || vacant;
    if (!canTitle) bookSel.title = false;
    if (bookSel.title) bookSel.rounds = 5;

    const slot = (f, side) => {
      const label = side === 'a' ? 'Red corner' : 'Blue corner';
      return `<div class="slot ${side === 'a' ? 'red' : 'blue'}">
        ${f ? `${octAvatar(f, 'sm ' + (side === 'a' ? 'red' : 'blue'))}
          <div class="who">
            <div class="nm">${esc(f.name)}</div>
            <div class="small mono muted">${rankLabel(f) !== '\u2014' ? rankLabel(f) + ' \u00b7 ' : ''}${overall(f)} \u00b7 ${f.elo} \u00b7 ${recordStr(f)}</div>
          </div>
          <button class="btn sm" data-slot="${side}">Change</button>`
        : `<div class="who">
            <div class="nm faint">${label}</div>
            <div class="small faint">No fighter selected</div>
          </div>
          <button class="btn sm primary" data-slot="${side}">Choose</button>`}
      </div>`;
    };

    const picker = bookSel.picking ? `
      <div class="picker">
        <div class="flex">
          <div class="section-title" style="margin:0">Choose the ${bookSel.picking === 'a' ? 'red' : 'blue'} corner</div>
          <button class="btn sm ghost right" id="bk-pick-close">Close</button>
        </div>
        <div class="pick-controls">
          <input type="text" id="bk-q" placeholder="Search name, country, style\u2026" value="${esc(bookSel.q)}" autocomplete="off">
          <select id="bk-sort">${Object.entries(BK_SORTS).map(([k, s]) =>
            `<option value="${k}" ${bookSel.sort === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        </div>
        <div class="small faint" id="bk-count"></div>
        <div class="pick-list" id="bk-list"></div>
      </div>` : '';

    let tapeHtml = '', oddsHtml = '';
    if (a && b && a.id !== b.id) {
      const booking = bookFight(a.id, b.id, { titleFight: bookSel.title, rounds: bookSel.rounds, samples: 300 });
      const o = booking.odds;
      bookSel.lastOdds = o;
      const rustA = computeRust(a), rustB = computeRust(b);
      const row = (va, lab, vb, hi) => {
        const aAdv = hi === 'high' ? va > vb : va < vb;
        return `<div class="l ${hi !== 'none' && va !== vb && aAdv ? 'adv' : ''}">${va}</div><div class="m">${lab}</div><div class="r ${hi !== 'none' && va !== vb && !aAdv ? 'adv' : ''}">${vb}</div>`;
      };
      tapeHtml = `<div class="panel"><h2>Tale of the Tape</h2>
        <div class="tape">
          ${row(overall(a), 'Overall', overall(b), 'high')}
          ${row(a.elo, 'ELO', b.elo, 'high')}
          ${row(recordStr(a), 'Record', recordStr(b), 'high')}
          ${row(a.age, 'Age', b.age, 'low')}
          ${row(a.height + ' cm', 'Height', b.height + ' cm', 'high')}
          ${row(a.reach + ' cm', 'Reach', b.reach + ' cm', 'high')}
          ${row(esc(a.style), 'Style', esc(b.style), 'none')}
          ${row(Math.round(rustA * 100) + '%', 'Ring Rust', Math.round(rustB * 100) + '%', 'low')}
        </div></div>`;

      const methodRows = ['KO', 'TKO', 'KOTKO', 'SUB', 'DEC'].map(m => {
        const la = o.methodA[m], lb = o.methodB[m];
        const lbl = m === 'KOTKO' ? 'KO/TKO (combined)' : m === 'DEC' ? 'Decision' : m;
        return `<div class="l mono">${la ? la.us + ' <span class="faint">(' + la.frac + ')</span>' : '\u2014'}</div>
                <div class="m">${lbl}</div>
                <div class="r mono">${lb ? lb.us + ' <span class="faint">(' + lb.frac + ')</span>' : '\u2014'}</div>`;
      }).join('');

      oddsHtml = `<div class="panel"><h2>The Book's Price</h2>
        <div class="tape" style="margin-bottom:8px">
          <div class="l"><span class="ovr corner-red" style="font-size:22px">${o.a.us}</span><br><span class="small faint mono">${o.a.frac} \u00b7 ${o.a.dec} \u00b7 ${o.impliedA}%</span></div>
          <div class="m">Moneyline</div>
          <div class="r"><span class="ovr corner-blue" style="font-size:22px">${o.b.us}</span><br><span class="small faint mono">${o.b.frac} \u00b7 ${o.b.dec} \u00b7 ${o.impliedB}%</span></div>
        </div>
        <div class="hr"></div>
        <div class="section-title">Method of Victory</div>
        <div class="tape">${methodRows}</div>
        <div class="hr"></div>
        <div class="small mono muted">Fight goes the distance: ${100 - o.finishPct}% \u00b7 Draw ${o.drawPct}%</div>
        ${rustA > 0.15 || rustB > 0.15 ? '<div class="small faint" style="margin-top:6px">Ring rust priced in \u2014 a long layoff dulls a fighter until they shake it off.</div>' : ''}
      </div>`;
    }

    return `<div class="grid">
      <div class="panel">
        <h2>Book a Fight</h2>
        <div class="grid grid-2">
          ${slot(a, 'a')}
          ${slot(b, 'b')}
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn sm ghost" id="bk-swap" ${a || b ? '' : 'disabled'}>\u21c4 Swap corners</button>
          ${a || b ? '<button class="btn sm ghost" id="bk-clear">Clear both</button>' : ''}
        </div>
        ${picker}
        <div class="hr"></div>
        <div class="grid grid-2">
          <label class="fld"><span>Event Name (optional)</span><input type="text" id="bk-event" value="${esc(bookSel.event)}" placeholder="e.g. Fight Night 1"></label>
          <label class="fld"><span>Rounds</span><select id="bk-rounds" ${bookSel.title ? 'disabled' : ''}>
            <option value="3" ${bookSel.rounds === 3 ? 'selected' : ''}>3 rounds</option>
            <option value="5" ${bookSel.rounds === 5 ? 'selected' : ''}>5 rounds</option>
          </select></label>
        </div>
        <div class="check-row">
          <input type="checkbox" id="bk-title" ${bookSel.title ? 'checked' : ''} ${canTitle ? '' : 'disabled'}>
          <label for="bk-title">${vacant ? 'For the vacant championship' : 'Title fight'} ${canTitle ? '' : '<span class="faint small">(champion must be involved)</span>'} <span class="small faint">\u2014 5 rounds</span></label>
        </div>
      </div>
      ${tapeHtml}
      ${oddsHtml}
      <div class="btn-row">
        <button class="btn primary" id="bk-sim" ${a && b && a.id !== b.id ? '' : 'disabled'}>Simulate Fight</button>
      </div>
    </div>`;
  },
  wire() {
    $all('[data-slot]').forEach(bt => bt.addEventListener('click', () => {
      bookSel.picking = bt.dataset.slot;
      bookSel.q = '';
      render('book');
    }));
    const swap = $('#bk-swap');
    if (swap) swap.addEventListener('click', () => {
      const t = bookSel.a; bookSel.a = bookSel.b; bookSel.b = t; render('book');
    });
    const clr = $('#bk-clear');
    if (clr) clr.addEventListener('click', () => {
      bookSel.a = null; bookSel.b = null; bookSel.title = false; render('book');
    });

    if (bookSel.picking) {
      bkRenderList();
      $('#bk-q').addEventListener('input', e => { bookSel.q = e.target.value; bkRenderList(); });
      $('#bk-sort').addEventListener('change', e => { bookSel.sort = e.target.value; bkRenderList(); });
      $('#bk-pick-close').addEventListener('click', () => { bookSel.picking = null; render('book'); });
      $('#bk-list').addEventListener('click', e => {
        const rowEl = e.target.closest('[data-pick]');
        if (!rowEl) return;
        bookSel[bookSel.picking] = rowEl.dataset.pick;
        if (rowEl.dataset.pick === state.champion) bookSel.title = true;
        bookSel.picking = null;
        render('book');
      });
    }

    $('#bk-event').addEventListener('change', e => { bookSel.event = e.target.value; });
    $('#bk-rounds').addEventListener('change', e => { bookSel.rounds = +e.target.value; render('book'); });
    $('#bk-title').addEventListener('change', e => { bookSel.title = e.target.checked; render('book'); });
    $('#bk-sim').addEventListener('click', () => {
      const ft = stageAndRunFight(bookSel.a, bookSel.b, {
        titleFight: bookSel.title, rounds: bookSel.rounds, eventName: $('#bk-event').value.trim(),
        odds: bookSel.lastOdds || null
      });
      autosave();
      bookSel = { a: null, b: null, title: false, rounds: 3, event: '', q: '', sort: bookSel.sort, picking: null };
      render('fightResult', { id: ft.id });
    });
  }
};

/* --------------------------- FIGHT RESULT ---------------------------- */
VIEWS.fightResult = {
  html({ id }) {
    const ft = state.fights.find(x => x.id === id);
    if (!ft) return '<div class="panel">Fight not found.</div>';
    const a = getFighter(ft.aId), b = getFighter(ft.bId);
    const res = ft.result;
    const w = res.draw ? null : getFighter(res.winnerId);
    const sa = res.stats.a, sb = res.stats.b;
    const mm = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

    const statRow = (lab, va, vb) => {
      const hiA = va > vb, hiB = vb > va;
      return `<div class="l ${hiA ? 'adv' : ''}">${va}</div><div class="m">${lab}</div><div class="r ${hiB ? 'adv' : ''}">${vb}</div>`;
    };

    const cards = res.scorecards ? `<div class="panel"><h2>Scorecards</h2>
      <div class="tape">${res.scorecards.map((c, i) =>
        `<div class="l mono">${c.a}</div><div class="m">Judge ${i + 1}</div><div class="r mono">${c.b}</div>`).join('')}
      </div></div>` : '';

    const feed = res.events && res.events.length ? `<div class="panel"><h2>Play-by-Play</h2>
      <div class="feed">
        ${res.events.map(ev => `<div class="ev">
          <span class="rd">R${ev.r}</span>
          <span class="tag ${esc(ev.phase)}">${esc(ev.phase)}</span>
          <span><span class="mono faint small">${ev.t}</span> ${esc(ev.text)}</span>
        </div>`).join('')}
      </div></div>` :
      (res._trimmed ? '<div class="panel small faint">Play-by-play for this older fight was compacted to keep your save small. The result, stats and scorecards are all preserved.</div>' : '');

    return `<div class="grid">
      <div class="result-banner ${ft.titleFight ? 'title-fight' : ''}">
        ${ft.eventName ? `<div class="small faint" style="letter-spacing:.2em;text-transform:uppercase">${esc(ft.eventName)}</div>` : ''}
        ${ft.titleFight ? '<div class="belt-tag" style="margin:4px 0">Championship Fight</div>' : ''}
        <div class="winner-name ovr">${res.draw ? `IT'S A DRAW` : esc(w.name) + ' WINS'}</div>
        <div class="method ${res.draw ? 'muted' : ''}">${esc(res.method)}</div>
        <div class="mono muted">${res.timeStr === 'Decision' ? `after ${res.scheduled} rounds` : `Round ${res.round} — ${res.timeStr}`} · excitement ${res.excitement}/100</div>
        <div class="small muted" style="margin-top:6px">${esc(res.summary)}</div>
        ${ft.odds ? `<div class="small mono faint" style="margin-top:6px">Closed: ${esc(a.name)} ${ft.odds.a.us} · ${esc(b.name)} ${ft.odds.b.us}</div>` : ''}
        ${ft.odds && !res.draw && ((res.winnerId === ft.aId ? ft.odds.impliedA : ft.odds.impliedB) <= 35) ? '<div class="chip gold" style="margin-top:6px">UPSET — the book had it ' + (res.winnerId === ft.aId ? ft.odds.impliedA : ft.odds.impliedB) + '%</div>' : ''}
      </div>

      <div class="panel">
        <div class="tape" style="margin-bottom:4px">
          <div class="l"><span class="corner-red ovr" style="font-size:19px">${esc(a.name)}</span></div>
          <div class="m">vs</div>
          <div class="r"><span class="corner-blue ovr" style="font-size:19px">${esc(b.name)}</span></div>
        </div>
        <div class="tape">
          ${statRow(sa.sigLanded + '/' + sa.sigThrown, 'Sig. Strikes', sb.sigLanded + '/' + sb.sigThrown)}
          ${statRow(sa.kd, 'Knockdowns', sb.kd)}
          ${statRow(sa.td + '/' + sa.tdAtt, 'Takedowns', sb.td + '/' + sb.tdAtt)}
          ${statRow(mm(sa.ctrlSec), 'Control Time', mm(sb.ctrlSec))}
          ${statRow(sa.subAtt, 'Sub Attempts', sb.subAtt)}
          ${statRow(Math.round(sa.dmgDealt), 'Damage Dealt', Math.round(sb.dmgDealt))}
          ${statRow(sa.healthLeft + '%', 'Health Left', sb.healthLeft + '%')}
          ${statRow(sa.staminaLeft + '%', 'Gas Left', sb.staminaLeft + '%')}
        </div>
      </div>

      ${cards}

      <div class="grid grid-2">
        <div class="panel"><h2>Ratings Impact</h2>
          <div class="flex"><span>${fighterLink(a)}</span><span class="right mono ${res.eloChange.a >= 0 ? '' : 'corner-red'}">${res.eloChange.a >= 0 ? '+' : ''}${res.eloChange.a} ELO → ${a.elo}</span></div>
          <div class="flex"><span>${fighterLink(b)}</span><span class="right mono ${res.eloChange.b >= 0 ? '' : 'corner-red'}">${res.eloChange.b >= 0 ? '+' : ''}${res.eloChange.b} ELO → ${b.elo}</span></div>
          ${res.pre && !res.draw && ((res.winnerId === ft.aId && res.pre.bChamp) || (res.winnerId === ft.bId && res.pre.aChamp)) ? '<div class="small chip gold" style="margin-top:8px">CHAMPION SCALP — huge rating swing</div>' : ''}
        </div>
        <div class="panel"><h2>Purses</h2>
          <div class="flex"><span>${esc(a.name)}</span><span class="right mono">${money(res.purse.a)}</span></div>
          <div class="flex"><span>${esc(b.name)}</span><span class="right mono">${money(res.purse.b)}</span></div>
        </div>
      </div>

      ${feed}

      <div class="btn-row">
        <button class="btn primary" id="fr-rematch">Book the Rematch</button>
        <button class="btn" data-go="rankings">Rankings</button>
        <button class="btn" data-go="book">Book Another</button>
      </div>
    </div>`;
  },
  wire({ id }) {
    const ft = state.fights.find(x => x.id === id);
    wireFighterLinks();
    $all('[data-go]').forEach(bt => bt.addEventListener('click', () => render(bt.dataset.go)));
    if (ft) $('#fr-rematch').addEventListener('click', () => {
      const aF = getFighter(ft.aId), bF = getFighter(ft.bId);
      if (!aF || !bF || aF.status !== 'active' || bF.status !== 'active') { toast('Both fighters must be active.'); return; }
      bookSel = { a: ft.aId, b: ft.bId, title: false, rounds: 3, event: '' };
      render('book');
    });
  }
};

/* ----------------------------- RANKINGS ------------------------------ */
VIEWS.rankings = {
  html() {
    const { champion, contenders } = officialRankings(15);
    const rest = activeFighters()
      .filter(f => (!champion || f.id !== champion.id) && !contenders.includes(f))
      .sort((x, y) => y.elo - x.elo).slice(0, 25);

    const move = f => {
      const d = recentEloDelta(f, 5);
      if (d > 8) return `<span class="chip win">▲ ${d}</span>`;
      if (d < -8) return `<span class="chip loss">▼ ${-d}</span>`;
      return '';
    };

    return `<div class="grid">
      ${champion ? `<div class="champ-card click-fighter" data-fid="${champion.id}" style="cursor:pointer">
        ${octAvatar(champion, 'lg')}
        <div style="min-width:0;flex:1">
          <div class="belt-tag">Champion</div>
          <div class="ovr" style="font-size:22px">${esc(champion.name)}</div>
          <div class="small mono muted">${recordStr(champion)} · ELO ${champion.elo} · ${champion.titleDefences} defences</div>
        </div>
        <div class="ovr big ${ratingClass(overall(champion))}">${overall(champion)}</div>
      </div>` : `<div class="panel center"><div class="belt-tag">The belt is vacant</div></div>`}

      <div class="panel">
        <h2>Official Rankings <span class="faint small">— live ELO</span></h2>
        ${contenders.map((f, i) => `<div class="rank-row click-fighter" data-fid="${f.id}">
          <div class="pos">${i + 1}</div>
          ${octAvatar(f, 'sm')}
          <div class="who"><div class="nm">${esc(f.name)}</div>
            <div class="small faint mono">${recordStr(f)} · ${esc(f.style)}</div></div>
          ${move(f)}
          <div class="stat">ELO ${f.elo}<br><span class="${ratingClass(overall(f))}">${overall(f)} OVR</span></div>
        </div>`).join('') || '<div class="faint small">No active fighters.</div>'}
      </div>

      ${rest.length ? `<div class="panel">
        <h2>Outside the Rankings</h2>
        ${rest.map(f => `<div class="rank-row click-fighter" data-fid="${f.id}">
          <div class="pos faint">·</div>
          <div class="who"><div class="nm">${esc(f.name)}</div>
            <div class="small faint mono">${recordStr(f)}</div></div>
          <div class="stat">ELO ${f.elo}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
  },
  wire() { wireFighterLinks(); }
};

/* ------------------------------- GOAT -------------------------------- */
VIEWS.goat = {
  html() {
    const list = goatList(50);
    return `<div class="grid">
      <div class="panel gold">
        <h2>Greatest of All Time</h2>
        <div class="small muted">Careers ranked forever — retired legends stay on this list. Scored on the quality of wins, big scalps, titles and defences, reign length, peak level, finishing and longevity, minus a small tax for each loss (losing to great fighters costs least).</div>
      </div>
      ${list.length ? list.map((row, i) => {
        const f = row.f;
        const gp = row.parts || {};
        return `<div class="panel ${i === 0 ? 'gold' : ''}">
          <div class="flex click-fighter" data-fid="${f.id}" style="cursor:pointer">
            <div class="pos ovr ${i < 3 ? 'rt-elite' : ''}" style="width:40px;text-align:center">${i + 1}</div>
            ${octAvatar(f, 'sm')}
            <div style="min-width:0;flex:1">
              <div class="nm" style="font-family:var(--font-display);text-transform:uppercase;font-size:16px;letter-spacing:.05em">${esc(f.name)} ${f.status === 'retired' ? '<span class="chip">RETIRED</span>' : ''}</div>
              <div class="small faint mono">${recordStr(f)} · peak ${f.peakOverall} OVR · peak ELO ${f.peakElo}${f.reigns.length ? ` · ${f.reigns.length} reign${f.reigns.length > 1 ? 's' : ''}` : ''}</div>
            </div>
            <div class="ovr ${i < 3 ? 'rt-elite' : ''}" style="font-size:24px">${row.score}</div>
          </div>
          <details style="margin-top:6px"><summary class="small faint" style="cursor:pointer">score breakdown</summary>
            <div style="margin-top:8px">
            ${gp ? [['Win quality', gp.quality], ['Big scalps', gp.scalps], ['Titles', gp.titles], ['Reign', gp.reign], ['Peak', gp.peak], ['Finishes', gp.finishes], ['Longevity', gp.longevity], ['Losses', -(gp.losses || 0)], ['Bonus', gp.bonus || 0]].map(([k, v]) => `
              <div class="goat-part"><span class="k">${k}</span>
              <div class="bar ${v < 0 ? '' : 'gold'}" style="flex:1"><i style="width:${Math.round(Math.min(100, Math.abs(v || 0) / 2))}%"></i></div>
              <span class="v ${v < 0 ? 'corner-red' : ''}">${v >= 0 ? '+' : ''}${Math.round(v || 0)}</span></div>`).join('') : ''}
            </div>
          </details>
        </div>`;
      }).join('') : '<div class="panel faint">Nobody has fought yet. Legacies are earned in the cage.</div>'}
    </div>`;
  },
  wire() { wireFighterLinks(); }
};

/* ------------------------------ RECORDS ------------------------------ */
let recordsBoard = 'wins';
VIEWS.records = {
  html() {
    const rows = boardRows(recordsBoard, 25);
    return `<div class="grid">
      <div class="panel">
        <h2>Record Books</h2>
        ${BOARD_GROUPS.map(g => `
          <div class="section-title" style="margin-top:10px">${esc(g.group)}</div>
          <div class="pill-tabs">
            ${g.items.map(it => `<button class="${it.id === recordsBoard ? 'on' : ''}" data-board="${it.id}">${esc(it.label)}</button>`).join('')}
          </div>`).join('')}
      </div>

      <div class="panel">
        <h2>${esc(boardLabel(recordsBoard))} <span class="faint small">${boardScope(recordsBoard) === 'alltime' ? '— all time, retired included' : '— active fighters'}</span></h2>
        ${rows.length ? rows.map((r, i) => `<div class="rank-row click-fighter" data-fid="${r.f.id}">
          <div class="pos">${i + 1}</div>
          ${octAvatar(r.f, 'sm')}
          <div class="who"><div class="nm">${esc(r.f.name)} ${r.f.status === 'retired' ? '<span class="chip">RET</span>' : ''}</div>
            ${r.sub ? `<div class="small faint mono">${esc(r.sub)}</div>` : ''}</div>
          <div class="stat" style="font-size:15px">${esc(r.value)}</div>
        </div>`).join('') : '<div class="faint small">Nothing on this board yet.</div>'}
      </div>
    </div>`;
  },
  wire() {
    wireFighterLinks();
    $all('[data-board]').forEach(b => b.addEventListener('click', () => { recordsBoard = b.dataset.board; render('records'); }));
  }
};

/* ------------------------------ HISTORY ------------------------------ */
let histFilter = { q: '', titleOnly: false };
VIEWS.history = {
  html() {
    let fights = state.fights.slice().reverse();
    if (histFilter.titleOnly) fights = fights.filter(f => f.titleFight);
    if (histFilter.q) {
      const q = histFilter.q.toLowerCase();
      fights = fights.filter(ft => {
        const a = getFighter(ft.aId), b = getFighter(ft.bId);
        return (a && a.name.toLowerCase().includes(q)) || (b && b.name.toLowerCase().includes(q)) || (ft.eventName || '').toLowerCase().includes(q);
      });
    }
    const shown = fights.slice(0, 60);

    const lineage = state.titleHistory.slice().reverse();

    return `<div class="grid">
      <div class="panel">
        <h2>Fight History <span class="faint mono small">(${state.fights.length} total)</span></h2>
        <div class="flex flex-wrap" style="margin-bottom:8px">
          <input type="text" id="hs-q" placeholder="Filter by fighter or event…" value="${esc(histFilter.q)}" style="max-width:280px">
          <label class="check-row" style="margin:0"><input type="checkbox" id="hs-title" ${histFilter.titleOnly ? 'checked' : ''}> Title fights only</label>
        </div>
        ${shown.map(ft => {
          const a = getFighter(ft.aId), b = getFighter(ft.bId);
          if (!a || !b) return '';
          const res = ft.result;
          return `<div class="rank-row" data-fight="${ft.id}">
            <div class="who"><div class="nm">${esc(a.name)} <span class="vs">vs</span> ${esc(b.name)} ${ft.titleFight ? '<span class="chip gold">TITLE</span>' : ''}</div>
              <div class="small faint mono">${esc(res.summary)}</div></div>
            <div class="stat small">${fmtD(ft.date)}${ft.eventName ? '<br>' + esc(ft.eventName) : ''}</div>
          </div>`;
        }).join('') || '<div class="faint small">No fights match.</div>'}
        ${fights.length > 60 ? `<div class="small faint center" style="padding:8px">Showing latest 60 of ${fights.length}.</div>` : ''}
      </div>

      <div class="panel gold">
        <h2>Championship Lineage</h2>
        ${state.champion ? `<div class="small">Current champion: <b>${esc(getFighter(state.champion).name)}</b></div><div class="hr"></div>` : ''}
        ${lineage.length ? lineage.map(t => {
          const nc = getFighter(t.championId), fc = t.formerId ? getFighter(t.formerId) : null;
          return `<div class="flex small" style="padding:4px 0" ${t.fightId != null ? `data-fight="${t.fightId}" role="button" style="cursor:pointer"` : ''}>
            <span class="mono faint nowrap">${fmtD(t.date)}</span>
            <span>${nc ? esc(nc.name) : '?'} ${fc ? `takes the belt from ${esc(fc.name)}` : 'crowned champion'}</span>
          </div>`;
        }).join('') : '<div class="faint small">The belt has never changed hands.</div>'}
      </div>
    </div>`;
  },
  wire() {
    $('#hs-q').addEventListener('input', e => { histFilter.q = e.target.value; render('history'); setTimeout(() => { const el = $('#hs-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 0); });
    $('#hs-title').addEventListener('change', e => { histFilter.titleOnly = e.target.checked; render('history'); });
    $all('[data-fight]').forEach(r => r.addEventListener('click', () => render('fightResult', { id: +r.dataset.fight })));
  }
};

/* -------------------------------- TIME ------------------------------- */
VIEWS.time = {
  html() {
    const d = state.date;
    const rep = lastAgeingReport;
    return `<div class="grid">
      <div class="panel center">
        <div class="section-title">Universe Date</div>
        <div class="ovr big">${fmtD(d)}</div>
        <div class="small faint" style="margin-top:4px">Time only moves when you say so.</div>
      </div>

      <div class="panel">
        <h2>Advance Time</h2>
        <div class="btn-row">
          <button class="btn" data-adv="week">+1 Week</button>
          <button class="btn" data-adv="month">+1 Month</button>
          <button class="btn" data-adv="quarter">+3 Months</button>
          <button class="btn" data-adv="half">+6 Months</button>
          <button class="btn primary" data-adv="year">+1 Year</button>
        </div>
        <div style="margin-top:8px">${ageingDateNote()}</div>
      </div>

      ${rep ? `<div class="panel">
        <h2>Development Report — 1 Jan ${rep.year}</h2>
        <div class="tbl-scroll"><table class="tbl">
          <thead><tr><th>Fighter</th><th class="num">Age</th><th class="num">From</th><th class="num">To</th><th class="num">Δ</th></tr></thead>
          <tbody>${rep.rows.map(r => `<tr class="click click-fighter" data-fid="${r.id}">
            <td>${esc(r.name)}</td><td class="num">${r.age}</td>
            <td class="num">${r.from}</td><td class="num">${r.to}</td>
            <td class="num ${r.delta > 0 ? 'rt-good' : r.delta < 0 ? 'corner-red' : 'faint'}">${r.delta > 0 ? '+' : ''}${r.delta}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}
    </div>`;
  },
  wire() {
    $all('[data-adv]').forEach(b => b.addEventListener('click', () => advanceTime(b.dataset.adv)));
    wireFighterLinks();
    $all('tr[data-fid]').forEach(tr => tr.addEventListener('click', () => render('profile', { id: +tr.dataset.fid })));
  }
};

/* -------------------------------- DATA ------------------------------- */
VIEWS.data = {
  html() {
    return `<div class="grid">
      <div class="panel">
        <h2>Universe</h2>
        <label class="fld"><span>Universe Name</span><input type="text" id="dt-name" value="${esc(state.meta.universeName || 'UFC Universe')}"></label>
        <div class="check-row"><input type="checkbox" id="dt-autosave" ${state.settings.autosave ? 'checked' : ''}>
          <label for="dt-autosave">Autosave to this browser after every change</label></div>
        <div class="small mono muted">Save size: ~${storageFootprintKB()} KB${state.settings.compactSaved ? ' · older play-by-play compacted to fit' : ''}</div>
      </div>

      <div class="panel">
        <h2>Backup &amp; Restore</h2>
        <div class="btn-row">
          <button class="btn primary" id="dt-export">Export Universe (JSON)</button>
          <button class="btn" id="dt-import">Import Universe…</button>
        </div>
        <input type="file" id="dt-file" accept=".json,application/json" style="display:none">
        <div class="small faint" style="margin-top:8px">Exports include absolutely everything — full play-by-play, all history. Keep backups if this universe matters to you; browser storage can be cleared by the browser.</div>
      </div>

      <div class="panel">
        <h2>Share Fighters</h2>
        <div class="btn-row">
          <button class="btn" id="dt-exf">Export All Fighters</button>
          <button class="btn" id="dt-imf">Import Fighters…</button>
        </div>
        <input type="file" id="dt-file-f" accept=".json,application/json" style="display:none">
        <div class="small faint" style="margin-top:8px">Imported fighters arrive with a clean 0-0 record in this universe — identity and attributes travel, careers don't.</div>
      </div>

      <div class="panel">
        <h2 class="corner-red">Danger Zone</h2>
        <button class="btn danger" id="dt-reset">Reset Universe</button>
        <div class="small faint" style="margin-top:8px">Deletes every fighter, fight and record permanently. Export a backup first.</div>
      </div>
    </div>`;
  },
  wire() {
    $('#dt-name').addEventListener('change', e => { state.meta.universeName = e.target.value.trim() || 'UFC Universe'; autosave(); updateTopbar(); });
    $('#dt-autosave').addEventListener('change', e => { state.settings.autosave = e.target.checked; if (e.target.checked) saveUniverse(); });
    $('#dt-export').addEventListener('click', () => exportUniverse());
    $('#dt-import').addEventListener('click', () => $('#dt-file').click());
    $('#dt-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      importUniverseFromFile(file, err => {
        if (err) { toast('Import failed: ' + err.message); return; }
        toast('Universe imported.');
        updateTopbar(); render('dashboard');
      });
    });
    $('#dt-exf').addEventListener('click', () => {
      const ids = allFighters().map(f => f.id);
      if (!ids.length) { toast('No fighters to export.'); return; }
      exportFighters(ids);
    });
    $('#dt-imf').addEventListener('click', () => $('#dt-file-f').click());
    $('#dt-file-f').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const added = importFightersFromText(rd.result);
          toast(`${added.length} fighter${added.length === 1 ? '' : 's'} imported.`);
          render('roster');
        } catch (err) { toast('Import failed: ' + err.message); }
      };
      rd.readAsText(file);
    });
    $('#dt-reset').addEventListener('click', () => {
      const word = prompt('This deletes EVERYTHING. Type RESET to confirm.');
      if (word !== 'RESET') { toast('Reset cancelled.'); return; }
      resetUniverse();
      lastAgeingReport = null;
      toast('Fresh universe.');
      updateTopbar(); render('create');
    });
  }
};
