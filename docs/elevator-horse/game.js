(function(){
"use strict";
const factories={"./config":function(require,module,exports){
'use strict';

module.exports = {
  duration: 30,
  maxEnergy: 100,
  energyDrain: 22,
  energyRecover: 33,
  baseScore: 38,
  warningDuration: 0.85,
  openingDuration: 0.5,
  closingDuration: 0.5,
  reactionGrace: 0.22,
  nearWindow: 0.36,
  nearBonus: 60,
  perfectBonus: 30,
  maxLives: 3,
  stages: [
    { id: 'warmup', start: 0, label: '熟悉操作', hint: '听到叮就按住，门关好再松手。', closed: [2.8, 3.2], open: [1.3, 1.5] },
    { id: 'rush', start: 8, label: '停靠加速', hint: '停靠更频繁，留意每次开门预警。', closed: [1.8, 2.2], open: [1.05, 1.25] },
    { id: 'inspection', start: 20, label: '老板查岗', hint: '最后 10 秒，稳住你的人设！', closed: [1.45, 1.7], open: [0.85, 1.05] }
  ],
  storageKey: 'elevator-horse-record-v1',
  version: '1.1.0'
};

},
"./engine":function(require,module,exports){
'use strict';

const C = require('./config');
const LINES = [
  '没人？那我不装了。', '工牌一摘，谁也不爱。',
  '这层楼，归本马管。', '月薪三千，马力无限。',
  '电梯很小，精神很大。'
];
const EPSILON = 1e-8;

// 纯逻辑层：没有 wx、DOM、定时器或绘图依赖，可用 Node 验证规则。
class Engine {
  constructor(options) {
    const opts = options || {};
    this.random = opts.random || Math.random;
    this.onEvent = opts.onEvent || function () {};
    this.mode = 'intro';
    this.score = 0;
    this.elapsed = 0;
    this.energy = C.maxEnergy;
    this.lives = C.maxLives;
    this.holding = false;
    this.phase = 'closed';
    this.phaseTime = 0;
    this.phaseDuration = 3;
    this.cycle = 1;
    this.combo = 0;
    this.nearCount = 0;
    this.caughtThisCycle = false;
    this.nearThisCycle = false;
    this.message = LINES[0];
    this.messageUntil = 0;
    this.reason = '';
    this.resumeGrace = 0;
    this.notifiedStage = 'warmup';
  }

  emit(type, detail) {
    this.onEvent(Object.assign({ type: type }, detail || {}));
  }

  start() {
    this.mode = 'playing';
    this.score = 0;
    this.elapsed = 0;
    this.energy = C.maxEnergy;
    this.lives = C.maxLives;
    this.holding = false;
    this.cycle = 0;
    this.combo = 0;
    this.nearCount = 0;
    this.reason = '';
    this.resumeGrace = 0;
    this.messageUntil = 0;
    this.notifiedStage = 'warmup';
    this.enterPhase('closed');
    this.emit('start');
  }

  get remaining() { return Math.max(0, C.duration - this.elapsed); }
  get multiplier() { return 1 + Math.min(this.combo, 4) * 0.25; }
  get stage() {
    for (let i = C.stages.length - 1; i >= 0; i -= 1) {
      if (this.elapsed + EPSILON >= C.stages[i].start) return C.stages[i];
    }
    return C.stages[0];
  }
  get phaseProgress() { return Math.min(1, this.phaseTime / this.phaseDuration); }
  get danger() {
    return (this.phase === 'opening' && this.phaseTime >= C.reactionGrace) ||
      this.phase === 'open' || this.phase === 'closing';
  }

  setHolding(value) {
    if (this.mode !== 'playing') return;
    const next = Boolean(value);
    if (next === this.holding) return;
    this.holding = next;
    if (next && this.phase === 'warning' &&
        this.phaseDuration - this.phaseTime <= C.nearWindow + EPSILON &&
        !this.nearThisCycle && !this.caughtThisCycle) {
      this.nearThisCycle = true;
      this.nearCount += 1;
      this.score += C.nearBonus;
      this.say('差点失去人籍！ +60', 1);
      this.emit('near');
    }
    this.emit('pose', { human: next });
  }

  say(text, duration) {
    this.message = text;
    this.messageUntil = this.elapsed + duration;
  }

  enterPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    if (phase === 'closed') {
      this.cycle += 1;
      this.caughtThisCycle = false;
      this.nearThisCycle = false;
      const range = this.stage.closed;
      this.phaseDuration = this.cycle === 1 ? 3 : range[0] + this.random() * (range[1] - range[0]);
    } else if (phase === 'warning') {
      this.phaseDuration = C.warningDuration;
      this.say('叮！有脚步声，快装人！', C.warningDuration);
      this.emit('warning');
    } else if (phase === 'opening') {
      this.phaseDuration = C.openingDuration;
      this.emit('door');
    } else if (phase === 'open') {
      const range = this.stage.open;
      this.phaseDuration = range[0] + this.random() * (range[1] - range[0]);
    } else {
      this.phaseDuration = C.closingDuration;
    }
  }

  advancePhase() {
    if (this.phase === 'closed') this.enterPhase('warning');
    else if (this.phase === 'warning') this.enterPhase('opening');
    else if (this.phase === 'opening') this.enterPhase('open');
    else if (this.phase === 'open') this.enterPhase('closing');
    else {
      if (!this.caughtThisCycle) {
        this.combo += 1;
        this.score += C.perfectBonus;
        this.say('完美伪装！ +30', 0.85);
        this.emit('perfect');
      }
      this.enterPhase('closed');
    }
  }

  catchHorse() {
    if (this.caughtThisCycle) return;
    this.caughtThisCycle = true;
    this.lives -= 1;
    this.combo = 0;
    this.say(this.lives === 2 ? '糟糕！马脚露出来了。' : '老板：你最好真的是人。', 1.3);
    this.emit('caught', { lives: this.lives });
    if (this.lives === 0) this.finish('caught');
  }

  // 分割到相位边界，不会因卡顿跨过开门判定。暂停时不推进逻辑。
  update(seconds) {
    if (this.mode !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    let left = Math.min(seconds, C.duration);
    while (left > EPSILON && this.mode === 'playing') {
      const dt = Math.min(left, 1 / 120, this.phaseDuration - this.phaseTime, this.remaining);
      if (dt <= EPSILON) {
        if (this.remaining <= EPSILON) { this.finish('complete'); break; }
        this.advancePhase();
        continue;
      }
      const safeAtStart = this.resumeGrace > 0;
      this.elapsed += dt;
      this.phaseTime += dt;
      if (this.stage.id !== this.notifiedStage) {
        this.notifiedStage = this.stage.id;
        this.emit('stage', { stage: this.stage.id, label: this.stage.label });
      }
      this.resumeGrace = Math.max(0, this.resumeGrace - dt);
      if (this.holding) {
        this.energy = Math.max(0, this.energy - C.energyDrain * dt);
        if (this.energy <= EPSILON) { this.finish('tired'); break; }
      } else {
        this.energy = Math.min(C.maxEnergy, this.energy + C.energyRecover * dt);
        if (this.phase === 'closed' || this.phase === 'warning') {
          this.score += C.baseScore * this.multiplier * dt;
        }
      }
      if (this.danger && !this.holding && !safeAtStart) this.catchHorse();
      if (this.mode !== 'playing') break;
      left -= dt;
      if (this.remaining <= EPSILON) this.finish('complete');
      else if (this.phaseTime >= this.phaseDuration - EPSILON) this.advancePhase();
    }
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.holding = false;
    this.emit('pause');
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.holding = false;
    // 返回后留出重新按住的时间，避免松手状态直接判输。
    this.resumeGrace = 1;
    this.say('回来了！给你 1 秒装人。', 1);
    this.emit('resume');
  }

  finish(reason) {
    if (this.mode !== 'playing') return;
    this.mode = 'result';
    this.reason = reason;
    if (reason === 'complete') this.elapsed = C.duration;
    this.score = Math.floor(this.score + EPSILON);
    this.holding = false;
    this.emit('finish', { score: this.score, reason: reason });
  }

  get speech() {
    if (this.messageUntil > this.elapsed) return this.message;
    if (this.phase === 'closed') return this.holding ? '领导放心，我情绪很稳定。' : LINES[(this.cycle - 1) % LINES.length];
    if (this.phase === 'warning') return '叮！有脚步声，快装人！';
    if (this.phase === 'closing') return '等门关好，再做马。';
    return this.caughtThisCycle ? '老板：刚才是不是有匹马？' : '领导好，我很稳定。';
  }

  get title() {
    if (this.reason === 'tired') return '装人太久，累瘫了';
    if (this.reason === 'caught') return '工牌还在，马甲没了';
    if (this.score >= 1100) return '人前员工，人后马王';
    if (this.score >= 700) return '半人半马，班味不大';
    return '初入马场，未来可期';
  }

  get resultCopy() {
    if (this.reason === 'tired') return '门关时松手做马，才能恢复体力。';
    if (this.reason === 'caught') return '被看见 3 次了。下次叮一响就收手！';
    return '存活 30 秒 · 极限装人 ' + this.nearCount + ' 次';
  }
}

module.exports = Engine;

},
"./renderer":function(require,module,exports){
'use strict';

const P = {
  paper: '#f6f3e8', ink: '#29282f', muted: '#77736b', line: '#d8d4c8',
  lime: '#d8f45b', purple: '#b4a0e9', mane: '#68508c', wall: '#d8d6c9',
  door: '#b9bcb4', red: '#b55343', cream: '#e4d88e'
};
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hits = [];
    this.layout = { scale: 1, x: 0, y: 0, height: 700, stageY: 219, stageH: 344, compact: false };
  }

  resize(info, menu) {
    const w = info.windowWidth || info.screenWidth || 375;
    const h = info.windowHeight || info.screenHeight || 667;
    const dpr = clamp(info.pixelRatio || 1, 1, 3);
    this.width = w; this.height = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const safe = info.safeArea || {};
    const top = Math.max(safe.top || 0, menu && menu.bottom > 0 ? menu.bottom + 8 : 12);
    const bottom = Math.max(10, h - (safe.bottom || h));
    const available = Math.max(180, h - top - bottom);
    // 竖屏优先用满宽度，矮屏压缩标题和留白；极矮横屏才整体降级。
    const scale = Math.min(w / 375, available / 520);
    const height = Math.min(810, available / scale);
    const compact = height < 690;
    const stageY = compact ? 150 : 219;
    this.layout = {
      x: (w - 375 * scale) / 2,
      y: top + (available - height * scale) / 2,
      scale: scale, height: height, stageY: stageY,
      stageH: height - stageY - 137, compact: compact
    };
  }

  point(touch) {
    return {
      x: ((touch.clientX === undefined ? touch.x : touch.clientX) - this.layout.x) / this.layout.scale,
      y: ((touch.clientY === undefined ? touch.y : touch.clientY) - this.layout.y) / this.layout.scale
    };
  }

  hitAt(point) {
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      if (point.x >= hit.x && point.x <= hit.x + hit.w && point.y >= hit.y && point.y <= hit.y + hit.h) return hit.id;
    }
    return null;
  }

  rect(x, y, w, h, radius, fill, stroke, lineWidth) {
    const c = this.ctx;
    const r = Math.min(radius || 0, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth || 2; c.stroke(); }
  }

  ellipse(x, y, rx, ry, fill, stroke, width) {
    const c = this.ctx;
    c.beginPath();
    // 使用 scale + arc，兼容不实现 ellipse 的旧 Canvas。
    c.save(); c.translate(x, y); c.scale(rx, ry); c.arc(0, 0, 1, 0, Math.PI * 2); c.restore();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 2.5; c.stroke(); }
  }

  line(x1, y1, x2, y2, color, width) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = color || P.ink; c.lineWidth = width || 1; c.stroke();
  }

  text(value, x, y, size, color, weight, align) {
    const c = this.ctx;
    c.font = (weight || '400') + ' ' + (size || 14) + 'px ' + FONT;
    c.fillStyle = color || P.ink; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    c.fillText(String(value), x, y);
  }

  fitText(value, x, y, maxWidth, size, color, weight, align) {
    let s = size;
    const c = this.ctx;
    do { c.font = (weight || '400') + ' ' + s + 'px ' + FONT; if (c.measureText(value).width <= maxWidth) break; s -= 0.5; } while (s > 10);
    this.text(value, x, y, s, color, weight, align);
  }

  button(id, label, x, y, w, h, options) {
    const o = options || {};
    const dy = o.pressed ? 3 : 0;
    if (!o.flat) this.rect(x, y + 4, w, h, 12, P.ink);
    this.rect(x, y + dy, w, h, 12, o.fill || P.lime, o.flat ? P.line : P.ink, o.flat ? 1 : 2);
    this.fitText(label, x + w / 2, y + dy + (o.sub ? 29 : h / 2 + 6), w - 20, o.size || 18, P.ink, '700', 'center');
    if (o.sub) this.fitText(o.sub, x + w / 2, y + dy + 49, w - 20, 12, P.ink, '400', 'center');
    if (id) {
      const targetW = Math.max(w, 44 / this.layout.scale);
      const targetH = Math.max(h + 4, 44 / this.layout.scale);
      this.hits.push({ id: id, x: clamp(x + (w - targetW) / 2, 0, 375 - targetW),
        y: Math.max(0, y + (h - targetH) / 2), w: targetW, h: targetH });
    }
  }

  horse(cx, ground, human, time, size, poseAge) {
    const c = this.ctx;
    const settle = human ? Math.sin(clamp(poseAge / 0.28, 0, 1) * Math.PI) : 0;
    c.save(); c.translate(cx, ground); c.scale(size || 1, size || 1);
    this.ellipse(0, 0, 76, 8, '#29282f25');
    c.translate(0, -10);
    if (human) c.translate(0, -settle * 6);
    if (!human) { c.rotate(Math.sin(time * 12) * 0.075); c.translate(0, -4 - Math.sin(time * 12) * 4); }
    const leg = (x, angle, humanLeg) => {
      c.save(); c.translate(x, -42); c.rotate(angle);
      this.rect(-8, 0, 16, 39, 4, humanLeg ? '#4c4c59' : P.purple, P.ink, 2.5);
      this.rect(-10, 31, 24, 11, 3, P.ink); c.restore();
    };
    if (human) {
      leg(-23, 0, true); leg(23, 0, true);
      this.rect(-45, -119, 90, 84, 11, '#f1eee3', P.ink, 3);
      this.line(-42, -101, -55, -53, P.ink, 3); this.line(42, -101, 52, -52, P.ink, 3);
      this.rect(44, -41, 34, 29, 4, '#675747', P.ink, 2.5);
      this.rect(53, -47, 15, 7, 2, null, P.ink, 2.5);
      this.text('工', 61, -21, 12, '#e4d9b6', '500', 'center');
      c.save(); c.translate(0, -113); c.rotate(settle * 0.22); c.translate(0, 113);
      c.beginPath(); c.moveTo(-5, -114); c.lineTo(6, -114); c.lineTo(3, -104); c.lineTo(8, -76); c.lineTo(0, -67); c.lineTo(-8, -76); c.lineTo(-3, -104); c.closePath(); c.fillStyle = '#b86157'; c.fill(); c.restore();
      this.line(-23, -118, -10, -103, P.ink, 1); this.line(23, -118, 10, -103, P.ink, 1);
    } else {
      const swing = Math.sin(time * 15) * 0.4;
      leg(-50, 0.2 + swing, false); leg(-25, -0.2, false); leg(24, -0.2 - swing, false); leg(48, 0.2, false);
      c.save(); c.translate(-53, -101); c.rotate(-0.45 + Math.sin(time * 12) * 0.15);
      this.rect(-37, -9, 40, 16, 8, P.mane, P.ink, 2.5); c.restore();
      this.ellipse(-2, -80, 65, 37, P.purple, P.ink, 3);
      c.save(); c.translate(38, -128); c.rotate(0.18); this.rect(-18, -28, 36, 88, 16, P.purple, P.ink, 3); c.restore();
      this.text('♪', -92, -105, 31, P.mane, '500'); this.text('✦', 86, -62, 25, P.mane, '500');
    }
    c.save(); c.translate(human ? -2 : 43, human ? -158 : -165); c.rotate(human ? 0 : 0.17);
    this.rect(-49, -31, 25, 66, 14, P.mane, P.ink, 3);
    if (!human) {
      c.save(); c.translate(-24, -40); c.rotate(-0.3); this.rect(-9, -31, 18, 43, 9, P.purple, P.ink, 3); c.restore();
      c.save(); c.translate(21, -40); c.rotate(0.3); this.rect(-9, -31, 18, 43, 9, P.purple, P.ink, 3); c.restore();
    } else {
      this.ellipse(-36, -2, 10, 8, P.purple, P.ink, 2.5); this.ellipse(34, -2, 10, 8, P.purple, P.ink, 2.5);
    }
    this.rect(-39, -43, 80, 83, 29, P.purple, P.ink, 3);
    this.ellipse(-14, -14, 13, 16, '#f8f5e8', P.ink, 2);
    this.ellipse(16, -18, 13, 16, '#f8f5e8', P.ink, 2);
    this.ellipse(human ? -14 : -9, human ? -13 : -8, 3.5, 5, P.ink);
    this.ellipse(human ? 16 : 21, human ? -17 : -12, 3.5, 5, P.ink);
    this.rect(human ? -27 : -15, 8, human ? 57 : 69, 37, 16, P.cream, P.ink, 3);
    this.ellipse(human ? -11 : 13, 22, 2.5, 3.5, '#514a42'); this.ellipse(human ? 13 : 37, 22, 2.5, 3.5, '#514a42');
    c.beginPath(); c.moveTo(-8, 36); c.quadraticCurveTo(12, 49, 29, 36); c.strokeStyle = P.ink; c.lineWidth = 2; c.stroke();
    if (human) {
      c.save(); c.translate(0, -settle * 11);
      this.rect(-31, -29, 32, 26, 6, null, P.ink, 1.5); this.rect(3, -32, 31, 26, 6, null, P.ink, 1.5); this.line(1, -18, 4, -18, P.ink, 2); c.restore();
    }
    c.restore(); c.restore();
  }

  boss(x, y) {
    this.rect(x - 32, y, 64, 74, 25, '#f0b883', P.ink, 2);
    this.rect(x - 33, y - 1, 66, 25, 12, '#383034');
    this.ellipse(x - 12, y + 37, 3, 4, P.ink); this.ellipse(x + 13, y + 37, 3, 4, P.ink);
    this.line(x - 8, y + 53, x + 8, y + 53, P.ink, 2);
    this.rect(x - 45, y + 65, 90, 110, 20, '#65777e');
    this.rect(x - 20, y - 24, 40, 17, 4, P.paper);
    this.text('老板', x, y - 12, 10, P.ink, '400', 'center');
  }

  scene(g, time, shake, app, timestamp) {
    const c = this.ctx; const x = 18, y = this.layout.stageY, w = 339, h = this.layout.stageH;
    c.save(); c.translate(shake ? Math.sin(time * 80) * 3 : 0, 0);
    this.rect(x, y, w, h, 12, P.wall, P.ink, 2);
    // 场景内部裁切，门板不会穿出外框。
    this.rect(x + 1, y + 1, w - 2, h - 2, 11); c.clip();
    const dy = y + 34, dh = h - 64, doorX = x + 39, doorW = w - 78;
    this.rect(doorX, dy, doorW, dh, 0, '#ead9ab');
    this.boss(187.5, y + 69);
    let open = 0;
    if (g.phase === 'opening') open = g.phaseProgress;
    else if (g.phase === 'open') open = 1;
    else if (g.phase === 'closing') open = 1 - g.phaseProgress;
    open = open * open * (3 - 2 * open);
    c.save(); this.rect(doorX, dy, doorW, dh, 0); c.clip();
    const half = doorW / 2;
    for (let side = 0; side < 2; side += 1) {
      const px = doorX + side * half + (side ? 1 : -1) * half * open;
      const grad = c.createLinearGradient(px, 0, px + half, 0);
      grad.addColorStop(0, P.door); grad.addColorStop(0.5, P.wall); grad.addColorStop(1, P.door);
      this.rect(px, dy, half, dh, 0, grad, '#74786f', 1);
    }
    c.restore();
    this.line(doorX, dy, doorX, dy + dh, '#666a61', 3); this.line(doorX + doorW, dy, doorX + doorW, dy + dh, '#666a61', 3);
    this.rect(x, y + h - 30, w, 30, 0, '#adb0a4');
    for (let i = 0; i < 7; i += 1) this.line(x + 48 * i, y + h - 29, x + 48 * i + 10, y + h, '#8c9287', 1);
    const warning = g.mode === 'playing' && g.phase === 'warning';
    const danger = ['opening', 'open', 'closing'].indexOf(g.phase) >= 0;
    this.rect(x, y, w, 34, 0, warning ? (Math.sin(time * 20) > 0 ? '#ad5541' : '#7c3e35') : danger ? '#743c37' : P.ink);
    this.text('↑  ' + String(g.cycle + 6).padStart(2, '0') + ' F', x + 13, y + 23, 16, '#e2f28e', '500');
    const state = warning ? '叮！即将开门' : g.phase === 'closing' ? '门关好再松手' : danger ? '老板正在看你' : '无人围观';
    this.text(state, x + w - 13, y + 22, 11, '#e2f28e', '500', 'right');
    c.save(); c.translate(x + 30, y + 73); c.rotate(-0.09);
    this.rect(-25, -16, 58, 38, 0, '#f0ede2'); this.text('禁止在电梯内', 4, -2, 8, '#625f50', '400', 'center'); this.text('恢复出厂设置', 4, 12, 8, '#625f50', '400', 'center'); c.restore();
    c.save(); c.translate(x + w - 25, y + 129); c.rotate(0.08);
    this.rect(-21, -20, 43, 42, 0, '#ddd5b6', '#8b897d', 1); this.text('今日也要', 0, -4, 9, '#635f56', '400', 'center'); this.text('马到成功', 0, 11, 9, '#635f56', '400', 'center'); c.restore();
    this.rect(x + w - 23, y + h - 121, 12, 44, 5, '#8d9188', '#666a61', 1); this.text('↑', x + w - 17, y + h - 100, 10, '#e9edc9', '400', 'center');
    const size = Math.min(1.03, (h - 73) / 255);
    this.horse(187.5, y + h - 27, g.holding, time, size, (timestamp - app.poseStarted) / 1000);
    const bubble = g.mode === 'intro' ? '你的精神状态，老板知道吗？' : g.speech;
    c.font = '14px ' + FONT; const bw = clamp(c.measureText(bubble).width + 24, 170, 290);
    this.rect(187.5 - bw / 2 + 2, y + 48, bw, 33, 9, '#29282f20');
    this.rect(187.5 - bw / 2, y + 45, bw, 33, 9, P.paper, P.ink, 2);
    c.beginPath(); c.moveTo(181, y + 78); c.lineTo(187, y + 85); c.lineTo(193, y + 78); c.fillStyle = P.paper; c.fill(); c.strokeStyle = P.ink; c.lineWidth = 2; c.stroke();
    this.fitText(bubble, 187.5, y + 66, bw - 16, 14, P.ink, '500', 'center');
    this.text(Array.from({ length: 3 }, (_, i) => i < g.lives ? '●' : '○').join(' '), x + 13, y + h - 9, 11, P.ink, '400');
    this.text(g.holding ? '人模人样' : '发疯 ×' + g.multiplier.toFixed(2), x + w - 12, y + h - 9, 10, P.ink, '400', 'right');
    if (g.mode === 'playing' && timestamp < app.nearUntil) this.nearFeedback(time, timestamp - app.nearStarted, y, h);
    c.restore();
  }

  nearFeedback(time, age, y, h) {
    const c = this.ctx, progress = clamp(age / 950, 0, 1);
    c.save();
    c.globalAlpha = Math.min(1, (1 - progress) * 2.4);
    const originY = y + h * 0.55;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 38 + progress * 105;
      const px = 187.5 + Math.cos(angle) * radius;
      const py = originY + Math.sin(angle) * radius * 0.65 + progress * progress * 18;
      c.save(); c.translate(px, py); c.rotate(angle + progress * 2);
      this.rect(-3, -5, 6, 10, 1, [P.lime, P.purple, P.cream][i % 3]); c.restore();
    }
    c.save(); c.translate(285, originY - progress * 30);
    const pop = 1 + Math.sin(clamp(age / 180, 0, 1) * Math.PI) * 0.18;
    c.scale(pop, pop); c.rotate(-0.1);
    this.rect(-43, -30, 86, 57, 9, P.lime, P.ink, 2);
    this.text('+60', 0, 4, 30, P.ink, '900', 'center');
    this.text('极限装人', 0, 20, 11, P.ink, '500', 'center');
    c.restore(); c.restore();
  }

  overlay(g, app) {
    const y = this.layout.stageY, h = this.layout.stageH, short = h < 285;
    this.rect(20, y + 2, 335, h - 4, 10, P.paper);
    if (g.mode === 'paused') {
      this.text('先喘口气，马也需要休息', 187.5, y + (short ? 35 : 64), 12, P.muted, '400', 'center');
      this.text('游戏已暂停', 187.5, y + (short ? 82 : 112), 28, P.ink, '800', 'center');
      this.text('进度保留，回来后有 1 秒反应时间。', 187.5, y + (short ? 119 : 148), 12, P.muted, '400', 'center');
      this.button('resume', '继续装人  ↗', 52, y + (short ? h - 72 : 181), 271, 51);
      return;
    }
    this.text(app.newBest ? '本机新纪录 / 精神鉴定' : '本次精神鉴定', 187.5, y + (short ? 23 : 37), 11, P.muted, '400', 'center');
    this.fitText(g.title, 187.5, y + (short ? 57 : 77), 299, short ? 23 : 25, P.ink, '800', 'center');
    this.text(String(Math.floor(g.score)), 187.5, y + (short ? 110 : 142), short ? 47 : 56, P.ink, '800', 'center');
    if (!short) this.text('发疯值', 187.5, y + 166, 12, P.muted, '400', 'center');
    this.fitText(g.resultCopy, 187.5, y + (short ? 139 : 195), 300, 12, P.muted, '400', 'center');
    this.text('本机最佳 ' + app.best + '  ·  极限装人 ' + g.nearCount + ' 次', 187.5, y + (short ? 161 : 218), 11, P.muted, '400', 'center');
    const buttonY = y + (short ? h - 54 : 239);
    this.button('share', '挑战好友', 42, buttonY, 140, 44, { flat: true, fill: P.lime, size: 14 });
    this.button('copy', '复制战绩', 193, buttonY, 140, 44, { flat: true, fill: P.paper, size: 14 });
  }

  render(g, app, timestamp) {
    const c = this.ctx, L = this.layout, time = timestamp / 1000;
    this.hits = [];
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = P.paper; c.fillRect(0, 0, this.width, this.height);
    c.save(); c.translate(L.x, L.y); c.scale(L.scale, L.scale);
    this.text('摸鱼宇宙 / 电梯分部', 19, 27, 11, P.muted, '500');
    if (g.mode === 'playing') {
      this.button('pause', '暂停', 216, 2, 53, 44, { flat: true, fill: P.paper, size: 12 });
    }
    this.button('sound', app.muted ? '音效关' : '音效开', 304, 2, 53, 44, { flat: true, fill: P.paper, size: 11 });
    if (L.compact) {
      this.text('电梯里禁止变成马', 18, 75, 27, P.ink, '900');
      this.text('门开做人 · 门关做马', 19, 90, 12, P.muted);
    } else {
      this.text('PLEASE ACT NORMAL.', 19, 56, 10, P.muted, '500');
      this.text('电梯里禁止', 17, 91, 33, P.ink, '900');
      this.text('变成', 17, 129, 33, P.ink, '900');
      c.save(); c.translate(105, 113); c.rotate(-0.1); this.rect(-18, -20, 42, 40, 1, P.lime); this.text('马', 3, 12, 33, P.ink, '900', 'center'); c.restore();
      c.save(); c.translate(310, 106); c.rotate(0.25); this.ellipse(0, 0, 29, 29, null, P.red, 1.8); this.text('忍住！', 2, 6, 16, P.red, '500', 'center'); c.restore();
      this.text('门开做人 · 门关做马', 19, 151, 12, P.muted, '400');
    }
    const hudLine = L.stageY - 54, labelY = L.stageY - 36, scoreY = L.stageY - 10;
    this.line(18, hudLine, 357, hudLine, P.line, 1);
    this.text('发疯值', 19, labelY, 11, P.muted); this.text(String(Math.floor(g.score)).padStart(4, '0'), 18, scoreY, 27, P.ink, '500');
    this.text('本机最佳', 142, labelY, 11, P.muted); this.text(app.best ? String(app.best) : '—', 142, scoreY - 3, 19, P.ink, '500');
    this.text('剩余时间', 356, labelY, 11, P.muted, '400', 'right'); this.text(Math.ceil(g.remaining) + 's', 356, scoreY, 26, P.ink, '500', 'right');
    this.scene(g, time, app.hitUntil > timestamp, app, timestamp);
    if (g.mode === 'result' || g.mode === 'paused') this.overlay(g, app);
    const end = L.stageY + L.stageH;
    // 连续触控区先注册，顶部设置和结算控件不会被当作游戏输入。
    if (g.mode === 'playing') this.hits.push({ id: 'hold', x: 18, y: L.stageY, w: 339, h: L.stageH + 113 });
    this.text('装人体力', 19, end + 23, 12, P.muted);
    this.rect(81, end + 16, 225, 5, 3, P.line);
    const energyW = 225 * g.energy / 100;
    if (energyW > 0) this.rect(81, end + 16, energyW, 5, 3, g.energy < 25 ? P.red : P.ink);
    this.text(Math.round(g.energy) + '%', 356, end + 24, 12, P.ink, '500', 'right');
    if (g.mode === 'intro') this.button('start', '进入电梯  ↗', 18, end + 43, 339, 66, { sub: '30 秒 / 按住场景或按钮装人' });
    else if (g.mode === 'result') this.button('restart', '再发一次疯  ↗', 18, end + 43, 339, 66, { sub: '这一次，你能比刚才更像个人吗？' });
    else if (g.mode === 'paused') this.button('resume', '继续游戏  ↗', 18, end + 43, 339, 66, { sub: '返回后记得重新按住装人' });
    else this.button('hold', g.holding ? '正在装人' : '按住装人', 18, end + 43, 339, 66, { pressed: g.holding, fill: g.holding ? '#ddd6ed' : P.lime, sub: g.holding ? '体力消耗中 · 等门关好再松手' : '场景也能按 · 松手做马' });
    const stageLabel = g.mode === 'intro' ? '前 8 秒熟悉操作 · 后 10 秒老板查岗' : g.stage.label + ' · ' + g.stage.hint;
    this.fitText(stageLabel, 19, end + 131, 335, 12, g.stage.id === 'inspection' ? P.red : P.muted);
    if (app.toastUntil > timestamp) {
      this.rect(37, end - 56, 301, 39, 10, '#29282ff2');
      this.fitText(app.toastText, 187.5, end - 31, 277, 12, P.paper, '500', 'center');
    }
    c.restore();
  }
}

module.exports = Renderer;

},
"./audio":function(require,module,exports){
'use strict';

// 内置短音效，无网络资源。音效失败不影响游戏。
class Audio {
  constructor(api, muted) {
    this.api = api;
    this.muted = muted;
    this.players = {};
    ['warning', 'caught', 'near', 'finish'].forEach(name => {
      if (typeof api.createInnerAudioContext !== 'function') return;
      try {
        const player = api.createInnerAudioContext();
        player.src = 'assets/audio/' + name + '.wav';
        player.volume = name === 'caught' ? 0.35 : 0.5;
        player.onError(function () {});
        this.players[name] = player;
      } catch (e) { /* 平台不支持时保持静音。 */ }
    });
  }
  play(name) {
    if (this.muted || !this.players[name]) return;
    try { this.players[name].stop(); this.players[name].play(); } catch (e) { /* 无音频也可玩。 */ }
  }
  stop() {
    Object.keys(this.players).forEach(name => { try { this.players[name].stop(); } catch (e) {} });
  }
}

module.exports = Audio;

},
"./application":function(require,module,exports){
'use strict';

const Engine = require('./engine');
const Renderer = require('./renderer');
const Audio = require('./audio');
const C = require('./config');

class Application {
  constructor(api, runtime) {
    this.api = api;
    const rt = runtime || {};
    this.now = rt.now || Date.now;
    this.schedule = rt.requestFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb, 16));
    this.cancel = rt.cancelFrame || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout);
    this.hidden = false;
    this.touchId = null;
    this.touchAction = null;
    this.best = 0;
    this.newBest = false;
    this.muted = false;
    this.toastUntil = 0;
    this.toastText = '';
    this.hitUntil = 0;
    this.nearStarted = -Infinity;
    this.nearUntil = 0;
    this.poseStarted = -Infinity;
    this.frameId = null;
    this.lastTime = this.now();
    this.loadRecord();
    this.engine = new Engine({ onEvent: event => this.onGameEvent(event) });
    this.audio = new Audio(api, this.muted);
    this.canvas = api.createCanvas();
    this.renderer = new Renderer(this.canvas);
  }

  loadRecord() {
    try {
      const record = this.api.getStorageSync(C.storageKey);
      if (record && Number.isFinite(record.best) && record.best >= 0) this.best = Math.floor(record.best);
      if (record && typeof record.muted === 'boolean') this.muted = record.muted;
    } catch (e) { /* 首次安装或存储不可用不阻塞启动。 */ }
  }

  saveRecord() {
    try {
      this.api.setStorageSync(C.storageKey, { version: C.version, best: this.best, muted: this.muted });
    } catch (e) { this.toast('本次纪录未能保存，请检查本地存储。'); }
  }

  resize() {
    let info = {};
    let menu = null;
    try {
      info = typeof this.api.getWindowInfo === 'function' ? this.api.getWindowInfo() : this.api.getSystemInfoSync();
    } catch (e) {
      info = this.api.getSystemInfoSync();
    }
    try { if (typeof this.api.getMenuButtonBoundingClientRect === 'function') menu = this.api.getMenuButtonBoundingClientRect(); } catch (e) {}
    this.renderer.resize(info, menu);
  }

  boot() {
    this.resize();
    this.api.onTouchStart(event => this.touchStart(event));
    this.api.onTouchMove(event => this.touchMove(event));
    this.api.onTouchEnd(event => this.touchEnd(event));
    this.api.onTouchCancel(event => this.touchCancel(event));
    this.api.onHide(() => {
      this.hidden = true;
      this.engine.pause();
      this.clearTouch();
      this.audio.stop();
      if (this.frameId !== null) this.cancel(this.frameId);
      this.frameId = null;
    });
    this.api.onShow(() => {
      if (!this.hidden) return;
      this.hidden = false;
      this.resize();
      this.lastTime = this.now();
      this.tick();
    });
    if (typeof this.api.onWindowResize === 'function') this.api.onWindowResize(() => {
      this.engine.pause(); this.clearTouch(); this.resize();
    });
    try {
      if (typeof this.api.showShareMenu === 'function') this.api.showShareMenu({ menus: ['shareAppMessage'] });
      if (typeof this.api.onShareAppMessage === 'function') this.api.onShareAppMessage(() => this.shareData());
      if (typeof this.api.getLaunchOptionsSync === 'function') {
        const options = this.api.getLaunchOptionsSync();
        const target = Number(options.query && options.query.score);
        if (Number.isFinite(target) && target > 0 && target <= 1000000) this.toast('好友挑战：超过 ' + Math.floor(target) + ' 分！', 4000);
      }
    } catch (e) { /* 游客模式可能不提供分享能力。 */ }
    this.lastTime = this.now();
    this.tick();
    return this;
  }

  tick() {
    if (this.hidden) return;
    const now = this.now();
    const dt = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    // 长时间卡顿时暂停；不会让一帧跨过预警，直接扣掉生命。
    if (dt > 0.5 && this.engine.mode === 'playing') {
      this.engine.pause(); this.clearTouch();
      this.toast('刚才有些卡顿，已为你暂停。');
    } else this.engine.update(dt);
    this.renderer.render(this.engine, this, now);
    this.frameId = this.schedule(() => this.tick());
  }

  onGameEvent(event) {
    if (event.type === 'start') {
      this.newBest = false;
      this.nearUntil = 0;
      this.hitUntil = 0;
      this.toastUntil = 0;
      this.poseStarted = -Infinity;
    }
    if (event.type === 'pose') this.poseStarted = this.now();
    if (event.type === 'caught') {
      this.hitUntil = this.now() + 420;
      this.audio.play('caught');
      this.vibrate();
    }
    if (event.type === 'near') {
      this.nearStarted = this.now();
      this.nearUntil = this.nearStarted + 950;
      this.vibrate();
    }
    if (event.type === 'stage') this.toast(event.label + ' · ' + this.engine.stage.hint, 2000);
    if (event.type === 'warning' || event.type === 'near') this.audio.play(event.type);
    if (event.type === 'pause') { this.audio.stop(); this.nearUntil = 0; this.hitUntil = 0; }
    if (event.type === 'finish') {
      this.newBest = event.score > this.best;
      this.best = Math.max(this.best, event.score);
      this.saveRecord();
      this.audio.play('finish');
    }
  }

  vibrate() {
    if (!this.muted && typeof this.api.vibrateShort === 'function') {
      try { this.api.vibrateShort({ type: 'light', fail: function () {} }); } catch (e) {}
    }
  }

  toast(text, duration) {
    this.toastText = text;
    this.toastUntil = this.now() + (duration || 2200);
  }

  findTouch(event) {
    const touches = event.changedTouches || [];
    for (let i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === this.touchId) return touches[i];
    }
    return null;
  }

  touchStart(event) {
    if (this.touchId !== null || this.hidden) return;
    const touch = (event.changedTouches || [])[0];
    if (!touch) return;
    const action = this.renderer.hitAt(this.renderer.point(touch));
    if (!action) return;
    this.touchId = touch.identifier;
    this.touchAction = action;
    if (action === 'hold') this.engine.setHolding(true);
  }

  touchMove(event) {
    const touch = this.findTouch(event);
    if (!touch || this.touchAction !== 'hold') return;
    const hit = this.renderer.hitAt(this.renderer.point(touch));
    // 场景、体力条和主按钮连成连续操作区；滑出操作区或取消时释放。
    if (hit !== 'hold') this.clearTouch();
  }

  touchEnd(event) {
    const touch = this.findTouch(event);
    if (!touch) return;
    const action = this.touchAction;
    const hit = this.renderer.hitAt(this.renderer.point(touch));
    this.clearTouch();
    if (action && action !== 'hold' && hit === action) this.act(action);
  }

  touchCancel(event) {
    if (!(event.changedTouches || []).length || this.findTouch(event)) this.clearTouch();
  }

  clearTouch() {
    this.touchId = null;
    this.touchAction = null;
    this.engine.setHolding(false);
  }

  act(action) {
    if (action === 'start' || action === 'restart') {
      this.engine.start();
      this.lastTime = this.now();
    } else if (action === 'pause') this.engine.pause();
    else if (action === 'resume') { this.engine.resume(); this.lastTime = this.now(); }
    else if (action === 'sound') {
      this.muted = !this.muted;
      this.audio.muted = this.muted;
      if (this.muted) this.audio.stop();
      this.saveRecord();
    } else if (action === 'share') {
      try {
        if (typeof this.api.shareAppMessage !== 'function') { this.toast('请使用右上角菜单分享，或复制战绩。'); return; }
        this.api.shareAppMessage(this.shareData());
      } catch (e) { this.toast('当前环境暂不支持分享，可以复制战绩。'); }
    } else if (action === 'copy') {
      const message = '我在《电梯里禁止变成马》疯了 ' + Math.floor(this.engine.score) +
        ' 分，极限装人 ' + this.engine.nearCount + ' 次。你能比我更像个人吗？';
      if (typeof this.api.setClipboardData !== 'function') { this.toast('本局得分 ' + Math.floor(this.engine.score)); return; }
      this.api.setClipboardData({ data: message, success: () => this.toast('战绩已复制，去挑战好友吧。'), fail: () => this.toast('未能复制，请重试。') });
    }
    // 点击后的第一帧立即刷新命中区域，避免快速连点沿用旧场景。
    this.renderer.render(this.engine, this, this.now());
  }

  shareData() {
    const score = Math.floor(this.engine.score);
    return {
      title: score > 0 ? '我在电梯里疯了' + score + '分！你能比我更像个人吗？' : '电梯里禁止变成马：门开装人，门关发疯！',
      query: 'score=' + score
    };
  }
}

module.exports = Application;

},
"./browser-adapter":function(require,module,exports){
'use strict';

// Browser implementation of the small wx surface used by the original game.
// No game state or test hooks are exposed on window.
module.exports = function createBrowserBridge(win, canvas, notify = function () {}) {
  const doc = win.document, listeners = [], callbacks = {}, memory = new Map(), players = [];
  let hidden = false, focused = true, warmed = false, warnedStorage = false;
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options); listeners.push(() => target.removeEventListener(type, fn, options));
  };
  const emit = (name, data) => { if (callbacks[name]) callbacks[name](data); };
  function foreground() {
    const next = !!doc.hidden || !focused;
    if (next === hidden) return;
    hidden = next; emit(next ? 'hide' : 'show');
  }
  const localTouch = event => {
    const box = canvas.getBoundingClientRect();
    return { identifier: event.pointerId, clientX: event.clientX - box.left, clientY: event.clientY - box.top };
  };
  function unlockAudio() {
    if (warmed) return; warmed = true;
    for (const player of players) player.unlock();
  }
  for (const [native, kind] of [['pointerdown', 'start'], ['pointermove', 'move'], ['pointerup', 'end'], ['pointercancel', 'cancel'], ['lostpointercapture', 'cancel']]) {
    listen(canvas, native, event => {
      if (native === 'pointerdown' && event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      if (native === 'pointerdown') {
        unlockAudio();
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
      emit(kind, { changedTouches: [localTouch(event)] });
    }, { passive: false });
  }
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(win, 'blur', () => { focused = false; foreground(); });
  listen(win, 'focus', () => { focused = true; foreground(); });
  listen(doc, 'visibilitychange', foreground);
  listen(win, 'pagehide', () => { focused = false; foreground(); });
  listen(win, 'pageshow', () => { focused = true; foreground(); });
  listen(win, 'resize', () => emit('resize'));
  listen(win, 'orientationchange', () => emit('resize'));

  const currentUrl = query => {
    const url = new URL(win.location.href); url.hash = '';
    if (query) for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
    return url.href;
  };
  async function copyText(text) {
    if (!win.navigator.clipboard || typeof win.navigator.clipboard.writeText !== 'function') throw new Error('clipboard-unavailable');
    await win.navigator.clipboard.writeText(text);
  }
  function offerManualCopy(text) {
    const panel = doc.getElementById('share-panel'), field = doc.getElementById('share-text');
    if (panel && field) {
      field.value = text; panel.hidden = false; field.focus(); field.select();
    }
    notify('自动复制不可用，请长按选中文本复制链接。');
  }
  const api = {
    createCanvas: () => canvas,
    getWindowInfo() {
      const box = canvas.getBoundingClientRect();
      let top = 0, bottom = 0;
      try {
        const probe = doc.getElementById('safe-insets'), style = win.getComputedStyle(probe);
        top = parseFloat(style.paddingTop) || 0; bottom = parseFloat(style.paddingBottom) || 0;
      } catch (_) {}
      const width = Math.max(1, box.width || win.innerWidth), height = Math.max(1, box.height || win.innerHeight);
      return { windowWidth: width, windowHeight: height, pixelRatio: Math.min(win.devicePixelRatio || 1, 3), safeArea: { top, bottom: height - bottom } };
    },
    getStorageSync(key) {
      try { const value = win.localStorage.getItem(key); return value ? JSON.parse(value) : memory.get(key); }
      catch (_) { return memory.get(key); }
    },
    setStorageSync(key, value) {
      memory.set(key, value);
      try { win.localStorage.setItem(key, JSON.stringify(value)); }
      catch (_) { if (!warnedStorage) { warnedStorage = true; notify('浏览器未允许保存记录，本次游玩仍可继续。'); } }
    },
    onTouchStart: fn => { callbacks.start = fn; }, onTouchMove: fn => { callbacks.move = fn; },
    onTouchEnd: fn => { callbacks.end = fn; }, onTouchCancel: fn => { callbacks.cancel = fn; },
    onHide: fn => { callbacks.hide = fn; }, onShow: fn => { callbacks.show = fn; }, onWindowResize: fn => { callbacks.resize = fn; },
    getLaunchOptionsSync: () => ({ query: Object.fromEntries(new URL(win.location.href).searchParams) }),
    setClipboardData(options) {
      const text = options.data + '\n' + currentUrl();
      copyText(text).then(() => { if (options.success) options.success(); }, error => {
        if (options.fail) options.fail(error); offerManualCopy(text);
      });
    },
    shareAppMessage(options) {
      const data = { title: '电梯里禁止变成马', text: options.title, url: currentUrl(options.query) };
      const fallback = () => copyText(data.text + '\n' + data.url).then(() => notify('挑战链接已复制，发给好友即可。'), () => offerManualCopy(data.text + '\n' + data.url));
      if (typeof win.navigator.share !== 'function') { fallback(); return; }
      try {
        Promise.resolve(win.navigator.share(data)).catch(error => { if (!error || error.name !== 'AbortError') fallback(); });
      } catch (_) { fallback(); }
    },
    createInnerAudioContext() {
      const media = new win.Audio(); media.preload = 'auto';
      let onError = function () {}, requested = false;
      media.addEventListener('error', event => onError(event));
      const player = {
        set src(value) { media.src = value; }, get src() { return media.src; },
        set volume(value) { media.volume = value; }, get volume() { return media.volume; },
        onError(fn) { onError = fn; },
        play() {
          requested = true;
          try { const promise = media.play(); if (promise && promise.catch) promise.catch(onError); } catch (error) { onError(error); }
        },
        stop() { requested = false; try { media.pause(); media.currentTime = 0; } catch (_) {} },
        unlock() {
          media.muted = true;
          try {
            Promise.resolve(media.play()).then(() => { if (!requested) player.stop(); media.muted = false; }, () => { media.muted = false; });
          } catch (_) { media.muted = false; }
        }
      };
      players.push(player); return player;
    }
  };
  const close = doc.getElementById('close-share');
  if (close) listen(close, 'click', () => { doc.getElementById('share-panel').hidden = true; canvas.focus(); });
  return { api, dispose() { for (const off of listeners) off(); for (const player of players) player.stop(); } };
};

}};
const cache={};
function require(id){if(!cache[id]){if(!factories[id])throw new Error("Unknown module "+id);const mod={exports:{}};cache[id]=mod;factories[id](require,mod,mod.exports);}return cache[id].exports;}
(function () {
  'use strict';
  const canvas = document.getElementById('game');
  let application;
  const bridge = require('./browser-adapter')(window, canvas, message => { if (application) application.toast(message, 3200); });
  application = new (require('./application'))(bridge.api, {
    now: () => Date.now(),
    requestFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: id => window.cancelAnimationFrame(id)
  }).boot();
})();

})();
