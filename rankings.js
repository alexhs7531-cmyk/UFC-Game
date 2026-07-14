/* =====================================================================
   rankings.js  -  live rankings, records boards, GOAT list
   ---------------------------------------------------------------------
   "Current" boards rank active fighters by live values.
   "All-time" boards include retired fighters and use peak/career totals,
   so a legend stays on the board forever after the gloves come off.
   No DOM, no storage.
   ===================================================================== */

/* the official rankings: champion pinned on top, then contenders by ELO */
function officialRankings(count) {
  const n = count || 15;
  const champ = state.champion ? getFighter(state.champion) : null;
  const rest = activeFighters()
    .filter(f => !champ || f.id !== champ.id)
    .sort((a, b) => b.elo - a.elo)
    .slice(0, n);
  return { champion: champ, contenders: rest };
}

/* ELO change over the most recent n recorded points (risers/fallers) */
function recentEloDelta(f, n) {
  const h = f.eloHistory;
  if (!h || h.length < 2) return 0;
  const from = h[Math.max(0, h.length - 1 - (n || 5))].e;
  return f.elo - from;
}

/* fastest finish (seconds into the fight) across a fighter's wins */
function fastestFinishSecs(f) {
  let best = null;
  f.fightHistory.forEach(fid => {
    const ft = state.fights.find(x => x.id === fid);
    if (!ft || ft.result.draw || ft.result.winnerId !== f.id) return;
    const m = ft.result.method;
    if (m !== 'KO' && m !== 'TKO' && m !== 'SUB') return;
    const [mm, ss] = ft.result.timeStr.split(':').map(Number);
    const secs = (ft.result.round - 1) * 300 + mm * 60 + ss;
    if (best == null || secs < best) best = secs;
  });
  return best;
}
function fmtFightTime(secs) {
  const r = Math.floor(secs / 300) + 1;
  const rem = secs % 300;
  return `R${r} ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
}

/* ------------------------- board definitions ------------------------ */
const BOARD_GROUPS = [
  {
    group: 'Careers', items: [
      { id: 'goat', label: 'GOAT — Greatest Careers', scope: 'alltime' },
      { id: 'earnings', label: 'Most Money Earned', scope: 'alltime' },
      { id: 'peakElo', label: 'Highest Peak ELO', scope: 'alltime' },
      { id: 'peakOvr', label: 'Highest Peak Overall', scope: 'alltime' }
    ]
  },
  {
    group: 'Winning', items: [
      { id: 'wins', label: 'Most Wins', scope: 'alltime' },
      { id: 'top10', label: 'Wins vs Top 10', scope: 'alltime' },
      { id: 'top5', label: 'Wins vs Top 5', scope: 'alltime' },
      { id: 'scalps', label: 'Champion Scalps', scope: 'alltime' },
      { id: 'bestStreak', label: 'Longest Win Streaks', scope: 'alltime' },
      { id: 'curStreak', label: 'Active Win Streaks', scope: 'current' },
      { id: 'undefeated', label: 'Best Unbeaten Records', scope: 'current' }
    ]
  },
  {
    group: 'Finishing', items: [
      { id: 'kos', label: 'Most KO/TKO Wins', scope: 'alltime' },
      { id: 'subs', label: 'Most Submission Wins', scope: 'alltime' },
      { id: 'finishRate', label: 'Highest Finish Rate', scope: 'alltime' },
      { id: 'fastest', label: 'Fastest Finishes', scope: 'alltime' },
      { id: 'bonuses', label: 'Most Performance Bonuses', scope: 'alltime' }
    ]
  },
  {
    group: 'The Belt', items: [
      { id: 'defences', label: 'Most Title Defences', scope: 'alltime' },
      { id: 'reignDays', label: 'Longest Time as Champion', scope: 'alltime' },
      { id: 'titleWins', label: 'Most Title Fight Wins', scope: 'alltime' }
    ]
  },
  {
    group: 'Form & Fame', items: [
      { id: 'popularity', label: 'Most Popular', scope: 'current' },
      { id: 'risers', label: 'Biggest Risers', scope: 'current' },
      { id: 'fallers', label: 'Biggest Fallers', scope: 'current' },
      { id: 'active', label: 'Most Fights', scope: 'alltime' }
    ]
  }
];

function boardScope(id) {
  for (const g of BOARD_GROUPS) for (const it of g.items) if (it.id === id) return it.scope;
  return 'current';
}
function boardLabel(id) {
  for (const g of BOARD_GROUPS) for (const it of g.items) if (it.id === id) return it.label;
  return id;
}

/* rows for a board: [{ f, value (display), num (sort) }] */
function boardRows(id, limit) {
  const lim = limit || 20;
  const pool = boardScope(id) === 'alltime' ? allFighters() : activeFighters();
  let rows = [];
  const push = (f, num, value, sub) => rows.push({ f, num, value, sub: sub || '' });

  pool.forEach(f => {
    switch (id) {
      case 'goat': if (f.hidden.legacyScore > 0) push(f, f.hidden.legacyScore, String(f.hidden.legacyScore), recordStr(f)); break;
      case 'earnings': if (f.earnings > 0) push(f, f.earnings, '$' + f.earnings.toLocaleString()); break;
      case 'peakElo': push(f, f.peakElo, String(f.peakElo)); break;
      case 'peakOvr': push(f, f.peakOverall, String(f.peakOverall), `at ${f.peakOverallAge}`); break;
      case 'wins': if (f.record.w) push(f, f.record.w, String(f.record.w), recordStr(f)); break;
      case 'top10': if (f.top10Wins) push(f, f.top10Wins, String(f.top10Wins)); break;
      case 'top5': if (f.top5Wins) push(f, f.top5Wins, String(f.top5Wins)); break;
      case 'scalps': if (f.championScalps) push(f, f.championScalps, String(f.championScalps)); break;
      case 'bestStreak': if (f.bestWinStreak >= 2) push(f, f.bestWinStreak, f.bestWinStreak + ' in a row'); break;
      case 'curStreak': if (f.currentStreak.type === 'W' && f.currentStreak.count >= 2) push(f, f.currentStreak.count, f.currentStreak.count + ' in a row'); break;
      case 'undefeated': if (isUndefeated(f) && f.record.w >= 3) push(f, f.record.w, recordStr(f)); break;
      case 'kos': if (f.record.ko) push(f, f.record.ko, String(f.record.ko)); break;
      case 'subs': if (f.record.sub) push(f, f.record.sub, String(f.record.sub)); break;
      case 'finishRate': if (f.record.w >= 5) push(f, finishRate(f), finishRate(f) + '%', `${f.record.ko + f.record.sub} of ${f.record.w} wins`); break;
      case 'fastest': { const s = fastestFinishSecs(f); if (s != null) push(f, -s, fmtFightTime(s)); break; }
      case 'bonuses': if (f.finishOfNight) push(f, f.finishOfNight, String(f.finishOfNight)); break;
      case 'defences': if (f.titleDefences) push(f, f.titleDefences, String(f.titleDefences)); break;
      case 'reignDays': { const d = totalReignDays(f); if (d > 0) push(f, d, d.toLocaleString() + ' days', f.reigns.length + (f.reigns.length === 1 ? ' reign' : ' reigns')); break; }
      case 'titleWins': if (f.titleFightsW) push(f, f.titleFightsW, String(f.titleFightsW)); break;
      case 'popularity': push(f, f.popularity, String(f.popularity)); break;
      case 'risers': { const d = recentEloDelta(f, 5); if (d > 0) push(f, d, '+' + d + ' ELO'); break; }
      case 'fallers': { const d = recentEloDelta(f, 5); if (d < 0) push(f, -d, d + ' ELO'); break; }
      case 'active': if (totalFights(f)) push(f, totalFights(f), String(totalFights(f)), recordStr(f)); break;
    }
  });

  rows.sort((x, y) => y.num - x.num);
  return rows.slice(0, lim);
}

/* the GOAT list with full breakdowns for the GOAT page */
function goatList(limit) {
  return allFighters()
    .filter(f => totalFights(f) > 0)
    .map(f => ({ f, score: f.hidden.legacyScore, parts: f.hidden.goatParts }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit || 50);
}

/* head-to-head record between two fighters */
function headToHead(aId, bId) {
  let aW = 0, bW = 0, d = 0;
  state.fights.forEach(ft => {
    const pair = (ft.aId === aId && ft.bId === bId) || (ft.aId === bId && ft.bId === aId);
    if (!pair || !ft.result) return;
    if (ft.result.draw) d++;
    else if (ft.result.winnerId === aId) aW++;
    else bW++;
  });
  return { aW, bW, d, total: aW + bW + d };
}
