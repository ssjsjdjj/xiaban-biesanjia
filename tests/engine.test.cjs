const test = require('node:test');
const assert = require('node:assert/strict');
global.Matter = require('../dist/vendor/matter.min.js');
require('../dist/engine.js');

function advance(game, seconds, control) {
  for (let frame = 0; frame < Math.round(seconds * 60) && game.status === 'playing'; frame++) {
    if (control) control(game.snapshot(), game);
    game.step(1 / 60);
  }
  return game.snapshot();
}

// A deliberately simple, low-speed player: read the visible drop marker, then
// follow the visible weighted centre. No body internals or future route data.
function followHints(speed = 70) {
  return (state, engine) => {
    if (state.guidance.kind === 'tail') {
      if (state.guidance.direction === 'stop') engine.releaseControl();
      else engine.setTarget(state.truck.x + Math.max(-speed / 9, Math.min(speed / 9, state.guidance.targetX - state.truck.x)));
      return;
    }
    const falling = state.cargo.filter(cargo => !cargo.caught);
    const goal = state.nextDrop ? state.nextDrop.x
      : falling.length ? falling[falling.length - 1].landingX
      : state.balance.centerX;
    const shift = Math.max(-speed / 9, Math.min(speed / 9, goal - state.truck.x));
    engine.setTarget(state.truck.x + shift);
  };
}

test('tutorial is catchable, precision rewards are observable, and pause/restart are coherent', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  assert.equal(game.snapshot().status, 'ready');
  game.reset();
  let state = advance(game, 4);
  assert.equal(state.lives, 3);
  assert.equal(state.catches, 1);
  assert.equal(state.perfectCatches, 1);
  assert.equal(state.precision, 100);
  assert.equal(state.streak, 1);
  const caught = events.find(event => event.type === 'catch');
  assert.equal(caught.quality, 'perfect');
  assert.equal(caught.cargoId, 1);
  assert.ok(caught.points > 25);
  game.pause(true);
  const frozen = game.elapsed;
  for (let i = 0; i < 100; i++) game.step(1 / 30);
  assert.equal(game.elapsed, frozen);
  game.pause(false);
  game.step(1 / 60);
  assert.ok(game.elapsed > frozen);
  game.reset('daily', '2026-10-30');
  state = game.snapshot();
  assert.equal(state.elapsed, 0);
  assert.equal(state.cargo.length, 0);
  assert.equal(state.score, 0);
  assert.equal(state.perfectCatches, 0);
  assert.equal(state.streak, 0);
  assert.equal(state.lastCrash, null);
  assert.equal(state.lives, 3);
  assert.equal(state.paused, false);
});

test('normal preview locks a world position and does not follow a moving truck', () => {
  const game = new ShiftEngine();
  game.reset();
  until(game, state => state.nextDrop?.cargoId === 2, 7);
  const announced = game.snapshot().nextDrop;
  assert.ok(announced);
  assert.equal(announced.type, 'coffee');
  assert.ok(announced.inSeconds >= 2.8 && announced.inSeconds < 6.3);
  game.setTarget(235);
  advance(game, .5);
  assert.equal(game.snapshot().nextDrop.x, announced.x);
  assert.notEqual(game.snapshot().truck.x, 210);
  game.releaseControl();
  until(game, state => state.cargo.some(cargo => cargo.id === 2), announced.inSeconds + 1);
  const falling = game.snapshot().cargo.find(cargo => cargo.type === 'coffee');
  assert.ok(falling);
  assert.equal(falling.x, announced.x);
  assert.ok(Number.isFinite(falling.landingX));
});

test('a missed parcel is not installed: signed cargo restores, then the same id is retried after three seconds', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  advance(game, 3);
  const info = { id: 2, type: 'coffee', x: 315, caught: false };
  game._allCargo.push(info);
  game._createCargo(info, 315, 665);
  game._planIndex = 2;
  game.step(1 / 60);
  const state = advance(game, .85);
  const crash = events.find(event => event.type === 'crash');
  assert.ok(crash);
  assert.equal(crash.cargoId, 2);
  assert.equal(crash.cargoType, 'coffee');
  assert.equal(crash.cause, '漏接');
  assert.equal(crash.side, 'right');
  assert.ok(crash.advice.includes('落点'));
  assert.equal(state.lastCrash.cargoId, crash.cargoId);
  assert.equal(state.lastCrash.cause, crash.cause);
  assert.equal(state.saves, 0);
  assert.equal(state.streak, 0);
  assert.equal(state.perfectCatches, 1);
  assert.deepEqual(state.cargo.map(cargo => cargo.id), [1]);
  assert.equal(state.cargo[0].restored, true);
  assert.equal(state.nextDrop.cargoId, 2);
  assert.equal(state.nextDrop.retry, true);
  assert.ok(state.nextDrop.inSeconds > 2.9);
  assert.equal(state.retries, 0);
  assert.equal(state.recovery.restoredCount, 1);
  assert.equal(state.recovery.retryType, 'coffee');
  advance(game, 4.2, (snapshot, engine) => {
    const goal = 315;
    if (Math.abs(goal - snapshot.truck.x) < 5) engine.releaseControl();
    else engine.setTarget(snapshot.truck.x + Math.max(-45 / 9, Math.min(45 / 9, goal - snapshot.truck.x)));
  });
  assert.equal(game.retries, 1);
  assert.equal(game.catches, 2);
  assert.equal(game.perfectCatches, 2);
  assert.equal(events.filter(event => event.type === 'catch' && event.cargoId === 2).length, 1);
  const coffee = game.cargo.find(cargo => cargo.id === 2);
  assert.equal(coffee.caught, true);
  assert.equal(coffee.restored, false);
  assert.equal(game.snapshot().cargo.find(cargo => cargo.id === 2).retry, true);
  Matter.Body.setPosition(coffee.body, { x: game.truck.x + 100, y: 665 });
  game.step(1 / 60);
  advance(game, .9);
  assert.equal(game.catches, 2);
  assert.equal(game.perfectCatches, 2);
  assert.ok(game.cargo.every(cargo => cargo.caught && cargo.restored));
  assert.equal(events.filter(event => event.type === 'catch' && event.cargoId === 2).length, 1);
});

test('a second old-cargo crash cannot swallow an announced but unspawned retry', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  advance(game, 3);
  const missed = { id: 2, type: 'coffee', x: 315, caught: false };
  game._allCargo.push(missed);
  game._createCargo(missed, 315, 665);
  game._planIndex = 2;
  game.step(1 / 60);
  advance(game, 2.1);
  assert.equal(game.snapshot().nextDrop.cargoId, 2);
  assert.equal(game.snapshot().nextDrop.retry, true);
  assert.equal(game.retries, 0);
  Matter.Body.setPosition(game.cargo[0].body, { x: 310, y: 665 });
  game.step(1 / 60);
  assert.equal(game.lives, 1);
  advance(game, .85);
  const state = game.snapshot();
  assert.equal(state.nextDrop.cargoId, 2);
  assert.equal(state.nextDrop.retry, true);
  assert.ok(state.nextDrop.inSeconds > 2.9);
  assert.deepEqual(state.cargo.map(cargo => cargo.id), [1]);
  assert.equal(game.catches, 1);
  advance(game, 3.1);
  assert.equal(game.retries, 1);
  assert.equal(events.filter(event => event.type === 'spawn' && event.cargoId === 2 && event.retry).length, 1);
  assert.equal(game.snapshot().cargo.find(cargo => cargo.id === 2).retry, true);
});

for (const variant of [0, 1, 2]) {
  test(`normal route variant ${variant} is finishable with delayed, low-speed visible-cue control`, () => {
    const state = delayedGuidanceRun(.3, 55, variant);
    assert.equal(state.status, 'win');
    assert.equal(state.finishReason, 'arrived');
    assert.equal(state.requiredCatches, 4);
    assert.ok(state.elapsed < 60);
    assert.equal(state.tail.completed, true);
    assert.ok(state.lives > 0);
    assert.ok(state.catches >= 4);
    assert.ok(state.perfectCatches >= 4);
    assert.ok(state.bestStreak >= 2);
    assert.equal(state.tail.variant, variant);
    assert.equal(state.tailBonus, 200);
    assert.equal(state.timeBonus, Math.floor((60 - state.elapsed) * 12));
  });
}

test('balance accounts for heavy cargo, exposes direction, and warns before a side drop', () => {
  const game = new ShiftEngine();
  game.reset();
  advance(game, 3);
  const bread = game.cargo[0];
  // Arrange physical bodies to isolate the mass-weighted signal, independent of
  // whatever decorative shape or future content order the renderer uses.
  const heavy = game._createCargo({ id: 99, type: 'monday', caught: true }, 260, 480);
  const state = game.snapshot();
  assert.ok(state.balance.centerX > 248, '5.2kg block should outweigh the 1.05kg bread');
  assert.equal(state.balance.correction, 'right');
  assert.ok(state.balance.offset > .35);
  Matter.Body.setPosition(heavy.body, { x: 310, y: 600 });
  const danger = game.snapshot();
  assert.ok(danger.cargo.find(cargo => cargo.id === 99).risk > .9);
  assert.ok(danger.balance.risk > .7);
  assert.equal(danger.balance.correction, 'right');
  assert.equal(danger.cargo.find(cargo => cargo.id === bread.id).mass, 1.05);
  Matter.Body.setPosition(heavy.body, { x: 330, y: 665 });
  game.step(1 / 60);
  assert.equal(game.snapshot().lastCrash.cause, '从右侧滑落');
  assert.equal(game.snapshot().lastCrash.cargoId, 99);
});

test('automatic bouncing cannot farm rescue points without recent steering', () => {
  const game = new ShiftEngine();
  game.reset();
  advance(game, 3);
  Matter.Body.setVelocity(game.cargo[0].body, { x: 0, y: -4.5 });
  advance(game, 2);
  assert.equal(game.snapshot().saves, 0);
  assert.equal(game.snapshot().perfectCatches, 1);
});

test('real rescues report their reward and cargo identity', () => {
  const saves = [];
  const game = new ShiftEngine(event => { if (event.type === 'save') saves.push(event); });
  game.reset();
  advance(game, 3);
  game._dropPlan = []; game._pendingDelivery = null;
  assert.equal(game.triggerChaos(), true);
  until(game, state => state.saves > 0, 3, (state, engine) => {
    const loaf = state.cargo.find(cargo => cargo.id === 1);
    if (loaf && !loaf.supported) engine.setTarget(state.truck.x + Math.max(-180 / 9, Math.min(180 / 9, loaf.landingX - state.truck.x)));
    else engine.releaseControl();
  });
  assert.ok(saves.length > 0);
  for (const save of saves) {
    assert.ok(Number.isInteger(save.cargoId));
    assert.equal(save.points, 45);
  }
});

test('violent steering fails without spending multiple lives in one chain reaction', () => {
  const crashes = [];
  const game = new ShiftEngine(event => { if (event.type === 'crash') crashes.push(event); });
  game.reset();
  advance(game, 61, (state, engine) => engine.setTarget(210 + Math.sin(state.elapsed * 4) * 125));
  assert.equal(game.status, 'lose');
  assert.equal(game.snapshot().finishReason, 'crash');
  assert.equal(game.lives, 0);
  assert.equal(crashes.length, 3);
  for (let i = 1; i < crashes.length; i++) assert.ok(crashes[i].elapsed - crashes[i - 1].elapsed >= 1.9);
});

test('chaos moves real cargo, uses game-time cooldown, and pauses consistently', () => {
  const game = new ShiftEngine();
  game.reset();
  advance(game, 3);
  assert.equal(game.triggerChaos(), true);
  assert.ok(game.snapshot().cargo.some(cargo => cargo.vy < -7));
  assert.equal(game.triggerChaos(), false);
  const cooldown = game.snapshot().chaosCooldown;
  game.pause(true);
  for (let i = 0; i < 100; i++) game.step(1 / 30);
  assert.equal(game.snapshot().chaosCooldown, cooldown);
  assert.equal(game.triggerChaos(), false);
});

test('same daily seed remains identical at 30/60 FPS and another seed changes the route', () => {
  const first = new ShiftEngine();
  const second = new ShiftEngine();
  const other = new ShiftEngine();
  first.reset('daily', '2026-10-30');
  second.reset('daily', '2026-10-30');
  other.reset('daily', '2026-10-31');
  for (let i = 0; i < 300; i++) first.step(1 / 60);
  for (let i = 0; i < 150; i++) second.step(1 / 30);
  advance(other, 5);
  const a = first.snapshot(), b = second.snapshot(), c = other.snapshot();
  assert.equal(a.dateSeed, '2026-10-30');
  assert.equal(a.elapsed, b.elapsed);
  assert.equal(a.score, b.score);
  assert.deepEqual(a.nextDrop, b.nextDrop);
  assert.equal(a.cargo[0].x, b.cargo[0].x);
  assert.equal(a.cargo[0].y, b.cargo[0].y);
  assert.notEqual(a.nextDrop.x, c.nextDrop.x);
  first.setTarget(Number.NaN);
  first.step(.1);
  assert.ok(Number.isFinite(first.snapshot().truck.x));
});

test('the fixed seeded daily route is also finishable by visible-hint steering', () => {
  const game = new ShiftEngine();
  game.reset('daily', '2026-10-30');
  const state = advance(game, 63, followHints(50));
  assert.equal(state.status, 'win');
  assert.ok(state.lives > 0);
});

test('release is real one-way braking at both speeds, and pause/repeated release cannot restart the old target', () => {
  for (const velocity of [225, 310, -225, -310]) {
    const game = new ShiftEngine();
    game.reset();
    game.truck.x = velocity > 0 ? 130 : 290;
    game.truck.vx = velocity;
    game.target = velocity > 0 ? 340 : 80;
    const startX = game.truck.x;
    game.releaseControl();
    for (let frame = 0; frame < 30; frame++) {
      if (frame === 5) game.releaseControl();
      game.step(1 / 60);
      assert.ok(game.truck.vx === 0 || Math.sign(game.truck.vx) === Math.sign(velocity));
    }
    const distance = Math.abs(game.truck.x - startX);
    assert.ok(distance <= (Math.abs(velocity) === 225 ? 20 : 30));
    assert.equal(game.truck.vx, 0);
    assert.equal(game.snapshot().truck.braking, true);
    assert.equal(game.target, game.truck.x);
    const pausedX = game.truck.x;
    game.pause(true);
    for (let i = 0; i < 20; i++) game.step(.1);
    assert.equal(game.truck.x, pausedX);
    game.pause(false);
    game.setTarget(velocity > 0 ? 80 : 340);
    game.step(1 / 60);
    assert.equal(game.snapshot().truck.braking, false);
    assert.equal(Math.sign(game.truck.vx), -Math.sign(velocity));
  }
});

test('only rescue is instructed during opposite-side danger; delivery waits and then receives a full new preparation window', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  advance(game, 3);
  const old = game.cargo[0];
  Matter.Body.setStatic(old.body, true);
  Matter.Body.setPosition(old.body, { x: 310, y: 570 });
  game._pendingDelivery = { id: 2, type: 'coffee', x: 145, time: game.elapsed + .05, retry: false, delayed: 0 };
  const position = game.truck.x;
  advance(game, .3);
  let state = game.snapshot();
  assert.equal(state.guidance.kind, 'rescue');
  assert.equal(state.guidance.direction, 'right');
  assert.equal(state.guidance.cargoId, 1);
  assert.equal(state.nextDrop.x, 145);
  assert.equal(state.nextDrop.delayed, true);
  assert.ok(state.nextDrop.inSeconds > 2.7);
  const announcedDropAt = game.elapsed + state.nextDrop.inSeconds;
  assert.equal(game.truck.x, position, 'guidance never steers the car itself');
  assert.ok(!state.cargo.some(cargo => cargo.id === 2));
  Matter.Body.setPosition(old.body, { x: 210, y: 562 });
  Matter.Body.setStatic(old.body, false);
  until(game, current => current.guidance.kind === 'pickup', .6);
  state = game.snapshot();
  assert.equal(state.guidance.kind, 'pickup');
  assert.equal(state.guidance.direction, 'left');
  assert.ok(Math.abs(game.elapsed + state.nextDrop.inSeconds - announcedDropAt) < 1e-8, 'display handoff confirmation does not retime the delivery');
  assert.ok(state.nextDrop.inSeconds > Math.abs(state.nextDrop.x - state.truck.x) / 55 + .8, 'a delayed reader still has time to reach this locked drop');
  advance(game, 2.8);
  assert.equal(events.filter(event => event.type === 'spawn' && event.cargoId === 2).length, 1);
});

function lessonControl(state, game) {
  const goal = state.tutorial.targetX;
  if (Math.abs(goal - state.truck.x) <= 8) game.releaseControl();
  else game.setTarget(state.truck.x + Math.max(-60 / 9, Math.min(60 / 9, goal - state.truck.x)));
}
function until(game, predicate, seconds = 20, control) {
  for (let i = 0; i < seconds * 60 && game.status === 'playing' && !predicate(game.snapshot()); i++) {
    if (control) control(game.snapshot(), game);
    game.step(1 / 60);
  }
  return game.snapshot();
}

test('tutorial cannot progress by standing still, has no deadline, and restarts cleanly', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset('tutorial');
  const state = advance(game, 120);
  assert.equal(state.status, 'playing');
  assert.equal(state.duration, 0);
  assert.equal(state.requiredCatches, 0);
  assert.equal(state.tutorial.step, 1);
  assert.equal(state.tutorial.completed, false);
  assert.equal(state.cargo.length, 0);
  assert.equal(state.lives, 3);
  assert.equal(events.filter(event => event.type === 'spawn').length, 0);
  game.setTarget(245);
  game.pause(true);
  advance(game, 2);
  assert.equal(game.snapshot().tutorial.step, 1);
  assert.equal(game.cargo.length, 0);
  game.reset('normal');
  assert.equal(game.snapshot().tutorial, null);
  assert.equal(game.duration, 60);
  assert.equal(game.elapsed, 0);
  assert.equal(game.retries, 0);
});

test('tutorial step two requires explicit release and 0.6 seconds of real unpaused stillness', () => {
  const game = new ShiftEngine();
  game.reset('tutorial');
  until(game, state => state.tutorial.step === 2, 10, lessonControl);
  assert.equal(game.snapshot().tutorial.step, 2);
  game.setTarget(180);
  advance(game, 3);
  assert.equal(game.snapshot().tutorial.step, 2, 'stopping at a held target is not releasing');
  game.releaseControl();
  advance(game, .3);
  assert.equal(game.snapshot().tutorial.step, 2);
  game.pause(true);
  advance(game, 2);
  assert.equal(game.snapshot().tutorial.step, 2);
  game.pause(false);
  advance(game, .4);
  assert.equal(game.snapshot().tutorial.step, 3);
});

test('tutorial rescue cannot auto-complete without movement and retries without normal crash or lost lives', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset('tutorial');
  until(game, state => state.tutorial.step === 3, 10, lessonControl);
  game.releaseControl();
  advance(game, 10);
  const state = game.snapshot();
  assert.equal(state.status, 'playing');
  assert.equal(state.tutorial.step, 3);
  assert.equal(state.tutorial.completed, false);
  assert.equal(state.lives, 3);
  assert.equal(events.filter(event => event.type === 'crash').length, 0);
  assert.ok(events.some(event => event.type === 'tutorial' && event.phase === 'retry'));
});

test('all tutorial steps complete through actual move, release and airborne recatch, without formal score', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset('tutorial');
  const state = until(game, () => false, 20, lessonControl);
  assert.equal(state.status, 'win');
  assert.equal(state.tutorial.completed, true);
  assert.equal(state.tutorial.progress, 1);
  assert.equal(state.score, 0);
  assert.equal(state.catches, 1);
  assert.ok(state.saves >= 1);
  assert.deepEqual(events.filter(event => event.type === 'tutorial' && event.phase === 'success').map(event => event.step), [1, 2, 3]);
  assert.equal(events.find(event => event.type === 'win').tutorial, true);
  assert.ok(events.find(event => event.type === 'tutorial' && event.phase === 'launch').text.includes('向右'));
});

test('tutorial stop arrows always use matching stop instructions rather than continuing to ask for movement', () => {
  const game = new ShiftEngine();
  game.reset('tutorial');
  assert.equal(game.snapshot().guidance.direction, 'right');
  until(game, state => state.cargo.length === 1, 5, lessonControl);
  let state = game.snapshot();
  assert.equal(state.guidance.direction, 'stop');
  assert.equal(state.guidance.text, '松手停稳，等饼落下');
  until(game, snapshot => snapshot.tutorial.step === 2, 5, lessonControl);
  game.setTarget(180);
  advance(game, 2);
  state = game.snapshot();
  assert.equal(state.guidance.direction, 'stop');
  assert.equal(state.guidance.text, '松手刹车，停稳一小会');
  game.releaseControl();
  advance(game, .7);
  assert.equal(game.snapshot().guidance.text, '先停稳，准备救货');
});

test('an unsigned tutorial parcel is never restored and a free retry does not duplicate its body or signature', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset('tutorial');
  until(game, state => state.cargo.length === 1, 5, lessonControl);
  assert.equal(game.catches, 0);
  Matter.Body.setPosition(game.cargo[0].body, { x: 20, y: 665 });
  game.step(1 / 60);
  advance(game, .9);
  assert.equal(game.cargo.length, 0);
  assert.equal(game.catches, 0);
  assert.equal(game.lives, 3);
  advance(game, 1.2);
  assert.equal(game.cargo.length, 1);
  assert.equal(game.cargo[0].id, 1);
  assert.equal(game.cargo[0].caught, false);
  assert.equal(events.filter(event => event.type === 'catch').length, 0);
  assert.equal(events.filter(event => event.type === 'crash').length, 0);
});

function delayedGuidanceRun(delay, speed, variant = 0, returnEngine = false) {
  const game = new ShiftEngine();
  game.reset('normal', '2026-10-30', { variant });
  const history = [];
  let observeAt = 0, goal = 210, moving = false, hand = 210;
  for (let frame = 0; frame < 3800 && game.status === 'playing'; frame++) {
    const current = game.snapshot();
    history.push(current);
    if (current.elapsed + 1e-8 >= observeAt) {
      const seen = history[Math.max(0, history.length - 1 - Math.round(delay * 60))];
      if (['pickup', 'rescue', 'tail'].includes(seen.guidance.kind) && seen.guidance.direction !== 'stop') {
        goal = seen.guidance.targetX + Math.sin(frame * .031) * 6;
        moving = true;
      } else {
        game.releaseControl(); hand = current.truck.x; moving = false;
      }
      observeAt += .2;
    }
    if (moving) { hand += Math.max(-speed / 60, Math.min(speed / 60, goal - hand)); game.setTarget(hand); }
    game.step(1 / 60);
  }
  return returnEngine ? game : game.snapshot();
}
for (const delay of [.3, .6]) test(`normal route tolerates a ${delay}s delayed model using only the unique visible instruction`, () => {
  const state = delayedGuidanceRun(delay, 55);
  assert.equal(state.status, 'win');
  assert.ok(state.elapsed < 60);
  assert.equal(state.tail.completed, true);
  assert.ok(state.lives > 0);
  assert.ok(state.perfectCatches >= 3);
  assert.ok(state.catches >= state.requiredCatches);
  assert.equal(state.finishReason, 'arrived');
});

test('standing still never succeeds in the denser route', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset('normal');
  const state = advance(game, 63);
  assert.equal(state.status, 'lose');
  assert.ok(['incomplete', 'crash', 'tail_incomplete'].includes(state.finishReason));
  assert.equal(state.requiredCatches, 4);
  assert.equal(events.filter(event => event.type === 'win').length, 0);
  const result = events.find(event => event.type === 'lose');
  assert.equal(result.finishReason, state.finishReason);
  assert.equal(result.lives, state.lives);
});

test('spawn, retry preview and restoration cannot satisfy the four-signature arrival condition', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  advance(game, 3);
  assert.equal(game.catches, 1);
  for (let id = 2; id <= 4; id++) {
    const info = { id, type: 'coffee', x: 315, caught: false };
    game._allCargo.push(info);
    game._createCargo(info, 315, 142);
  }
  assert.equal(game.catches, 1, 'creating three airborne parcels is not signing for them');
  assert.equal(game.snapshot().requiredCatches, 4);
  for (const item of game.cargo.filter(cargo => !cargo.caught)) Matter.Body.setPosition(item.body, { x: 315, y: 665 });
  game.step(1 / 60);
  advance(game, .85);
  assert.equal(game.catches, 1);
  assert.equal(events.filter(event => event.type === 'catch').length, 1);
  assert.ok(game.snapshot().nextDrop.retry);
  assert.equal(game.snapshot().cargo.length, 1);
  assert.equal(game.snapshot().cargo[0].restored, true);
  game.elapsed = 59.99;
  game.step(1 / 60);
  advance(game, 2.1);
  const state = game.snapshot();
  assert.equal(state.status, 'lose');
  assert.equal(state.finishReason, 'incomplete');
  assert.equal(state.catches, 1);
});

function fourSignedFixture(onEvent = () => {}) {
  const game = new ShiftEngine(onEvent);
  game.reset();
  game._dropPlan = []; game._pendingDelivery = null;
  for (let id = 1; id <= 4; id++) {
    const info = { id, type: 'bread', x: 210, caught: false };
    game._allCargo.push(info);
    game._createCargo(info, 210, 562 - (id - 1) * 34.5);
  }
  advance(game, .8);
  assert.equal(game.catches, 4, 'fixture parcels must really touch the supported stack');
  return game;
}

test('a crash in the final 0.2 seconds never wins with an empty recovering cart', () => {
  const events = [];
  const game = fourSignedFixture(event => events.push(event));
  game._tail.active = game._tail.completed = true;
  game.elapsed = 59.8;
  Matter.Body.setPosition(game.cargo[3].body, { x: 330, y: 665 });
  game.step(1 / 60);
  assert.equal(game.lives, 2);
  assert.equal(game.cargo.length, 0);
  advance(game, .2);
  let state = game.snapshot();
  assert.equal(state.elapsed, 60);
  assert.equal(state.status, 'playing');
  assert.equal(state.settling, true);
  assert.equal(state.cargo.length, 0);
  assert.equal(events.filter(event => event.type === 'win').length, 0);
  const x = game.truck.x;
  game.setTarget(340);
  advance(game, .2);
  assert.equal(game.truck.x, x, 'settling releases player control and freezes the round clock');
  assert.equal(game.elapsed, 60);
  assert.equal(events.filter(event => event.type === 'win').length, 0);
  advance(game, 1.8);
  state = game.snapshot();
  assert.equal(state.status, 'win');
  assert.equal(state.finishReason, 'arrived');
  assert.equal(state.cargo.length, 4);
  assert.ok(state.cargo.every(cargo => cargo.caught && cargo.supported));
  assert.equal(state.timeBonus, 0);
});

test('unrecoverable arrival terminates within two settling seconds as unsafe, never as an empty-cart win', () => {
  const events = [];
  const game = fourSignedFixture(event => events.push(event));
  game._tail.active = game._tail.completed = true;
  for (const item of game.cargo) Matter.Composite.remove(game.engine.world, item.body);
  game.cargo = [];
  game._restoreCargo = () => {}; // Simulate a failed recovery, not an awarded delivery.
  game.elapsed = 59.99;
  game.step(1 / 60);
  assert.equal(game.snapshot().settling, true);
  advance(game, 2);
  assert.equal(game.status, 'lose');
  assert.equal(game.finishReason, 'unsafe_arrival');
  assert.equal(game.cargo.length, 0);
  assert.equal(events.filter(event => event.type === 'win').length, 0);
});

test('four signed parcels plus no tail input cannot arrive, even with stable cargo and surviving lives', () => {
  const events = [];
  const game = fourSignedFixture(event => events.push(event));
  game.elapsed = 41.99;
  game.releaseControl();
  advance(game, 21);
  const state = game.snapshot();
  assert.ok(state.lives > 0);
  assert.equal(state.catches, 4);
  assert.equal(state.status, 'lose');
  assert.equal(state.finishReason, 'tail_incomplete');
  assert.equal(state.tail.completed, false);
  assert.equal(events.filter(event => event.type === 'tail' && event.phase === 'station').length, 0);
});

test('tail stations each require new movement and a new release; holding a target is insufficient', () => {
  const game = fourSignedFixture();
  game.elapsed = 41.99;
  game.step(1 / 60);
  assert.equal(game.snapshot().tail.active, true);
  const target = game.snapshot().tail.targetX;
  for (let i = 0; i < 180; i++) {
    game.setTarget(game.truck.x + Math.max(-45 / 9, Math.min(45 / 9, target - game.truck.x)));
    game.step(1 / 60);
  }
  assert.equal(game.snapshot().tail.step, 1, 'a held target is not an explicit release');
  game.releaseControl();
  advance(game, .3);
  assert.equal(game.snapshot().tail.step, 1);
  advance(game, .3);
  assert.equal(game.snapshot().tail.step, 2);
  assert.equal(game.snapshot().tail.progress, 0);
  advance(game, .8);
  assert.equal(game.snapshot().tail.completed, false, 'previous station release cannot complete the next');
});

test('an early complete run awards explicit tail/time points once and does not reward further steps', () => {
  const game = delayedGuidanceRun(.3, 55, 0, true);
  const state = game.snapshot();
  assert.equal(state.status, 'win');
  assert.ok(state.elapsed < 55);
  assert.equal(state.tailBonus, 200);
  assert.ok(state.timeBonus >= 60);
  const score = state.score;
  for (let i = 0; i < 200; i++) game.step(.1);
  assert.equal(game.snapshot().score, score);
  assert.equal(game.snapshot().timeBonus, state.timeBonus);
  game.reset('normal', '2026-10-30', { variant: 2 });
  assert.equal(game.snapshot().settling, false);
  assert.equal(game.snapshot().tailBonus, 0);
  assert.equal(game.snapshot().timeBonus, 0);
  assert.equal(game.snapshot().assists, 0);
});

test('a stable supported edge parcel is not an endless rescue, while a three-second genuine rescue gets one stated checkpoint', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  game._dropPlan = []; game._pendingDelivery = null;
  const info = { id: 1, type: 'coffee', x: 283, caught: true };
  game._allCargo.push(info);
  const edge = game._createCargo(info, 283, 565, true);
  Matter.Body.setAngle(edge.body, Math.PI / 2);
  advance(game, .5);
  assert.equal(edge.supported, true);
  assert.ok(game.snapshot().cargo[0].risk > .52);
  assert.equal(game._rescueCargo(), null);
  assert.notEqual(game.snapshot().guidance.kind, 'rescue');
  Matter.Body.setStatic(edge.body, true);
  Matter.Body.setPosition(edge.body, { x: 315, y: 500 });
  edge.supported = false;
  const catches = game.catches, perfect = game.perfectCatches;
  const x = game.truck.x;
  advance(game, 3.2);
  assert.equal(game.assists, 1);
  assert.equal(game.truck.x, x);
  assert.equal(game.catches, catches);
  assert.equal(game.perfectCatches, perfect);
  const assist = events.find(event => event.type === 'recovery' && event.phase === 'assist');
  assert.ok(assist.text.includes('扶正'));
  assert.equal(assist.points, -25);
  assert.equal(events.filter(event => ['catch', 'save'].includes(event.type)).length, 0);
  advance(game, 2);
  assert.equal(game.assists, 1);
});

test('a continuous rescue cannot postpone its checkpoint by alternating endangered parcel IDs', () => {
  const game = new ShiftEngine();
  game.reset();
  game._dropPlan = []; game._pendingDelivery = null;
  for (const id of [1, 2]) {
    const info = { id, type: 'bread', x: 310, caught: true };
    game._allCargo.push(info);
    const item = game._createCargo(info, id === 1 ? 315 : 300, 500);
    Matter.Body.setStatic(item.body, true);
  }
  for (let frame = 0; frame < 192; frame++) {
    if (game.assists === 0) {
      const rightId = Math.floor(frame / 15) % 2 + 1;
      for (const item of game.cargo) Matter.Body.setPosition(item.body, { x: item.id === rightId ? 315 : 300, y: item.id === 1 ? 500 : 440 });
    }
    game.step(1 / 60);
  }
  assert.equal(game.assists, 1);
  assert.equal(game.catches, 0);
  assert.equal(game.perfectCatches, 0);
  assert.equal(game.cargo.length, 2);
});

function signedParcelFixture(count, onEvent = () => {}) {
  const game = new ShiftEngine(onEvent);
  game.reset();
  game._dropPlan = []; game._pendingDelivery = null;
  for (let id = 1; id <= count; id++) {
    const info = { id, type: 'bread', x: 210, caught: false };
    game._allCargo.push(info);
    game._createCargo(info, 210, 562 - (id - 1) * 34.5);
  }
  advance(game, .8);
  assert.equal(game.catches, count);
  return game;
}
function threeSignedFixture(onEvent = () => {}) { return signedParcelFixture(3, onEvent); }

test('closing deliveries with only three real signatures and no airborne chance ends immediately, without a doomed tail', () => {
  const events = [];
  const game = threeSignedFixture(event => events.push(event));
  game.elapsed = 41.99;
  game.step(1 / 60);
  const state = game.snapshot();
  assert.equal(state.status, 'lose');
  assert.equal(state.finishReason, 'incomplete');
  assert.ok(state.elapsed < 42.1);
  assert.equal(state.catches, 3);
  assert.equal(state.lives, 3);
  assert.equal(state.tailBonus, 0);
  assert.equal(events.filter(event => event.type === 'tail').length, 0);
  const score = state.score;
  advance(game, 20);
  assert.equal(game.score | 0, score);
  assert.equal(events.filter(event => event.type === 'lose').length, 1);
});

test('a final airborne unsigned parcel remains a real chance after closing and can still be physically signed', () => {
  const events = [];
  const game = threeSignedFixture(event => events.push(event));
  const info = { id: 4, type: 'bread', x: 210, caught: false };
  game._allCargo.push(info);
  game._createCargo(info, 210, 180);
  game.elapsed = 41.99;
  game.step(1 / 60);
  let state = game.snapshot();
  assert.equal(state.status, 'playing');
  assert.equal(state.catches, 3);
  assert.equal(game._deliveriesClosed, true);
  assert.ok(['pickup', 'brake'].includes(state.guidance.kind));
  assert.equal(state.guidance.cargoId, 4);
  advance(game, 1);
  state = game.snapshot();
  assert.equal(state.status, 'playing');
  assert.equal(state.catches, 4);
  assert.equal(events.filter(event => event.type === 'catch' && event.cargoId === 4).length, 1);
  assert.equal(events.filter(event => event.type === 'lose').length, 0);
});

test('delivery capacity counts distinct unsigned IDs and cannot double-count duplicate physical bodies', () => {
  const game = signedParcelFixture(2);
  const info = { id: 3, type: 'bread', x: 210, caught: false };
  game._allCargo.push(info);
  game._createCargo(info, 210, 180);
  game._createCargo(info, 210, 100);
  game._deliveriesClosed = true;
  game.step(1 / 60);
  assert.equal(game.status, 'lose');
  assert.equal(game.finishReason, 'incomplete');
  assert.equal(game.catches, 2);
});

test('tail feedback and station accumulation share release, braking, named cargo and holding conditions', () => {
  const game = fourSignedFixture();
  game.elapsed = 41.99;
  game.step(1 / 60);
  assert.equal(game.snapshot().tail.feedback.phase, 'approach');
  const target = game.snapshot().tail.targetX;
  until(game, state => Math.abs(state.truck.x - target) <= 20, 5, (state, engine) => engine.setTarget(state.truck.x + Math.max(-45 / 9, Math.min(45 / 9, target - state.truck.x))));
  let state = game.snapshot();
  assert.equal(state.tail.feedback.phase, 'release');
  assert.equal(state.guidance.detail, state.tail.feedback.detail);
  game.releaseControl();
  state = game.snapshot();
  assert.equal(state.tail.feedback.phase, 'braking');
  advance(game, .25);
  game._tail.hold = game._tail.progress = 0;
  for (const item of game.cargo) {
    item.supported = true;
    Matter.Body.setVelocity(item.body, { x: game.truck.vx / 60, y: 0 });
  }
  const blocker = game.cargo.find(item => item.id === 4);
  blocker.supported = false;
  state = game.snapshot();
  assert.equal(state.tail.feedback.phase, 'cargo_wait');
  assert.equal(state.tail.feedback.blockingCargoId, 4);
  assert.equal(state.tail.feedback.blockingCargoType, 'bread');
  assert.ok(state.tail.feedback.detail.includes('支撑'));
  game._updateTail(.2);
  assert.equal(game.snapshot().tail.progress, 0);
  blocker.supported = true;
  Matter.Body.setVelocity(blocker.body, { x: game.truck.vx / 60 + 1, y: 0 });
  assert.ok(game.snapshot().tail.feedback.detail.includes('横向滑动'));
  Matter.Body.setVelocity(blocker.body, { x: game.truck.vx / 60, y: 0 });
  state = game.snapshot();
  assert.equal(state.tail.feedback.phase, 'holding');
  game._updateTail(.2);
  state = game.snapshot();
  assert.ok(state.tail.feedback.progress > .4 && state.tail.feedback.progress < .5);
  assert.equal(state.tail.feedback.progress, state.tail.progress);
  assert.equal(state.guidance.detail, state.tail.feedback.detail);
  game._recovery = .2;
  assert.equal(game.snapshot().tail.feedback.phase, 'recovery');
});

test('two-station completion never promises immediate arrival while a required fourth parcel is still airborne', () => {
  const events = [];
  const game = threeSignedFixture(event => events.push(event));
  const info = { id: 4, type: 'bread', x: 210, caught: false };
  game._allCargo.push(info); game._createCargo(info, 210, 140);
  game.elapsed = 45;
  Object.assign(game._tail, { active: true, step: 2, targetX: game.truck.x, originX: game.truck.x - 25, moved: 25, released: true, hold: .44 });
  game.releaseControl();
  game.step(1 / 60);
  assert.equal(game.status, 'playing');
  assert.equal(game.catches, 3);
  assert.equal(game.snapshot().tail.completed, true);
  assert.equal(game.snapshot().tail.feedback.phase, 'complete');
  const completed = events.find(event => event.type === 'tail' && event.phase === 'complete');
  assert.ok(completed.text.includes('真实签收'));
  assert.ok(!completed.text.includes('提前收工'));
  assert.equal(game.snapshot().guidance.cargoId, 4);
});

test('losing the last airborne chance after deliveries close ends incomplete immediately rather than promising an impossible retry', () => {
  const game = threeSignedFixture();
  const info = { id: 4, type: 'bread', x: 210, caught: false };
  game._allCargo.push(info);
  const falling = game._createCargo(info, 210, 180);
  game.elapsed = 41.99;
  game.step(1 / 60);
  assert.equal(game.status, 'playing');
  Matter.Body.setPosition(falling.body, { x: 330, y: 665 });
  game.step(1 / 60);
  assert.equal(game.status, 'lose');
  assert.equal(game.finishReason, 'incomplete');
  assert.ok(game.elapsed < 42.1);
  assert.equal(game.catches, 3);
  assert.equal(game.lives, 2);
});

function keyboardGuidanceRun(delay, speed = 55, options = {}) {
  let slowmo = 0;
  const game = new ShiftEngine(event => { if (event.type === 'save') slowmo = .32; if (options.onEvent) options.onEvent(event); });
  game.reset(options.mode || 'normal', options.seed || '2026-10-30', { variant: options.variant || 0 });
  const history = [];
  let nextObservation = 0, key = 0, hand = 210, goal = 210, moving = false;
  for (let frame = 0; frame < 4200 && game.status === 'playing'; frame++) {
    const state = game.snapshot();
    if (options.onState) options.onState(state);
    history.push(state);
    if (frame / 60 + 1e-8 >= nextObservation) {
      const cue = history[Math.max(0, history.length - 1 - Math.round(delay * 60))].guidance;
      const direction = ['pickup', 'rescue', 'tail'].includes(cue.kind) && cue.direction === 'left' ? -1
        : ['pickup', 'rescue', 'tail'].includes(cue.kind) && cue.direction === 'right' ? 1 : 0;
      if (options.input === 'touch') {
        if (direction) { goal = cue.targetX + Math.sin(frame * .031) * 6; moving = true; }
        else { game.releaseControl(); hand = state.truck.x; moving = false; }
      } else {
        if (key && !direction) game.releaseControl();
        key = direction;
      }
      nextObservation += .2;
    }
    // Matches app keyboard targeting. It is a held key, not a pointer motor
    // interpolated towards an exact world coordinate.
    if (options.input === 'touch' && moving && !state.settling) {
      hand += Math.max(-speed / 60, Math.min(speed / 60, goal - hand)); game.setTarget(hand);
    } else if (key && !state.settling) game.setTarget(state.truck.x + key * (speed / 9));
    game.step((1 / 60) * (slowmo > 0 ? .36 : 1));
    slowmo = Math.max(0, slowmo - 1 / 60);
  }
  return game.snapshot();
}
for (const delay of [.3, .6]) test(`calibrated 55px/s held-key control survives ${delay}s reaction delay without replacing keyboard movement with a pointer robot`, () => {
  const state = keyboardGuidanceRun(delay);
  assert.equal(state.status, 'win');
  assert.equal(state.finishReason, 'arrived');
  assert.ok(state.elapsed < 60);
  assert.ok(state.catches >= 4);
  assert.equal(state.tail.completed, true);
});

test('normal tail begins after the full physical delivery job, without waiting for a fixed clock or cancelling an unannounced last parcel', () => {
  const game = new ShiftEngine();
  game.reset('normal', '2026-11-11');
  const deliveries = [], signatures = [], tailStarts = [];
  game.onEvent = event => {
    if (event.type === 'spawn') deliveries.push(event);
    if (event.type === 'catch') signatures.push(event);
    if (event.type === 'tail' && event.phase === 'start') {
      tailStarts.push(event);
      const state = game.snapshot();
      assert.equal(deliveries.filter(item => !item.retry).length, 6);
      assert.equal(new Set(signatures.map(item => item.cargoId)).size, 6);
      assert.equal(state.nextDrop, null);
      assert.ok(state.cargo.every(item => item.caught && item.supported));
      assert.equal(state.tail.startAt, event.elapsed);
    }
  };
  const control = followHints(50);
  until(game, state => state.catches >= 4 && !state.nextDrop, 25, control);
  let state = game.snapshot();
  assert.ok(state.catches >= 4);
  assert.equal(deliveries.length, 4);
  assert.equal(state.tail.active, false, 'unannounced parcels still belong to this job');
  state = until(game, () => false, 40, control);
  assert.equal(state.status, 'win');
  assert.equal(tailStarts.length, 1);
  assert.ok(state.tail.startAt < 40);
  assert.ok(state.elapsed < 48);
  game.reset('normal', '2026-11-11');
  assert.equal(game.snapshot().tail.startAt, null);
  assert.equal(game.snapshot().tail.active, false);
});

function finishedPlanFixture(onEvent) {
  const game = fourSignedFixture(onEvent);
  game._dropPlan = game._allCargo.map(info => ({ id: info.id, type: info.type, x: info.x, time: .1, retry: false }));
  game._planIndex = game._dropPlan.length;
  game._sentIds = new Set(game._allCargo.map(info => info.id)); // fixture bodies were physically placed and signed
  game.releaseControl();
  return game;
}

test('early tail preserves a real airborne parcel and retry preparation instead of cancelling them', () => {
  const events = [];
  const game = finishedPlanFixture(event => events.push(event));
  const retry = { id: 5, type: 'bread', x: 210, caught: false };
  game._allCargo.push(retry);
  game._retryQueue.push({ ...retry });
  advance(game, .1);
  let state = game.snapshot();
  assert.equal(state.tail.active, false);
  assert.equal(state.nextDrop.retry, true);
  assert.ok(state.nextDrop.inSeconds > 2.8, 'the retry retains its full preparation');
  advance(game, 2.5);
  assert.equal(game.snapshot().tail.active, false);
  until(game, current => current.cargo.some(item => item.id === 5), 1);
  state = game.snapshot();
  assert.ok(state.cargo.some(item => item.id === 5 && !item.caught));
  assert.equal(state.tail.active, false, 'spawning alone is not signing');
  until(game, current => current.tail.active, 3);
  state = game.snapshot();
  assert.equal(state.catches, 5);
  assert.equal(state.tail.active, true);
  assert.equal(events.filter(event => event.type === 'catch' && event.cargoId === 5).length, 1);
  assert.ok(state.tail.startAt < 10);
});

test('early tail waits for physical recovery and every signed parcel, and pause cannot advance the transition', () => {
  const game = finishedPlanFixture();
  Matter.Body.setPosition(game.cargo[3].body, { x: 330, y: 665 });
  game.step(1 / 60);
  assert.equal(game.lives, 2);
  assert.equal(game.snapshot().tail.active, false);
  assert.equal(game.cargo.length, 0);
  game.pause(true);
  const frozen = game.elapsed;
  advance(game, 3);
  assert.equal(game.elapsed, frozen);
  assert.equal(game.snapshot().tail.startAt, null);
  game.pause(false);
  until(game, state => state.tail.active, 3);
  const state = game.snapshot();
  assert.equal(state.tail.active, true);
  assert.equal(state.cargo.length, 4);
  assert.ok(state.cargo.every(item => item.caught && item.supported && item.restored));
  assert.equal(state.catches, 4);
});

test('the new daily date preserves its seeded job and starts tail after the full job across frame rates and retrying the same line', () => {
  const a = new ShiftEngine(), b = new ShiftEngine();
  a.reset('daily', '2026-11-11', { variant: 0 });
  b.reset('daily', '2026-11-11', { variant: 2 });
  const planned = JSON.stringify(a._dropPlan);
  assert.equal(planned, JSON.stringify(b._dropPlan));
  assert.equal(a.snapshot().tail.variant, b.snapshot().tail.variant);
  for (let frame = 0; frame < 600; frame++) a.step(1 / 60);
  for (let frame = 0; frame < 300; frame++) b.step(1 / 30);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.reset('daily', '2026-11-11', { variant: 2 });
  assert.equal(JSON.stringify(a._dropPlan), planned);
  const state = advance(a, 63, followHints(50));
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.equal(state.job.sent, state.job.total);
  assert.ok(state.tail.startAt < 42, 'a completed safe daily job does not wait for the old fixed deadline');
});

test('road preview and active warning expose distinct timing, freeze on pause, and announce once', () => {
  const events = [];
  const game = new ShiftEngine(event => events.push(event));
  game.reset();
  advance(game, 11);
  let state = game.snapshot();
  assert.equal(state.warning.phase, 'upcoming');
  assert.ok(state.warning.inSeconds > .9 && state.warning.inSeconds < 1.1);
  assert.equal(state.warning.kind, 'bump');
  const preview = { ...state.warning };
  game.pause(true);
  advance(game, 2);
  assert.deepEqual(game.snapshot().warning, preview);
  game.pause(false);
  advance(game, 1.1);
  state = game.snapshot();
  assert.equal(state.warning.phase, 'active');
  assert.equal(state.warning.inSeconds, 0);
  assert.ok(state.warning.remainingSeconds > 1 && state.warning.remainingSeconds < 1.3);
  const announcements = events.filter(event => event.type === 'warning' && event.kind === 'bump');
  assert.equal(announcements.length, 1);
  assert.equal(announcements[0].phase, 'upcoming');
  assert.ok(announcements[0].inSeconds > 1.2);
  game.pause(true);
  const active = { ...state.warning };
  advance(game, 2);
  assert.deepEqual(game.snapshot().warning, active);
  game.pause(false);
  advance(game, 1.5);
  assert.equal(game.snapshot().warning, null);
});

test('job counts physical delivery IDs once and distinguishes a missed item, queued retry, retry flight and real signature', () => {
  const game = new ShiftEngine();
  game.reset();
  assert.deepEqual({ ...game.snapshot().job, detail: '' }, { minimumMet: false, required: 4, total: 6, sent: 0, remainingDeliveries: 6, airborneUnsigned: 0, retryCount: 0, unthrownCount: 0, retryExpiredCount: 0, unavailableDeliveries: 0, deliveriesClosed: false, phase: 'delivery', detail: '' });
  until(game, state => state.cargo.some(cargo => cargo.id === 2), 10);
  let state = game.snapshot();
  assert.equal(state.job.sent, 2);
  assert.equal(state.job.remainingDeliveries, 4);
  assert.equal(state.job.airborneUnsigned, 1);
  const second = game.cargo.find(item => item.id === 2);
  Matter.Body.setPosition(second.body, { x: 315, y: 665 });
  game.step(1 / 60);
  state = game.snapshot();
  assert.equal(state.catches, 1);
  assert.equal(state.job.retryCount, 1);
  assert.equal(state.job.airborneUnsigned, 0);
  assert.equal(state.job.sent, 2);
  advance(game, .85);
  state = game.snapshot();
  assert.equal(state.nextDrop.retry, true);
  assert.equal(state.job.retryCount, 1);
  assert.equal(state.job.sent, 2);
  game._retryQueue.push({ id: 2, type: 'coffee', x: 315 });
  assert.equal(game.snapshot().job.retryCount, 1, 'pending and queued copies of one ID are one outstanding job');
  game._retryQueue = [];
  let sawRetryFlight = false;
  until(game, current => current.catches === 2, 7, (current, engine) => {
    if (current.cargo.some(item => item.retry && !item.caught)) {
      sawRetryFlight = true;
      assert.equal(current.job.airborneUnsigned, 1);
      assert.equal(current.job.retryCount, 1);
      assert.equal(current.job.sent, 2);
    }
    if (Math.abs(current.truck.x - 315) < 8) engine.releaseControl();
    else engine.setTarget(current.truck.x + Math.max(-45 / 9, Math.min(45 / 9, 315 - current.truck.x)));
  });
  state = game.snapshot();
  assert.equal(sawRetryFlight, true);
  assert.equal(state.catches, 2);
  assert.equal(state.retries, 1);
  assert.equal(state.job.sent, 2);
  assert.equal(state.job.retryCount, 0);
  assert.equal(state.job.airborneUnsigned, 0);
});

test('minimum signatures are distinct from completing the planned delivery job and the real two stations', () => {
  let minimumState, lastFlight, tailState;
  const state = keyboardGuidanceRun(.3, 55, { input: 'touch', onState: current => {
    if (!minimumState && current.catches === 4) minimumState = current;
    if (!lastFlight && current.job.sent === 6 && current.job.airborneUnsigned) lastFlight = current;
    if (!tailState && current.tail.active) tailState = current;
  } });
  assert.equal(minimumState.job.minimumMet, true);
  assert.equal(minimumState.job.remainingDeliveries, 2);
  assert.equal(minimumState.job.phase, 'delivery');
  assert.ok(minimumState.job.detail.includes('还剩2件'));
  assert.equal(minimumState.tail.active, false);
  assert.equal(lastFlight.job.remainingDeliveries, 0);
  assert.equal(lastFlight.job.airborneUnsigned, 1);
  assert.equal(lastFlight.job.phase, 'delivery');
  assert.equal(lastFlight.tail.active, false);
  assert.equal(tailState.job.phase, 'tail');
  assert.equal(tailState.job.sent, 6);
  assert.equal(tailState.job.airborneUnsigned, 0);
  assert.equal(state.status, 'win');
  assert.equal(state.job.phase, 'complete');
  assert.equal(state.job.remainingDeliveries, 0);
  assert.equal(state.job.minimumMet, true);
});

test('all normal variants remain finishable by actual held-key and touch control with 0.3 and 0.6 second reactions', () => {
  for (const variant of [0, 1, 2]) for (const input of ['keyboard', 'touch']) for (const delay of [.3, .6]) {
    const state = keyboardGuidanceRun(delay, 55, { variant, input });
    assert.equal(state.status, 'win', `variant ${variant}, ${input}, ${delay}s`);
    assert.equal(state.catches, 6);
    assert.equal(state.job.sent, 6);
    assert.equal(state.tail.completed, true);
    assert.ok(state.lives > 0);
  }
});

test('daily sends the whole real plan and transitions without a long pure-steady wait for both controls and reactions', () => {
  for (const input of ['keyboard', 'touch']) for (const delay of [.3, .6]) {
    const events = [];
    let steady = 0, longestSteady = 0;
    const state = keyboardGuidanceRun(delay, 55, { mode: 'daily', seed: '2026-11-11', input, onEvent: event => events.push(event), onState: current => {
      steady = current.guidance.kind === 'steady' ? steady + 1 / 60 : 0;
      longestSteady = Math.max(longestSteady, steady);
      if (current.tail.active) assert.equal(current.job.remainingDeliveries, 0);
    } });
    assert.equal(state.status, 'win', `${input}, ${delay}s`);
    assert.equal(state.catches, 6);
    const originalSpawns = events.filter(event => event.type === 'spawn' && !event.retry);
    assert.deepEqual(originalSpawns.map(event => event.cargoId), [1, 2, 3, 4, 5, 6]);
    assert.ok(originalSpawns.every(event => event.elapsed <= 39));
    assert.ok(state.tail.startAt < 42);
    assert.ok(longestSteady < 6, `pure steady was ${longestSteady}s`);
    assert.equal(state.job.sent, state.job.total);
    assert.equal(state.job.retryCount, 0);
  }
});

test('normal route differences affect early real cargo while original-line reset preserves the exact plan', () => {
  const secondDeliveries = [], thirdDeliveries = [], plans = [];
  for (const variant of [0, 1, 2]) {
    const events = [], game = new ShiftEngine(event => events.push(event));
    game.reset('normal', '2026-11-11', { variant });
    const plan = JSON.stringify(game._dropPlan);
    plans.push(plan);
    advance(game, 16, followHints(55));
    secondDeliveries.push(events.find(event => event.type === 'spawn' && event.cargoId === 2));
    thirdDeliveries.push(events.find(event => event.type === 'spawn' && event.cargoId === 3));
    const route = game.snapshot().route;
    assert.equal(route.variant, variant);
    assert.ok(route.name && route.tagline);
    game.pause(true); advance(game, 3); game.pause(false);
    game.reset('normal', '2026-11-11', { variant });
    assert.equal(JSON.stringify(game._dropPlan), plan);
    assert.deepEqual(game.snapshot().route, route);
  }
  assert.equal(new Set(plans).size, 3);
  assert.ok(secondDeliveries.every(Boolean));
  assert.notEqual(secondDeliveries[0].x, secondDeliveries[1].x);
  assert.notEqual(secondDeliveries[0].cargoType, secondDeliveries[2].cargoType);
  assert.ok(thirdDeliveries.every(Boolean));
  assert.notEqual(thirdDeliveries[0].elapsed, thirdDeliveries[2].elapsed);
});

test('lobby resets emit no gameplay events and defer the first tutorial announcement until actual unpaused play', () => {
  const events = [], game = new ShiftEngine(event => events.push(event));
  for (const mode of ['normal', 'daily', 'tutorial']) {
    game.reset(mode, '2026-11-11', { variant: 2 });
    game.status = 'ready'; game.step(.1);
    assert.equal(events.length, 0);
    assert.ok(game.snapshot().route.name);
    assert.equal(game.snapshot().dateSeed, '2026-11-11');
  }
  game.reset('tutorial');
  game.pause(true); game.step(.1);
  assert.equal(events.length, 0);
  game.pause(false); game.step(1 / 60);
  assert.equal(events.filter(event => event.type === 'tutorial' && event.step === 1 && event.phase === 'start').length, 1);
  game.step(1 / 60);
  assert.equal(events.length, 1);
  game.reset('tutorial'); game.reset('daily', '2026-11-11'); game.step(1 / 60);
  assert.equal(events.length, 1, 'a previewed tutorial cannot leak an announcement into another mode');
});

test('meeting four signatures cannot cancel an otherwise legal final delivery between 36 and 39 seconds', () => {
  const events = [], game = finishedPlanFixture(event => events.push(event));
  game._dropPlan.push({ id: 5, type: 'bread', x: 210, time: 37.5, retry: false });
  game.elapsed = 34.75;
  game.step(1 / 60);
  assert.equal(game.catches, 4);
  assert.equal(game.snapshot().nextDrop.cargoId, 5);
  assert.equal(game.snapshot().tail.active, false);
  until(game, current => current.catches === 5, 5);
  const spawned = events.find(event => event.type === 'spawn' && event.cargoId === 5);
  assert.ok(spawned && spawned.elapsed > 36 && spawned.elapsed < 39);
  assert.equal(game.catches, 5, 'only the real final collision earns the extra signature');
  assert.ok(game.elapsed < 42);
});

test('a closed delivery window reports unsent work honestly without promising an impossible new delivery or retry', () => {
  const game = new ShiftEngine(); game.reset();
  until(game, state => state.catches === 4, 24, followHints(50));
  assert.equal(game.catches, 4);
  game._closeDeliveries();
  let state = game.snapshot();
  assert.equal(state.job.minimumMet, true);
  assert.equal(state.job.remainingDeliveries, 2);
  assert.equal(state.job.phase, 'settling');
  assert.equal(state.job.deliveriesClosed, true);
  assert.ok(state.job.detail.includes('投递已截止'));
  assert.ok(state.job.detail.includes('2件原单未投出'));
  assert.ok(!state.job.detail.includes('待投递'));
  assert.ok(!state.guidance.text.includes('等下一件'));
  assert.ok(!state.guidance.detail?.includes('新货才会继续'));
  game._tail.active = true;
  state = game.snapshot();
  assert.equal(state.job.phase, 'tail');
  assert.ok(state.job.detail.includes('收工两站'));
});

test('all four routes require real interception: no input until tail cannot obtain four signatures', () => {
  for (const config of [{ mode: 'normal', variant: 0 }, { mode: 'normal', variant: 1 }, { mode: 'normal', variant: 2 }, { mode: 'daily', variant: 0 }]) {
    const events = [], game = new ShiftEngine(event => events.push(event));
    game.reset(config.mode, '2026-11-11', { variant: config.variant });
    const state = advance(game, 62, (current, engine) => {
      if (!current.tail.active) return; // Deliberately no target or release before tail.
      const cue = current.guidance;
      if (cue.direction === 'left') engine.setTarget(current.truck.x - 55 / 9);
      else if (cue.direction === 'right') engine.setTarget(current.truck.x + 55 / 9);
      else engine.releaseControl();
    });
    assert.equal(state.status, 'lose', JSON.stringify(config));
    assert.ok(state.catches < 4);
    assert.equal(events.filter(event => event.type === 'catch').length, state.catches);
    assert.ok(events.some(event => event.type === 'catch' && event.cargoId === 1), 'the first easy parcel still really lands');
    assert.ok(events.some(event => event.type === 'spawn' && event.cargoId === 2));
    assert.ok(events.some(event => event.type === 'crash' && event.cause === '漏接'));
    const passiveLeft = 210 - 82, passiveRight = 210 + 82;
    const widths = { bread: 94, coffee: 28, pot: 56, fish: 64, monday: 46 };
    const unreachable = game._dropPlan.filter(item => item.x + widths[item.type] / 2 < passiveLeft || item.x - widths[item.type] / 2 > passiveRight);
    assert.ok(unreachable.length >= 3, 'at least three actual parcel extents lie outside the idle deck');
  }
});

test('a long interception receives an actual locked preparation window rather than assuming a short universal preview', () => {
  let announcedAt = null, targetX = null, distance = null;
  const events = [];
  const state = keyboardGuidanceRun(.6, 55, { variant: 2, onEvent: event => events.push(event), onState: current => {
    if (current.nextDrop?.cargoId !== 3) return;
    if (announcedAt === null) { announcedAt = current.elapsed; targetX = current.nextDrop.x; distance = Math.abs(targetX - current.truck.x); }
    assert.equal(current.nextDrop.x, targetX);
  } });
  const drop = events.find(event => event.type === 'spawn' && event.cargoId === 3 && !event.retry);
  assert.ok(distance > 190);
  assert.ok(drop.elapsed - announcedAt >= 5.7);
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.ok(events.find(event => event.type === 'spawn' && event.cargoId === 1).elapsed < 1, 'the first parcel remains immediate');
});

function parkedFirstStationFixture(onEvent = () => {}) {
  const game = fourSignedFixture(onEvent);
  game.elapsed = 42; game.step(1 / 60);
  for (let frame = 0; frame < 240 && Math.abs(game.truck.x - game._tail.targetX) > 8; frame++) {
    game.setTarget(game.truck.x + Math.max(-45 / 9, Math.min(45 / 9, game._tail.targetX - game.truck.x)));
    game.step(1 / 60);
  }
  game.releaseControl();
  until(game, state => state.tail.progress > .3, 1);
  assert.ok(game._tail.moved >= 18);
  assert.equal(game._tail.released, true);
  return game;
}

test('an actual three-second rescue checkpoint preserves an already real release and cannot leave parking falsely waiting for another release', () => {
  const events = [], game = parkedFirstStationFixture(event => events.push(event));
  const floating = game.cargo[3];
  Matter.Body.setStatic(floating.body, true);
  Matter.Body.setPosition(floating.body, { x: game.truck.x + 105, y: 480 });
  until(game, state => state.assists > 0, 3.3);
  assert.equal(game.assists, 1);
  assert.equal(game._tail.released, true);
  assert.equal(game.snapshot().truck.braking, true);
  const state = until(game, current => current.tail.step === 2, 2.5); // no further input
  assert.equal(state.tail.step, 2);
  assert.equal(state.catches, 4);
  assert.equal(events.filter(event => event.type === 'crash').length, 0);
  assert.equal(events.filter(event => event.type === 'tail' && event.phase === 'station' && event.step === 1).length, 1);
});

test('a brief real support gap preserves parking progress without counting during the gap, while major danger still clears it', () => {
  const game = parkedFirstStationFixture();
  const before = game.snapshot().tail.progress;
  const top = game.cargo[3];
  Matter.Body.setPosition(top.body, { x: top.body.position.x, y: top.body.position.y - 4 });
  Matter.Body.setVelocity(top.body, { x: 0, y: 0 });
  let sawGap = false;
  for (let frame = 0; frame < 50 && game.snapshot().tail.step === 1; frame++) {
    game.step(1 / 60);
    const state = game.snapshot();
    if (state.tail.feedback.phase === 'cargo_wait') {
      sawGap = true;
      assert.ok(state.tail.progress > 0);
      assert.ok(state.tail.progress <= before + .001, 'no station time is earned without actual stable support');
    }
  }
  assert.equal(sawGap, true);
  assert.equal(game.snapshot().tail.step, 2);
  const dangerous = parkedFirstStationFixture();
  const offDeck = dangerous.cargo[3];
  Matter.Body.setStatic(offDeck.body, true);
  Matter.Body.setPosition(offDeck.body, { x: dangerous.truck.x + 110, y: 480 });
  advance(dangerous, .2);
  assert.equal(dangerous.snapshot().tail.progress, 0);
  assert.equal(dangerous.snapshot().tail.step, 1);
  assert.equal(dangerous.snapshot().guidance.kind, 'rescue');
});

function lastMissFixture(signedCount = 4, nextPlan = null) {
  const events = [], game = signedCount === 4 ? finishedPlanFixture(event => events.push(event)) : threeSignedFixture(event => events.push(event));
  if (signedCount !== 4) {
    game._dropPlan = game._allCargo.map(info => ({ id: info.id, type: info.type, x: info.x, time: .1 }));
    game._planIndex = game._dropPlan.length;
    game._sentIds = new Set(game._allCargo.map(info => info.id));
  }
  const last = { id: signedCount + 1, type: 'coffee', x: 330, time: 35.3 };
  game._dropPlan.push(last);
  if (nextPlan) game._dropPlan.push(nextPlan);
  game.elapsed = nextPlan ? 35.3 : 36.5;
  game._spawnDelivery(last);
  const body = game.cargo.find(item => item.id === last.id).body;
  Matter.Body.setPosition(body, { x: 330, y: 665 });
  game.step(1 / 60);
  return { game, events };
}

test('a late real miss expires an impossible retry, explains it, and begins tail as soon as the signed job is safe', () => {
  const { game, events } = lastMissFixture();
  const state = until(game, current => current.tail.active, 3);
  assert.equal(state.catches, 4);
  assert.equal(state.job.retryCount, 0);
  assert.equal(state.job.unavailableDeliveries, 1);
  assert.equal(state.job.deliveriesClosed, true);
  assert.equal(state.nextDrop, null);
  assert.ok(state.tail.startAt < 39, 'there is no fixed42 wait for a retry that can no longer be sent');
  assert.ok(events.some(event => event.type === 'recovery' && event.phase === 'expired' && event.text.includes('窗口已过')));
  assert.ok(!events.some(event => event.type === 'recovery' && /稍后补发|准备补发/.test(event.text || '')), 'an already impossible retry is never promised, even during recovery');
  assert.equal(events.filter(event => event.type === 'spawn' && event.retry).length, 0);
  const insufficient = lastMissFixture(3).game;
  advance(insufficient, 2);
  assert.equal(insufficient.status, 'lose');
  assert.equal(insufficient.finishReason, 'incomplete');
  assert.ok(insufficient.elapsed < 39);
});

test('an impossible far retry cannot cancel another real planned parcel that still has a full preparation window', () => {
  const next = { id: 6, type: 'bread', x: 210, time: 38.95 };
  const { game, events } = lastMissFixture(4, next);
  until(game, state => state.nextDrop?.cargoId === 6, 1.2);
  const state = game.snapshot();
  assert.equal(state.job.deliveriesClosed, false);
  assert.equal(state.job.retryCount, 0);
  assert.equal(state.job.unavailableDeliveries, 1);
  assert.equal(state.nextDrop.cargoId, 6);
  assert.ok(state.nextDrop.inSeconds >= 2.7);
  assert.equal(state.tail.active, false);
  assert.ok(events.some(event => event.type === 'recovery' && event.phase === 'expired'));
});

test('next normal route preview cycles truthfully and cannot be mutated through a snapshot', () => {
  const game = new ShiftEngine();
  for (const variant of [0, 1, 2]) {
    const current = game.reset('normal', '2026-11-11', { variant }).route;
    const expected = game.reset('normal', '2026-11-11', { variant: (variant + 1) % 3 }).route;
    assert.deepEqual(current.next, { name: expected.name, tagline: expected.tagline, variant: expected.variant });
  }
  game.reset('normal');
  game.snapshot().route.next.name = 'changed outside';
  assert.notEqual(game.snapshot().route.next.name, 'changed outside');
  assert.equal(game.reset('daily', '2026-11-11').route.next, undefined);
  assert.equal(game.reset('tutorial').route.next, undefined);
});

test('the real light-heavy trajectory does not hand a moving unsupported-margin rescue directly to the opposite tail target', () => {
  const watched = [];
  const state = keyboardGuidanceRun(.3, 55, { input: 'touch', variant: 2, onState: current => {
    const monday = current.cargo.find(item => item.type === 'monday');
    if (!monday || current.elapsed < 37 || current.elapsed > 39 || current.truck.vx >= -12 || monday.risk <= .6 || current.rescue?.cargoId !== monday.id || current.rescue.supportMargin >= 0) return;
    watched.push({ at: current.elapsed, x: current.truck.x, margin: current.rescue.supportMargin, direction: current.guidance.direction });
    assert.equal(current.guidance.kind, 'rescue');
    assert.ok(['recovering', 'edge'].includes(current.guidance.rescueState));
    assert.notEqual(current.guidance.direction, 'right', 'the next station must not reverse an active left rescue outside its support margin');
  } });
  assert.ok(watched.length >= 5, 'the known real trajectory must actually reach the dangerous handoff');
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.equal(state.assists, 0);
});

test('a real projected landing beyond the car lane is labelled as an edge limit rather than a completed rescue', () => {
  let edgeFrames = 0, stoppedEdgeFrames = 0;
  const state = keyboardGuidanceRun(.3, 55, { onState: current => {
    if (current.guidance.rescueState !== 'edge') return;
    edgeFrames++;
    assert.equal(current.guidance.kind, 'rescue');
    assert.equal(current.rescue.state, 'edge');
    assert.ok(current.guidance.text.includes('边'));
    assert.ok(current.guidance.detail.includes('其余货'));
    assert.ok(current.guidance.detail.includes('下趟'));
    assert.ok(!current.guidance.detail.includes('先救回'));
    if (current.guidance.direction === 'stop') {
      stoppedEdgeFrames++;
      assert.ok(current.guidance.text.includes('刹稳'));
      assert.ok(current.guidance.text.includes('已近'));
    }
  } });
  assert.ok(edgeFrames > 10);
  assert.ok(stoppedEdgeFrames > 0, 'the known clipped-target case is exercised, not avoided');
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.equal(state.assists, 0);
});

test('snapshot reads and pause cannot advance rescue clearance, and an actually settled supported edge is released without endless rescue', () => {
  const game = new ShiftEngine(); game.reset(); advance(game, 3);
  game._dropPlan = []; game._pendingDelivery = null;
  const loaf = game.cargo[0];
  Matter.Body.setStatic(loaf.body, true);
  Matter.Body.setPosition(loaf.body, { x: 315, y: 480 });
  advance(game, .25);
  assert.equal(game.snapshot().guidance.kind, 'rescue');
  Matter.Body.setStatic(loaf.body, false);
  Matter.Body.setPosition(loaf.body, { x: 283, y: 562 });
  Matter.Body.setAngle(loaf.body, 0);
  Matter.Body.setVelocity(loaf.body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(loaf.body, 0);
  advance(game, .1);
  let state = game.snapshot();
  assert.equal(state.cargo[0].supported, true);
  assert.ok(state.cargo[0].risk > .52);
  assert.equal(state.guidance.kind, 'rescue', 'support must be confirmed for a short continuous interval');
  const safeFor = state.rescue.safeFor, elapsed = state.elapsed;
  state.rescue.safeFor = 99;
  for (let i = 0; i < 200; i++) game.snapshot();
  assert.equal(game.snapshot().rescue.safeFor, safeFor);
  game.pause(true); advance(game, 2);
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.snapshot().rescue.safeFor, safeFor);
  game.pause(false); advance(game, .3);
  state = game.snapshot();
  assert.equal(state.cargo[0].supported, true);
  assert.ok(state.cargo[0].risk > .52);
  assert.notEqual(state.guidance.kind, 'rescue');
  assert.equal(state.rescue, null);
  assert.equal(state.assists, 0, 'hint persistence must not manufacture a three-second checkpoint');
  assert.equal(state.catches, 1);
});

test('a fresh actual loss of support invalidates a previous safe handoff instead of silently retaining clearance', () => {
  const game = new ShiftEngine(); game.reset(); advance(game, 3);
  game._dropPlan = []; game._pendingDelivery = null;
  const loaf = game.cargo[0];
  Matter.Body.setStatic(loaf.body, true);
  Matter.Body.setPosition(loaf.body, { x: 315, y: 480 });
  advance(game, .25);
  Matter.Body.setStatic(loaf.body, false);
  Matter.Body.setPosition(loaf.body, { x: 210, y: 562 });
  Matter.Body.setVelocity(loaf.body, { x: 0, y: 0 });
  advance(game, .5);
  assert.notEqual(game.snapshot().guidance.kind, 'rescue');
  Matter.Body.setStatic(loaf.body, true);
  Matter.Body.setPosition(loaf.body, { x: 315, y: 480 });
  game.step(1 / 60);
  const state = game.snapshot();
  assert.equal(state.guidance.kind, 'rescue');
  assert.equal(state.guidance.cargoId, loaf.id);
  assert.equal(state.rescue.safeFor, 0);
});

test('cue safety changes preserve the real S run without adding assistance or relaxing signatures', () => {
  const state = keyboardGuidanceRun(.6, 55, { input: 'touch', variant: 1 });
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.equal(state.lives, 3);
  assert.ok(state.perfectCatches >= 3);
  assert.equal(state.assists, 0);
  assert.equal(state.tail.completed, true);
});

test('the slower real fold trajectory keeps rescuing before a moving support margin will be lost', () => {
  const watched = [], predictedLosses = [];
  const state = keyboardGuidanceRun(.6, 45, { input: 'touch', variant: 1, onState: current => {
    const cargo = current.cargo.find(item => item.type === 'monday');
    if (!cargo || current.elapsed < 39.8 || current.elapsed > 40.4 || cargo.risk < .6 || current.truck.vx < 12) return;
    const body = current.rescue;
    if (body?.cargoId !== cargo.id || body.projectedSupportMargin >= 1) return;
    watched.push(current.elapsed);
    assert.equal(current.guidance.kind, 'rescue');
    assert.notEqual(current.guidance.direction, 'right', 'the right-hand station cannot override a left parcel whose support will disappear');
    if (body.supportMargin > 0 && body.projectedSupportMargin < 0) predictedLosses.push(current.elapsed);
  } });
  assert.ok(watched.length >= 5, 'the original40.08–40.30 handoff must actually be exercised');
  assert.ok(predictedLosses.length > 0, 'the warning must precede actual loss of margin, not only react afterward');
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 6);
  assert.equal(state.assists, 0);
});

test('the real boundary trajectory does not flash a non-rescue instruction between adjacent risks', () => {
  // Fixed held-key input recorded from the V9 visible-cue run. Replaying the
  // same input keeps the old physical scene, even when new cues change what a
  // live controller would do. This avoids passing merely because it crashed earlier.
  const input = [[0, 0], [4.6, 1], [6.8, 0], [10.4, -1], [12.6, 0], [17, -1], [19.2, 0], [22.8, 1], [25.6, 0], [29.6, 1], [31.4, 0]];
  let slowmo = 0, index = 0, key = 0, watched = 0;
  const game = new ShiftEngine(event => { if (event.type === 'save') slowmo = .32; });
  game.reset('normal', '2026-11-11', { variant: 0 });
  for (let frame = 0; frame < 38 * 60; frame++) {
    while (index < input.length && frame / 60 + 1e-8 >= input[index][0]) {
      const nextKey = input[index++][1];
      if (key && !nextKey) game.releaseControl();
      key = nextKey;
    }
    if (key) game.setTarget(game.truck.x + key * 55 / 9);
    const current = game.snapshot();
    if (current.elapsed >= 36.88 && current.elapsed <= 37.08) {
      watched++;
      assert.equal(current.lives, 3, 'the original risky cargo is still present, not already restored');
      assert.equal(current.catches, 6);
      assert.ok(Math.abs(current.truck.x - 333.36) < .1);
      assert.ok(current.cargo.find(cargo => cargo.type === 'pot').x > 430);
      assert.equal(current.guidance.kind, 'rescue', 'the known50ms preparation flash must remain a continuous risk handoff');
      assert.ok(['recovering', 'edge'].includes(current.guidance.rescueState));
      assert.ok(!current.guidance.text.includes('准备停站'));
    }
    game.step((1 / 60) * (slowmo > 0 ? .36 : 1));
    slowmo = Math.max(0, slowmo - 1 / 60);
  }
  assert.ok(watched >= 8);
});

test('global rescue confirmation is bounded and cannot expire through pause or snapshot reads', () => {
  const game = new ShiftEngine(); game.reset(); advance(game, 3);
  game._dropPlan = []; game._pendingDelivery = null;
  const loaf = game.cargo[0];
  Matter.Body.setStatic(loaf.body, true);
  Matter.Body.setPosition(loaf.body, { x: 315, y: 480 });
  advance(game, .25);
  Matter.Body.setStatic(loaf.body, false);
  Matter.Body.setPosition(loaf.body, { x: 210, y: 562 });
  Matter.Body.setAngle(loaf.body, 0);
  Matter.Body.setVelocity(loaf.body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(loaf.body, 0);
  until(game, () => !game._rescueLatch && game._rescueHandoff && game.elapsed < game._rescueHandoff.until, .6);
  assert.equal(game.snapshot().guidance.kind, 'rescue');
  assert.equal(game._rescueLatch, null);
  const elapsed = game.elapsed, untilAt = game._rescueHandoff.until;
  assert.ok(untilAt - elapsed <= .121);
  for (let i = 0; i < 200; i++) game.snapshot();
  assert.equal(game.elapsed, elapsed);
  game.pause(true); advance(game, 2);
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.snapshot().guidance.kind, 'rescue');
  game.pause(false); advance(game, .2);
  assert.notEqual(game.snapshot().guidance.kind, 'rescue');
  assert.equal(game.snapshot().rescue, null);
  assert.equal(game.assists, 0);
  assert.equal(game.catches, 1);
});

test('the real fast light-heavy run calls an unthrown original unthrown, never an expired retry after signed cargo falls', () => {
  const events = [];
  const state = keyboardGuidanceRun(.15, 70, { input: 'touch', variant: 2, seed: '2026-11-11', onEvent: event => events.push(event) });
  assert.equal(state.status, 'win');
  assert.equal(state.catches, 5);
  assert.equal(state.lives, 2);
  assert.equal(state.retries, 0);
  assert.equal(state.score, 1170, 'presentation classification cannot change the original real score');
  assert.ok(Math.abs(state.elapsed - 39.3833333333) < 1 / 60);
  assert.deepEqual(events.filter(event => event.type === 'spawn').map(event => event.cargoId), [1, 2, 3, 4, 5]);
  const potCaught = events.find(event => event.type === 'catch' && event.cargoId === 5);
  const potCrash = events.find(event => event.type === 'crash' && event.cargoId === 5);
  assert.ok(potCaught && potCrash && potCaught.elapsed < potCrash.elapsed);
  assert.ok(Math.abs(potCrash.elapsed - 33.8333333333) < 1 / 60);
  assert.equal(state.job.unthrownCount, 1);
  assert.equal(state.job.retryExpiredCount, 0);
  assert.equal(state.job.unavailableDeliveries, 1);
  assert.ok(state.job.detail.includes('1件原单未投出'));
  const recovery = events.filter(event => event.type === 'recovery' && ['start', 'restored'].includes(event.phase));
  assert.deepEqual(recovery.map(event => event.phase), ['start', 'restored']);
  for (const event of recovery) {
    assert.equal(event.restoredCount, 5);
    assert.equal(event.unthrownCount, 1);
    assert.equal(event.retryExpiredCount, 0);
    assert.ok(event.text.includes('5件已签收货物'));
    assert.ok(event.text.includes('1件原单未投出'));
    assert.ok(!/补发|漏接|未签收/.test(event.text));
  }
  assert.equal(events.filter(event => event.type === 'catch' && event.cargoId === 5).length, 1);
});

test('an actually thrown late miss remains a clearly expired retry in job and every recovery phase', () => {
  const { game, events } = lastMissFixture();
  until(game, current => current.tail.active, 3);
  const state = game.snapshot();
  assert.equal(state.job.unthrownCount, 0);
  assert.equal(state.job.retryExpiredCount, 1);
  assert.equal(state.job.unavailableDeliveries, 1);
  assert.ok(state.job.detail.includes('1件漏接，补发窗口已过'));
  for (const phase of ['expired', 'start', 'restored']) {
    const event = events.find(event => event.type === 'recovery' && event.phase === phase);
    assert.ok(event, phase);
    assert.equal(event.unthrownCount, 0);
    assert.equal(event.retryExpiredCount, 1);
    assert.ok(event.text.includes('1件漏接，补发窗口已过'));
    assert.ok(!event.text.includes('原单未投出'));
  }
  assert.equal(events.filter(event => event.type === 'spawn' && event.cargoId === 5).length, 1);
  assert.equal(events.filter(event => event.type === 'spawn' && event.retry).length, 0);
  assert.equal(state.catches, 4);
});

test('mixed expired retry and unthrown original are classified once per ID without losing a real airborne opportunity', () => {
  const { game, events } = lastMissFixture(4, { id: 6, type: 'bread', x: 210, time: 38.95 });
  assert.equal(game.snapshot().job.retryExpiredCount, 1);
  assert.equal(game.snapshot().job.unthrownCount, 0, 'an original still scheduled with a legal window is not unavailable');
  game._closeDeliveries();
  game._closeDeliveries();
  let state = game.snapshot();
  assert.equal(state.job.unthrownCount, 1);
  assert.equal(state.job.retryExpiredCount, 1);
  assert.equal(state.job.unavailableDeliveries, 2);
  assert.equal(game._unavailableIds.size, 2);
  assert.ok(state.job.detail.includes('1件原单未投出'));
  assert.ok(state.job.detail.includes('1件漏接，补发窗口已过'));
  state = until(game, current => current.recovery?.text.includes('已归位'), 1.2);
  assert.equal(state.recovery.restoredCount, 4);
  assert.equal(state.recovery.unthrownCount, 1);
  assert.equal(state.recovery.retryExpiredCount, 1);
  assert.ok(state.recovery.text.includes('1件原单未投出'));
  assert.ok(state.recovery.text.includes('1件漏接，补发窗口已过'));
  assert.ok(!/稍后补发|准备补发/.test(state.recovery.text));
  assert.equal(state.catches, 4);
  assert.equal(events.filter(event => event.type === 'catch').length, 4);

  // Closing delivery cannot reclassify a parcel already in a real first flight
  // as withdrawn or expired while its collision/signature is still possible.
  const flying = finishedPlanFixture();
  const final = { id: 5, type: 'bread', x: 210, time: 38.9 };
  flying._dropPlan.push(final);
  flying._spawnDelivery(final);
  flying._closeDeliveries();
  const airborne = flying.snapshot();
  assert.equal(airborne.job.airborneUnsigned, 1);
  assert.equal(airborne.job.unthrownCount, 0);
  assert.equal(airborne.job.retryExpiredCount, 0);
  until(flying, current => current.catches === 5, 2);
  assert.equal(flying.catches, 5);
  assert.equal(flying.snapshot().job.retryExpiredCount, 0);
});

test('presentation outcome counts and recovery text freeze on pause and clear on an original-line reset without old events', () => {
  const { game, events } = lastMissFixture(4, { id: 6, type: 'bread', x: 210, time: 38.95 });
  game._closeDeliveries();
  until(game, current => current.recovery?.text.includes('已归位'), 1.2);
  const initial = game.snapshot(), expiresAt = game._recoveryInfoUntil;
  game.pause(true);
  for (let i = 0; i < 120; i++) { game.snapshot(); game.step(1 / 30); }
  const paused = game.snapshot();
  assert.equal(paused.elapsed, initial.elapsed);
  assert.equal(game._recoveryInfoUntil, expiresAt);
  assert.deepEqual(paused.recovery, initial.recovery);
  assert.equal(paused.job.unthrownCount, 1);
  assert.equal(paused.job.retryExpiredCount, 1);
  const eventCount = events.length;
  const reset = game.reset('normal', game.dateSeed, { variant: game.route.variant });
  assert.equal(events.length, eventCount, 'reset must not replay an old expiry or recovery');
  assert.equal(reset.job.unthrownCount, 0);
  assert.equal(reset.job.retryExpiredCount, 0);
  assert.equal(reset.job.unavailableDeliveries, 0);
  assert.equal(reset.recovery, null);
  assert.equal(reset.lastCrash, null);
  assert.equal(reset.paused, false);
  const fresh = new ShiftEngine();fresh.reset('normal', game.dateSeed, { variant: game.route.variant });
  assert.deepEqual(game._dropPlan, fresh._dropPlan);
});
