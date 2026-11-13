/* Reproducible UI integration checks using the real combat engine and a DOM mock. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { Nightfall } = require('./dist/engine.js');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'dist/ui.js'), 'utf8');
const referenced = [...source.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'unique HTML IDs');
for (const id of referenced) assert(ids.includes(id), 'referenced ID ' + id);

class Events {
  constructor() { this.events = {}; }
  addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
  fire(name, extra = {}) {
    const event = { button: 0, pointerId: 1, key: '', repeat: false, detail: 1, preventDefault() { this.prevented = true; }, ...extra };
    for (const fn of this.events[name] || []) fn(event);
    return event;
  }
}
class Element extends Events {
  constructor(id) {
    super(); this.id = id; this.hidden = false; this.disabled = false; this.inert = false;
    this.style = {}; this.attrs = {}; this.classNames = new Set();
    this.classList = {
      toggle: (name, value) => value === undefined
        ? this.classNames.has(name) ? this.classNames.delete(name) : this.classNames.add(name)
        : value ? this.classNames.add(name) : this.classNames.delete(name),
      remove: name => this.classNames.delete(name), add: name => this.classNames.add(name)
    };
    this.parentElement = { classList: this.classList };
    this.offsetParent = {}; this.isConnected = true; this.capture = new Set();
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  getContext() { return context2d; }
  focus() { document.activeElement = this; }
  querySelector() { return this.querySelectorAll()[0]; }
  querySelectorAll() { return (panelButtons[this.id] || []).map(id => elements[id]); }
  contains(element) { return this.querySelectorAll().includes(element); }
  closest() { return null; }
  hasPointerCapture(id) { return this.capture.has(id); }
  setPointerCapture(id) { this.capture.add(id); }
  releasePointerCapture(id) { this.capture.delete(id); }
  getBoundingClientRect() { return this.id === 'move-pad' ? { left: 0, top: 0, width: 124, height: 130 } : { left: 0, top: 0, width: 390, height: 390 }; }
}
const context2d = new Proxy({
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  measureText: value => ({ width: value.length * 8 })
}, { get: (object, key) => key in object ? object[key] : () => {} });
const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
const panelButtons = {
  'start-screen': ['start', 'practice'],
  'intermission-screen': ['continue-heal', 'continue-power', 'exit-intermission'],
  'pause-screen': ['resume', 'restart-paused', 'help-paused', 'exit-paused'],
  'result-screen': ['restart', 'return-title'],
  'help-screen': ['close-help']
};
const document = new Events();
document.getElementById = id => elements[id]; document.body = new Element('body'); document.activeElement = null; document.hidden = false;
const window = new Events();
window.matchMedia = () => ({ matches: false }); window.innerWidth = 1440; window.devicePixelRatio = 1;
const audioTrace = [];
const audioParameter = kind => ({
  setValueAtTime(value) { audioTrace.push({ kind, value }); },
  exponentialRampToValueAtTime(value) { audioTrace.push({ kind, value }); },
  linearRampToValueAtTime(value) { audioTrace.push({ kind, value }); }
});
class AudioVoice {
  constructor(kind) { this.kind = kind; this.frequency = audioParameter('frequency'); }
  connect() {} disconnect() {}
  start() { audioTrace.push({ kind: this.kind, start: true }); }
  stop() { this.onended?.(); }
}
class TestAudio {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; audioTrace.push({ kind: 'context' }); }
  createOscillator() { return new AudioVoice('oscillator'); }
  createBufferSource() { return new AudioVoice('noise'); }
  createGain() { return { gain: audioParameter('gain'), connect() {}, disconnect() {} }; }
  createBiquadFilter() { return { frequency: audioParameter('filter'), Q: audioParameter('Q'), connect() {}, disconnect() {} }; }
  createBuffer(channels, samples) { const values = new Float32Array(samples); return { getChannelData: () => values }; }
  async resume() { this.state = 'running'; }
}
window.AudioContext = TestAudio;
const stored = {};
const localStorage = { getItem: key => stored[key] ?? null, setItem: (key, value) => { stored[key] = value; } };
let game, clock = 0, frames = [];
class Game extends Nightfall { constructor(canvas, options) { super(canvas, { seed: 734923, ...options }); game = this; } }
vm.runInNewContext(source, {
  document, window, localStorage, performance: { now: () => clock },
  requestAnimationFrame: fn => { frames.push(fn); }, Nightfall: Game, console, setTimeout, clearTimeout
}, { filename: 'ui.js' });
function tick(dt) {
  clock += dt * 1000; const pending = frames; frames = [];
  for (const fn of pending) fn(clock);
}
const down = (key, extra = {}) => document.fire('keydown', { key, ...extra });
const up = key => document.fire('keyup', { key });
let checks = 2;
function ok(value, message) { assert(value, message); checks++; }

ok(!elements['start-screen'].hidden && elements['control-deck'].inert, 'title controls inert');
elements.start.fire('click');
ok(game.snapshot().challenge && game.snapshot().stageCount === 3, 'primary action starts three boss challenge');
elements.home.fire('click'); elements.practice.fire('click');
ok(!game.snapshot().challenge, 'practice is explicit single fight');
ok(game.state === 'playing' && !elements['control-deck'].inert, 'start playable');
down('W'); ok(game.input.y === -1, 'uppercase movement');
up('w'); ok(game.input.y === 0, 'lowercase keyup clears uppercase');
down('j'); for (let i = 0; i < 12; i++) tick(.05);
ok(game.attackHeld && game.chargeTime >= .52, 'keyboard charge holds');
up('J'); ok(!game.attackHeld && game.stats.hits === 1, 'keyboard release strikes');
for (let i = 0; i < 15; i++) tick(.05);
down('d');
elements.game.fire('pointerdown', { pointerId: 10, clientX: 80, clientY: 80 });
elements.game.fire('pointermove', { pointerId: 10, clientX: 80, clientY: 37 });
ok(game.input.x > 0 && game.input.y < 0, 'joystick combines with keys');
elements.game.fire('pointerup', { pointerId: 10 });
ok(game.input.x === 1 && game.input.y === 0 && game.dashCd === 0, 'joystick release preserves keys and never auto dashes');
up('d');
elements['move-pad'].fire('pointerdown', { pointerId: 20, clientX: 64, clientY: 65 });
ok(game.input.x === 0 && game.input.y === 0, 'fixed stick ignores small resting-thumb drift');
elements['move-pad'].fire('pointermove', { pointerId: 20, clientX: 106, clientY: 65 });
ok(game.input.x === 1 && game.input.y === 0 && elements['move-pad'].classNames.has('active'), 'fixed stick reaches full movement and shows pressed feedback');
elements.attack.fire('pointerdown', { pointerId: 21 });
ok(game.attackHeld && game.input.x === 1, 'two thumbs can move and charge together');
elements.attack.fire('pointercancel', { pointerId: 21 });
ok(!game.attackHeld && game.input.x === 1, 'canceling attack preserves moving thumb');
elements.attack.fire('pointerdown', { pointerId: 22 });
elements['move-pad'].fire('pointercancel', { pointerId: 20 });
ok(game.attackHeld && game.input.x === 0 && elements['joystick-nub'].style.transform === 'translate(-50%,-50%)', 'canceling move preserves charging thumb and recenters stick');
elements.attack.fire('pointercancel', { pointerId: 22 });
let guardPresses = 0, dashPresses = 0;
const guardMethod = game.guard.bind(game), dashMethod = game.dash.bind(game);
game.guard = () => { guardPresses++; return guardMethod(); };
game.dash = () => { dashPresses++; return dashMethod(); };
elements.guard.fire('pointerdown', { pointerId: 23 });
ok(guardPresses === 1 && elements.guard.classNames.has('pressed'), 'guard activates on finger-down');
elements.guard.fire('pointerup', { pointerId: 23 }); elements.guard.fire('click', { detail: 1 });
ok(guardPresses === 1 && !elements.guard.classNames.has('pressed'), 'guard release and ghost click do not trigger twice');
elements.guard.fire('click', { detail: 0 });
ok(guardPresses === 2, 'accessible keyboard click remains available');
elements['move-pad'].fire('pointerdown', { pointerId: 24, clientX: 106, clientY: 65 });
elements.dash.fire('pointerdown', { pointerId: 25 });
ok(dashPresses === 1 && game.dashDir.x === 1 && game.dashDir.y === 0, 'dodge activates immediately in current thumb direction');
elements.dash.fire('pointerup', { pointerId: 25 }); elements.dash.fire('click', { detail: 1 });
ok(dashPresses === 1 && game.input.x === 1, 'dodge ghost click suppressed without releasing move');
elements['move-pad'].fire('pointerup', { pointerId: 24 });
elements.attack.fire('pointerdown', { pointerId: 12 });
ok(game.attackHeld, 'pointer attack holds');
const hits = game.stats.hits;
elements.attack.fire('pointercancel', { pointerId: 12 });
ok(!game.attackHeld && game.stats.hits === hits, 'pointer cancel clears without strike');
elements['help-top'].fire('click');
ok(game.state === 'paused' && !elements['help-screen'].hidden, 'help pauses');
elements['help-top'].fire('click'); elements['close-help'].fire('click');
ok(!elements['pause-screen'].hidden && elements['help-screen'].hidden, 'double help returns to pause');
elements.resume.fire('click'); down('j'); window.fire('blur');
ok(game.state === 'paused' && !game.attackHeld && game.input.x === 0, 'blur clears attack and pauses');
up('j'); elements.resume.fire('click');
ok(game.state === 'playing' && !game.attackHeld, 'resume no stale attack');
elements.effects.fire('click');
ok(game.options.effects === false, 'effects setting updates actual engine option');
const originalGuard = game.guard.bind(game); let guardCalls = 0;
game.guard = () => { guardCalls++; return originalGuard(); };
elements.pause.fire('click'); elements.guard.fire('click'); down('k');
ok(guardCalls === 0, 'paused actions blocked');
elements['help-paused'].fire('click'); elements['close-help'].focus();
const tab = down('Tab');
ok(tab.prevented && document.activeElement === elements['close-help'], 'help focus trap');
elements['close-help'].fire('click'); elements.resume.fire('click');
game.finish(false, '六十秒已尽');
ok(!elements['result-screen'].hidden && elements['control-deck'].inert && !elements.record.textContent.includes('NaN'), 'terminal result and record');
elements.restart.fire('click');
ok(game.state === 'playing' && game.time === 0, 'result retry resets fight');
for (let i = 0; i < 160 && !game.snapshot().parryNow; i++) tick(.025);
tick(.025);
ok(game.snapshot().parryNow && elements.guard.classNames.has('timing-now') && elements['guard-caption'].textContent === '现在格挡', 'real gold telegraph lights the guard button at the parry beat');
elements.guard.fire('pointerdown', { pointerId: 31 }); elements.guard.fire('pointerup', { pointerId: 31 });
for (let i = 0; i < 16; i++) tick(.025);
ok(game.stats.parries === 1 && elements.attack.classNames.has('riposte') && elements['context-hint'].textContent.includes('下一刀强化'), 'actual perfect parry highlights the next attack opportunity');
for (let i = 0; i < 300 && game.state === 'playing' && !game.snapshot().dodgeNow; i++) tick(.025);
tick(.025);
ok(game.snapshot().dodgeNow && elements.dash.classNames.has('timing-now') && elements['dash-caption'].textContent === '现在闪避', 'real red telegraph lights a separate dodge prompt');
const combatSnapshot = game.snapshot.bind(game);
// Presentation fixtures exercise the optional encounter metadata without editing combat state.
game.snapshot = () => ({ ...combatSnapshot(), state: 'playing', styleName: '迟刃式', styleHint: '迟刃后接追刀', pressureName: '连势', attackCombo: '1 / 2', punish: 0 });
tick(.05);
ok(!elements['boss-style'].hidden && elements['boss-style'].textContent === '迟刃式' && elements['attack-tell'].textContent === '连势 · 1 / 2', 'chosen style and current combo are visible without a new menu');
game.snapshot = () => ({ ...combatSnapshot(), state: 'playing', styleName: '迟刃式', pressureName: '收势·抓破绽', punish: 1, broken: 0, parryNow: false, dodgeNow: false, danger: false, riposte: 0 });
tick(.05);
ok(elements['attack-tell'].classNames.has('opening') && elements['context-hint'].textContent.includes('收势'), 'real recovery metadata prompts a punish opportunity');
game.snapshot = () => ({ ...combatSnapshot(), state: 'menu', styleName: '迟刃式' });
tick(.05);
ok(elements['boss-style'].hidden && !elements['bottom-caption'].textContent.includes('本局刀路'), 'unstarted title never presents an encounter style as already selected');
game.snapshot = combatSnapshot;
ok(audioTrace.length === 0, 'sound stays silent until explicitly enabled');
elements.sound.fire('click');
game.emit('sound', 'light1');
const light1Frequencies = audioTrace.filter(event => event.kind === 'frequency').map(event => event.value);
ok(audioTrace.some(event => event.kind === 'noise' && event.start) && light1Frequencies.includes(390), 'light slash combines a pitched stroke and filtered air');
game.emit('sound', 'light2');
ok(audioTrace.some(event => event.kind === 'frequency' && event.value === 510), 'second light slash has its own pitch');
const knownSounds = audioTrace.length;
game.emit('sound', 'unrecognized-event');
ok(audioTrace.length === knownSounds, 'unknown sound never falls back to an unrelated slash');
game.emit('sound', 'heavyHit'); game.emit('sound', 'execute'); game.emit('sound', 'warning');
ok(audioTrace.some(event => event.kind === 'frequency' && event.value === 82) && audioTrace.some(event => event.kind === 'frequency' && event.value === 66), 'heavy impact and execution have distinct low strikes');
ok(audioTrace.filter(event => event.kind === 'gain').every(event => event.value <= .05), 'individual synth voices use conservative gain envelopes');
const beforeMute = audioTrace.length;
elements.sound.fire('click'); game.emit('sound', 'parry');
ok(audioTrace.length === beforeMute, 'muting stops newly requested combat audio');
ok(html.indexOf('duel-art.js') < html.indexOf('engine.js'), 'animation module loads before the engine');
// Transition fixtures finish bosses through the public damage API to verify UI routing,
// focus/input cleanup and records. Strategy-driven full runs live in gauntlet simulation.
elements.home.fire('click'); elements.start.fire('click'); tick(.05);
ok(elements['stage-caption'].textContent.includes('1 / 3') && elements['boss-name'].textContent === game.snapshot().bossName, 'challenge HUD identifies current realm and boss');
down('d'); down('j'); game.player.hp = 60; game.damageBoss(game.boss.hp, 0);
ok(game.state === 'intermission' && !elements['intermission-screen'].hidden && elements['control-deck'].inert, 'stage victory opens rest choices without a terminal result');
ok(!game.attackHeld && game.input.x === 0 && elements['heal-detail'].textContent.includes(String(Math.min(32, 100 - game.player.hp))), 'rest clears all inputs and shows actual capped healing');
const restTime = game.time; for (let i = 0; i < 25; i++) tick(.05); down('j'); down('k');
ok(game.time === restTime && !game.attackHeld && game.stats.parries === 0, 'rest clock and combat actions stay frozen');
elements['exit-intermission'].focus(); const restTab = down('Tab');
ok(restTab.prevented && document.activeElement === elements['continue-heal'], 'rest choices form a keyboard focus loop');
elements['continue-power'].fire('click'); up('j'); up('d'); tick(.05);
ok(game.state === 'playing' && game.snapshot().stageNumber === 2 && game.snapshot().bossId === 'archer' && game.snapshot().powerBonus === .12, 'power choice advances to a distinct second boss');
ok(!game.attackHeld && game.input.x === 0 && elements['intermission-screen'].hidden, 'next realm never inherits held combat input');
game.player.hp = 45; game.damageBoss(game.boss.hp, 0);
ok(elements['intermission-title'].textContent === game.snapshot().nextBoss.name && elements['heal-detail'].textContent.includes('32'), 'next boss and full healing choice update after second stage');
const expectedHealed = Math.min(100, game.player.hp + 32); elements['continue-heal'].fire('click'); tick(.05);
ok(game.snapshot().stageNumber === 3 && game.player.hp === expectedHealed && elements['bottom-caption'].textContent.includes('满蓄破甲'), 'heal choice carries restored health into final armor fight');
game.finish(false, '倒在潮声里');
ok(elements['result-title'].textContent === '止步第 3 境' && elements['restart'].innerHTML.includes('重闯三境'), 'failed challenge explains progress and retry scope');
elements.restart.fire('click');
ok(game.snapshot().stageNumber === 1 && game.snapshot().powerBonus === 0 && game.player.hp === 100, 'challenge retry starts a fresh full run');
for (let stage = 0; stage < 3; stage++) { game.damageBoss(game.boss.hp, 0); if (stage < 2) elements['continue-power'].fire('click'); }
ok(game.state === 'won' && elements['result-title'].textContent === '三境，尽破' && stored['nightfall-best-gauntlet'], 'final clear presents the whole challenge result in its own record');
console.log('Active UI integration checks passed:', checks);
