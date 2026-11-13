'use strict';
// Encounters below change state only through normal controls and update().
// Seeded simulated perception is useful for regression; it is not human playtest data.
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const { run, summarize, profiles } = require('./mobile-feel-sim.cjs');
const DT = 1 / 120;
const make = seed => { const g = new Nightfall({ getContext: () => ({}) }, { seed }); g.start(); return g; };
const styleKey = g => typeof g.style === 'object' ? g.style.id : g.style || g.snapshot().styleName;
function defend(g) {
  const p = g.player, b = g.boss, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  let mx = d > 146 ? dx / d : 0, my = d > 146 ? dy / d : 0;
  const a = g.attack;
  if (a && a.duration - a.elapsed <= .1) {
    if (!a.red) g.guard();
    else {
      mx = -dx / d; my = -dy / d;
      if (a.type === 'geyser' && Array.isArray(a.points) && a.points.length) {
        const nearest = [...a.points].sort((one, two) => Math.hypot(p.x - one.x, p.y - one.y) - Math.hypot(p.x - two.x, p.y - two.y))[0];
        const xx = p.x - nearest.x, yy = p.y - nearest.y, dd = Math.hypot(xx, yy);
        if (dd > 4) { mx = xx / dd; my = yy / dd; }
        else { mx = -dy / d; my = dx / d; }
      }
      g.movementInput(mx, my); g.dash();
    }
  }
  for (const r of g.rings) {
    const rd = Math.hypot(p.x - r.x, p.y - r.y) || 1;
    if (!r.hit && Math.abs(rd - r.radius) < 65) {
      mx = (r.x - p.x) / rd; my = (r.y - p.y) / rd;
      g.movementInput(mx, my); g.dash();
    }
  }
  g.movementInput(mx, my);
  if (g.broken > 0) g.execute();
}
function observe(seed) {
  const g = make(seed), starts = [], threats = [], errors = [], seen = new Set();
  let maxEffects = 0, recoveries = 0, stopProbe = null, frozenRecoverySamples = 0;
  for (let frame = 0; frame < 60 / DT + 2 && g.state === 'playing'; frame++) {
    const a = g.attack;
    if (a && !seen.has(a)) {
      seen.add(a);
      starts.push({ type: a.type, phase: g.phase, time: g.time, duration: a.duration, red: a.red,
        comboIndex: a.comboIndex || 1, comboTotal: a.comboTotal || 1 });
      if (a.red && a.type !== 'ring' && g.rings.some(r => r.life > 0)) errors.push('red attack began while a tide ring was active');
    }
    if (g.punish > .4 && !g.attack && g.executionTime <= 0 && !stopProbe) {
      recoveries++; stopProbe = { x: g.boss.x, y: g.boss.y, at: g.time };
    }
    defend(g);
    if (stopProbe && g.punish > .1 && !g.attack && g.executionTime <= 0) {
      assert.ok(Math.hypot(g.boss.x - stopProbe.x, g.boss.y - stopProbe.y) < .001, 'the boss must stay planted while visibly recovering');
      frozenRecoverySamples++;
    } else stopProbe = null;
    const before = g.attack;
    g.update(DT);
    if (before && before.elapsed >= before.duration && g.attack !== before) threats.push({ type: before.type, time: g.time, red: before.red });
    maxEffects = Math.max(maxEffects, g.effects.length);
  }
  assert.ok(g.result, 'defensive observer must reach a real terminal outcome');
  return { game: g, style: styleKey(g), starts, threats, errors, maxEffects, recoveries, frozenRecoverySamples };
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const encounterSeeds = Array.from({ length: 24 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0);
const observations = encounterSeeds.map(observe);
check('fixed seeds reproduce style and the full observed attack history', () => {
  const one = observations[0], again = observe(encounterSeeds[0]);
  assert.equal(one.style, again.style);
  assert.deepEqual(one.game.attackHistory, again.game.attackHistory);
  assert.deepEqual(one.game.attackLog, again.game.attackLog);
});
check('three-round style bags show all styles without adjacent repeats', () => {
  const g = make(913), bag = [];
  for (let i = 0; i < 12; i++) { if (i) g.start(); bag.push(styleKey(g)); }
  assert.deepEqual(new Set(bag), new Set(['hunter', 'warden', 'trickster']));
  for (let i = 1; i < bag.length; i++) assert.notEqual(bag[i], bag[i - 1]);
  for (let i = 0; i < bag.length; i += 3) assert.equal(new Set(bag.slice(i, i + 3)).size, 3);
});
check('every style opens with a readable single gold sweep', () => {
  for (const run of observations) {
    assert.equal(run.starts[0].type, 'sweep'); assert.equal(run.starts[0].red, false);
    assert.ok(run.starts[0].duration >= .9); assert.equal(run.starts[0].comboTotal, 1);
  }
});
check('multiple full encounters expose all attack families and different sequences', () => {
  const types = new Set(observations.flatMap(r => r.starts.map(a => a.type)));
  for (const type of ['sweep', 'rush', 'leap', 'ring', 'thrust', 'cross', 'cleave', 'feint', 'geyser']) assert.ok(types.has(type), 'missing attack family ' + type);
  const sequences = new Set(observations.map(r => r.starts.map(a => a.type).join(',')));
  assert.ok(sequences.size >= 12, 'several rounds must not share one fixed script');
});
check('chains stay short and their individual telegraphs remain readable', () => {
  for (const row of observations.flatMap(r => r.starts)) {
    assert.ok(row.comboTotal >= 1 && row.comboTotal <= 3);
    assert.ok(row.comboIndex >= 1 && row.comboIndex <= row.comboTotal);
    assert.ok(row.duration >= .48, 'each chained hit needs its own response window');
  }
});
check('red strike spacing leaves time for the defensive cooldown', () => {
  for (const run of observations) {
    const log = Array.isArray(run.game.attackLog) ? run.game.attackLog : run.threats;
    const red = log.filter(a => a.red);
    for (let i = 1; i < red.length; i++) assert.ok(red[i].time - red[i - 1].time >= 1.2 - DT, 'two resolved red attacks are too close together');
    assert.deepEqual(run.errors, []);
  }
});
check('finished chains create genuine planted counterattack opportunities', () => {
  assert.ok(observations.reduce((n, r) => n + r.recoveries, 0) > 12);
  assert.ok(observations.reduce((n, r) => n + r.frozenRecoverySamples, 0) > 120);
});
check('effect queues stay bounded and final outcomes reject new attacks', () => {
  for (const run of observations) {
    assert.ok(run.maxEffects < 120, 'short impact effects must expire during the encounter');
    const g = run.game, before = JSON.stringify({ s: g.snapshot(), r: g.result });
    assert.equal(g.attackDown(), false); assert.equal(g.guard(), false); assert.equal(g.dash(), false); assert.equal(g.execute(), false);
    g.attackUp(); g.update(.05);
    assert.equal(JSON.stringify({ s: g.snapshot(), r: g.result }), before);
  }
});
const imperfect = Object.keys(profiles).flatMap(profile => Array.from({ length: 12 }, (_, i) => run(profile, i + 1)));
check('imperfect control simulations terminate through genuine game outcomes', () => {
  for (const r of imperfect) {
    assert.ok(r.time > 0 && r.time <= 60); assert.ok(r.hp >= 0 && r.hp <= 100);
    assert.ok(r.stats.damage >= 0 && r.stats.damage <= r.bossMax);
    assert.ok(r.styleName); assert.ok(r.attackHistory.length > 0);
  }
});
const styles = [...new Set(observations.map(r => r.style))].map(style => ({ style,
  observedRounds: observations.filter(r => r.style === style).length,
  attackTypes: [...new Set(observations.filter(r => r.style === style).flatMap(r => r.starts.map(a => a.type)))].sort(),
  maxEffects: Math.max(...observations.filter(r => r.style === style).map(r => r.maxEffects)) }));
console.log(JSON.stringify({ note: 'Seeded simulations, not human playtest rates.', checks: passed, coverageRounds: observations.length,
  styles, imperfectControllers: summarize(imperfect) }, null, 2));
