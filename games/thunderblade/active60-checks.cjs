'use strict';
// Legal-control checks: simulation may read telegraphs, but never edits combat state.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
const make = (options = {}) => { const g = new Nightfall({ getContext: () => ({}) }, { seed: 734923, ...options }); g.start(); return g; };
const step = (g, seconds, control) => {
  const frames = Math.ceil(seconds / DT);
  for (let i = 0; i < frames && g.state === 'playing'; i++) {
    if (control) control(g, i);
    g.update(Math.min(DT, seconds - i * DT));
  }
};
const until = (g, predicate, limit = 15, control) => {
  for (let i = 0; i < Math.ceil(limit / DT); i++) {
    if (predicate(g)) return;
    assert.equal(g.state, 'playing', 'encounter ended before condition');
    if (control) control(g, i);
    if (predicate(g)) return;
    g.update(DT);
  }
  assert.ok(predicate(g), 'condition did not occur within allowed simulation time');
};
function approach(g) {
  const dx = g.boss.x - g.player.x, dy = g.boss.y - g.player.y;
  const d = Math.hypot(dx, dy) || 1;
  g.movementInput(d > 140 ? dx / d : 0, d > 140 ? dy / d : 0);
}
function charge(g) {
  if (!g.attackHeld) g.attackDown();
  else if (g.chargeTime >= .52) g.attackUp();
}
function defend(g) {
  const a = g.attack;
  if (a && a.duration - a.elapsed < .12) {
    if (a.red) g.dash(); else g.guard();
  }
  for (const r of g.rings) {
    if (!r.hit && Math.abs(Math.hypot(g.player.x - r.x, g.player.y - r.y) - r.radius) < 70) g.dash();
  }
}
function orbit(g) {
  const dx = g.player.x - 360, dy = g.player.y - 363, d = Math.hypot(dx, dy) || 1;
  const correction = (270 - d) / 80;
  g.movementInput(-dy / d + dx / d * correction, dx / d + dy / d * correction);
  for (const r of g.rings) {
    if (!r.hit && Math.abs(Math.hypot(g.player.x - r.x, g.player.y - r.y) - r.radius) < 65) g.dash();
  }
}
function simulate(strategy) {
  const g = make(), phases = new Set([1]);
  for (let frame = 0; frame < Math.ceil(60 / DT) + 2 && g.state === 'playing'; frame++) {
    if (strategy === 'evade') orbit(g);
    else if (strategy !== 'passive') approach(g);
    if (g.broken > 0 && !['passive', 'evade'].includes(strategy)) g.execute();
    if (strategy === 'quick' && frame % 12 === 0) { g.attackDown(); g.attackUp(); }
    if (strategy === 'charge' || strategy === 'mixed') charge(g);
    if (strategy === 'mixed' || strategy === 'parryOnly') defend(g);
    g.update(DT); phases.add(g.phase);
  }
  assert.ok(g.result, `${strategy} failed to terminate`);
  return { game: g, result: { strategy, ...g.result, phases: [...phases] } };
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
check('no automatic attack during initial boss approach', () => {
  const g = make(), hp = g.boss.hp;
  step(g, 3);
  assert.equal(g.boss.hp, hp); assert.equal(g.stats.hits, 0); assert.equal(g.stats.damage, 0);
});
check('short taps are light, partial charge grows smoothly, and near-full releases are forgiving', () => {
  const samples = [.08, .25, .38, .50, .54].map(hold => {
    const g = make(); g.attackDown(); step(g, hold); g.attackUp();
    assert.equal(g.attackHeld, false); assert.equal(g.stats.hits, 1);
    return { damage: g.stats.damage, posture: g.posture, combo: g.combo };
  });
  assert.ok(samples[0].damage > 0); assert.equal(samples[0].combo, 1, 'short tap keeps the light combo');
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].damage > samples[i - 1].damage, 'holding longer should add damage');
    assert.ok(samples[i].posture > samples[i - 1].posture, 'holding longer should add posture pressure');
  }
  assert.ok((samples[4].damage - samples[3].damage) / samples[4].damage < .10, '.50s and .54s must not have a damage cliff');
  assert.ok(samples[4].damage > samples[0].damage * 2);
});
check('canceling one attack preserves the held movement input and never discharges it', () => {
  const g = make(); g.movementInput(.6, .8); g.attackDown(); step(g, .2);
  const before = { x: g.player.x, y: g.player.y };
  g.cancelAttack(); assert.deepEqual(g.input, { x: .6, y: .8 }); assert.equal(g.attackHeld, false);
  assert.equal(g.attackUp(), false); step(g, .1);
  assert.ok(Math.hypot(g.player.x - before.x, g.player.y - before.y) > 0);
  assert.equal(g.stats.damage, 0);
});
check('perfect guard counter damages boss and immediately refreshes guard', () => {
  const g = make();
  until(g, x => x.attack && !x.attack.red && x.attack.duration - x.attack.elapsed < .12);
  const before = g.boss.hp, a = g.attack;
  assert.equal(g.guard(), true);
  until(g, x => x.attack !== a, 2);
  assert.equal(g.stats.parries, 1); assert.ok(g.boss.hp < before); assert.equal(g.player.hp, 100);
  assert.equal(g.guardCd, 0); assert.equal(g.guard(), true);
});
check('perfect parry strengthens only the next landed slash', () => {
  const baseline = make(); baseline.attackDown(); baseline.attackUp();
  const normalFirst = baseline.stats.damage;
  until(baseline, x => x.attackCd <= 0, 1);
  const beforeSecond = baseline.stats.damage; baseline.attackDown(); baseline.attackUp();
  const normalSecond = baseline.stats.damage - beforeSecond;
  const g = make();
  until(g, x => x.attack && !x.attack.red && x.attack.duration - x.attack.elapsed < .12);
  g.guard(); until(g, x => x.stats.parries === 1, 2);
  assert.ok(g.snapshot().riposte > 0);
  const beforeFirst = g.stats.damage; g.attackDown(); g.attackUp();
  assert.ok(g.stats.damage - beforeFirst > normalFirst); assert.equal(g.snapshot().riposte, 0);
  until(g, x => x.attackCd <= 0, 1);
  const before = g.stats.damage, recoveryBonus = g.punish > 0 ? 1.2 : 1; g.attackDown(); g.attackUp();
  assert.equal(g.stats.damage - before, Math.round(normalSecond * recoveryBonus), 'the second slash may use the recovery bonus but must not repeat the parry bonus');
});
check('a light slash tapped during a timed guard waits, then becomes the parry follow-up', () => {
  const baseline = make(); baseline.attackDown(); baseline.attackUp();
  const g = make();
  until(g, x => x.attack && !x.attack.red && x.attack.duration - x.attack.elapsed < .24);
  g.guard(); g.attackDown(); step(g, .06);
  assert.equal(g.attackUp(), true); assert.equal(g.queuedSlash?.waitGuard, true);
  assert.ok(g.player.guard > 0); assert.equal(g.stats.hits, 0);
  until(g, x => x.stats.parries === 1, 2, x => assert.equal(x.stats.hits, 0, 'queued attack must not interrupt the pending guard'));
  const parryDamage = g.stats.damage;
  until(g, x => x.stats.hits === 1, 1);
  assert.ok(g.stats.damage - parryDamage > baseline.stats.damage, 'the queued slash should receive the parry follow-up bonus');
  assert.equal(g.player.hp, g.player.maxHp); assert.equal(g.queuedSlash, null); assert.equal(g.snapshot().riposte, 0);
});
check('break opens execution, heals actual damage, and clears charge', () => {
  const g = make();
  until(g, x => x.player.hp < x.player.maxHp, 5);
  until(g, x => x.broken > 0, 12, x => { approach(x); charge(x); });
  const hp = g.player.hp, damage = g.stats.damage;
  g.movementInput(.6, .8);
  assert.ok(hp < g.player.maxHp); assert.equal(g.execute(), true);
  assert.equal(g.player.hp, Math.min(g.player.maxHp, hp + 14));
  assert.ok(g.stats.damage > damage); assert.equal(g.stats.executions, 1);
  assert.equal(g.broken, 0); assert.equal(g.posture, 0); assert.ok(g.postureLock > 0);
  assert.equal(g.attackHeld, false); assert.equal(g.attack, null);
  assert.deepEqual(g.input, { x: .6, y: .8 }, 'execution must preserve the other thumb holding movement');
});
for (const action of ['guard', 'dash']) {
  check(`${action} cooldown-tail input buffers once, and pause cancels buffered input`, () => {
    const sounds = [], g = make({ onEvent(type, data) { if (type === 'sound') sounds.push(data); } });
    assert.equal(g[action](), true);
    until(g, x => x[action + 'Cd'] > 0 && x[action + 'Cd'] <= .14, 2);
    assert.equal(sounds.filter(s => s === action).length, 1);
    assert.equal(g[action](), true); assert.equal(g.queuedDefense.type, action);
    assert.equal(g[action](), true); assert.equal(g[action](), true);
    assert.equal(sounds.filter(s => s === action).length, 1, 'buffer must not start the action early');
    step(g, .2); assert.equal(g.queuedDefense, null);
    assert.equal(sounds.filter(s => s === action).length, 2, 'repeated buffer taps resolve to one action');
    step(g, .45); assert.equal(sounds.filter(s => s === action).length, 2);
    until(g, x => x[action + 'Cd'] > 0 && x[action + 'Cd'] <= .14, 2);
    assert.equal(g[action](), true); assert.ok(g.queuedDefense);
    g.pause(); assert.equal(g.queuedDefense, null); const paused = g.snapshot();
    for (let i = 0; i < 10; i++) g.update(.05);
    assert.deepEqual(g.snapshot(), paused);
    g.resume(); step(g, .3);
    assert.equal(sounds.filter(s => s === action).length, 2, 'resuming must not fire the canceled buffer');
  });
}
check('snapshot exposes timely parry and dodge cues for the current threat', () => {
  const g = make();
  until(g, x => x.snapshot().parryNow, 4);
  assert.equal(g.attack.red, false); assert.match(g.snapshot().hint, /格挡/);
  g.guard();
  until(g, x => x.snapshot().dodgeNow, 10);
  assert.ok(g.attack?.red || g.rings.length > 0); assert.match(g.snapshot().hint, /闪避/);
});
check('pause clears held input and freezes encounter; resume does not discharge', () => {
  const g = make();
  g.movementInput(1, 0); g.attackDown(); step(g, .2); g.pause();
  const before = g.snapshot(), x = g.player.x, y = g.player.y;
  assert.equal(g.attackHeld, false); assert.deepEqual(g.input, { x: 0, y: 0 });
  assert.equal(g.attackDown(), false); assert.equal(g.guard(), false); assert.equal(g.dash(), false);
  g.update(.5); assert.deepEqual(g.snapshot(), before);
  g.resume(); step(g, .25);
  assert.equal(g.player.x, x); assert.equal(g.player.y, y); assert.equal(g.stats.damage, 0);
});
const runs = ['passive', 'quick', 'charge', 'parryOnly', 'mixed', 'evade'].map(simulate);
check('pure offense loses and mixed controls can win through all phases', () => {
  for (const name of ['passive', 'quick', 'charge']) assert.equal(runs.find(x => x.result.strategy === name).result.win, false, name);
  const mixed = runs.find(x => x.result.strategy === 'mixed').result;
  assert.equal(mixed.win, true); assert.deepEqual(mixed.phases, [1, 2, 3]);
  assert.ok(mixed.stats.parries > 0); assert.ok(mixed.stats.executions > 0);
});
check('evasion reaches 60-second timeout with no invented damage', () => {
  const evade = runs.find(x => x.result.strategy === 'evade').result;
  assert.equal(evade.win, false); assert.equal(evade.reason, '六十秒已尽');
  assert.equal(evade.time, 60); assert.equal(evade.remaining, 0);
  assert.equal(evade.stats.damage, 0); assert.ok(evade.hp > 0);
});
check('both terminal outcomes reject attacks and stay immutable', () => {
  for (const { game: g } of runs) {
    const before = JSON.stringify({ snapshot: g.snapshot(), result: g.result });
    assert.equal(g.attackDown(), false); assert.equal(g.guard(), false); assert.equal(g.dash(), false); assert.equal(g.execute(), false);
    g.attackUp(); g.update(.05);
    assert.equal(JSON.stringify({ snapshot: g.snapshot(), result: g.result }), before);
  }
});
check('home and restart make a clean new battle', () => {
  const g = runs.find(x => x.result.strategy === 'mixed').game;
  g.home(); assert.equal(g.state, 'menu'); assert.equal(g.time, 0); assert.equal(g.stats.damage, 0); assert.equal(g.attackDown(), false);
  g.start(); assert.equal(g.state, 'playing'); assert.equal(g.player.hp, g.player.maxHp); assert.equal(g.boss.hp, g.boss.maxHp);
  assert.equal(g.time, 0); assert.equal(g.stats.executions, 0); assert.equal(g.attackHeld, false);
});
console.log(JSON.stringify({ passed, simulations: runs.map(x => x.result) }, null, 2));
