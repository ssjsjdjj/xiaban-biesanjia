'use strict';
// Consecutive-round scripted play. Controls may inspect visible tells/positions,
// but battle state is changed only by public inputs, start(), and update().
// These measurements describe the controllers, not human retention or win rates.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
const STRATEGIES = ['quick', 'charge', 'mixed', 'opportunist', 'circle'];
function random(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const mean = a => a.length ? +(a.reduce((s, n) => s + n, 0) / a.length).toFixed(2) : 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function moveAway(g, a) {
  const p = g.player, b = g.boss, angle = Math.atan2(p.y - b.y, p.x - b.x);
  let source = b;
  if (a.type === 'leap') source = { x: a.tx, y: a.ty };
  if (a.type === 'geyser') source = [...a.points].sort((x, y) => distance(p, x) - distance(p, y))[0];
  let dx = p.x - source.x, dy = p.y - source.y, d = Math.hypot(dx, dy);
  if (d < 4) { dx = -Math.sin(angle); dy = Math.cos(angle); d = 1; }
  // A thumb controller chooses a sideways escape when already near the rim.
  const edge = Math.hypot(p.x - 360, p.y - 363);
  if (edge > 260 && dx * (p.x - 360) + dy * (p.y - 363) > 0) { dx = -Math.sin(angle); dy = Math.cos(angle); d = 1; }
  return { x: dx / d, y: dy / d };
}
function runRound(g, strategy, roundIndex, errorSeed) {
  const rng = random(errorSeed), between = (a, b) => a + (b - a) * rng();
  const learning = roundIndex < 3 ? 'learning' : roundIndex >= 9 ? 'fatigue' : 'familiar';
  const sample = learning === 'learning' ? .13 : learning === 'fatigue' ? .14 : .09;
  const forgotten = learning === 'learning' ? .12 : learning === 'fatigue' ? .15 : .06;
  const tells = new Map(), waves = new Map(), phases = new Set([1]);
  let nextDecision = 0, nextAttack = .2, releaseAt = null, defenseUntil = 0, breakAt = null, executeAt = Infinity;
  const actions = { downs: 0, releases: 0, acceptedReleases: 0, quickReleases: 0, chargedReleases: 0, guardAttempts: 0, dashAttempts: 0, missedTells: 0, queuedSeconds: 0, maxQueuedWait: 0 };
  let observedQueue = null, queueAt = 0;
  for (let frame = 0; frame <= 60 / DT + 2 && g.state === 'playing'; frame++) {
    const now = g.time;
    if (now + 1e-6 >= nextDecision) {
      nextDecision += sample;
      const s = g.snapshot(), p = g.player, b = g.boss, a = g.attack;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
      let move = { x: 0, y: 0 }, defenseNow = false;
      if (strategy === 'circle') {
        const correction = (220 - d) / 95;
        move = { x: -dy / d * .82 + dx / d * correction, y: dx / d * .82 + dy / d * correction };
      } else {
        const desired = strategy === 'opportunist' && !(s.punish > 0 || s.riposte > 0) ? 225 : 145;
        if (d > desired) move = { x: dx / d, y: dy / d };
        else if (strategy === 'opportunist' && d < desired - 30) move = { x: -dx / d, y: -dy / d };
      }
      if (a) {
        if (!tells.has(a)) tells.set(a, { used: false, forgot: rng() < forgotten, threshold: between(.74, .93), readyAt: null });
        const plan = tells.get(a), ratio = a.elapsed / a.duration;
        const cue = roundIndex >= 3 ? a.red ? s.dodgeNow : s.parryNow : ratio >= plan.threshold;
        if (cue && plan.readyAt === null) plan.readyAt = now + between(.015, learning === 'fatigue' ? .11 : .075);
        if (!plan.used && plan.readyAt !== null && now >= plan.readyAt) {
          plan.used = true;
          if (plan.forgot) actions.missedTells++;
          else {
            if (a.red) { move = moveAway(g, a); g.movementInput(move.x, move.y); g.dash(); actions.dashAttempts++; }
            else { g.guard(); actions.guardAttempts++; }
            defenseNow = true; defenseUntil = now + Math.max(.15, a.duration - a.elapsed + .06); releaseAt = null;
          }
        }
        if (!plan.forgot && ratio > plan.threshold - .08) defenseNow = true;
      }
      for (const wave of g.rings) {
        if (!waves.has(wave)) waves.set(wave, { used: false, forgot: rng() < forgotten });
        const plan = waves.get(wave), rd = distance(p, wave) || 1;
        if (!plan.used && !wave.hit && rd - wave.radius < 65) {
          plan.used = true;
          if (!plan.forgot) {
            move = { x: (wave.x - p.x) / rd, y: (wave.y - p.y) / rd };
            g.movementInput(move.x, move.y); g.dash(); actions.dashAttempts++;
            defenseNow = true; defenseUntil = now + .28; releaseAt = null;
          } else actions.missedTells++;
        }
      }
      g.movementInput(move.x, move.y);
      if (s.broken > 0) {
        if (breakAt === null) { breakAt = now; executeAt = now + between(.25, learning === 'fatigue' ? 1.2 : .75); }
        if (now >= executeAt) { g.execute(); releaseAt = null; breakAt = null; nextAttack = now + .65; }
      } else {
        breakAt = null;
        const waitForOpening = strategy === 'opportunist' && !(s.punish > .15 || s.riposte > .1);
        if (!defenseNow && now >= defenseUntil && !waitForOpening) {
          if (g.attackHeld && releaseAt !== null && now >= releaseAt) {
            actions.releases++; actions[g.chargeTime > .18 ? 'chargedReleases' : 'quickReleases']++;
            if (g.attackUp()) actions.acceptedReleases++;
            releaseAt = null; nextAttack = now + between(.06, .15);
          } else if (!g.attackHeld && now >= nextAttack) {
            actions.downs++;
            if (g.attackDown() && g.attackHeld) {
              const heavy = strategy === 'charge' || strategy === 'opportunist' || strategy === 'mixed' && (s.punish > .75 || s.riposte > .5) || strategy === 'circle' && s.punish > .8;
              releaseAt = now + (heavy ? between(.47, .65) : between(.045, .12));
            }
            nextAttack = now + .1;
          }
        }
      }
    }
    if (g.queuedSlash) {
      actions.queuedSeconds += DT;
      if (g.queuedSlash !== observedQueue) { observedQueue = g.queuedSlash; queueAt = g.time; }
      actions.maxQueuedWait = Math.max(actions.maxQueuedWait, g.time - queueAt);
    } else observedQueue = null;
    g.update(DT); phases.add(g.phase);
  }
  assert.ok(g.result, 'a round must finish through the game rules');
  return { round: roundIndex + 1, strategy, learning, style: g.style.id, ...g.result, phases: [...phases], actions,
    attackHistory: g.attackHistory.map(x => ({ ...x })) };
}
function runSession(strategy, rounds = 12, encounterSeed = 0x56789a23) {
  let sounds = [], feedback = [];
  const g = new Nightfall({ getContext: () => ({}) }, { seed: encounterSeed, effects: false, onEvent(type, value) { if (type === 'sound') sounds.push(value); if (type === 'feedback') feedback.push(String(value)); } });
  const results = [];
  for (let i = 0; i < rounds; i++) {
    sounds = []; feedback = []; g.start();
    assert.equal(g.stats.damage, 0); assert.equal(g.player.hp, g.player.maxHp); assert.equal(g.time, 0);
    assert.equal(g.attack, null); assert.equal(g.input.x, 0); assert.equal(g.input.y, 0);
    const row = runRound(g, strategy, i, Math.imul(i + 1, 2654435761) >>> 0);
    const swingTypes = ['light1', 'light2', 'finisher', 'heavy', 'slash'];
    row.actualSwings = sounds.filter(s => swingTypes.includes(s)).length;
    row.whiffs = Math.max(0, row.actualSwings - row.stats.hits);
    row.busyFeedback = feedback.filter(s => /收刀后|处决中|尚未就绪/.test(s)).length;
    row.routeSignature = row.attackHistory.filter((a, index) => index > 0).slice(0, 7).map(a => a.type).join(',');
    results.push(row);
  }
  for (let i = 0; i + 2 < results.length; i += 3) assert.equal(new Set(results.slice(i, i + 3).map(r => r.style)).size, 3, 'the same instance must rotate all three styles');
  return results;
}
function summarize(sessions) {
  return sessions.map(rounds => ({ strategy: rounds[0].strategy, rounds: rounds.length, wins: rounds.filter(r => r.win).length,
    averageDuration: mean(rounds.map(r => r.time)), averageWinDuration: mean(rounds.filter(r => r.win).map(r => r.time)), averageDamage: mean(rounds.map(r => r.stats.damage)), averageHp: mean(rounds.map(r => r.hp)),
    averageSwings: mean(rounds.map(r => r.actualSwings)), averageWhiffs: mean(rounds.map(r => r.stats.whiffs ?? r.whiffs)), averageBusyFeedback: mean(rounds.map(r => r.busyFeedback)),
    averageDashRefunds: mean(rounds.map(r => r.stats.dashRefunds || 0)), maximumQueuedWait: +Math.max(...rounds.map(r => r.actions.maxQueuedWait)).toFixed(3),
    openingKinds: [...new Set(rounds.map(r => r.attackHistory[0]?.type))],
    uniqueFirstSevenRoutesAfterOpening: new Set(rounds.map(r => r.routeSignature)).size,
    styleCounts: Object.fromEntries(['hunter', 'warden', 'trickster'].map(s => [s, rounds.filter(r => r.style === s).length])),
    thirdByStage: ['learning', 'familiar', 'fatigue'].map(stage => ({ stage, rounds: rounds.filter(r => r.learning === stage).length,
      wins: rounds.filter(r => r.learning === stage && r.win).length, averageDuration: mean(rounds.filter(r => r.learning === stage).map(r => r.time)) })) }));
}
if (require.main === module) {
  const sessions = STRATEGIES.map(strategy => runSession(strategy));
  const report = { note: 'Consecutive rounds on the same game instance; scripted control models, not human playtest win rates.', rounds: sessions.flat().length, summary: summarize(sessions), sessions: process.argv.includes('--summary') ? undefined : sessions };
  console.log(JSON.stringify(report, null, 2));
}
module.exports = { runSession, summarize, STRATEGIES };
