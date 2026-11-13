'use strict';
// Boundary fixtures deliberately place combat state at transitions. Actual play
// simulations live in gauntlet-session-sim.cjs and never use these fixtures.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function make() {
  const events = [];
  const g = new Nightfall({ getContext: () => ({}) }, { seed: 734923, effects: false, onEvent(type, data) { events.push({ type, data }); } });
  g.startChallenge(); return { g, events };
}
function step(g, seconds) { for (let frame = 0; frame < Math.ceil(seconds / DT); frame++) g.update(Math.min(DT, seconds - frame * DT)); }
function winFixture(g) { g.boss.hp = 1; g.damageBoss(1, 0); }
function archerFixture() { const out = make(); winFixture(out.g); out.g.continueChallenge('power'); return out; }
function colossusFixture() { const out = archerFixture(); winFixture(out.g); out.g.continueChallenge('power'); return out; }
function fullCharge(g) { assert.equal(g.attackDown(), true); step(g, .54); assert.equal(g.attackUp(), true); }
check('challenge starts with a fresh first boss and exposes the whole route', () => {
  const { g } = make(), s = g.snapshot();
  assert.equal(s.challenge, true); assert.equal(s.stageIndex, 0); assert.equal(s.stageNumber, 1); assert.equal(s.stageCount, 3);
  assert.equal(s.bossId, 'duelist'); assert.equal(s.sceneId, 'rain'); assert.equal(s.cleared, 0);
  assert.equal(s.hp, 100); assert.equal(s.bossHp, 3000); assert.equal(s.time, 0); assert.equal(s.powerBonus, 0);
  assert.ok(s.bossName); assert.ok(s.bossHint); assert.equal(g.result, null);
});
check('a stage win freezes into an intermission and cancels all held combat input', () => {
  const { g, events } = make();
  g.player.hp = 37; g.movementInput(1, .5); g.attackDown(); g.queuedDefense = { type: 'dash', life: .1 };
  winFixture(g);
  assert.equal(g.state, 'intermission'); assert.equal(g.result, null); assert.equal(g.player.hp, 45);
  assert.equal(g.attackHeld, false); assert.equal(g.queuedSlash, null); assert.equal(g.queuedDefense, null);
  assert.deepEqual(g.input, { x: 0, y: 0 }); assert.equal(g.attack, null); assert.equal(g.rings.length, 0);
  assert.equal(events.filter(e => e.type === 'intermission').length, 1); assert.equal(events.filter(e => e.type === 'result').length, 0);
  const before = JSON.stringify(g.snapshot()); step(g, 3);
  assert.equal(JSON.stringify(g.snapshot()), before);
  assert.equal(g.attackDown(), false); assert.equal(g.guard(), false); assert.equal(g.dash(), false);
  assert.equal(g.snapshot().nextBoss.name.length > 0, true);
});
check('rest choice restores actual missing health and resets the stage timer', () => {
  const { g } = make(); g.player.hp = 37; g.time = 24; winFixture(g);
  assert.equal(g.continueChallenge('heal'), true);
  const s = g.snapshot();
  assert.equal(s.bossId, 'archer'); assert.equal(s.sceneId, 'bamboo'); assert.equal(s.stageNumber, 2); assert.equal(s.hp, 77);
  assert.equal(s.time, 0); assert.equal(s.remaining, 60); assert.equal(s.cleared, 1); assert.equal(s.totalTime, 24);
  assert.equal(s.bossHp, 3400); assert.equal(s.powerBonus, 0);
  assert.equal(g.continueChallenge('heal'), false, 'the same rest cannot be selected twice');
});
check('healing cannot exceed max health and power carries into the next boss', () => {
  const { g } = make(); g.player.hp = 95; winFixture(g); g.continueChallenge('heal'); assert.equal(g.player.hp, 100);
  winFixture(g); assert.equal(g.continueChallenge('power'), true);
  assert.equal(g.snapshot().bossId, 'colossus'); assert.equal(g.snapshot().sceneId, 'forge');
  assert.ok(Math.abs(g.snapshot().powerBonus - .12) < 1e-9);
  const { g: powered } = colossusFixture(); assert.ok(Math.abs(powered.snapshot().powerBonus - .24) < 1e-9);
});
check('three wins produce one aggregate result with all boss records', () => {
  const { g, events } = make();
  for (let stage = 0; stage < 3; stage++) { g.time = 10 + stage; winFixture(g); if (stage < 2) g.continueChallenge('power'); }
  assert.equal(g.state, 'won'); assert.equal(g.result.win, true); assert.equal(g.result.challenge, true);
  assert.equal(g.result.cleared, 3); assert.equal(g.result.stages.length, 3); assert.equal(g.result.time, 33);
  assert.equal(events.filter(e => e.type === 'result').length, 1);
  assert.equal(g.result.score, g.result.stages.reduce((sum, stage) => sum + stage.score, 0));
  const before = JSON.stringify({ s: g.snapshot(), result: g.result }); step(g, 1);
  g.attackDown(); g.guard(); g.dash(); g.continueChallenge('heal');
  assert.equal(JSON.stringify({ s: g.snapshot(), result: g.result }), before);
});
check('second-stage defeat preserves prior clear and produces a final result', () => {
  const { g, events } = archerFixture(); g.player.inv = 0; g.hurt(1000, false);
  assert.equal(g.state, 'lost'); assert.equal(g.result.win, false); assert.equal(g.result.cleared, 1);
  assert.equal(g.result.hp, 0); assert.equal(g.result.stages.length, 2);
  assert.equal(events.filter(e => e.type === 'result').length, 1); assert.equal(g.continueChallenge('heal'), false);
});
check('timeout ends the active stage once without entering the next fight', () => {
  const { g, events } = archerFixture(); g.time = 60 - DT / 2; g.update(DT);
  assert.equal(g.state, 'lost'); assert.equal(g.result.cleared, 1); assert.equal(g.result.remaining, 0);
  assert.equal(events.filter(e => e.type === 'result').length, 1); assert.equal(g.snapshot().stageNumber, 2);
});
check('restart and home discard the previous route, injuries and power', () => {
  const { g } = colossusFixture(); g.player.hp = 31; g.startChallenge();
  assert.equal(g.snapshot().stageNumber, 1); assert.equal(g.player.hp, 100); assert.equal(g.snapshot().powerBonus, 0);
  assert.equal(g.snapshot().cleared, 0); assert.equal(g.snapshot().totalTime, 0);
  g.home(); assert.equal(g.state, 'menu'); assert.equal(g.attackHeld, false);
  g.start(); assert.equal(g.snapshot().challenge, false); assert.equal(g.boss.hp, 5200);
});
check('archer volley has three distinct, finite lanes and can be reflected by a timed guard', () => {
  const { g } = archerFixture(); g.route = ['volley']; g.routeIndex = 0; g.beginAttack('volley');
  const a = g.attack;
  assert.equal(a.red, false); assert.equal(a.lanes.length, 3); assert.equal(a.halfWidth, 23);
  for (const lane of a.lanes) for (const key of ['x', 'y', 'ex', 'ey']) assert.ok(Number.isFinite(lane[key]));
  assert.equal(new Set(a.lanes.map(lane => Math.atan2(lane.ey - lane.y, lane.ex - lane.x).toFixed(3))).size, 3);
  const hp = g.boss.hp; g.guard(); g.resolveAttack(a);
  assert.equal(g.stats.parries, 1); assert.ok(hp - g.boss.hp >= 180); assert.equal(g.player.hp, 100);
});
check('archer starts beyond sword range and creates space when a close player rushes the bow', () => {
  const { g } = archerFixture();
  assert.ok(Math.hypot(g.player.x - g.boss.x, g.player.y - g.boss.y) > 250, 'a ranged boss must not spawn within heavy-slash range');
  g.player.x = g.boss.x; g.player.y = g.boss.y + 145;
  g.route = ['volley']; g.routeIndex = 0; g.beginAttack('volley');
  const d = Math.hypot(g.player.x - g.boss.x, g.player.y - g.boss.y);
  assert.ok(d > 214, 'the visible retreat must actually leave both light assist and heavy reach');
  const locked = JSON.stringify(g.attack.lanes), x = g.player.x;
  g.movementInput(1, 0); step(g, .25);
  assert.ok(g.player.x > x); assert.equal(JSON.stringify(g.attack.lanes), locked, 'lateral movement can escape an already locked lane');
});
check('archer sidestep changes position before locking one wider, readable arrow lane', () => {
  const { g } = archerFixture(), before = { x: g.boss.x, y: g.boss.y };
  g.route = ['sidestep']; g.routeIndex = 0; g.beginAttack('sidestep');
  const a = g.attack;
  assert.ok(Math.hypot(g.boss.x - before.x, g.boss.y - before.y) > 75);
  assert.equal(a.lanes.length, 1); assert.equal(a.halfWidth, 34); assert.equal(a.duration, 1.35);
  assert.equal(a.lanes[0].x, g.boss.x); assert.equal(a.lanes[0].y, g.boss.y);
  const locked = JSON.stringify(a.lanes); g.movementInput(1, 0); step(g, .25);
  assert.equal(JSON.stringify(a.lanes), locked, 'arrow direction must not silently track after its tell locks');
});
check('an archer pinned against the rim sidesteps instead of losing its retreat', () => {
  const { g } = archerFixture(); g.boss.x = 360; g.boss.y = 133; g.player.x = 360; g.player.y = 260;
  const from = { x: g.boss.x, y: g.boss.y }; g.beginAttack('volley');
  assert.ok(Math.hypot(g.boss.x - from.x, g.boss.y - from.y) > 100);
  assert.ok(Math.hypot(g.boss.x - 360, g.boss.y - 363) <= 230.001);
  assert.ok(g.attack.lanes.every(lane => lane.x === g.boss.x && lane.y === g.boss.y));
});
check('two full charged hits open colossus armor and light attacks alone do not', () => {
  const { g } = colossusFixture(); g.nextAttack = 100; g.player.x = g.boss.x; g.player.y = g.boss.y + 120;
  assert.equal(g.snapshot().armor, 2); g.slash(false, 0); assert.equal(g.snapshot().armor, 2);
  step(g, .7); fullCharge(g); assert.equal(g.snapshot().armor, 1); assert.equal(g.snapshot().armorOpen, 0);
  step(g, .7); fullCharge(g); assert.equal(g.snapshot().armor, 0); assert.ok(g.snapshot().armorOpen > 7.9);
  assert.ok(g.stats.damage > 0); step(g, 8.1); assert.equal(g.snapshot().armorOpen, 0); assert.equal(g.snapshot().armor, 2);
});
check('per-boss move sets make their opening response visibly different', () => {
  const g1 = make().g, g2 = archerFixture().g, g3 = colossusFixture().g;
  const openings = [g1, g2, g3].map(g => { g.pickAttack(); return g.attack.type; });
  assert.equal(openings[0], 'sweep'); assert.equal(openings[1], 'volley'); assert.equal(openings[2], 'cleave');
});
check('a whole challenge remains completable through public controls with no boundary fixtures', () => {
  const { runChallenge } = require('./gauntlet-session-sim.cjs');
  const run = runChallenge('adaptive', 5, 0x8a6213bd);
  assert.equal(run.win, true); assert.equal(run.cleared, 3);
  assert.deepEqual(run.stages.map(stage => stage.bossId), ['duelist', 'archer', 'colossus']);
  assert.equal(run.rests.length, 2); assert.ok(run.stages[2].armorOpenSeen);
  assert.ok(run.stages.every(stage => stage.time > 0 && stage.time <= 60));
});
console.log(`Continuous-challenge checks passed: ${passed}`);
