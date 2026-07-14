/* =====================================================================
   fightEngine.js  -  MMA fight simulation (pure: never mutates a fighter)
   ---------------------------------------------------------------------
   simulateFight(a, b, opts) -> result object. engine.js applies effects.

   DESIGN
   ------
   A fight is simulated in 30-second segments across 5-minute rounds,
   moving between three phases the way a real MMA fight does:

     STAND  -> striking exchanges, takedown attempts, clinch entries
     CLINCH -> control battle, knees/elbows, trips, separations
     GROUND -> top control, ground-and-pound, submission hunting,
               sweeps, stand-ups and referee resets

   The model separates two questions that are easy to conflate:

     (1) WHO WINS. Control and skill decide this. Wrestling both ways,
         fight IQ, cardio and defensive craft let the better fighter
         dictate where the fight happens, out-land and out-position,
         and bank rounds on the judges' criteria (impact first, then
         dominance, then control time).

     (2) WHETHER IT IS FINISHED. Power, submissions and accumulation
         decide this, and a finish can happen in ANY fight:

           * flush shot on a compromised opponent  -> KO
           * hurt fighter swarmed / not defending  -> TKO (strikes)
           * bottom fighter broken under GnP       -> TKO (ground & pound)
           * locked-in submission                  -> SUB (tap or nap)
           * the final horn                        -> decision (UD/SD/MD)

   The flush-shot path is the puncher's chance and is available even
   from behind — but landing it flush on an elite defensive fighter is
   rare, so a 99-rated prime great loses to a 90 only on a genuinely
   believable night. Nothing is ever 0%.

   Ring rust: pass opts.rustA / opts.rustB (0..1) and timing, cardio and
   output are shaved — long layoffs matter, as they do in real MMA.

   All tunables live in T so the whole model calibrates from one place.
   ===================================================================== */

const T = {
  /* ---------- segments / structure ---------- */
  SEG_PER_ROUND: 10,        // 30-second segments in a 5-minute round
  SEG_SECONDS: 30,

  /* ---------- standing output / accuracy ---------- */
  STRIKE_BASE: 5.2,         // significant strike attempts per segment at even skill
  VOLUME_STAM: 0.45,        // how much an empty tank cuts output
  VOLUME_HURT: 0.55,        // a hurt fighter throws far less
  LAND_BASE: 0.40,          // baseline sig-strike connect rate
  LAND_SKILL_K: 0.55,       // striking-vs-defence gap swing on landing
  LAND_SPEED: 0.0025,       // speed edge per point
  LAND_REACH: 0.0018,       // reach edge per cm (capped)
  LAND_IQ: 0.0015,          // fight IQ edge per point
  LAND_TIRED: 0.22,         // a gassed opponent gets hit more
  LAND_HURT_OPEN: 0.28,     // a hurt opponent is far easier to hit clean
  COUNTER_EDGE: 0.16,       // counter share punishes aggression

  /* ---------- damage / durability ---------- */
  DMG_BASE: 0.74,           // health damage per clean sig strike, light hitter
  DMG_POWER_K: 1.60,        // how hard raw power scales that
  DMG_CHIN_K: 0.85,         // how much chin+durability resists it
  DMG_HURT_MULT: 1.50,      // strikes on a hurt fighter do extra
  HEALTH_START: 100,

  /* ---------- hurt / knockdown / KO ---------- */
  FLUSH_BASE: 0.066,        // chance a landed power shot is FLUSH (clean on the button)
  FLUSH_POWER_K: 0.9,       // power vs chin swing on flush chance
  FLUSH_DEF_K: 0.55,        // striking defence + IQ shrink flush chance
  HURT_HEALTH_K: 1.7,       // low health makes flush shots hurt more
  KD_FROM_FLUSH: 0.58,      // flush shots that score a knockdown
  KO_ON_KD: 0.40,           // knockdowns that end it on the spot (clean KO)
  TKO_FOLLOWUP: 0.30,       // hurt + swarmed -> referee stoppage chance per burst
  TKO_HEALTH: 14,           // below this health, sustained landing forces the ref's hand
  HURT_DECAY: 0.42,         // hurt severity recovered per segment (heart helps)
  HEART_SURVIVE: 0.35,      // heart's pull on surviving finishing sequences

  /* ---------- takedowns ---------- */
  TD_BASE: 0.34,            // base success for an even wrestling battle
  TD_SKILL_K: 0.60,         // wrestling vs TDD swing
  TD_FATIGUE: 0.22,         // tired opponents are easier to take down
  TD_HURT: 0.25,            // hurt opponents are much easier to take down
  TD_FAIL_COST: 2.6,        // stamina cost of a failed shot
  TD_SPRAWL_DMG: 2.2,       // damage a sprawl-and-brawler lands on a failed shot

  /* ---------- clinch ---------- */
  CLINCH_ENTRY: 0.10,       // base chance a segment moves to the clinch
  CLINCH_DMG: 0.48,         // knees/elbows damage scale vs standing
  CLINCH_TRIP_K: 0.5,       // clinch takedown boost for wrestlers
  CLINCH_SEP: 0.45,         // chance the clinch breaks each segment

  /* ---------- ground ---------- */
  GNP_BASE: 3.4,            // GnP strike attempts per top segment
  GNP_DMG: 0.92,            // GnP damage scale
  SUB_BASE: 0.072,          // base chance a sub attempt finishes at even skill
  SUB_SKILL_K: 0.62,        // subs vs sub defence swing
  SUB_FATIGUE: 0.40,        // exhausted fighters get submitted
  SUB_DAMAGE: 0.35,         // badly hurt fighters get submitted
  SUB_ATTEMPT_COST: 2.0,    // stamina cost of hunting a sub
  SWEEP_BASE: 0.16,         // bottom fighter escapes/reverses per segment
  STANDUP_REF: 0.10,        // referee stands up a stalling top player
  GROUND_CTRL_K: 0.55,      // groundControl vs (wrestling+scramble) swing on keeping top

  /* ---------- stamina ---------- */
  STAM_BASE_DRAIN: 1.50,     // per segment at moderate pace
  STAM_OUTPUT_DRAIN: 0.10,  // per strike thrown
  STAM_GRAPPLE_DRAIN: 1.8,  // extra for grappling-heavy segments
  STAM_CARDIO_SAVE: 0.50,    // how much elite cardio blunts all drains
  STAM_ROUND_RECOVER: 18,   // recovered on the stool (scaled by cardio+heart)
  CHAMP_R4_TAX: 1.05,       // extra drain in championship rounds 4-5

  /* ---------- judging ---------- */
  JUDGE_NOISE: 3.8,         // per-judge noise on a round's impact margin
  TEN_EIGHT_MARGIN: 20,     // impact margin (or KD + big edge) for a 10-8
  CTRL_POINT: 0.045,        // impact points per second of control
  TD_POINT: 2.1,            // impact points per takedown landed
  SUBATT_POINT: 3.4,        // impact points per real submission attempt

  /* ---------- class gap (P4P nudge) ---------- */
  CLASS_K: 0.017            // small per-point overall nudge on exchanges
};

/* ------------------------------ helpers ------------------------------ */

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function styleOf(f) { return STYLE_PROFILES[f.style] || STYLE_PROFILES['All-Rounder']; }

/* fight-time fighter shell: live health/stamina/hurt without mutating f */
function fstate(f, rust) {
  return {
    f, prof: styleOf(f),
    health: T.HEALTH_START,
    stamina: 100,
    hurt: 0,                       // 0..3 severity, decays
    kd: 0,
    rust: clamp(rust || 0, 0, 1),  // 0 sharp .. 1 badly rusty
    stats: { sigLanded: 0, sigThrown: 0, kd: 0, td: 0, tdAtt: 0, ctrlSec: 0, subAtt: 0, dmgDealt: 0, dmgTaken: 0 }
  };
}

/* effective attribute after fatigue, hurt and rust */
function eff(s, key) {
  let v = s.f.attributes[key];
  const stamF = 0.62 + 0.38 * (s.stamina / 100);
  const hurtF = 1 - clamp(s.hurt, 0, 3) * 0.13;
  const rustF = 1 - s.rust * 0.10;
  if (key === 'speed' || key === 'striking' || key === 'strikingDefence' || key === 'wrestling' ||
      key === 'takedownDefence' || key === 'groundControl' || key === 'submissions' ||
      key === 'submissionDefence' || key === 'clinch') v *= stamF * hurtF * rustF;
  if (key === 'fightIQ') v *= (1 - s.rust * 0.06);
  return v;
}

function drain(s, amt) {
  const save = 1 - T.STAM_CARDIO_SAVE * (s.f.attributes.cardio / 100) * (1 - s.rust * 0.25);
  s.stamina = clamp(s.stamina - amt * save, 0, 100);
}

function takeDamage(s, dmg) {
  s.health = clamp(s.health - dmg, 0, 100);
  s.stats.dmgTaken += dmg;
}

/* small class nudge: the clearly better fighter wins more of the 50/50s */
function classEdge(a, b) {
  return clamp((overall(a.f) - overall(b.f)) * T.CLASS_K, -0.5, 0.5);
}

/* =====================================================================
   simulateFight(a, b, opts)
   opts: { rounds: 3|5, titleFight, rustA, rustB }
   ===================================================================== */
function simulateFight(fa, fb, opts) {
  opts = opts || {};
  const scheduled = opts.rounds === 5 ? 5 : 3;
  const A = fstate(fa, opts.rustA), B = fstate(fb, opts.rustB);
  const rounds = [];
  const events = [];
  let finish = null;   // { winner: 'a'|'b', method, round, segIdx }
  let position = 'stand';

  const logEv = (rn, seg, phase, text) => {
    const secs = Math.min(299, seg * T.SEG_SECONDS + rndi(2, 27));
    events.push({ r: rn, t: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, phase, text });
  };

  for (let rn = 1; rn <= scheduled && !finish; rn++) {
    const R = {
      n: rn,
      a: { sig: 0, dmg: 0, kd: 0, td: 0, subAtt: 0, ctrl: 0 },
      b: { sig: 0, dmg: 0, kd: 0, td: 0, subAtt: 0, ctrl: 0 }
    };
    position = 'stand'; // fights restart standing each round
    if (T.DEBUG) {
      (globalThis.__dbg = globalThis.__dbg || []).push({ rn, ha: A.health, hb: B.health, sa: A.stamina, sb: B.stamina, ua: A.hurt, ub: B.hurt });
    }

    for (let seg = 0; seg < T.SEG_PER_ROUND && !finish; seg++) {
      const champTax = (rn >= 4) ? T.CHAMP_R4_TAX : 1;

      if (position === 'stand') {
        finish = standSegment(A, B, R, rn, seg, champTax, logEv, p => { position = p; });
      } else if (position === 'clinch') {
        finish = clinchSegment(A, B, R, rn, seg, champTax, logEv, p => { position = p; });
      } else {
        const topSide = position === 'groundA' ? 'a' : 'b';
        const top = topSide === 'a' ? A : B;
        const bot = topSide === 'a' ? B : A;
        const topR = topSide === 'a' ? R.a : R.b;
        const botR = topSide === 'a' ? R.b : R.a;
        finish = groundSegment(top, bot, topR, botR, topSide, rn, seg, champTax, logEv, p => { position = p; });
      }

      // decay hurt with heart-driven recovery
      [A, B].forEach(s => {
        if (s.hurt > 0) s.hurt = Math.max(0, s.hurt - T.HURT_DECAY * (0.7 + s.f.attributes.heart / 200));
      });
    }

    // stool: recover between rounds
    if (!finish) {
      [A, B].forEach(s => {
        const rec = T.STAM_ROUND_RECOVER * (0.25 + s.f.attributes.cardio / 300 + s.f.attributes.heart / 800);
        s.stamina = clamp(s.stamina + rec, 0, 100);
        s.health = clamp(s.health + 5 + s.f.attributes.heart / 30 + (100 - s.health) * 0.20, 0, 100);
        s.hurt = Math.max(0, s.hurt - 1);
      });
    }

    rounds.push(R);
    if (finish) finish.round = rn;
  }

  /* ------------------------------ verdict ------------------------------ */
  let res;
  if (finish) {
    const w = finish.winner === 'a' ? fa : fb;
    const l = finish.winner === 'a' ? fb : fa;
    const secs = Math.min(299, finish.segIdx * T.SEG_SECONDS + rndi(3, 28));
    res = {
      winnerId: w.id, loserId: l.id, draw: false,
      method: finish.method, round: finish.round,
      timeStr: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      scorecards: null
    };
  } else {
    res = judgeFight(fa, fb, rounds);
    res.round = scheduled;
    res.timeStr = 'Decision';
  }

  /* stats + shared fields */
  res.rounds = rounds;
  res.scheduled = scheduled;
  res.titleFight = !!opts.titleFight;
  res.stats = {
    a: Object.assign({}, A.stats, { healthLeft: Math.round(A.health), staminaLeft: Math.round(A.stamina) }),
    b: Object.assign({}, B.stats, { healthLeft: Math.round(B.health), staminaLeft: Math.round(B.stamina) })
  };
  res.events = events.slice(0, 60);
  res.excitement = excitementScore(res, A, B);
  res.dominant = isDominant(res, fa, fb);
  res.summary = buildSummary(fa, fb, res);
  return res;
}

/* --------------------------- STAND segment --------------------------- */
function standSegment(A, B, R, rn, seg, champTax, logEv, setPos) {
  // 1) takedown attempts (order randomised)
  const order = Math.random() < 0.5 ? [[A, B, 'a'], [B, A, 'b']] : [[B, A, 'b'], [A, B, 'a']];
  for (const [me, opp, side] of order) {
    const intent = me.prof.tdIntent *
      (1 + (opp.hurt > 0.6 ? 0.5 : 0) + (opp.stamina < 40 ? 0.3 : 0)) *
      (0.7 + eff(me, 'fightIQ') / 200);
    if (chance(intent * 0.55)) {
      me.stats.tdAtt++;
      const atk = eff(me, 'wrestling') + eff(me, 'fightIQ') * 0.25 + me.f.attributes.strength * 0.15;
      const def = eff(opp, 'takedownDefence') * (1 + opp.prof.sprawl * 1.35) + eff(opp, 'fightIQ') * 0.2 + opp.f.attributes.strength * 0.12;
      let p = T.TD_BASE + T.TD_SKILL_K * sigmoid((atk - def) / 14) - T.TD_SKILL_K / 2;
      p += (opp.stamina < 45 ? T.TD_FATIGUE * (1 - opp.stamina / 45) : 0);
      p += opp.hurt > 0.5 ? T.TD_HURT : 0;
      p += classEdge(me, opp) * 0.10;
      if (chance(clamp(p, 0.03, 0.92))) {
        me.stats.td++; (side === 'a' ? R.a : R.b).td++;
        drain(me, 1.6 * champTax); drain(opp, 2.6 * champTax);
        logEv(rn, seg, 'GROUND', `${last(me.f)} shoots and plants ${last(opp.f)} on the canvas.`);
        setPos(side === 'a' ? 'groundA' : 'groundB');
        return null;
      } else {
        drain(me, T.TD_FAIL_COST * champTax);
        if (opp.prof.sprawl > 0.08 && chance(0.5)) {
          const dmg = T.TD_SPRAWL_DMG * (0.6 + eff(opp, 'power') / 130);
          takeDamage(me, dmg); opp.stats.dmgDealt += dmg;
          (side === 'a' ? R.b : R.a).dmg += dmg;
          logEv(rn, seg, 'STAND', `${last(opp.f)} stuffs the shot and makes ${last(me.f)} pay on the break.`);
        } else if (chance(0.3)) {
          logEv(rn, seg, 'STAND', `${last(me.f)} shoots — ${last(opp.f)} sprawls beautifully.`);
        }
      }
    }
  }

  // 2) clinch entry
  const clinchP = T.CLINCH_ENTRY * (1 + (A.prof.pressure + B.prof.pressure) * 2 + (A.f.attributes.clinch + B.f.attributes.clinch) / 400);
  if (chance(clinchP)) { setPos('clinch'); logEv(rn, seg, 'CLINCH', `They tie up against the fence.`); return null; }

  // footwork and movement cost something even without engaging
  drain(A, T.STAM_BASE_DRAIN * champTax); drain(B, T.STAM_BASE_DRAIN * champTax);

  // 3) striking exchange (both fire; faster man usually first)
  const aFirst = chance(0.5 + clamp((eff(A, 'speed') - eff(B, 'speed')) / 400, -0.08, 0.08));
  const seq = aFirst
    ? [[A, B, R.a, R.b, 'a'], [B, A, R.b, R.a, 'b']]
    : [[B, A, R.b, R.a, 'b'], [A, B, R.a, R.b, 'a']];
  for (const [me, opp, myR, oppR, side] of seq) {
    const fin = exchange(me, opp, myR, oppR, side, rn, seg, champTax, logEv, 1);
    if (fin) return fin;
  }
  return null;
}

/* one fighter's standing output for a segment; may produce a finish */
function exchange(me, opp, myR, oppR, side, rn, seg, champTax, logEv, scale) {
  const out = T.STRIKE_BASE * me.prof.volume * scale *
    (1 - T.VOLUME_STAM * (1 - me.stamina / 100)) *
    (me.hurt > 0.5 ? T.VOLUME_HURT : 1) *
    (0.85 + me.f.attributes.aggression / 200) * (1 - me.rust * 0.12);
  const thrown = Math.max(0, Math.round(out + rnd(-1.2, 1.2)));
  me.stats.sigThrown += thrown;
  drain(me, T.STAM_BASE_DRAIN * 0.4 * champTax + thrown * T.STAM_OUTPUT_DRAIN * champTax);
  drain(opp, me.prof.pressure * 0.8 * champTax); // pressure fighters drown you

  if (!thrown) return null;

  // connect rate
  let p = T.LAND_BASE +
    T.LAND_SKILL_K * (sigmoid((eff(me, 'striking') - eff(opp, 'strikingDefence')) / 13) - 0.5) +
    T.LAND_SPEED * (eff(me, 'speed') - eff(opp, 'speed')) +
    T.LAND_REACH * clamp(me.f.reach - opp.f.reach, -12, 12) +
    T.LAND_IQ * (eff(me, 'fightIQ') - eff(opp, 'fightIQ')) +
    classEdge(me, opp) * 0.06;
  p += me.prof.counter * T.COUNTER_EDGE * (opp.f.attributes.aggression / 100);
  if (opp.stamina < 40) p += T.LAND_TIRED * (1 - opp.stamina / 40);
  if (opp.hurt > 0.4) p += T.LAND_HURT_OPEN * Math.min(1, opp.hurt);
  p = clamp(p, 0.06, 0.85);

  let landed = 0;
  for (let i = 0; i < thrown; i++) if (chance(p)) landed++;
  if (!landed) return null;
  me.stats.sigLanded += landed; myR.sig += landed;

  // damage
  const chinRes = (opp.f.attributes.chin * 0.7 + oppHidden(opp).durability * 0.3);
  const perShot = T.DMG_BASE * (0.5 + T.DMG_POWER_K * eff(me, 'power') / 100) /
    (0.5 + T.DMG_CHIN_K * chinRes / 100);
  let dmg = 0;
  const ctrBonus = 1 + me.prof.counter * 0.30 * (opp.f.attributes.aggression / 100);
  for (let i = 0; i < landed; i++) dmg += perShot * ctrBonus * rnd(0.55, 1.5) * (opp.hurt > 0.4 ? T.DMG_HURT_MULT : 1);
  takeDamage(opp, dmg);
  me.stats.dmgDealt += dmg; myR.dmg += dmg;

  // flush shot -> hurt / knockdown / KO
  let flushP = T.FLUSH_BASE * me.prof.koThreat *
    (0.4 + T.FLUSH_POWER_K * eff(me, 'power') / (chinRes + 30)) *
    (1 - T.FLUSH_DEF_K * (eff(opp, 'strikingDefence') * 0.7 + eff(opp, 'fightIQ') * 0.3) / 130) *
    (1 + (1 - opp.health / 100) * T.HURT_HEALTH_K * 0.25) *
    (1 + me.prof.counter * 1.0 * (opp.prof.pressure * 0.6 + opp.f.attributes.aggression / 250));
  flushP = clamp(flushP, 0.003, 0.20);
  const flushRolls = Math.min(landed, 3);
  for (let i = 0; i < flushRolls; i++) {
    if (!chance(flushP)) continue;
    // flush landed: hurt escalates
    opp.hurt = clamp(opp.hurt + rnd(0.8, 1.6) * (1 + (1 - opp.health / 100) * 0.5), 0, 3);
    takeDamage(opp, perShot * 2.2);
    const survive = T.HEART_SURVIVE * (opp.f.attributes.heart / 100) + (opp.health / 100) * 0.35;
    if (chance(T.KD_FROM_FLUSH * (opp.hurt / 3 + 0.3) - survive * 0.3)) {
      opp.kd++; opp.stats.kd++; myR.kd++;
      logEv(rn, seg, 'STAND', `${last(me.f)} DROPS ${last(opp.f)} with a huge shot!`);
      // clean KO?
      if (chance(T.KO_ON_KD * (1 + (1 - opp.health / 100) * 0.5) - survive * 0.5)) {
        logEv(rn, seg, 'STAND', `${last(opp.f)} is out cold. It's all over!`);
        return { winner: side, method: 'KO', segIdx: seg };
      }
      // swarm for the TKO
      if (chance(T.TKO_FOLLOWUP * (1.1 - survive) + (me.f.attributes.aggression / 400))) {
        logEv(rn, seg, 'STAND', `${last(me.f)} swarms — the referee has seen enough. TKO!`);
        return { winner: side, method: 'TKO', segIdx: seg };
      }
      logEv(rn, seg, 'STAND', `${last(opp.f)} somehow survives and scrambles back up.`);
    } else if (chance(0.5)) {
      logEv(rn, seg, 'STAND', `${last(me.f)} hurts ${last(opp.f)} — big moment!`);
    }
  }

  // sustained one-sided beating -> referee steps in
  if ((opp.health < T.TKO_HEALTH && opp.hurt > 0.4 && landed >= 3) || (opp.health < 3 && landed >= 1)) {
    const survive = (opp.f.attributes.heart / 100) * 0.4 + opp.health / 60;
    if (chance(0.42 - survive * 0.3)) {
      logEv(rn, seg, 'STAND', `${last(opp.f)} is taking too much — the referee waves it off. TKO.`);
      return { winner: side, method: 'TKO', segIdx: seg };
    }
  }
  return null;
}

/* --------------------------- CLINCH segment -------------------------- */
function clinchSegment(A, B, R, rn, seg, champTax, logEv, setPos) {
  const ctrlA = eff(A, 'clinch') + A.f.attributes.strength * 0.4 + eff(A, 'wrestling') * 0.3;
  const ctrlB = eff(B, 'clinch') + B.f.attributes.strength * 0.4 + eff(B, 'wrestling') * 0.3;
  const aCtrl = sigmoid((ctrlA - ctrlB) / 12);
  const boss = chance(aCtrl) ? A : B;
  const under = boss === A ? B : A;
  const bossR = boss === A ? R.a : R.b;
  const bossSide = boss === A ? 'a' : 'b';

  (boss === A ? R.a : R.b).ctrl += T.SEG_SECONDS * 0.6;
  boss.stats.ctrlSec += T.SEG_SECONDS * 0.6;
  drain(A, (T.STAM_BASE_DRAIN + 1.2) * champTax); drain(B, (T.STAM_BASE_DRAIN + 1.2) * champTax);

  // dirty boxing / knees
  const landed = rndi(0, 3);
  if (landed) {
    const chinRes = under.f.attributes.chin * 0.7 + oppHidden(under).durability * 0.3;
    const dmg = landed * T.DMG_BASE * T.CLINCH_DMG * (0.5 + T.DMG_POWER_K * eff(boss, 'power') / 100) / (0.5 + T.DMG_CHIN_K * chinRes / 100);
    takeDamage(under, dmg);
    boss.stats.sigLanded += landed; boss.stats.sigThrown += landed + 1; boss.stats.dmgDealt += dmg;
    bossR.sig += landed; bossR.dmg += dmg;
    if (under.health < 7 && chance(0.25)) {
      logEv(rn, seg, 'CLINCH', `${last(boss.f)} breaks ${last(under.f)} down in the clinch — the referee steps in. TKO.`);
      return { winner: bossSide, method: 'TKO', segIdx: seg };
    }
  }

  // trip / clinch takedown
  const tripP = (boss.prof.tdIntent + T.CLINCH_TRIP_K * eff(boss, 'wrestling') / 200) * 0.5;
  if (chance(tripP)) {
    const def = eff(under, 'takedownDefence') * (1 + under.prof.sprawl);
    if (chance(clamp(T.TD_BASE + 0.1 + T.TD_SKILL_K * (sigmoid((eff(boss, 'wrestling') - def) / 14) - 0.5), 0.05, 0.9))) {
      boss.stats.td++; boss.stats.tdAtt++; bossR.td++;
      logEv(rn, seg, 'GROUND', `${last(boss.f)} drags ${last(under.f)} down from the clinch.`);
      setPos(boss === A ? 'groundA' : 'groundB');
      return null;
    }
    boss.stats.tdAtt++;
  }

  if (chance(T.CLINCH_SEP)) { setPos('stand'); }
  return null;
}

/* --------------------------- GROUND segment -------------------------- */
function groundSegment(top, bot, topR, botR, side, rn, seg, champTax, logEv, setPos) {
  // control time
  topR.ctrl += T.SEG_SECONDS * 0.8;
  top.stats.ctrlSec += T.SEG_SECONDS * 0.8;
  drain(top, (T.STAM_BASE_DRAIN + 0.8) * champTax);
  drain(bot, (T.STAM_BASE_DRAIN + T.STAM_GRAPPLE_DRAIN) * champTax * 0.7);

  // bottom fighter tries to get up / sweep first (wrestlers and scramblers escape)
  const escP = T.SWEEP_BASE +
    T.GROUND_CTRL_K * (sigmoid((eff(bot, 'wrestling') * 0.6 + eff(bot, 'takedownDefence') * 0.2 + bot.prof.scramble * 100 * 0.2
      - eff(top, 'groundControl')) / 13) - 0.5) +
    (bot.f.attributes.cardio - top.f.attributes.cardio) / 600;
  if (chance(clamp(escP, 0.03, 0.55))) {
    if (chance(0.22 * (1 + bot.prof.scramble))) {
      logEv(rn, seg, 'GROUND', `${last(bot.f)} scrambles and REVERSES position!`);
      setPos(side === 'a' ? 'groundB' : 'groundA');
    } else {
      logEv(rn, seg, 'GROUND', `${last(bot.f)} works back to the feet.`);
      setPos('stand');
    }
    return null;
  }

  // top decides: hunt the sub or drop bombs
  const wantSub = chance(top.prof.subHunt * 0.58 * (0.5 + eff(top, 'submissions') / 160));
  if (wantSub) {
    top.stats.subAtt++; topR.subAtt++;
    drain(top, T.SUB_ATTEMPT_COST * champTax);
    let p = T.SUB_BASE +
      T.SUB_SKILL_K * (sigmoid((eff(top, 'submissions') - eff(bot, 'submissionDefence')) / 12) - 0.5) +
      T.SUB_FATIGUE * Math.max(0, (45 - bot.stamina) / 45) * 0.5 +
      T.SUB_DAMAGE * Math.max(0, (40 - bot.health) / 40) * 0.5 +
      classEdge(top, bot) * 0.05;
    p = clamp(p, 0.008, 0.60);
    if (chance(p)) {
      logEv(rn, seg, 'GROUND', `${last(top.f)} locks it in — ${last(bot.f)} taps! Submission!`);
      return { winner: side, method: 'SUB', segIdx: seg };
    }
    if (chance(0.30)) {
      logEv(rn, seg, 'GROUND', `${last(top.f)} hunts a submission — ${last(bot.f)} defends well.`);
      if (chance(0.35)) setPos('stand'); // lost position going for it
    }
  } else {
    // ground and pound
    const thrown = Math.round(T.GNP_BASE * top.prof.gnp * (0.6 + top.stamina / 200));
    let landP = clamp(0.45 + (eff(top, 'groundControl') - eff(bot, 'submissionDefence') * 0.4 - eff(bot, 'takedownDefence') * 0.3) / 160, 0.15, 0.8);
    let landed = 0;
    for (let i = 0; i < thrown; i++) if (chance(landP)) landed++;
    top.stats.sigThrown += thrown;
    if (landed) {
      const chinRes = bot.f.attributes.chin * 0.7 + oppHidden(bot).durability * 0.3;
      const dmg = landed * T.DMG_BASE * T.GNP_DMG * (0.5 + T.DMG_POWER_K * eff(top, 'power') / 100) / (0.5 + T.DMG_CHIN_K * chinRes / 100);
      takeDamage(bot, dmg);
      if (dmg > 4.5) bot.hurt = clamp(bot.hurt + rnd(0.5, 1.0), 0, 3);
      top.stats.sigLanded += landed; top.stats.dmgDealt += dmg;
      topR.sig += landed; topR.dmg += dmg;
      if (bot.health < T.TKO_HEALTH + 2 && (bot.hurt > 0.3 || bot.health < 8) && landed >= 2) {
        const survive = (bot.f.attributes.heart / 100) * 0.4 + bot.health / 55;
        if (chance(0.45 - survive * 0.3)) {
          logEv(rn, seg, 'GROUND', `${last(bot.f)} isn't answering back — the referee stops it. TKO (ground and pound).`);
          return { winner: side, method: 'TKO', segIdx: seg };
        }
      }
    }
    // bottom sub off the back (grapplers are dangerous everywhere)
    if (chance(bot.prof.subHunt * 0.15)) {
      bot.stats.subAtt++; botR.subAtt++;
      let p = (T.SUB_BASE * 0.55) + T.SUB_SKILL_K * 0.7 * (sigmoid((eff(bot, 'submissions') - eff(top, 'submissionDefence')) / 12) - 0.5);
      p = clamp(p, 0.004, 0.30);
      if (chance(p)) {
        logEv(rn, seg, 'GROUND', `${last(bot.f)} snatches a submission OFF THE BACK — ${last(top.f)} taps! Incredible!`);
        return { winner: side === 'a' ? 'b' : 'a', method: 'SUB', segIdx: seg };
      }
    }
  }

  // referee stand-up for stalling
  if (chance(T.STANDUP_REF * (1 - top.prof.gnp * 0.4))) {
    logEv(rn, seg, 'STAND', `The referee stands them back up.`);
    setPos('stand');
  }
  return null;
}

/* ------------------------- hidden accessor -------------------------- */
function oppHidden(s) { return s.f.hidden || { durability: 60 }; }
function last(f) { return f.name.split(' ').pop(); }

/* ------------------------------ judging ------------------------------ */
function roundImpact(side) {
  return side.dmg * 1.0 + side.sig * 0.35 + side.kd * 16 +
    side.td * T.TD_POINT + side.subAtt * T.SUBATT_POINT + side.ctrl * T.CTRL_POINT;
}

function judgeFight(fa, fb, rounds) {
  const cards = [];
  for (let j = 0; j < 3; j++) {
    let a = 0, b = 0;
    rounds.forEach(R => {
      const ia = roundImpact(R.a) + rnd(-T.JUDGE_NOISE, T.JUDGE_NOISE) + (styleOf(fa).decision - 1) * 2;
      const ib = roundImpact(R.b) + rnd(-T.JUDGE_NOISE, T.JUDGE_NOISE) + (styleOf(fb).decision - 1) * 2;
      const margin = ia - ib;
      const kdEdge = R.a.kd - R.b.kd;
      if (Math.abs(margin) < 0.8 && !kdEdge) { // genuinely even round: judge leans
        if (chance(0.5)) a += 10, b += 9; else b += 10, a += 9;
      } else if (margin >= 0) {
        a += 10;
        b += (margin > T.TEN_EIGHT_MARGIN || (R.a.kd >= 1 && margin > T.TEN_EIGHT_MARGIN * 0.55)) ? 8 : 9;
      } else {
        b += 10;
        a += (-margin > T.TEN_EIGHT_MARGIN || (R.b.kd >= 1 && -margin > T.TEN_EIGHT_MARGIN * 0.55)) ? 8 : 9;
      }
    });
    cards.push({ a, b });
  }
  const aWins = cards.filter(c => c.a > c.b).length;
  const bWins = cards.filter(c => c.b > c.a).length;
  const draws = 3 - aWins - bWins;

  if (aWins === 3 || bWins === 3) {
    const aWon = aWins === 3;
    return { winnerId: aWon ? fa.id : fb.id, loserId: aWon ? fb.id : fa.id, draw: false, method: 'UD', scorecards: cards };
  }
  if (aWins === 2 && bWins === 1) return { winnerId: fa.id, loserId: fb.id, draw: false, method: 'SD', scorecards: cards };
  if (bWins === 2 && aWins === 1) return { winnerId: fb.id, loserId: fa.id, draw: false, method: 'SD', scorecards: cards };
  if (aWins === 2 && draws === 1) return { winnerId: fa.id, loserId: fb.id, draw: false, method: 'MD', scorecards: cards };
  if (bWins === 2 && draws === 1) return { winnerId: fb.id, loserId: fa.id, draw: false, method: 'MD', scorecards: cards };
  // scorecards level, but if the fight clearly was not, the judges find a winner
  const totA = rounds.reduce((s, R) => s + roundImpact(R.a), 0);
  const totB = rounds.reduce((s, R) => s + roundImpact(R.b), 0);
  if (Math.abs(totA - totB) > 7) {
    const aWon = totA > totB;
    const lv = cards.find(c => c.a === c.b);
    if (lv) { if (aWon) lv.a += 1; else lv.b += 1; }
    return { winnerId: aWon ? fa.id : fb.id, loserId: aWon ? fb.id : fa.id, draw: false, method: 'MD', scorecards: cards };
  }
  return { winnerId: null, loserId: null, draw: true, method: draws === 3 ? 'Draw' : 'Split Draw', scorecards: cards };
}

/* dominant = clear sweep or one-sided damage; feeds ELO + development */
function isDominant(res, fa, fb) {
  if (res.draw) return false;
  const wStats = res.winnerId === fa.id ? res.stats.a : res.stats.b;
  const lStats = res.winnerId === fa.id ? res.stats.b : res.stats.a;
  if (res.method !== 'UD' && res.method !== 'SD' && res.method !== 'MD') {
    return res.round <= Math.ceil(res.scheduled / 2) || wStats.dmgTaken < lStats.dmgTaken * 0.45;
  }
  if (res.method === 'UD' && res.scorecards) {
    const sweep = res.scorecards.every(c => (res.winnerId === fa.id ? c.a - c.b : c.b - c.a) >= res.rounds.length);
    return sweep;
  }
  return false;
}

/* ====================== excitement 5..100 ======================= */
function excitementScore(res, A, B) {
  const totalSig = A.stats.sigLanded + B.stats.sigLanded;
  const kd = A.stats.kd + B.stats.kd;
  const subs = A.stats.subAtt + B.stats.subAtt;
  let e = 26;
  e += clamp(totalSig / res.scheduled, 0, 50) * 0.55;
  e += kd * 9 + subs * 2.5;
  if (res.method === 'KO') e += 20;
  else if (res.method === 'TKO') e += 14;
  else if (res.method === 'SUB') e += 12;
  if (res.method === 'SD' || res.method === 'MD') e += 7;
  if (res.draw) e += 6;
  return clamp(Math.round(e), 5, 100);
}

/* ========================== summaries ============================ */
const METHOD_FULL = {
  KO: 'KO', TKO: 'TKO', SUB: 'submission',
  UD: 'unanimous decision', SD: 'split decision', MD: 'majority decision'
};
function buildSummary(fa, fb, res) {
  if (res.draw) {
    const med = medianCard(res.scorecards);
    return `${fa.name} and ${fb.name} fight to a ${res.method.toLowerCase()} (${med})`;
  }
  const w = res.winnerId === fa.id ? fa : fb, l = res.winnerId === fa.id ? fb : fa;
  if (res.timeStr === 'Decision') {
    const med = medianCard(res.scorecards, res.winnerId === fa.id);
    return `${w.name} def. ${l.name} by ${METHOD_FULL[res.method]} (${med})`;
  }
  return `${w.name} def. ${l.name} by ${METHOD_FULL[res.method]}, R${res.round} ${res.timeStr}`;
}
function medianCard(cards, aIsWinner) {
  if (!cards) return '';
  const sorted = cards.slice().sort((x, y) => (x.a - x.b) - (y.a - y.b));
  const m = sorted[1];
  if (aIsWinner === undefined) return `${m.a}-${m.b}`;
  return aIsWinner ? `${m.a}-${m.b}` : `${m.b}-${m.a}`;
}

/* ================= Monte Carlo booking estimate ==================
   Runs the real engine N times to see how the bookies would price it.
   Returns win/draw/method probabilities used to build betting odds. */
function estimateFight(a, b, opts) {
  opts = opts || {};
  const N = opts.samples || 300;
  let aw = 0, bw = 0, dr = 0;
  const meth = { a: { KO: 0, TKO: 0, SUB: 0, DEC: 0 }, b: { KO: 0, TKO: 0, SUB: 0, DEC: 0 } };
  let finRounds = 0, finishes = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateFight(a, b, opts);
    if (r.draw) { dr++; continue; }
    const side = r.winnerId === a.id ? 'a' : 'b';
    if (side === 'a') aw++; else bw++;
    const m = (r.method === 'UD' || r.method === 'SD' || r.method === 'MD') ? 'DEC' : r.method;
    meth[side][m]++;
    if (m !== 'DEC') { finishes++; finRounds += r.round; }
  }
  return {
    n: N,
    pA: aw / N, pB: bw / N, pDraw: dr / N,
    methodA: meth.a, methodB: meth.b,
    finishPct: finishes / N,
    avgFinishRound: finishes ? finRounds / finishes : 0
  };
}

/* ======================== betting odds =========================== */
/* Decimal odds from a true probability with the bookmaker's margin
   already applied per outcome. */
function decOdds(pTrue, margin) {
  const p = clamp(pTrue * (1 + margin), 0.005, 0.995);
  return 1 / p;
}
function toAmerican(dec) {
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}
function toFractional(dec) {
  const v = dec - 1;
  const fracs = [
    [1, 10], [1, 8], [1, 6], [1, 5], [1, 4], [2, 7], [3, 10], [1, 3], [2, 5], [4, 9], [1, 2],
    [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5],
    [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1],
    [7, 2], [4, 1], [9, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [12, 1], [14, 1],
    [16, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1], [66, 1], [80, 1], [100, 1]
  ];
  let best = fracs[0], bd = Infinity;
  fracs.forEach(fr => { const d = Math.abs(fr[0] / fr[1] - v); if (d < bd) { bd = d; best = fr; } });
  return `${best[0]}/${best[1]}`;
}
/* Build a full odds board from a Monte Carlo estimate. */
function buildOdds(est) {
  const MONEYLINE_MARGIN = 0.045;  // ~104.5% book on the two-way line
  const METHOD_MARGIN = 0.14;      // props are priced meaner, as in real books
  // fold draws into the moneyline the way books do (draw = tiny side market)
  const pA = est.pA / Math.max(0.0001, est.pA + est.pB);
  const pB = 1 - pA;
  const dA = decOdds(pA, MONEYLINE_MARGIN / 2), dB = decOdds(pB, MONEYLINE_MARGIN / 2);
  const method = side => {
    const src = side === 'a' ? est.methodA : est.methodB;
    const pWin = side === 'a' ? est.pA : est.pB;
    const total = Math.max(1, src.KO + src.TKO + src.SUB + src.DEC);
    const out = {};
    ['KO', 'TKO', 'SUB', 'DEC'].forEach(m => {
      const p = pWin * (src[m] / total);
      out[m] = p < 0.004 ? null : fmtOdds(decOdds(p, METHOD_MARGIN));
    });
    // combined KO/TKO line, the market people actually bet
    const pKoTko = pWin * ((src.KO + src.TKO) / total);
    out.KOTKO = pKoTko < 0.004 ? null : fmtOdds(decOdds(pKoTko, METHOD_MARGIN));
    return out;
  };
  return {
    a: fmtOdds(dA), b: fmtOdds(dB),
    impliedA: Math.round(pA * 100), impliedB: Math.round(pB * 100),
    methodA: method('a'), methodB: method('b'),
    finishPct: Math.round(est.finishPct * 100),
    drawPct: Math.round(est.pDraw * 1000) / 10
  };
}
function fmtOdds(dec) {
  return { dec: Math.round(dec * 100) / 100, us: toAmerican(dec), frac: toFractional(dec) };
}
