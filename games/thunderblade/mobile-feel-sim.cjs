'use strict';
// Scripted, imperfect perception/control models. These are NOT human playtest data.
// The controller reads positions/tells for simulated perception and changes battle
// state only through movementInput/attackDown/attackUp/guard/dash/execute/update.
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
const profiles = {
  beginner: { sample: .18, guardAt: .65, jitter: .15, forget: .22, redForget: .25, lightOnly: true, executionDelay: [ .6, 2.7 ], chargeRange: [.42, .7], defensePriority: false },
  beginner_cued: { sample: .18, guardAt: .65, jitter: .15, forget: .22, redForget: .25, lightOnly: true, executionDelay: [ .6, 2.7 ], chargeRange: [.42, .7], defensePriority: false, useCues: true },
  intermediate: { sample: .10, guardAt: .84, jitter: .12, forget: .08, redForget: .1, lightOnly: false, executionDelay: [.3, 1.1], chargeRange: [.45, .7], defensePriority: true },
  expert: { sample: .05, guardAt: .92, jitter: .025, forget: .02, redForget: .02, lightOnly: false, executionDelay: [.15, .5], chargeRange: [.53, .65], defensePriority: true }
};
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function run(profileName, seed = 1, engineOptions = {}) {
  const config = profiles[profileName], rng = random(seed), between = (a, b) => a + (b - a) * rng();
  // Adjacent tiny LCG seeds have similar first samples, so spread encounter seeds
  // across uint32 space while keeping controller-error seeds stable for comparisons.
  const encounterSeed = Math.imul(seed, 2654435761) >>> 0;
  const g = new Nightfall({ getContext: () => ({}) }, { seed: encounterSeed, ...engineOptions }); g.start();
  const phases = new Set([1]), tells = new Map(), ringPlans = new Map();
  const actions = { quickReleases: 0, partialChargeReleases: 0, fullChargeReleases: 0, guardAttempts: 0, dashAttempts: 0, missedTells: 0, lateReleases: 0 };
  let nextDecision = 0, nextAttackAt = .25, releaseAt = null, breakSeenAt = null, executeAt = Infinity;
  let defendedUntil = 0;
  for (let frame = 0; frame <= 60 / DT + 2 && g.state === 'playing'; frame++) {
    const now = frame * DT;
    if (now + 1e-6 >= nextDecision) {
      nextDecision += config.sample;
      const s = g.snapshot(), a = g.attack;
      let dx = g.boss.x - g.player.x, dy = g.boss.y - g.player.y;
      const dist = Math.hypot(dx, dy) || 1;
      let moveX = dist > 145 ? dx / dist : 0, moveY = dist > 145 ? dy / dist : 0;
      let defenseNow = false;
      if (a) {
        if (!tells.has(a)) {
          tells.set(a, { threshold: Math.max(.45, Math.min(.99, config.guardAt + between(-config.jitter, config.jitter))), forgot: rng() < (a.red ? config.redForget : config.forget), used: false });
        }
        const plan = tells.get(a), ratio = a.elapsed / a.duration;
        const responseReady = config.useCues ? a.red ? s.dodgeNow : s.parryNow : ratio >= plan.threshold;
        if (!plan.used && responseReady) {
          plan.used = true;
          if (plan.forgot) actions.missedTells++;
          else {
            if (a.red) {
              // Move away from danger instead of an unrealistic dash into the boss.
              moveX = -dx / dist; moveY = -dy / dist;
              if (a.type === 'geyser' && Array.isArray(a.points) && a.points.length) {
                const target = [...a.points].sort((one, two) => Math.hypot(g.player.x - one.x, g.player.y - one.y) - Math.hypot(g.player.x - two.x, g.player.y - two.y))[0];
                const awayX = g.player.x - target.x, awayY = g.player.y - target.y, away = Math.hypot(awayX, awayY);
                if (away > 4) { moveX = awayX / away; moveY = awayY / away; }
                else { moveX = -dy / dist; moveY = dx / dist; }
              }
              g.movementInput(moveX, moveY); g.dash(); actions.dashAttempts++;
            } else { g.guard(); actions.guardAttempts++; }
            defenseNow = true; defendedUntil = now + Math.max(.10, a.duration - a.elapsed + .05);
            // Real input cancels the current hold; forget the pending release too.
            releaseAt = null;
          }
        }
        if (config.defensePriority && ratio > plan.threshold - .12 && !plan.forgot) defenseNow = true;
      }
      for (const ring of g.rings) {
        if (!ringPlans.has(ring)) ringPlans.set(ring, { forgot: rng() < config.redForget, used: false, range: between(40, 95) });
        const plan = ringPlans.get(ring), gap = Math.hypot(g.player.x - ring.x, g.player.y - ring.y) - ring.radius;
        if (!plan.used && !ring.hit && (config.useCues ? s.dodgeNow : gap < plan.range)) {
          plan.used = true;
          if (!plan.forgot) {
            // Cross towards the source; a ring cannot be parried.
            const d = Math.hypot(g.player.x - ring.x, g.player.y - ring.y) || 1;
            moveX = (ring.x - g.player.x) / d; moveY = (ring.y - g.player.y) / d;
            g.movementInput(moveX, moveY); g.dash(); actions.dashAttempts++; defenseNow = true; defendedUntil = now + .3; releaseAt = null;
          } else actions.missedTells++;
        }
      }
      g.movementInput(moveX, moveY);
      if (s.broken > 0) {
        if (breakSeenAt === null) { breakSeenAt = now; executeAt = now + between(...config.executionDelay); }
        if (now >= executeAt) { g.execute(); breakSeenAt = null; releaseAt = null; nextAttackAt = now + .7; }
      } else {
        breakSeenAt = null;
        const waitingForDefense = config.defensePriority && (defenseNow || now < defendedUntil);
        if (!waitingForDefense) {
          if (g.attackHeld && releaseAt !== null && now >= releaseAt) {
            const held = g.chargeTime;
            g.attackUp(); actions[held >= .52 ? 'fullChargeReleases' : held > .18 ? 'partialChargeReleases' : 'quickReleases']++;
            if (now - releaseAt > .08) actions.lateReleases++;
            releaseAt = null; nextAttackAt = now + (config.lightOnly ? between(.12, .28) : between(.05, .15));
          } else if (!g.attackHeld && now >= nextAttackAt) {
            const accepted = g.attackDown();
            if (accepted !== false && g.attackHeld) releaseAt = now + (config.lightOnly ? between(.05, .13) : between(...config.chargeRange));
            nextAttackAt = now + .1;
          }
        }
      }
    }
    g.update(DT); phases.add(g.phase);
  }
  if (!g.result) throw new Error('Controller did not reach a terminal outcome');
  return { profile: profileName, seed, encounterSeed: engineOptions.seed ?? encounterSeed, ...g.result, phases: [...phases], actions, style: g.style || null, styleName: g.styleName || null,
    attackHistory: Array.isArray(g.attackHistory) ? g.attackHistory.map(a => ({ ...a })) : [] };
}
function summarize(runs) {
  return Object.keys(profiles).map(profile => {
    const cases = runs.filter(r => r.profile === profile), average = key => +(cases.reduce((total, r) => total + key(r), 0) / cases.length).toFixed(2);
    return { profile, scriptedCases: cases.length, wins: cases.filter(r => r.win).length,
      averageDuration: average(r => r.time), averageDamage: average(r => r.stats.damage),
      averageParries: average(r => r.stats.parries), averageExecutions: average(r => r.stats.executions),
      reachedFinalPhase: cases.filter(r => r.phases.includes(3)).length,
      fastestWin: Math.min(...cases.filter(r => r.win).map(r => r.time), Infinity),
      hpAtFinish: average(r => r.hp) };
  });
}
function inspectHeldMovement() {
  const g = new Nightfall({ getContext: () => ({}) }); g.start();
  for (let frame = 0; frame < 10 / DT && g.state === 'playing'; frame++) {
    if (g.broken > 0) {
      g.movementInput(1, 0);
      const before = Math.hypot(g.input.x, g.input.y), accepted = g.execute();
      return { executed: accepted, movementBefore: before, movementAfter: Math.hypot(g.input.x, g.input.y), retained: Math.hypot(g.input.x, g.input.y) > .1 };
    }
    const dx = g.boss.x - g.player.x, dy = g.boss.y - g.player.y, dist = Math.hypot(dx, dy) || 1;
    g.movementInput(dist > 145 ? dx / dist : 0, dist > 145 ? dy / dist : 0);
    if (!g.attackHeld) g.attackDown(); else if (g.chargeTime >= .54) g.attackUp();
    if (g.attack && g.attack.duration - g.attack.elapsed < .12) g.attack.red ? g.dash() : g.guard();
    g.update(DT);
  }
  throw new Error('Unable to reach a natural execution for held-movement probe');
}
if (require.main === module) {
  const runs = Object.keys(profiles).flatMap(profile => Array.from({ length: 12 }, (_, i) => run(profile, i + 1)));
  console.log(JSON.stringify({ note: 'Scripted imperfect controllers; not human playtest win rates.', heldMovementAcrossExecution: inspectHeldMovement(), summary: summarize(runs), runs: process.argv.includes('--summary') ? undefined : runs }, null, 2));
}
module.exports = { run, summarize, profiles, inspectHeldMovement };
