'use strict';
// Public-control probes. Diagnostics do not stand in for a real phone playtest.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const DT = 1 / 120;
const make = (options = {}) => { const g = new Nightfall({ getContext: () => ({}) }, { seed: 734923, ...options }); g.start(); return g; };
function step(g, seconds, controller) {
  for (let n = 0; n < Math.ceil(seconds / DT) && g.state === 'playing'; n++) {
    if (controller) controller(g);
    g.update(Math.min(DT, seconds - n * DT));
  }
}
function until(g, predicate, seconds = 10, controller) {
  for (let n = 0; n < Math.ceil(seconds / DT); n++) {
    if (predicate(g)) return;
    assert.equal(g.state, 'playing', 'probe encounter ended before its condition');
    if (controller) controller(g);
    g.update(DT);
  }
  assert.ok(predicate(g), 'probe condition timed out');
}
const diff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const rows = [];
function probe(name, run) { rows.push({ name, ...run() }); }
probe('a retreating thumb is not pulled back by a light slash', () => {
  const g = make(); g.movementInput(0, 1);
  const before = g.player.y; g.attackDown(); g.attackUp();
  const immediate = g.player.y - before; step(g, .12);
  return { fixed: immediate >= -.01 && g.player.y >= before, immediateYDelta: +immediate.toFixed(2), finalYDelta: +(g.player.y - before).toFixed(2) };
});
probe('an out-of-reach light slash does not drag the player into an empty swing', () => {
  const g = make(); g.movementInput(0, 1);
  until(g, x => Math.hypot(x.player.x - x.boss.x, x.player.y - x.boss.y) >= 278, 1.4);
  g.movementInput(0, 0);
  const before = { x: g.player.x, y: g.player.y }, damage = g.stats.damage;
  g.attackDown(); g.attackUp(); step(g, .12);
  const travel = Math.hypot(g.player.x - before.x, g.player.y - before.y), dealt = g.stats.damage - damage;
  return { fixed: dealt > 0 || travel < 1, travel: +travel.toFixed(2), dealt };
});
probe('moving sideways while charging keeps the held blade aimed at the boss', () => {
  const g = make(); g.attackDown(); g.movementInput(1, 0); step(g, .16);
  const target = Math.atan2(g.boss.y - g.player.y, g.boss.x - g.player.x), error = diff(g.player.angle, target);
  return { fixed: error < .3, angleErrorRadians: +error.toFixed(3) };
});
probe('a quick slash buffered during a parry dash is delivered once', () => {
  const g = make();
  until(g, x => x.attack && !x.attack.red && x.attack.duration - x.attack.elapsed < .1);
  g.guard(); until(g, x => x.stats.parries > 0, 1);
  const dx = g.boss.x - g.player.x, dy = g.boss.y - g.player.y, d = Math.hypot(dx, dy) || 1;
  g.movementInput(dx / d, dy / d);
  const hits = g.stats.hits; g.dash(); g.attackDown(); g.attackUp(); step(g, .45);
  const delivered = g.stats.hits - hits;
  return { fixed: delivered === 1 && !g.queuedSlash, delivered, stillQueued: !!g.queuedSlash };
});
probe('a full-health execution does not claim healing it could not provide', () => {
  const g = make();
  until(g, x => x.broken > 0, 10, x => {
    const dx = x.boss.x - x.player.x, dy = x.boss.y - x.player.y, d = Math.hypot(dx, dy) || 1;
    x.movementInput(d > 140 ? dx / d : 0, d > 140 ? dy / d : 0);
    if (x.attack && !x.attack.red && x.attack.duration - x.attack.elapsed < .12) x.guard();
    else if (!x.attackHeld) x.attackDown(); else if (x.chargeTime >= .52) x.attackUp();
  });
  const before = g.player.hp; assert.equal(before, g.player.maxHp);
  g.execute();
  const healed = g.player.hp - before, message = g.texts.find(t => /处决/.test(t.text))?.text || '';
  const claimed = /回血\s*\+(\d+)/.exec(message);
  return { fixed: claimed ? Number(claimed[1]) === healed : !/回血\s*\+14/.test(message), healed, message };
});
probe('pose movement pauses while defensive cooldowns retain their real-time rhythm', () => {
  const g = make(); g.attackDown(); step(g, .54); g.attackUp();
  const before = { pose: g.actor.age, cd: g.attackCd, stop: g.hitStop }; g.update(DT);
  const poseDelta = g.actor.age - before.pose, cooldownDelta = before.cd - g.attackCd;
  assert.ok(before.stop > 0);
  return { fixed: poseDelta < cooldownDelta * .5, poseDelta: +poseDelta.toFixed(5), cooldownDelta: +cooldownDelta.toFixed(5) };
});
probe('normal recovery stores one follow-up and a new defensive action cancels it', () => {
  function prepare() {
    const g = make(); g.attackDown(); step(g, .54); g.attackUp();
    const before = g.stats.hits;
    for (let n = 0; n < 5; n++) { g.attackDown(); assert.equal(g.attackUp(), true); }
    assert.equal(g.snapshot().attackQueued, true);
    return { g, before };
  }
  const normal = prepare(); step(normal.g, .9);
  const delivered = normal.g.stats.hits - normal.before;
  const cancelled = ['guard', 'dash'].map(action => {
    const { g, before } = prepare(); assert.equal(g[action](), true);
    assert.equal(g.snapshot().attackQueued, false); step(g, .9);
    return { action, extraHits: g.stats.hits - before, stillQueued: !!g.queuedSlash };
  });
  return { fixed: delivered === 1 && cancelled.every(r => r.extraHits === 0 && !r.stillQueued), delivered, cancelled };
});
probe('consecutive completed rounds retain a safe first lesson without repeating one opener forever', () => {
  const g = make(), openers = [];
  for (let round = 0; round < 9; round++) {
    if (round) g.start();
    until(g, x => x.attackHistory.length > 0, 3);
    const first = g.attackHistory[0];
    assert.equal(first.comboTotal, 1); assert.ok(first.duration >= .75);
    openers.push({ style: g.style.id, type: first.type });
    step(g, 60);
    assert.ok(g.result, 'each restart follows a genuinely ended encounter');
  }
  return { fixed: openers[0].type === 'sweep' && new Set(openers.map(r => r.type)).size >= 2, openers };
});
probe('phase hints describe the active style instead of promising unavailable tide rings', () => {
  const byStyle = {};
  for (const wanted of ['hunter', 'warden', 'trickster']) {
    let selectedSeed;
    for (let n = 1; n <= 24; n++) { const seed = Math.imul(n, 2654435761) >>> 0; if (make({ seed }).style.id === wanted) { selectedSeed = seed; break; } }
    assert.notEqual(selectedSeed, undefined);
    const messages = []; let g;
    g = make({ seed: selectedSeed, onEvent(type, data) { if (type === 'feedback' && /^(连势增强|末刀后再追击|新招)/.test(String(data))) messages.push(String(data)); } });
    const used = new Set(), rings = new Set();
    until(g, x => x.phase >= 3, 55, x => {
      const dx = x.boss.x - x.player.x, dy = x.boss.y - x.player.y, d = Math.hypot(dx, dy) || 1;
      let mx = d > 145 ? dx / d : 0, my = d > 145 ? dy / d : 0;
      const a = x.attack;
      if (a && !used.has(a) && a.duration - a.elapsed < .11) {
        used.add(a);
        if (!a.red) x.guard();
        else if (a.type !== 'ring') { mx = -dx / d; my = -dy / d; x.movementInput(mx, my); x.dash(); }
      }
      for (const ring of x.rings) {
        const rd = Math.hypot(x.player.x - ring.x, x.player.y - ring.y) || 1;
        if (!rings.has(ring) && !ring.hit && Math.abs(rd - ring.radius) < 65) {
          rings.add(ring); mx = (ring.x - x.player.x) / rd; my = (ring.y - x.player.y) / rd;
          x.movementInput(mx, my); x.dash();
        }
      }
      x.movementInput(mx, my); if (x.broken > 0) x.execute();
    });
    assert.equal(messages.length, 2); byStyle[wanted] = messages;
  }
  return { fixed: ['hunter', 'trickster'].every(style => byStyle[style].every(text => !text.includes('潮环'))), byStyle };
});
probe('light finishers refund dodge only on a landed hit and recovery heavy strikes reward the opening', () => {
  const near = make(); near.movementInput(0, -1); near.dash(); step(near, .21); near.movementInput(0, 0);
  near.attackDown(); near.attackUp(); step(near, .27); near.attackDown(); near.attackUp(); step(near, .27);
  const nearBefore = near.dashCd; near.attackDown(); near.attackUp(); const nearAfter = near.dashCd;
  const far = make(); far.dash(); step(far, .21);
  far.attackDown(); far.attackUp(); step(far, .27); far.attackDown(); far.attackUp(); step(far, .27);
  const farBefore = far.dashCd; far.attackDown(); far.attackUp();
  const base = make(); base.attackDown(); step(base, .54); base.attackUp();
  const normalHeavy = base.stats.damage;
  const punish = make(); until(punish, x => x.punish > 1, 5); assert.equal(punish.riposte, 0);
  const damageBefore = punish.stats.damage; punish.attackDown(); step(punish, .54); punish.attackUp();
  const openingHeavy = punish.stats.damage - damageBefore;
  return { fixed: near.stats.dashRefunds === 1 && nearBefore - nearAfter > .25 && far.stats.dashRefunds === 0 && far.dashCd === farBefore && openingHeavy > normalHeavy * 1.25,
    landedRefund: +(nearBefore - nearAfter).toFixed(3), emptySwingRefund: +(farBefore - far.dashCd).toFixed(3), normalHeavy, openingHeavy };
});
console.log(JSON.stringify({ note: 'Read-only observations driven by legitimate controls; not human playtest results.', probes: rows }, null, 2));
if (process.argv.includes('--assert-fixed')) {
  for (const row of rows) assert.ok(row.fixed, row.name);
  console.log('PASS all feel regression probes');
}
module.exports = { rows };
