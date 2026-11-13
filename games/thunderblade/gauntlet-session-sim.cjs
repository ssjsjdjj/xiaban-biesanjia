'use strict';
// A visible-state controller for whole challenges. No HP, stats, timers or boss
// state are assigned here: every run advances through public inputs and update.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
const STRATEGIES = ['adaptive', 'light_defense', 'charge', 'learning', 'quick'];
const mean = values => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function random(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function escape(g, a) {
  const p = g.player, b = g.boss;
  let source = b;
  if (a.type === 'leap') source = { x: a.tx, y: a.ty };
  if (a.points?.length) source = a.points.slice().sort((x, y) => distance(p, x) - distance(p, y))[0];
  let dx = p.x - source.x, dy = p.y - source.y, d = Math.hypot(dx, dy);
  if (d < 8) { dx = p.y - b.y || 1; dy = -(p.x - b.x); d = Math.hypot(dx, dy); }
  if (Math.hypot(p.x - 360, p.y - 363) > 245 && dx * (p.x - 360) + dy * (p.y - 363) > 0) {
    const angle = Math.atan2(p.y - b.y, p.x - b.x); dx = -Math.sin(angle); dy = Math.cos(angle); d = 1;
  }
  return { x: dx / d, y: dy / d };
}
function runStage(g, strategy, runIndex, seed) {
  const rng = random(seed), sample = strategy === 'learning' ? .17 : runIndex < 4 ? .115 : runIndex >= 9 ? .13 : .085;
  const forgetChance = strategy === 'learning' ? .28 : runIndex < 4 ? .10 : runIndex >= 9 ? .12 : .05;
  const plans = new Map(), waves = new Map(), phases = new Set([1]);
  const actions = { swings: 0, accepted: 0, guards: 0, dashes: 0, forgotten: 0, armorHits: 0, maxQueuedWait: 0 };
  let decisionAt = 0, releaseAt = Infinity, nextSwingAt = .2, defenseUntil = 0, executeAt = Infinity, observedBreak = false, observedQueue = null, queueAt = 0;
  let armorOpenSeen = false, armorClosedSeen = false, outOfRangeSeconds = 0, currentChase = 0, maxChase = 0;
  const bossId = g.bossId, stage = g.snapshot().stageNumber;
  for (let frame = 0; frame <= 60 / DT + 3 && g.state === 'playing'; frame++) {
    const now = g.time;
    if (now + 1e-6 >= decisionAt) {
      decisionAt += sample;
      const s = g.snapshot(), p = g.player, b = g.boss, a = g.attack;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      const target = 145;
      let move = d > target ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
      let defendNow = false;
      // This comparison profile always releases the short tap before planning
      // defense; waiting through a tell must not turn it into a charged strike.
      if (strategy === 'light_defense' && g.attackHeld && now >= releaseAt) {
        actions.swings++; if (g.attackUp()) actions.accepted++; releaseAt = Infinity; nextSwingAt = now + .055 + rng() * .09;
      }
      if (strategy !== 'quick' && a) {
        if (!plans.has(a)) plans.set(a, { used: false, forgot: rng() < forgetChance, at: null });
        const plan = plans.get(a);
        if ((a.red ? s.dodgeNow : s.parryNow) && plan.at === null) plan.at = now + .015 + rng() * (strategy === 'learning' ? .17 : .065);
        if (!plan.used && plan.at !== null && now >= plan.at) {
          plan.used = true;
          if (plan.forgot) actions.forgotten++;
          else {
            if (a.red) { move = escape(g, a); g.movementInput(move.x, move.y); g.dash(); actions.dashes++; }
            else { g.guard(); actions.guards++; }
            defendNow = true; defenseUntil = now + Math.max(.16, a.duration - a.elapsed + .06); releaseAt = Infinity;
          }
        }
        if (!plan.forgot && a.duration - a.elapsed < .32) defendNow = true;
      }
      if (strategy !== 'quick') for (const ring of g.rings) {
        if (!waves.has(ring)) waves.set(ring, { used: false, forgot: rng() < forgetChance });
        const plan = waves.get(ring), dRing = distance(p, ring) || 1;
        if (!plan.used && !ring.hit && Math.abs(dRing - ring.radius) < 68) {
          plan.used = true;
          if (plan.forgot) actions.forgotten++;
          else {
            move = { x: (ring.x - p.x) / dRing, y: (ring.y - p.y) / dRing };
            g.movementInput(move.x, move.y); g.dash(); actions.dashes++; defendNow = true; defenseUntil = now + .28; releaseAt = Infinity;
          }
        }
      }
      g.movementInput(move.x, move.y);
      armorOpenSeen ||= s.armorOpen > 0; armorClosedSeen ||= s.armor > 0;
      if (s.broken > 0) {
        if (!observedBreak) { observedBreak = true; executeAt = now + .2 + rng() * .55; }
        if (now >= executeAt) { g.execute(); observedBreak = false; releaseAt = Infinity; nextSwingAt = now + .65; }
      } else {
        observedBreak = false;
        if (!defendNow && now >= defenseUntil) {
          if (g.attackHeld && now >= releaseAt) {
            actions.swings++; if (g.attackUp()) actions.accepted++; releaseAt = Infinity; nextSwingAt = now + .055 + rng() * .09;
          } else if (!g.attackHeld && now >= nextSwingAt) {
            if (g.attackDown() && g.attackHeld) {
              const heavy = strategy === 'charge' || ['adaptive', 'learning'].includes(strategy) && (bossId === 'colossus' || s.punish > .7 || s.riposte > .4);
              releaseAt = now + (heavy ? strategy === 'learning' ? .38 + rng() * .28 : .50 + rng() * .11 : .045 + rng() * .055);
              if (heavy && s.armor > 0) actions.armorHits++;
            }
            nextSwingAt = now + .1;
          }
        }
      }
    }
    if (g.queuedSlash) {
      if (g.queuedSlash !== observedQueue) { observedQueue = g.queuedSlash; queueAt = now; }
      actions.maxQueuedWait = Math.max(actions.maxQueuedWait, now - queueAt);
    } else observedQueue = null;
    if (distance(g.player, g.boss) > 214) { outOfRangeSeconds += DT; currentChase += DT; maxChase = Math.max(maxChase, currentChase); }
    else currentChase = 0;
    g.update(DT); phases.add(g.phase);
  }
  assert.notEqual(g.state, 'playing', 'stage must terminate under its real time limit');
  assert.ok(Number.isFinite(g.player.hp) && g.player.hp >= 0 && g.player.hp <= 100, 'health stays within the visible maximum');
  const dangerTimes = g.attackLog.filter(a => a.red).map(a => a.time);
  for (let i = 1; i < dangerTimes.length; i++) assert.ok(dangerTimes[i] - dangerTimes[i - 1] >= 1.2 - DT, 'red attacks leave a real dodge recovery interval');
  assert.ok(g.effects.length <= 100 && g.texts.length <= 24, 'a whole stage cannot accumulate unbounded effects');
  return { bossId, stage, time: +g.time.toFixed(2), hp: g.player.hp, bossHp: g.boss.hp, won: g.boss.hp <= 0,
    stats: { ...g.stats }, actions, phases: [...phases], armorOpenSeen, armorClosedSeen,
    outOfRangeSeconds: +outOfRangeSeconds.toFixed(2), maxChase: +maxChase.toFixed(2),
    attacks: g.attackHistory.map(a => a.type), routeSignature: g.attackHistory.slice(0, 8).map(a => a.type).join(',') };
}
function runChallenge(strategy = 'adaptive', runIndex = 0, seed = 0x8a6213bd) {
  const feedback = [], sounds = [];
  const g = new Nightfall({ getContext: () => ({}) }, { seed, effects: false,
    onEvent(type, value) { if (type === 'feedback') feedback.push(String(value)); if (type === 'sound') sounds.push(value); } });
  g.startChallenge();
  const stages = [], rests = [];
  for (let stage = 0; stage < 3 && g.state === 'playing'; stage++) {
    stages.push(runStage(g, strategy, runIndex, (seed ^ Math.imul(stage + 1, 2654435761)) >>> 0));
    if (g.state === 'intermission') {
      const s = g.snapshot(), hpBefore = g.player.hp, frozenTime = g.time;
      for (let frame = 0; frame < 240; frame++) g.update(DT);
      assert.equal(g.time, frozenTime, 'rest must freeze combat time');
      assert.equal(g.player.hp, hpBefore, 'rest must not drain or regenerate health over time');
      const choice = g.player.hp < (strategy === 'learning' ? 88 : 72) ? 'heal' : 'power';
      assert.equal(g.continueChallenge(choice), true, 'a rest choice should start the next stage');
      assert.equal(g.attackHeld, false); assert.equal(g.queuedSlash, null);
      rests.push({ after: stage + 1, hpBefore, choice, hpAfter: g.player.hp, powerBonus: g.snapshot().powerBonus, nextBoss: s.nextBoss?.name });
    }
  }
  assert.ok(g.result, 'a complete challenge must produce a final result');
  assert.equal(g.result.stages.length, stages.length, 'the final scoreboard retains each completed or failed boss');
  assert.equal(g.result.cleared, stages.filter(stage => stage.won).length);
  return { strategy, run: runIndex + 1, seed, win: g.result.win, cleared: g.result.cleared,
    time: g.result.time, score: g.result.score, hp: g.result.hp, stages, rests,
    busyFeedback: feedback.filter(s => /收刀后|尚未就绪|处决中/.test(s)).length,
    heavySounds: sounds.filter(s => s === 'heavy').length };
}
function runSession(rounds = 12) {
  const rng = random(0x3278d1ab), seeds = Array.from({ length: rounds }, () => Math.floor(rng() * 4294967296) >>> 0);
  return STRATEGIES.flatMap(strategy => seeds.map((seed, index) => runChallenge(strategy, index, seed)));
}
function summarize(runs) {
  return STRATEGIES.map(strategy => {
    const rows = runs.filter(r => r.strategy === strategy);
    return { strategy, challenges: rows.length, clears: rows.filter(r => r.win).length,
      averageClearedBosses: mean(rows.map(r => r.cleared)), averageTime: mean(rows.map(r => r.time)), averageHp: mean(rows.map(r => r.hp)),
      averageBusyFeedback: mean(rows.map(r => r.busyFeedback)),
      bosses: ['duelist', 'archer', 'colossus'].map(bossId => {
        const stages = rows.flatMap(r => r.stages).filter(s => s.bossId === bossId);
        return { bossId, reached: stages.length, defeated: stages.filter(s => s.won).length, averageTime: mean(stages.map(s => s.time)),
          maximumTime: stages.length ? Math.max(...stages.map(s => s.time)) : 0,
          attackKinds: [...new Set(stages.flatMap(s => s.attacks))], uniqueFirstEightRoutes: new Set(stages.map(s => s.routeSignature)).size,
          armorOpened: stages.filter(s => s.armorOpenSeen).length, averageWhiffs: mean(stages.map(s => s.stats.whiffs)),
          averageParries: mean(stages.map(s => s.stats.parries)), averageExecutions: mean(stages.map(s => s.stats.executions)),
          averageOutOfRangeSeconds: mean(stages.map(s => s.outOfRangeSeconds)), maximumChase: stages.length ? Math.max(...stages.map(s => s.maxChase)) : 0,
          maxQueuedWait: stages.length ? +Math.max(...stages.map(s => s.actions.maxQueuedWait)).toFixed(3) : 0 };
      }) };
  });
}
if (require.main === module) {
  const runs = runSession();
  console.log(JSON.stringify({ note: 'Whole three-boss challenges via public controls; scripts are not human win rates or retention data.', challenges: runs.length, summary: summarize(runs), runs: process.argv.includes('--summary') ? undefined : runs }, null, 2));
}
module.exports = { runChallenge, runSession, runStage, summarize, STRATEGIES };
