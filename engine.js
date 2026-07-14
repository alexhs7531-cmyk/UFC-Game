/* =====================================================================
   engine.js  -  world progression
   ---------------------------------------------------------------------
   Turns a raw fight result (produced by fightEngine, no mutation) into
   real changes across the universe: records, ELO, the belt, purses,
   popularity, post-fight development, wear, streaks, GOAT points and
   yearly ageing. No DOM, no storage.
   ===================================================================== */

/* -------------------------- ELO probability -------------------------- */

function expectedScore(ra, rb) { return 1 / (1 + Math.pow(10, (rb - ra) / 400)); }

/* fewer fights -> rating moves faster; long veterans settle */
function experienceK(f) {
  const n = totalFights(f);
  if (n < 5) return 1.30;
  if (n < 12) return 1.12;
  if (n < 25) return 1.00;
  return 0.90;
}

/* current ELO rank among active fighters (1-based); null if inactive */
function rankOf(f) {
  if (f.status !== 'active') return null;
  const list = activeFighters().slice().sort((a, b) => b.elo - a.elo);
  const i = list.findIndex(x => x.id === f.id);
  return i >= 0 ? i + 1 : null;
}

/* ring rust 0..1 from time out of the cage (used by odds AND real fights) */
function computeRust(f) {
  const anchor = f.lastFightDate || f.debutDate;
  if (!anchor) return 0;
  const months = Math.max(0, monthsBetween(anchor, state.date));
  const rust = clamp((months - 9) / 24, 0, 1);       // fine to 9 months, full rust at ~33
  return f.lastFightDate ? rust : Math.min(rust, 0.35); // debut nerves cap lower
}

/* --------------------------- stage + run a fight --------------------------- */
/* Builds the fight record, snapshots pre-fight standing, simulates, applies. */
function stageAndRunFight(aId, bId, opts) {
  opts = opts || {};
  const a = getFighter(aId), b = getFighter(bId);
  if (!a || !b || a.id === b.id) return null;

  const titleFight = !!opts.titleFight;
  const rounds = titleFight ? 5 : (opts.rounds === 5 ? 5 : 3);
  const pre = {
    aElo: a.elo, bElo: b.elo,
    aRank: rankOf(a), bRank: rankOf(b),
    aChamp: isChampion(a), bChamp: isChampion(b),
    aOvr: overall(a), bOvr: overall(b),
    aRust: computeRust(a), bRust: computeRust(b)
  };

  const result = simulateFight(a, b, { rounds, titleFight, rustA: pre.aRust, rustB: pre.bRust });
  result.pre = pre;

  const fight = {
    id: genId('fight'),
    aId, bId, rounds, titleFight,
    eventName: opts.eventName || '',
    date: cloneDate(state.date),
    odds: opts.odds || null,
    result, simulated: true
  };
  applyFightResult(fight);
  return fight;
}

/* --------------------------- apply a fight --------------------------- */
function applyFightResult(fight) {
  const a = getFighter(fight.aId), b = getFighter(fight.bId);
  const res = fight.result;
  const draw = res.draw;
  const winner = draw ? null : getFighter(res.winnerId);
  const loser = draw ? null : getFighter(res.loserId);
  const isFinish = res.method === 'KO' || res.method === 'TKO' || res.method === 'SUB';

  /* ---- ELO ---- */
  res.eloChange = applyElo(a, b, res, fight);

  /* ---- records ---- */
  if (draw) { a.record.d++; b.record.d++; }
  else {
    winner.record.w++;
    loser.record.l++;
    if (res.method === 'KO' || res.method === 'TKO') { winner.record.ko++; loser.record.koLoss++; }
    else if (res.method === 'SUB') { winner.record.sub++; loser.record.subLoss++; }
    else winner.record.dec++;
  }

  /* ---- streaks ---- */
  applyStreak(a, draw ? 'D' : (winner === a ? 'W' : 'L'));
  applyStreak(b, draw ? 'D' : (winner === b ? 'W' : 'L'));

  /* ---- quality-win ledger (uses PRE-fight standing) ---- */
  if (!draw) {
    const loserPreRank = loser === a ? res.pre.aRank : res.pre.bRank;
    const loserWasChamp = loser === a ? res.pre.aChamp : res.pre.bChamp;
    if (loserWasChamp) winner.championScalps++;
    if (loserPreRank != null && loserPreRank <= 5) winner.top5Wins++;
    if ((loserPreRank != null && loserPreRank <= 10) || loserWasChamp) winner.top10Wins++;
  }

  /* ---- the belt ---- */
  if (fight.titleFight) applyTitle(fight, winner, loser, draw);

  /* ---- best win / worst loss ---- */
  if (!draw) {
    const loserPreElo = loser === a ? res.pre.aElo : res.pre.bElo;
    const winnerPreElo = winner === a ? res.pre.aElo : res.pre.bElo;
    const prevBest = winner.bestWinId ? oppPreElo(winner.bestWinId, winner.id) : -1;
    if (loserPreElo > prevBest) winner.bestWinId = fight.id;
    const prevWorst = loser.worstLossId ? oppPreElo(loser.worstLossId, loser.id) : 1e9;
    if (winnerPreElo < prevWorst) loser.worstLossId = fight.id;
  }

  /* ---- popularity ---- */
  res.popChange = applyPopularity(a, b, res, fight);

  /* ---- purses ---- */
  const purseA = computePurse(a, b, res, fight);
  const purseB = computePurse(b, a, res, fight);
  a.earnings += purseA; b.earnings += purseB;
  res.purse = { a: purseA, b: purseB };
  if (isFinish && winner) { winner.finishOfNight++; }

  /* ---- development + wear ---- */
  res.attrChange = {
    a: applyDevelopment(a, res, b, fight),
    b: applyDevelopment(b, res, a, fight)
  };

  /* ---- GOAT ---- */
  a.fightHistory.push(fight.id);
  b.fightHistory.push(fight.id);
  state.fights.push(fight);
  recomputeGoat(a); recomputeGoat(b);

  /* ---- bookkeeping ---- */
  a.lastFightDate = cloneDate(fight.date);
  b.lastFightDate = cloneDate(fight.date);
  a.eloHistory.push({ d: dateToStr(fight.date), e: a.elo });
  b.eloHistory.push({ d: dateToStr(fight.date), e: b.elo });
  trimHist(a); trimHist(b);
  updatePeaks(a); updatePeaks(b);
  return fight;
}

function oppPreElo(fightId, myId) {
  const f = state.fights.find(x => x.id === fightId);
  if (!f || !f.result.pre) return 0;
  return f.aId === myId ? f.result.pre.bElo : f.result.pre.aElo;
}

function trimHist(f) {
  if (f.eloHistory.length > 120) f.eloHistory = f.eloHistory.slice(-120);
}
function updatePeaks(f) {
  if (f.elo > f.peakElo) f.peakElo = f.elo;
  const ovr = overall(f);
  if (ovr > f.peakOverall) { f.peakOverall = ovr; f.peakOverallAge = f.age; }
  if (f.popularity > f.peakPopularity) f.peakPopularity = f.popularity;
}

/* ------------------------------ ELO calc ----------------------------- */
/* Standard ELO already pays far more for an upset (low expected score),
   then the K multipliers stack: title fights, finishes, dominance and a
   champion's scalp make the swing SIGNIFICANTLY bigger — beating the
   world champion as an underdog is a rocket ride up the rankings. */
function applyElo(a, b, res, fight) {
  const eA = expectedScore(a.elo, b.elo);
  const eB = 1 - eA;
  let sA, sB;
  if (res.draw) { sA = 0.5; sB = 0.5; }
  else if (res.winnerId === a.id) { sA = 1; sB = 0; }
  else { sA = 0; sB = 1; }

  const isFinish = res.method === 'KO' || res.method === 'TKO' || res.method === 'SUB';
  let mult = 1;
  if (fight.titleFight) mult *= 1.30;
  if (isFinish) mult *= 1.12;
  if (res.dominant) mult *= 1.08;
  if (!res.draw) {
    const loserWasChamp = res.loserId === a.id ? res.pre.aChamp : res.pre.bChamp;
    if (loserWasChamp) mult *= 1.25;       // you took the king's head
  }

  const kA = 34 * experienceK(a) * mult;
  const kB = 34 * experienceK(b) * mult;
  const before = { a: a.elo, b: b.elo };
  a.elo = Math.round(clamp(a.elo + kA * (sA - eA), 700, 2500));
  b.elo = Math.round(clamp(b.elo + kB * (sB - eB), 700, 2500));
  return { a: a.elo - before.a, b: b.elo - before.b };
}

/* ------------------------------ streaks ------------------------------ */
function applyStreak(f, r) {
  if (f.currentStreak.type === r) f.currentStreak.count++;
  else f.currentStreak = { type: r, count: 1 };
  if (r === 'W' && f.currentStreak.count > f.bestWinStreak) f.bestWinStreak = f.currentStreak.count;
}

/* ------------------------------- title ------------------------------- */
function applyTitle(fight, winner, loser, draw) {
  const champId = state.champion;
  if (draw) {
    // champion retains on a draw; a vacant title stays vacant
    if (champId) {
      const c = getFighter(champId);
      c.titleDefences++;
      const open = c.reigns.find(r => !r.end);
      if (open) open.defences++;
    }
    return;
  }
  winner.titleFightsW++; loser.titleFightsL++;
  if (champId === winner.id) {
    // successful defence
    winner.titleDefences++;
    const open = winner.reigns.find(r => !r.end);
    if (open) open.defences++;
  } else {
    // new champion (beat the champ, or won a vacant title fight)
    if (champId && champId === loser.id) closeReign(loser, fight.date);
    state.champion = winner.id;
    winner.reigns.push({ start: cloneDate(fight.date), end: null, defences: 0 });
    state.titleHistory.push({
      date: cloneDate(fight.date), championId: winner.id,
      formerId: champId || null, fightId: fight.id, vacated: false
    });
  }
}

/* ---------------------------- popularity ----------------------------- */
function applyPopularity(a, b, res, fight) {
  const before = { a: a.popularity, b: b.popularity };
  const isFinish = res.method === 'KO' || res.method === 'TKO' || res.method === 'SUB';
  const war = res.excitement >= 75;
  [['a', a, b], ['b', b, a]].forEach(([side, me, opp]) => {
    let d = 0;
    if (res.draw) d += war ? 2 : 0;
    else if (res.winnerId === me.id) {
      d += 2 + (isFinish ? 2 : 0) + (fight.titleFight ? 5 : 0);
      // upset bump scales with how big an underdog you were
      const myPre = side === 'a' ? res.pre.aElo : res.pre.bElo;
      const opPre = side === 'a' ? res.pre.bElo : res.pre.aElo;
      if (opPre > myPre) d += clamp((opPre - myPre) / 60, 0, 6);
      // beating a star rubs off
      d += clamp((opp.popularity - 55) / 15, 0, 3);
    } else {
      d -= war ? 1 : 2.5;
      if (fight.titleFight) d -= 1;
    }
    if (war) d += 1.5;
    me.popularity = clamp(Math.round(me.popularity + d), 1, 99);
  });
  return { a: a.popularity - before.a, b: b.popularity - before.b };
}

/* ------------------------- purses / earnings -------------------------
   Pay is driven by stature: popularity (the crowd), ELO + overall (the
   resume), the size of the fight, a win bonus and a finish bonus. Big
   names in big title fights pull eye-watering money -> the all-time
   earnings board stays alive forever. */
function computePurse(me, opp, res, fight) {
  const pop = me.popularity;
  let base = 14000 +
    pop * pop * 42 +                                   // fame is exponential money
    Math.max(0, me.elo - 1200) * 240 +
    Math.max(0, overall(me) - 70) * 1100 +
    Math.max(0, opp.popularity - 40) * 1500;           // a big-name dance partner sells

  let stakes = 1;
  if (fight.titleFight) stakes *= 2.6;
  const myRank = res.pre[me.id === fight.aId ? 'aRank' : 'bRank'];
  const opRank = res.pre[me.id === fight.aId ? 'bRank' : 'aRank'];
  if (myRank && myRank <= 5 && opRank && opRank <= 5) stakes *= 1.45;
  if (fight.rounds === 5 && !fight.titleFight) stakes *= 1.2;   // main event

  let pay = base * stakes;
  if (!res.draw && res.winnerId === me.id) {
    pay *= 1.85;                                        // win bonus
    const isFinish = res.method === 'KO' || res.method === 'TKO' || res.method === 'SUB';
    if (isFinish) pay += 50000;                         // performance bonus
  }
  return Math.round(pay / 500) * 500;
}

/* ----------------------- post-fight development ----------------------
   Fights teach. Wins over quality opposition accelerate a fighter's
   climb toward his potential; losses teach IQ and heart; getting
   knocked out leaves wear that never fully heals. Yearly ageing does
   the heavy lifting — these are the result-driven nudges on top. */
function applyDevelopment(me, res, opp, fight) {
  if (me.frozen) return {};
  const won = !res.draw && res.winnerId === me.id;
  const koLoss = !res.draw && res.loserId === me.id && (res.method === 'KO' || res.method === 'TKO');
  const subLoss = !res.draw && res.loserId === me.id && res.method === 'SUB';
  const young = me.age < 27 ? 1 : me.age < 33 ? 0.6 : 0.3;
  const learn = young * me.hidden.improvementRate;
  const deltas = {};
  const bump = (k, base) => {
    let amt = base * learn;
    if (amt > 0) {
      const headroom = Math.min(99, me.hidden.potential + 4) - me.attributes[k];
      amt *= clamp(headroom / 18, 0.1, 1.2);
    }
    const nv = clamp(Math.round((me.attributes[k] + amt) * 100) / 100, 1, 99);
    const d = nv - me.attributes[k];
    if (Math.abs(d) >= 0.01) { me.attributes[k] = nv; deltas[k] = round1((deltas[k] || 0) + d); }
  };

  const oppQuality = clamp((opp.elo - 1150) / 500, 0, 1.4);
  if (won) {
    bump('fightIQ', 0.4 + oppQuality * 0.3);
    if (res.dominant) { bump('striking', 0.4); bump('wrestling', 0.3); bump('groundControl', 0.3); }
    me.hidden.confidence = clamp(me.hidden.confidence + 4, 1, 99);
    me.hidden.careerMomentum = clamp(me.hidden.careerMomentum + 7 + oppQuality * 5 + (fight.titleFight ? 4 : 0), -100, 100);
  } else if (res.draw) {
    bump('fightIQ', 0.4); bump('heart', 0.2);
  } else {
    bump('fightIQ', 0.5); bump('heart', 0.4); // hard lessons
    me.hidden.confidence = clamp(me.hidden.confidence - 5 - (koLoss ? 4 : 0), 1, 99);
    me.hidden.careerMomentum = clamp(me.hidden.careerMomentum - 8 - (koLoss ? 4 : 0), -100, 100);
    if (koLoss) { bump('chin', -0.9); me.hidden.durability = clamp(me.hidden.durability - 4, 1, 99); }
    if (subLoss) bump('submissionDefence', 0.5); // you drill what caught you
  }

  /* wear: damage carried out of the cage drives long-term decline */
  const myStats = me.id === fight.aId ? res.stats.a : res.stats.b;
  me.hidden.damageAccumulation = clamp(me.hidden.damageAccumulation + (myStats.dmgTaken || 0) * 0.30 + (koLoss ? 18 : 0), 0, 1000);

  return deltas;
}

/* ------------------------------ ageing -------------------------------
   Called once per in-game year (each 1 January crossed) for every
   active, unfrozen fighter. This is the career-curve model:

     18-21:  +2..+5 overall per year   (technique pours in)
     22-26:  +1..+3 per year
     27-primeEnd: flat (tiny drift)
     primeEnd+1..35: -0..-1
     36-38:  -1..-2
     39+:    -2..-4, worse with wear

   Growth is scaled by the fighter's hidden improvement rate and hot
   momentum (a phenom on a title run rockets), and can NEVER push
   overall past potential. Decline is scaled by accumulated damage —
   wars and KO losses catch up with everyone. Growth spends on
   technique first; decline strips athleticism first while fight IQ
   holds longest. */
function ageFighterOneYear(f) {
  if (f.frozen) return;
  f.age++;
  f.birthYear = state.date.y - f.age;

  const ovr = overall(f);
  const h = f.hidden;
  let target;
  const momentum = 1 + clamp(h.careerMomentum, -30, 80) / 130;
  const wearFrac = Math.min(h.damageAccumulation, 350) / 350;   // 0..1 career wear

  if (f.age <= 21) target = rnd(2, 5) * h.improvementRate * momentum;
  else if (f.age <= 26) target = rnd(1, 3) * h.improvementRate * momentum;
  else if (f.age <= h.primeEnd) target = rnd(-0.3, 0.6);
  else if (f.age <= 35) target = rnd(-0.8, 0) - wearFrac * 0.4;
  else if (f.age <= 38) target = rnd(-1.6, -1) - wearFrac * 0.7;
  else target = rnd(-2.6, -1.8) - wearFrac * 1.4;

  if (target > 0) {
    target = Math.min(target, 7);                    // even phenoms have a ceiling per year
    target = Math.min(target, h.potential - ovr);    // potential is the wall
    if (target < 0) target = 0;
  }

  if (Math.abs(target) > 0.05) applyOverallDelta(f, target);

  // momentum cools every year; damage never fully heals but eases slightly
  h.careerMomentum = Math.round(h.careerMomentum * 0.5);
  h.damageAccumulation = Math.max(0, h.damageAccumulation * 0.88 - 4);

  const newOvr = overall(f);
  f.overallHistory.push({ y: state.date.y, age: f.age, ovr: newOvr });
  if (f.overallHistory.length > 40) f.overallHistory = f.overallHistory.slice(-40);
  updatePeaks(f);
  recomputeGoat(f);
}

/* growth/decline profiles: relative share of the overall change each
   attribute takes. Overall is a weighted mean, so we can hit the target
   delta exactly by scaling the profile vector (then clamping). */
const GROW_PROFILE = {
  striking: 1.2, power: 0.7, strikingDefence: 1.1, speed: 0.5,
  wrestling: 1.2, takedownDefence: 1.1, groundControl: 1.0, submissions: 0.9,
  submissionDefence: 1.0, clinch: 0.8,
  cardio: 0.9, chin: 0.3, strength: 0.8,
  fightIQ: 1.4, heart: 0.5, aggression: 0.1
};
const DECLINE_PROFILE = {
  striking: 0.7, power: 0.8, strikingDefence: 0.9, speed: 1.7,
  wrestling: 0.8, takedownDefence: 0.9, groundControl: 0.6, submissions: 0.4,
  submissionDefence: 0.5, clinch: 0.5,
  cardio: 1.6, chin: 1.5, strength: 0.9,
  fightIQ: -0.25,   // craft still sharpens while the body goes
  heart: 0.1, aggression: 0.3
};

function applyOverallDelta(f, target) {
  const preOvr = overall(f);
  const profile = target >= 0 ? GROW_PROFILE : DECLINE_PROFILE;
  let wSum = 0, wpSum = 0;
  ATTR_KEYS.forEach(k => { wSum += ATTR_WEIGHTS[k]; wpSum += ATTR_WEIGHTS[k] * profile[k]; });
  if (Math.abs(wpSum) < 0.001) return;
  const s = (target * wSum) / wpSum;
  const attrCap = Math.min(99, f.hidden.potential + 4);
  ATTR_KEYS.forEach(k => {
    let nv = f.attributes[k] + s * profile[k] * rnd(0.75, 1.25);
    if (target > 0) nv = Math.min(nv, attrCap);
    f.attributes[k] = clamp(Math.round(nv * 10) / 10, 1, 99);
  });
  // capped attributes swallow part of the gain: respill onto uncapped ones
  if (target > 0) {
    const intended = Math.min(f.hidden.potential, preOvr + target);
    let guard = 0;
    while (overall(f) < intended - 0.2 && guard++ < 120) {
      const open = ATTR_KEYS.filter(k => f.attributes[k] < attrCap - 0.05);
      if (!open.length) break;
      const k = pick(open);
      f.attributes[k] = clamp(Math.round((f.attributes[k] + 0.5) * 10) / 10, 1, attrCap);
    }
  }
  // clamping can leave overall a touch off (or above potential): correct it
  let guard = 0;
  while (target > 0 && overall(f) > f.hidden.potential && guard++ < 60) {
    const k = pick(ATTR_KEYS.filter(x => f.attributes[x] > 1));
    f.attributes[k] = clamp(f.attributes[k] - 0.5, 1, 99);
  }
}

function ageAllForYear() {
  const report = [];
  activeFighters().forEach(f => {
    const before = overall(f);
    ageFighterOneYear(f);
    const after = overall(f);
    report.push({ id: f.id, name: f.name, age: f.age, from: before, to: after, delta: after - before });
  });
  report.sort((a, b) => b.delta - a.delta);
  return report;
}

/* -------------------------------- GOAT --------------------------------
   Fair, transparent career score. Recomputed from the full ledger after
   every fight, then kept as a high-water mark so a legend's place is
   never eroded. Rewards: quality of wins (who you beat, WHEN they were
   good), scalps of ranked men and champions, winning and DEFENDING the
   belt, time as champion, peak level reached, finishing, longevity.
   Punishes losses — but losing to a great costs almost nothing, losing
   to a nobody costs plenty. */
function recomputeGoat(f) {
  const parts = { quality: 0, scalps: 0, titles: 0, reign: 0, peak: 0, finishes: 0, longevity: 0, losses: 0, bonus: 0 };

  f.fightHistory.forEach(fid => {
    const ft = state.fights.find(x => x.id === fid);
    if (!ft || !ft.result || !ft.result.pre) return;
    const res = ft.result;
    const iAmA = ft.aId === f.id;
    const oppPre = iAmA ? res.pre.bElo : res.pre.aElo;
    const oppRank = iAmA ? res.pre.bRank : res.pre.aRank;
    const oppChamp = iAmA ? res.pre.bChamp : res.pre.aChamp;
    const oppQ = clamp((oppPre - 1100) / 80, 0, 10);   // beating a 1900 = +10

    if (!res.draw && res.winnerId === f.id) {
      parts.quality += 2 + oppQ;
      if (oppRank != null && oppRank <= 10) parts.scalps += 4;
      if (oppRank != null && oppRank <= 5) parts.scalps += 3;
      if (oppChamp) parts.scalps += 8;
    } else if (!res.draw && res.loserId === f.id) {
      parts.losses -= clamp(4 - oppQ / 2, 0.5, 4);
    }
  });

  parts.titles = f.reigns.length * 25 + f.titleDefences * 12;
  parts.reign = Math.min(120, totalReignDays(f) / 30);
  parts.peak = clamp((f.peakElo - 1400) / 6, 0, 120) + clamp((f.peakOverall - 80) * 3, 0, 57);
  parts.finishes = f.record.ko + f.record.sub;
  parts.longevity = Math.min(40, totalFights(f) * 0.8);
  if (f.status === 'retired' && isUndefeated(f) && f.record.w >= 12) parts.bonus += 15;

  const total = Math.max(0, Math.round(
    parts.quality + parts.scalps + parts.titles + parts.reign +
    parts.peak + parts.finishes + parts.longevity + parts.losses + parts.bonus
  ));
  f.hidden.goatParts = parts;
  f.hidden.legacyScore = Math.max(f.hidden.legacyScore || 0, total);
  return total;
}

/* recompute for everyone (e.g. after import) */
function recomputeAllGoat() { allFighters().forEach(recomputeGoat); }

/* ------------------------- booking estimate --------------------------
   The bookmakers' view of a matchup: Monte Carlo on the real engine,
   with today's ring rust priced in, converted to a full odds board. */
function bookFight(aId, bId, opts) {
  const a = getFighter(aId), b = getFighter(bId);
  if (!a || !b) return null;
  opts = opts || {};
  const rounds = opts.titleFight ? 5 : (opts.rounds === 5 ? 5 : 3);
  const est = estimateFight(a, b, {
    rounds, titleFight: !!opts.titleFight,
    rustA: computeRust(a), rustB: computeRust(b),
    samples: opts.samples || 300
  });
  const odds = buildOdds(est);
  const eA = expectedScore(a.elo, b.elo);
  return { est, odds, eloExpectA: Math.round(eA * 100) };
}
