'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'wechat/game.js'), 'utf8');
let checks = 0;
const devices = [
  { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 375, height: 667 },
  { width: 390, height: 844, safeArea: { top: 44, bottom: 810 } },
  { width: 320, height: 568, safeArea: { top: 20, bottom: 534 } }
];
for (const device of devices) {
  const { width, height } = device;
  const handlers = {}, calls = [], labels = [], queued = new Map(); let seq = 0, stored = {};
  const ctx = new Proxy({ measureText: s => ({ width: String(s).length * 13 }) }, {
    get: (target, key) => target[key] || ((...args) => { if (key === 'fillText') labels.push(args); })
  });
  let instance;
  class FakeGame {
    constructor(canvas, options) {
      instance = this; this.options = options; this.state = 'menu'; this.held = false; this.input = [0, 0];
      this.s = { remaining: 60, hp: 100, maxHp: 100, bossHp: 5200, bossMax: 5200, posture: 0, phase: 1, phaseName: '试锋', charge: 0, broken: 0, dashCd: 0, guardCd: 0, stats: {} };
    }
    snapshot() { return { ...this.s }; } draw() {} update() {}
    resetInput() { calls.push('clear'); this.held = false; this.input = [0, 0]; }
    cancelAttack() { calls.push('cancel'); this.held = false; }
    start() { calls.push('start'); this.s.challenge = false; this.state = 'playing'; this.options.onEvent('start'); }
    startChallenge() { calls.push('challenge'); Object.assign(this.s, { challenge: true, stageNumber: 1, stageCount: 3, sceneName: '听雨庭', bossName: '逐影', bossId: 'duelist' }); this.state = 'playing'; this.options.onEvent('start'); }
    continueChallenge(choice) { calls.push(['continue', choice]); this.s.stageNumber++; this.s.bossId = this.s.stageNumber === 2 ? 'archer' : 'colossus'; if (choice === 'heal') this.s.hp = Math.min(100, this.s.hp + 32); else this.s.powerBonus = (this.s.powerBonus || 0) + .12; this.state = 'playing'; this.options.onEvent('start'); return true; }
    pause() { calls.push('pause'); this.state = 'paused'; this.options.onEvent('pause'); }
    resume() { calls.push('resume'); this.state = 'playing'; this.options.onEvent('resume'); }
    home() { calls.push('home'); this.state = 'menu'; }
    attackDown() { calls.push('down'); this.held = true; return true; }
    attackUp() { calls.push('up'); this.held = false; }
    execute() { calls.push('execute'); } guard() { calls.push('guard'); } dash() { calls.push('dash'); }
    movementInput(x, y) { calls.push(['move', x, y]); this.input = [x, y]; }
  }
  const wx = {
    createCanvas: () => ({ getContext: () => ctx }), getWindowInfo: () => ({ windowWidth: width, windowHeight: height, pixelRatio: 2, safeArea: device.safeArea }),
    getStorageSync: () => 0, setStorageSync: (k, v) => stored[k] = v
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) wx['on' + name] = fn => handlers[name] = fn;
  const sandbox = { wx, require: () => ({ Nightfall: FakeGame }), Date, Math, requestAnimationFrame: fn => { queued.set(++seq, fn); return seq; }, cancelAnimationFrame: id => queued.delete(id) };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const get = code => vm.runInContext(code, sandbox), render = () => get('render()');
  const touch = (x, y, identifier) => ({ clientX: x, clientY: y, identifier });
  const start = (x, y, id) => handlers.TouchStart({ changedTouches: [touch(x, y, id)] });
  const end = id => handlers.TouchEnd({ changedTouches: [{ identifier: id }] });
  const cancel = id => handlers.TouchCancel({ changedTouches: [{ identifier: id }] });
  const move = (x, y, id) => handlers.TouchMove({ touches: [touch(x, y, id)] });
  function check(name, fn) { try { fn(); checks++; } catch (e) { e.message = width + '×' + height + (device.safeArea ? ' safe-area' : '') + ' ' + name + ': ' + e.message; throw e; } }
  const menuButton = get('buttons[0]');
  check('menu layout fits', () => {
    assert(labels.every(([, x, y]) => x >= 0 && x <= width && y > 0 && y < height));
    assert(menuButton.y + menuButton.h <= get('controlBottom'));
  });
  start(menuButton.x + menuButton.w / 2, menuButton.y + menuButton.h / 2, 1); render();
  check('primary menu starts challenge', () => assert.equal(instance.s.challenge, true));
  const base = get('stickBase'), layout = get('actionLayout');
  const clearCount = () => calls.filter(v => v === 'clear').length;
  check('all controls have large separate targets within safe area', () => {
    const actionButtons = get("buttons.filter(b => b.shape === 'circle')"); assert.equal(actionButtons.length, 3);
    for (const b of actionButtons) {
      assert(b.radius * 2 >= 59); assert(b.x - b.radius >= 0); assert(b.x + b.radius <= width);
      assert(b.y - b.radius >= get('controlTop')); assert(b.y + b.radius <= get('controlBottom'));
      assert(b.x - b.radius > get('moveZone.x + moveZone.w'));
    }
    for (let i = 0; i < actionButtons.length; i++) for (let j = i + 1; j < actionButtons.length; j++) {
      const a = actionButtons[i], b = actionButtons[j]; assert(Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius + 5);
    }
    assert(get('arenaY + arenaSize') < get('controlTop')); assert(get('arenaSize') > 160);
  });
  check('battlefield tap cannot move fixed joystick', () => {
    start(30, get('arenaY + 35'), 2); assert.equal(get('moveTouch'), null); assert.deepEqual(instance.input, [0, 0]);
  });
  check('fixed joystick has deadzone and proportional travel', () => {
    start(base.x + 3, base.y, 3); assert.deepEqual(instance.input, [0, 0]);
    move(base.x + 6, base.y, 3); assert(instance.input[0] > 0 && instance.input[0] < .1);
    move(base.x + 44, base.y, 3); assert.deepEqual(instance.input, [1, 0]);
    assert.equal(get('stickBase.x'), base.x); assert.equal(get('stickBase.y'), base.y);
    assert(get('stickPoint.x') <= base.x + 26);
  });
  check('attack starts on touch and releasing it preserves joystick', () => {
    start(layout.attack.x, layout.attack.y, 4); assert.equal(instance.held, true); assert.equal(calls.at(-1), 'down');
    end(4); assert.equal(calls.at(-1), 'up'); assert.deepEqual(instance.input, [1, 0]); assert.equal(get('moveTouch'), 3);
  });
  check('canceling attack does not stop movement or discharge', () => {
    start(layout.attack.x, layout.attack.y, 5); const cleared = clearCount(), ups = calls.filter(v => v === 'up').length;
    cancel(5); assert.equal(calls.at(-1), 'cancel'); assert.equal(instance.held, false); assert.deepEqual(instance.input, [1, 0]);
    assert.equal(clearCount(), cleared); end(5); assert.equal(calls.filter(v => v === 'up').length, ups);
  });
  check('canceling joystick preserves held attack', () => {
    start(layout.attack.x, layout.attack.y, 6); cancel(3); assert.equal(instance.held, true); assert.deepEqual(instance.input, [0, 0]);
    assert.equal(get('moveTouch'), null); assert.equal(get('stickPoint'), null); end(6); assert.equal(calls.at(-1), 'up');
  });
  check('release joystick recenters without adding a dodge', () => {
    const dodges = calls.filter(v => v === 'dash').length;
    start(base.x, base.y, 7); move(base.x - 44, base.y, 7); end(7);
    assert.deepEqual(instance.input, [0, 0]); assert.equal(get('stickPoint'), null); assert.equal(calls.filter(v => v === 'dash').length, dodges);
  });
  check('guard and dodge activate immediately only once', () => {
    const guards = calls.filter(v => v === 'guard').length, dodges = calls.filter(v => v === 'dash').length;
    start(layout.guard.x, layout.guard.y, 8); assert.equal(calls.at(-1), 'guard'); assert.equal(get('actionTouches.get(8)'), 'guard'); end(8);
    assert.equal(calls.filter(v => v === 'guard').length, guards + 1);
    start(layout.dash.x, layout.dash.y, 9); assert.equal(calls.at(-1), 'dash'); end(9); assert.equal(calls.filter(v => v === 'dash').length, dodges + 1);
  });
  check('canceling a skill touch preserves both other pointer owners', () => {
    start(base.x, base.y, 10); move(base.x + 44, base.y, 10); start(layout.attack.x, layout.attack.y, 11);
    start(layout.guard.x, layout.guard.y, 12); cancel(12);
    assert.equal(get('attackTouch'), 11); assert.equal(get('moveTouch'), 10); assert.deepEqual(instance.input, [1, 0]); assert.equal(get('actionTouches.size'), 0); end(11); end(10);
  });
  check('execution uses existing attack target and keeps movement', () => {
    instance.s.broken = 3; render(); start(base.x + 44, base.y, 13);
    const ups = calls.filter(v => v === 'up').length;
    start(layout.attack.x, layout.attack.y, 14); assert.equal(calls.at(-1), 'execute'); assert.deepEqual(instance.input, [1, 0]); end(14);
    assert.equal(calls.filter(v => v === 'up').length, ups); end(13); instance.s.broken = 0;
  });
  check('charge, riposte and cooldown labels are explicit', () => {
    instance.s.charge = 1; labels.length = 0; render(); assert(labels.some(([s]) => s === '松手重斩'));
    instance.s.charge = 0; instance.s.riposte = .8; labels.length = 0; render(); assert(labels.some(([s]) => s === '反击强化'));
    instance.s.guardCd = .3; labels.length = 0; render(); assert(labels.some(([s]) => s === '0.3s'));
    instance.s.guardCd = 0; instance.s.riposte = 0;
  });
  check('last moment defense cues use existing buttons', () => {
    instance.s.parryNow = true; instance.s.dodgeNow = true; labels.length = 0; render();
    assert(labels.some(([s]) => s === '现在格挡')); assert(labels.some(([s]) => s === '现在闪避'));
    assert.equal(get("buttons.filter(b => b.shape === 'circle').length"), 3);
    instance.s.parryNow = false; instance.s.dodgeNow = false;
  });
  check('whole cancel clears both selected fingers without an attack', () => {
    start(base.x + 44, base.y, 15); start(layout.attack.x, layout.attack.y, 16); const ups = calls.filter(v => v === 'up').length;
    handlers.TouchCancel({ changedTouches: [] }); assert.equal(instance.held, false); assert.deepEqual(instance.input, [0, 0]);
    end(16); assert.equal(calls.filter(v => v === 'up').length, ups);
  });
  check('background pauses and clears all input, foreground stays paused', () => {
    start(layout.attack.x, layout.attack.y, 17); handlers.Hide(); assert.equal(instance.state, 'paused'); assert.equal(queued.size, 0); assert.equal(instance.held, false);
    const ups = calls.filter(v => v === 'up').length; end(17); assert.equal(calls.filter(v => v === 'up').length, ups);
    handlers.Show(); assert.equal(instance.state, 'paused'); assert.equal(queued.size, 1);
    labels.length = 0; render(); assert(labels.every(([, x, y]) => x >= 0 && x <= width && y > 0 && y < height));
    for (const b of get('buttons')) assert(b.y + b.h <= get('controlBottom'));
  });
  check('intermission clears both thumbs and keeps all choices within safe area', () => {
    instance.state = 'playing'; render(); start(base.x + 44, base.y, 31); start(layout.attack.x, layout.attack.y, 32);
    Object.assign(instance.s, { challenge: true, stageNumber: 1, stageCount: 3, hp: 70, cleared: 1, totalTime: 24, powerBonus: 0, nextBoss: { name: '鸣弦', sceneName: '竹海', hint: '横移避箭，弹反回箭' } });
    instance.state = 'intermission'; instance.options.onEvent('intermission', instance.snapshot()); labels.length = 0; render();
    assert.equal(get('moveTouch'), null); assert.equal(get('attackTouch'), null); assert.equal(instance.held, false); assert.deepEqual(instance.input, [0, 0]);
    assert(labels.some(([s]) => s.includes('回血 +30'))); assert(labels.some(([s]) => s.includes('伤害 +12%')));
    assert(labels.every(([, x, y]) => x >= 0 && x <= width && y > 0 && y < height));
    const choices = get('buttons'); assert.equal(choices.length, 3); for (const b of choices) assert(b.y + b.h <= get('controlBottom'));
    const before = calls.filter(v => v === 'up').length; end(32); assert.equal(calls.filter(v => v === 'up').length, before);
    start(choices[1].x + 10, choices[1].y + 10, 33); render(); assert.equal(instance.state, 'playing'); assert.equal(instance.s.stageNumber, 2); assert.equal(instance.s.powerBonus, .12);
    instance.state = 'paused'; render(); const retry = get('buttons[1]'); start(retry.x + 5, retry.y + 5, 34); assert.equal(calls.at(-2), 'challenge'); assert.equal(instance.s.stageNumber, 1);
    Object.assign(instance.s, { hp: 60, cleared: 1, nextBoss: { name: '鸣弦', sceneName: '竹海', hint: '横移避箭' } }); instance.state = 'intermission'; instance.options.onEvent('intermission', instance.snapshot()); render();
    const heal = get('buttons[0]'); start(heal.x + 10, heal.y + 10, 35); assert.equal(instance.s.hp, 92); assert.equal(instance.state, 'playing');
    instance.s.challenge = false;
  });
  check('Chinese timeout result and every button fit', () => {
    instance.state = 'lost'; instance.options.onEvent('result', { win: false, reason: '六十秒已尽', time: 60, score: 500, bossHp: 800, bossMax: 5200, stats: { parries: 2, hits: 15, executions: 1 } });
    labels.length = 0; render(); assert(labels.some(([s]) => s === '时尽，潮未平')); assert(labels.every(([, x, y]) => x >= 0 && x <= width && y > 0 && y < height));
    for (const b of get('buttons')) assert(b.y + b.h <= get('controlBottom'));
    assert.equal(stored['nightfall-active60-best'], 500);
  });
}
console.log('WeChat mock: ' + checks + ' checks passed across 5 phone/safe-area layouts. Not a real-device test.');
