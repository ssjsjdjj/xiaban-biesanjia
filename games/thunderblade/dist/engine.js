(function (root) {
  'use strict';
  const W = 720, H = 720, TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const segmentDistance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const PHASES = ['试刀 · 单刃', '追潮 · 连刃', '断潮 · 狂澜'];
  const STYLES = [
    { id: 'hunter', name: '逐影刀', hint: '突进追身，留意连段末刀', distance: 145 },
    { id: 'warden', name: '镇潮势', hint: '重劈镇场，收势时近身追击', distance: 185 },
    { id: 'trickster', name: '迟刃式', hint: '快慢交错，看刀光再格挡', distance: 160 }
  ];
  const ROUTES = {
    hunter: { 1: [['thrust'], ['rush'], ['sweep'], ['leap']], 2: [['rush', 'cross'], ['cross', 'thrust'], ['thrust', 'sweep'], ['leap', 'rush']], 3: [['rush', 'cross', 'thrust'], ['cross', 'cross', 'cleave'], ['leap', 'rush'], ['thrust', 'feint']] },
    warden: { 1: [['cleave'], ['leap'], ['sweep'], ['thrust']], 2: [['cleave'], ['geyser', 'sweep'], ['ring'], ['sweep', 'cleave']], 3: [['geyser', 'thrust'], ['ring'], ['cleave', 'cross'], ['sweep', 'sweep', 'cleave']] },
    trickster: { 1: [['feint'], ['thrust'], ['leap'], ['sweep']], 2: [['feint', 'thrust'], ['cross', 'cross'], ['leap', 'sweep'], ['thrust', 'feint']], 3: [['feint', 'cross', 'thrust'], ['cross', 'feint'], ['leap', 'cross'], ['geyser', 'sweep']] }
  };
  class Nightfall {
    constructor(canvas, options = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.options = options;
      this.randomState = options.seed === undefined ? ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0) : Number(options.seed) >>> 0;
      this.styleBag = []; this.previousStyle = -1; this.roundsStarted = 0;
      this.dpr = Math.min(options.dpr || (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1), 2);
      canvas.width = W * this.dpr; canvas.height = H * this.dpr;
      this.clock = 0; this.state = 'menu'; this.effects = []; this.texts = []; this.trails = []; this.rings = [];
      this.rain = Array.from({ length: 55 }, (_, i) => ({ x: (i * 137) % W, y: (i * 73) % H, speed: 240 + (i % 5) * 26 }));
      this.resetBattle(); this.state = 'menu';
    }
    emit(type, data) { if (this.options.onEvent) this.options.onEvent(type, data); }
    resetBattle() {
      this.time = 0; this.result = null; this.phase = 1; this.posture = 0; this.broken = 0; this.postureLock = 0;
      this.player = { x: 360, y: 482, hp: 100, maxHp: 100, angle: -Math.PI / 2, inv: 0, guard: 0, guardAge: 0, dash: 0, dodgeWindow: 0 };
      this.boss = { x: 360, y: 290, r: 44, hp: 5200, maxHp: 5200, angle: Math.PI / 2, flash: 0 };
      this.stats = { hits: 0, parries: 0, dodges: 0, executions: 0, damage: 0, weakHits: 0, counters: 0, maxCombo: 0, whiffs: 0, dashRefunds: 0 };
      this.effects = []; this.texts = []; this.trails = []; this.rings = [];
      this.attack = null; this.attackSerial = 0; this.nextAttack = 1.5; this.attackCd = 0;
      this.dashCd = 0; this.guardCd = 0; this.combo = 0; this.comboTime = 0; this.riposte = 0;
      this.shake = 0; this.flash = 0; this.flashColor = '#d8ebde'; this.executionTime = 0; this.hitStop = 0;
      this.banner = ''; this.bannerTime = 0; this.lastMove = { x: 0, y: -1 }; this.resetInput();
      this.style = STYLES[0]; this.styleName = ''; this.styleHint = '';
      this.route = []; this.routeIndex = 0; this.chainId = 0; this.lastRoute = ''; this.lastOpeners = [];
      this.attackHistory = []; this.attackLog = []; this.lastRedAt = -Infinity; this.punish = 0;
      this.actor = { action: 'idle', age: 0, duration: 1, angle: -Math.PI / 2, force: 0 };
      this.bossPose = { action: 'idle', age: 0, duration: 1, angle: Math.PI / 2 }; this.effectSerial = 0;
    }
    random() { this.randomState = (1664525 * this.randomState + 1013904223) >>> 0; return this.randomState / 4294967296; }
    chooseStyle() {
      if (!this.styleBag.length) {
        this.styleBag = [0, 1, 2];
        for (let i = 2; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [this.styleBag[i], this.styleBag[j]] = [this.styleBag[j], this.styleBag[i]]; }
        if (this.styleBag[2] === this.previousStyle) [this.styleBag[2], this.styleBag[0]] = [this.styleBag[0], this.styleBag[2]];
      }
      this.previousStyle = this.styleBag.pop(); this.style = STYLES[this.previousStyle];
      this.styleName = this.style.name; this.styleHint = this.style.hint;
    }
    posePlayer(action, duration, angle = this.player.angle, force = 1) { this.actor = { action, age: 0, duration, angle, force }; }
    poseBoss(action, duration, angle = this.boss.angle) { this.bossPose = { action, age: 0, duration, angle }; }
    hitEffect(x, y, angle, heavy = false, color = '#baffe8') {
      this.effects.push({ kind: 'sparks', x, y, angle, color, count: this.options.effects === false ? 4 : heavy ? 24 : 11, seed: ++this.effectSerial * 137, life: heavy ? .42 : .28, max: heavy ? .42 : .28 });
      this.effects.push({ kind: 'impact', x, y, angle, color, radius: heavy ? 70 : 38, life: .2, max: .2 });
      if (this.effects.length > 100) this.effects.splice(0, this.effects.length - 100);
    }
    start() {
      this.resetBattle(); this.chooseStyle(); this.roundsStarted++; this.state = 'playing';
      this.say(this.styleName + ' · 六十秒决胜', 2.1); this.emit('start'); this.emit('hud', this.snapshot());
    }
    home() { this.resetBattle(); this.state = 'menu'; this.emit('hud', this.snapshot()); }
    cancelAttack() { this.attackHeld = false; this.chargeTime = 0; this.queuedSlash = null; }
    resetInput() { this.input = { x: 0, y: 0 }; this.cancelAttack(); this.queuedDefense = null; }
    pause() { if (this.state === 'playing') { this.state = 'paused'; this.resetInput(); this.emit('pause'); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); } }
    ready() { return this.state === 'playing' && (this.time < 60 || this.resolvingSlice && this.time <= 60) && this.player.hp > 0 && this.boss.hp > 0; }
    movementInput(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const n = Math.max(1, Math.hypot(x, y)); this.input = { x: x / n, y: y / n };
      if (n > .08 && (x || y)) { const l = Math.hypot(x, y); this.lastMove = { x: x / l, y: y / l }; }
    }
    attackDown() {
      if (!this.ready() || this.executionTime > .18 || this.attackHeld) return false;
      if (this.broken > 0) return this.execute();
      this.attackHeld = true; this.chargeTime = 0; this.emit('sound', 'charge'); return true;
    }
    attackUp() {
      if (!this.attackHeld) return false;
      const strength = clamp((this.chargeTime - .18) / .34, 0, 1), charged = strength > 0;
      this.attackHeld = false; this.chargeTime = 0;
      if (!this.ready()) return false;
      const waitGuard = !!(this.player.guard > 0 && this.attack && !this.attack.red && this.attack.duration - this.attack.elapsed < this.player.guard);
      const wait = Math.max(this.attackCd, this.executionTime, this.player.dash, waitGuard ? Math.min(this.player.guard, this.attack.duration - this.attack.elapsed + .03) : 0);
      if (wait <= 0) return this.slash(charged, strength);
      if (wait <= .7 || waitGuard) { this.queuedSlash = { charged, strength, waitGuard, life: Math.max(.25, wait + .15) }; return true; }
      this.emit('feedback', '收刀后再出招'); return false;
    }
    slash(charged, strength = 1) {
      if (!this.ready() || this.executionTime > 0 || this.player.dash > 0) return false;
      if (this.broken > 0) return this.execute();
      this.player.guard = 0;
      this.combo = charged ? 0 : this.comboTime > 0 ? this.combo % 3 + 1 : 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.comboTime = 1.25; const finisher = this.combo === 3;
      this.attackCd = charged ? .29 + .33 * strength : finisher ? .42 : .26;
      const p = this.player, b = this.boss, d = distance(p, b), angle = Math.atan2(b.y - p.y, b.x - p.x);
      p.angle = angle;
      this.posePlayer(charged ? 'heavy' : finisher ? 'finisher' : this.combo === 2 ? 'light2' : 'light1', charged ? .4 : finisher ? .34 : .24, angle, charged ? strength : 1);
      const reach = charged ? 214 : 186, step = charged ? 36 : 24;
      const toward = this.input.x * Math.cos(angle) + this.input.y * Math.sin(angle);
      // A short assist may complete a nearby hit, but never overturn a retreat or pull an empty swing forward.
      if (toward >= -.15 && d > reach - 14 && d <= reach + step) {
        const lunge = Math.min(step, d - reach + 14);
        this.trails.push({ x: p.x, y: p.y, angle, life: .12, max: .12 });
        p.x += Math.cos(angle) * lunge; p.y += Math.sin(angle) * lunge; this.contain(p, 286);
      }
      this.effects.push({ kind: 'slash', x: p.x, y: p.y, angle, side: this.combo === 2 ? -1 : 1, radius: charged ? 180 : 145, color: charged ? '#f1d78e' : '#b0fff0', heavy: charged || finisher, life: .24, max: .24 });
      this.emit('sound', charged ? 'heavy' : finisher ? 'finisher' : this.combo === 2 ? 'light2' : 'light1');
      if (distance(p, b) <= reach) {
        const counter = this.riposte > 0;
        const weak = this.punish > 0;
        const damage = Math.round((charged ? 36 + 72 * strength : finisher ? 80 : this.combo === 2 ? 44 : 36) * (1 + (counter ? .35 : 0) + (weak ? charged ? .2 + .15 * strength : .2 : 0)));
        this.riposte = 0;
        this.stats.hits++; if (weak) this.stats.weakHits++; if (counter) this.stats.counters++;
        this.hitEffect(b.x - Math.cos(angle) * 28, b.y - Math.sin(angle) * 28, angle, charged || finisher || counter, counter ? '#ffe5a0' : charged ? '#f9d79a' : '#baffe8');
        this.poseBoss('recoil', charged || finisher ? .18 : .1, angle);
        this.emit('sound', counter ? 'counter' : charged || finisher ? 'heavyHit' : 'hit');
        this.damageBoss(damage, (charged ? 9 + 21 * strength : finisher ? 22 : 9) + (counter ? 8 : 0) + (weak ? 5 : 0));
        if (this.state !== 'playing') return true;
        this.hitStop = charged ? .065 : .025;
        this.impact(charged ? 9 : finisher ? 7 : 3);
        const refund = finisher ? Math.min(.35, this.dashCd) : 0;
        if (refund > 0) { this.dashCd -= refund; this.stats.dashRefunds++; }
        if (counter) this.float('弹反追击', b.x, b.y - 70, '#ffe0a0', 24);
        else if (charged) this.float(weak ? '收势重斩' : strength >= .95 ? '重斩' : '蓄斩', b.x, b.y - 70, '#f2d492', 22);
        else if (finisher) this.float(refund > 0 ? '三连 · 回身' : '三连 · 断', b.x, b.y - 70, '#baffec', 20);
        else if (weak) this.float('破绽追击', b.x, b.y - 64, '#c1ffdc', 17);
      } else { this.stats.whiffs++; this.float('未命中 · 再近一点', p.x, p.y - 50, '#c0c8c1', 15); this.emit('feedback', '靠近首领，刀光范围内出招'); }
      return true;
    }
    guard() {
      if (!this.ready()) return false;
      const wait = Math.max(this.guardCd, this.executionTime);
      if (wait > 0) {
        if (wait <= .14) { this.cancelAttack(); this.queuedDefense = { type: 'guard', life: .17 }; return true; }
        this.emit('feedback', this.executionTime > 0 ? '处决中' : '格挡尚未就绪'); return false;
      }
      this.cancelAttack(); this.queuedDefense = null;
      this.player.guard = .56; this.player.guardAge = 0; this.guardCd = .82;
      this.posePlayer('guard', .56);
      this.emit('sound', 'guard'); return true;
    }
    dash() {
      if (!this.ready()) return false;
      const wait = Math.max(this.dashCd, this.executionTime);
      if (wait > 0) {
        if (wait <= .14) { this.cancelAttack(); this.queuedDefense = { type: 'dash', life: .17 }; return true; }
        this.emit('feedback', this.executionTime > 0 ? '处决中' : '闪避尚未就绪'); return false;
      }
      this.cancelAttack(); this.queuedDefense = null; this.player.guard = 0;
      const inputLength = Math.hypot(this.input.x, this.input.y);
      let dx = this.input.x, dy = this.input.y;
      if (inputLength < .1) {
        const ring = this.rings.find(r => !r.hit && Math.abs(distance(this.player, r) - r.radius) < 110);
        // With no direction held, cross an incoming wave rather than chase it to the arena wall.
        dx = ring ? ring.x - this.player.x : this.player.x - this.boss.x;
        dy = ring ? ring.y - this.player.y : this.player.y - this.boss.y;
      }
      const n = Math.hypot(dx, dy) || 1; this.dashDir = { x: dx / n, y: dy / n };
      this.player.dash = .19; this.player.dodgeWindow = .31; this.player.inv = Math.max(this.player.inv, .31); this.dashCd = 1.05;
      this.player.angle = Math.atan2(this.dashDir.y, this.dashDir.x);
      this.posePlayer('dash', .24, Math.atan2(this.dashDir.y, this.dashDir.x));
      this.emit('sound', 'dash'); return true;
    }
    execute() {
      if (!this.ready() || this.broken <= 0 || this.executionTime > 0) return false;
      const b = this.boss, p = this.player;
      p.x = b.x; p.y = Math.min(636, b.y + 106); p.angle = -Math.PI / 2;
      this.broken = 0; this.posture = 0; this.postureLock = 4.3; this.attack = null; this.rings = []; this.route = []; this.punish = 0;
      const healed = Math.min(14, p.maxHp - p.hp), dealt = Math.min(320, b.hp);
      this.executionTime = .62; p.inv = 1; p.hp += healed;
      this.stats.executions++; this.cancelAttack(); this.queuedDefense = null; this.nextAttack = .18;
      this.posePlayer('execute', .7, -Math.PI / 2); this.poseBoss('recoil', .7);
      this.hitEffect(b.x, b.y, -Math.PI / 2, true, '#ffe2a0');
      this.effects.push({ kind: 'execute', x: b.x, y: b.y, life: .65, max: .65 });
      this.say('断 潮', .7); this.float('处决  −' + dealt + (healed > 0 ? '  /  回血 +' + healed : ''), b.x, b.y - 85, '#f6d691', 22);
      this.impact(22); this.flash = .18; this.flashColor = '#fff1c5'; this.emit('sound', 'execute');
      this.damageBoss(320, 0); return true;
    }
    damageBoss(damage, posture) {
      if (!this.ready()) return;
      const actual = Math.min(this.boss.hp, damage); this.boss.hp = Math.max(0, this.boss.hp - damage);
      this.stats.damage += actual; this.boss.flash = .12;
      this.float(String(Math.round(actual)), this.boss.x + 30, this.boss.y - 30, '#edf4df', 23);
      if (this.boss.hp <= 0) { this.finish(true, '斩断潮涌'); return; }
      if (this.broken <= 0 && this.postureLock <= 0) {
        this.posture = Math.min(100, this.posture + posture);
        if (this.posture >= 100) {
          this.broken = 4; this.attack = null; this.rings = []; this.route = []; this.punish = 0; this.nextAttack = .8;
          this.poseBoss('broken', 4); this.emit('sound', 'stagger');
          this.say('破防 · 出刀处决', 1.1); this.emit('feedback', '破防！按斩击 / E 处决并回血'); this.emit('sound', 'break'); this.impact(12);
        }
      }
    }
    hurt(damage, parryable = true, source) {
      if (!this.ready() || this.executionTime > 0) return 'ignored';
      const p = this.player;
      if (p.inv > 0) {
        if (p.dodgeWindow > 0) { this.stats.dodges++; this.float('掠 影', p.x, p.y - 45, '#afffee', 18); }
        return 'dodge';
      }
      if (parryable && p.guard > 0) {
        if (p.guardAge <= .28) {
          this.stats.parries++; this.guardCd = 0; p.guard = 0; p.inv = .12;
          this.riposte = 1.2;
          this.posePlayer('parry', .32, Math.atan2(this.boss.y - p.y, this.boss.x - p.x)); this.poseBoss('recoil', .2);
          this.hitEffect(p.x, p.y - 15, p.angle, true, '#ffe5a0'); this.hitStop = .075;
          this.damageBoss(65, 44); this.impact(12); this.flash = .1; this.flashColor = '#f9df9b';
          this.float('弹 反', p.x, p.y - 60, '#ffe0a0', 30); this.emit('sound', 'parry');
          this.emit('feedback', '完美弹反 · 下一刀强化'); return 'parry';
        }
        damage = 6; this.float('格挡', p.x, p.y - 48, '#dacfae', 18); this.emit('sound', 'block');
        if (this.postureLock <= 0) this.posture = Math.min(99, this.posture + 8);
      } else this.emit('sound', 'hurt');
      p.hp = Math.max(0, p.hp - damage); p.inv = .52; p.guard = 0;
      this.posePlayer('hurt', .24); this.hitEffect(p.x, p.y - 8, p.angle + Math.PI, false, '#f4ad96');
      this.float('−' + damage, p.x + 24, p.y - 28, '#f6a194', 23); this.impact(8); this.flash = .12; this.flashColor = '#c45247';
      if (source) { const angle = Math.atan2(p.y - source.y, p.x - source.x); p.x += Math.cos(angle) * 26; p.y += Math.sin(angle) * 26; this.contain(p, 286); }
      if (p.hp <= 0) this.finish(false, '倒在潮声里');
      return 'hit';
    }
    finish(win, reason) {
      if (this.state !== 'playing') return;
      this.state = win ? 'won' : 'lost'; this.resetInput(); this.attack = null; this.rings = []; this.route = [];
      const score = Math.round(this.stats.damage + this.stats.parries * 140 + this.stats.dodges * 35 + this.stats.executions * 180 + (win ? 1000 + (60 - this.time) * 35 + this.player.hp * 5 : 0));
      this.result = { win, reason, time: this.time, remaining: Math.max(0, 60 - this.time), hp: this.player.hp, score, stats: { ...this.stats }, bossHp: this.boss.hp, bossMax: this.boss.maxHp, styleName: this.styleName, styleHint: this.styleHint };
      this.emit('result', this.result); this.emit('sound', win ? 'win' : 'lose'); this.emit('hud', this.snapshot());
    }
    snapshot() {
      const a = this.attack;
      const parryNow = !!(a && !a.red && a.duration - a.elapsed <= .27);
      const dodgeNow = !!(a && a.red && a.type !== 'ring' && a.duration - a.elapsed <= .25 || this.rings.some(r => !r.hit && Math.abs(distance(this.player, r) - r.radius) < 85));
      const hint = this.broken > 0 ? '破防！按斩击 / E 处决 · 回血 +14' : this.executionTime > 0 ? '断潮处决 · 刀势未尽' : parryNow ? '现在格挡！迎住金色刀锋' : dodgeNow ? '现在闪避！避开红色危招' : a ? a.red ? '危 · 红色攻击不可格挡，闪出危险区' : '金色刀芒 · 预警将满时按格挡' : this.riposte > 0 ? '弹反成功 · 趁势出刀，强化反击' : this.punish > 0 ? '收势破绽 · 趁现在连斩或重斩' : this.attackHeld ? '蓄满后松开，重斩更易破防' : '轻斩三连 · 长按蓄力 · 观察首领起手';
      return { state: this.state, time: this.time, remaining: Math.max(0, 60 - this.time), hp: this.player.hp, maxHp: this.player.maxHp,
        bossHp: this.boss.hp, bossMax: this.boss.maxHp, posture: this.posture, postureLock: this.postureLock, broken: this.broken, phase: this.phase, phaseName: PHASES[this.phase - 1], charge: clamp(this.chargeTime / .52, 0, 1), attackHeld: this.attackHeld,
        dashCd: this.dashCd, guardCd: this.guardCd, attackCd: this.attackCd, attackQueued: !!this.queuedSlash, riposte: this.riposte, parryNow, dodgeNow, combo: this.comboTime > 0 ? this.combo : 0, stats: { ...this.stats }, hint, attackName: a ? a.name : this.broken > 0 ? '架势崩解' : this.executionTime > 0 ? '处决' : '收势', telegraph: a ? clamp(a.elapsed / a.duration, 0, 1) : 0, danger: !!(a && a.red),
        styleName: this.styleName, styleHint: this.styleHint, punish: this.punish, attackCombo: a && a.comboTotal > 1 ? a.comboIndex + ' / ' + a.comboTotal : '', pressureName: a ? a.name : this.punish > 0 ? '收势 · 抓破绽' : this.broken > 0 ? '架势崩解' : this.executionTime > 0 ? '断潮处决' : '寻隙' };
    }
    contain(p, radius) {
      const dx = p.x - 360, dy = p.y - 363, d = Math.hypot(dx, dy);
      if (d > radius) { p.x = 360 + dx / d * radius; p.y = 363 + dy / d * radius; }
    }
    beginAttack(type, follow = false) {
      const b = this.boss, p = this.player;
      let angle = Math.atan2(p.y - b.y, p.x - b.x);
      if (type === 'cross') angle += this.routeIndex % 2 ? .42 : -.42;
      const red = ['leap', 'ring', 'cleave', 'geyser'].includes(type);
      const names = { sweep: '横刀 · 金', twin: '连刃 · 金', rush: '逐影突进 · 金', leap: '坠潮 · 危', ring: '潮环 · 危', thrust: '穿喉直刺 · 金', cross: '交错斩 · 金', feint: '迟刃蓄斩 · 金', cleave: '裂地重劈 · 危', geyser: '三叠潮涌 · 危' };
      const timings = { sweep: this.phase === 1 ? 1.05 : .86, twin: .7, rush: .9, leap: 1.08, ring: .9, thrust: .86, cross: this.routeIndex ? .74 : .94, feint: 1.32, cleave: 1.18, geyser: 1.15 };
      const duration = red ? Math.max(timings[type], this.lastRedAt + 1.2 - this.time) : timings[type];
      const length = type === 'thrust' ? 300 : Math.min(390, distance(p, b) + 85);
      const end = { x: b.x + Math.cos(angle) * length, y: b.y + Math.sin(angle) * length };
      if (type === 'rush') { this.contain(end, 230); angle = Math.atan2(end.y - b.y, end.x - b.x); }
      const target = { x: p.x, y: p.y }; this.contain(target, 250);
      const radius = type === 'leap' ? 123 : type === 'geyser' ? 80 : type === 'ring' ? 105 : type === 'cleave' ? 235 : type === 'feint' ? 220 : type === 'cross' ? 210 : 216;
      const halfAngle = type === 'cleave' ? 1.8 : type === 'cross' ? 1.2 : type === 'feint' ? 1.35 : 1.4;
      const points = type === 'geyser' ? [-1, 0, 1].map(side => ({ x: target.x + Math.sin(angle) * side * 112, y: target.y - Math.cos(angle) * side * 112 })) : undefined;
      this.attack = { type, name: names[type], elapsed: 0, duration, angle, x: b.x, y: b.y, tx: target.x, ty: target.y, ex: end.x, ey: end.y, radius, halfAngle, halfWidth: type === 'thrust' ? 50 : 63, points, red, follow,
        comboIndex: this.routeIndex + 1, comboTotal: Math.max(1, this.route.length), chain: this.chainId };
      this.punish = 0; b.angle = angle; this.poseBoss('windup', duration, angle);
      this.attackHistory.push({ type, phase: this.phase, style: this.style.id, chain: this.chainId, comboIndex: this.attack.comboIndex, comboTotal: this.attack.comboTotal, time: this.time, duration, red });
      this.emit('threat');
      this.emit('sound', red ? 'warning' : 'tell');
    }
    pickAttack() {
      if (this.rings.length) { this.nextAttack = .1; return; }
      let chosen = [this.roundsStarted <= 1 ? 'sweep' : this.style.id === 'hunter' ? 'thrust' : this.style.id === 'trickster' ? 'feint' : 'sweep'];
      if (this.attackHistory.length) {
        const d = distance(this.player, this.boss);
        let candidates = ROUTES[this.style.id][this.phase].filter(route => route.join(',') !== this.lastRoute && !this.lastOpeners.slice(-2).includes(route[0]));
        if (!candidates.length) candidates = ROUTES[this.style.id][this.phase].filter(route => route.join(',') !== this.lastRoute);
        const weights = candidates.map(route => d > 240 && ['rush', 'thrust', 'leap'].includes(route[0]) || d < 160 && ['cross', 'sweep', 'cleave', 'feint'].includes(route[0]) ? 2.3 : 1);
        let value = this.random() * weights.reduce((a, v) => a + v, 0), index = 0;
        while (index < weights.length - 1 && value >= weights[index]) value -= weights[index++];
        chosen = candidates[index];
      }
      this.route = chosen.slice(); this.routeIndex = 0; this.chainId++; this.attackSerial++;
      this.lastRoute = this.route.join(','); this.lastOpeners.push(this.route[0]); if (this.lastOpeners.length > 3) this.lastOpeners.shift();
      this.beginAttack(this.route[0]);
    }
    resolveAttack(a) {
      if (!this.ready() || this.attack !== a) return;
      const p = this.player, b = this.boss;
      this.attack = null; let hit = false;
      this.attackLog.push({ type: a.type, time: this.time, red: a.red, chain: a.chain }); if (a.red) this.lastRedAt = this.time;
      this.poseBoss(a.type, .38, a.angle);
      if (['sweep', 'twin', 'cross', 'feint', 'cleave'].includes(a.type)) {
        hit = distance(p, b) < a.radius && Math.abs(angleDiff(Math.atan2(p.y - b.y, p.x - b.x), a.angle)) < a.halfAngle;
        this.effects.push({ kind: 'slash', x: b.x, y: b.y, angle: a.angle, side: a.comboIndex % 2 ? 1 : -1, radius: a.radius, color: a.red ? '#f49e7c' : '#f4d39d', heavy: true, life: .34, max: .34 });
        if (a.red) this.hitEffect(b.x + Math.cos(a.angle) * 110, b.y + Math.sin(a.angle) * 110, a.angle, true, '#eeb69a');
        if (hit) this.hurt(a.red ? 25 : a.type === 'cross' || a.type === 'twin' ? 16 : a.type === 'feint' ? 23 : 20, !a.red, b);
      } else if (a.type === 'rush' || a.type === 'thrust') {
        hit = segmentDistance(p, { x: a.x, y: a.y }, { x: a.ex, y: a.ey }) < a.halfWidth;
        this.effects.push({ kind: 'line', x: a.x, y: a.y, ex: a.ex, ey: a.ey, life: .35, max: .35 });
        if (a.type === 'rush') { b.x = a.ex; b.y = a.ey; this.contain(b, 230); }
        if (hit) this.hurt(a.type === 'thrust' ? 19 : 22, true, { x: a.x, y: a.y });
      } else if (a.type === 'leap') {
        b.x = a.tx; b.y = a.ty; this.contain(b, 230);
        this.effects.push({ kind: 'burst', x: a.tx, y: a.ty, radius: a.radius, color: '#ed8e72', life: .5, max: .5 });
        if (Math.hypot(p.x - a.tx, p.y - a.ty) < a.radius) this.hurt(25, false, b);
        this.impact(10);
      } else if (a.type === 'geyser') {
        for (const point of a.points) this.effects.push({ kind: 'burst', x: point.x, y: point.y, radius: a.radius, color: '#e6aa8b', life: .55, max: .55 });
        if (a.points.some(point => distance(p, point) < a.radius)) this.hurt(23, false, b);
        this.impact(10); this.emit('sound', 'wave');
      } else if (a.type === 'ring') {
        this.rings.push({ x: b.x, y: b.y, radius: 34, life: 1.55, hit: false }); this.emit('sound', 'wave');
      }
      if (!this.ready() || this.broken > 0) return;
      this.routeIndex++;
      if (this.routeIndex < this.route.length) this.beginAttack(this.route[this.routeIndex], true);
      else {
        this.route = []; this.punish = a.type === 'ring' ? 1.7 : a.red ? 1.3 : this.phase === 3 ? 1.05 : 1.15;
        this.nextAttack = this.punish;
      }
    }
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, .05);
      if (this.state !== 'playing') { if (this.state === 'menu') this.clock += dt; return; }
      this.clock += dt;
      if (this.time >= 60) { this.finish(false, '六十秒已尽'); return; }
      dt = Math.min(dt, 60 - this.time); this.time += dt;
      this.resolvingSlice = true;
      try {
      const p = this.player, b = this.boss;
      // Hit pause affects motion, not the 60-second clock or defensive cooldowns.
      const motion = this.hitStop > 0 ? dt * .18 : dt; this.hitStop = Math.max(0, this.hitStop - dt);
      for (const pose of [this.actor, this.bossPose]) { pose.age += motion; if (pose.age >= pose.duration) pose.action = 'idle'; }
      for (const key of ['dashCd', 'guardCd', 'attackCd', 'comboTime', 'postureLock', 'bannerTime', 'executionTime', 'shake', 'flash', 'riposte']) this[key] = Math.max(0, this[key] - dt);
      p.inv = Math.max(0, p.inv - dt); p.dodgeWindow = Math.max(0, p.dodgeWindow - dt); p.guard = Math.max(0, p.guard - dt); p.guardAge += dt; b.flash = Math.max(0, b.flash - dt);
      if (this.attackHeld) this.chargeTime = Math.min(1.2, this.chargeTime + dt);
      if (this.queuedDefense) {
        const q = this.queuedDefense; q.life -= dt;
        if (this.executionTime <= 0 && this[q.type === 'guard' ? 'guardCd' : 'dashCd'] <= 0) { this.queuedDefense = null; this[q.type](); }
        else if (q.life <= 0) this.queuedDefense = null;
      }
      if (this.queuedSlash) {
        this.queuedSlash.life -= dt;
        const guarding = this.queuedSlash.waitGuard && p.guard > 0 && this.attack && !this.attack.red;
        if (this.attackCd <= 0 && this.executionTime <= 0 && p.dash <= 0 && !guarding) {
          const q = this.queuedSlash; this.queuedSlash = null; this.slash(q.charged, q.strength);
        } else if (this.queuedSlash.life <= 0) this.queuedSlash = null;
      }
      if (this.state !== 'playing') return;
      if (this.executionTime <= 0) {
        if (p.dash > 0) {
          this.trails.push({ x: p.x, y: p.y, angle: p.angle, life: .24, max: .24 });
          p.x += this.dashDir.x * 740 * motion; p.y += this.dashDir.y * 740 * motion; p.dash = Math.max(0, p.dash - motion);
        } else {
          const speed = this.attackHeld ? 184 : p.guard > 0 ? 140 : 242;
          p.x += this.input.x * speed * motion; p.y += this.input.y * speed * motion;
          if (this.attackHeld || p.guard > 0) p.angle = Math.atan2(b.y - p.y, b.x - p.x);
          else if (Math.hypot(this.input.x, this.input.y) > .1) p.angle = Math.atan2(this.input.y, this.input.x);
        }
        this.contain(p, 286);
        const phase = Math.max(this.phase, b.hp <= b.maxHp * .32 || this.time >= 40 ? 3 : b.hp <= b.maxHp * .68 || this.time >= 20 ? 2 : 1);
        if (phase !== this.phase) {
          this.phase = phase; this.attackSerial = 0;
          this.say(phase === 2 ? '二式 · 连刃追潮' : '终式 · 狂澜将至', 1.25);
          this.emit('feedback', (phase === 2 ? '连势增强 · ' : '末刀后再追击 · ') + this.styleHint); this.emit('sound', 'phase');
        }
        if (this.broken > 0) {
          this.broken = Math.max(0, this.broken - dt);
          if (this.broken === 0) { this.posture = 45; this.postureLock = .6; this.nextAttack = .5; this.emit('feedback', '处决窗口已结束'); }
        } else {
          if (this.attack) { const a = this.attack; a.elapsed += motion; if (a.elapsed >= a.duration) this.resolveAttack(a); }
          else {
            const recovering = this.punish > 0;
            this.nextAttack -= motion;
            if (recovering) this.punish = Math.max(0, this.nextAttack);
            if (this.nextAttack <= 0) this.pickAttack();
            else if (!recovering && this.rings.length === 0) {
              const d = distance(p, b), speed = this.style.id === 'hunter' ? 72 : this.style.id === 'warden' ? 35 : 54;
              if (d > this.style.distance) { b.x += (p.x - b.x) / d * speed * motion; b.y += (p.y - b.y) / d * speed * motion; this.contain(b, 230); }
            }
          }
          if (this.state !== 'playing') return;
          for (const ring of this.rings) {
            ring.radius += 280 * motion; ring.life -= motion;
            if (!ring.hit && Math.abs(distance(p, ring) - ring.radius) < 24) { ring.hit = true; this.hurt(25, false, ring); if (this.state !== 'playing') return; }
          }
          this.rings = this.rings.filter(r => r.life > 0);
        }
      }
      for (const list of [this.effects, this.texts, this.trails]) for (const e of list) e.life -= dt;
      this.effects = this.effects.filter(e => e.life > 0); this.texts = this.texts.filter(e => e.life > 0); this.trails = this.trails.filter(e => e.life > 0);
      if (this.time >= 60 && this.state === 'playing') this.finish(false, '六十秒已尽');
      this.emit('hud', this.snapshot());
      } finally { this.resolvingSlice = false; }
    }
    say(s, seconds) { this.banner = s; this.bannerTime = seconds; }
    float(s, x, y, color, size) { this.texts.push({ text: s, x, y, color, size, life: .9, max: .9 }); if (this.texts.length > 24) this.texts.shift(); }
    impact(strength) { this.shake = Math.max(this.shake, strength / 80); this.emit('impact', { strength }); }
    text(value, x, y, size = 18, color = '#dbe8d8', align = 'center') {
      const c = this.ctx; c.fillStyle = color; c.font = `${size}px "Noto Serif SC", "Songti SC", serif`; c.textAlign = align; c.fillText(value, x, y);
    }
    circle(x, y, r, fill, stroke, width = 1) {
      const c = this.ctx; c.beginPath(); c.arc(x, y, Math.max(.1, r), 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    drawArena() {
      const c = this.ctx;
      const bg = c.createRadialGradient(360, 340, 40, 360, 360, 510); bg.addColorStop(0, '#263e3c'); bg.addColorStop(.7, '#132b2c'); bg.addColorStop(1, '#09191f');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      // Moon reflected in a rain-soaked stone dueling platform.
      this.circle(568, 92, 66, '#c3d6bd0b', '#a8c3b517'); this.circle(568, 92, 51, '#c3d6bd0b');
      for (let i = 0; i < 18; i++) {
        const a = i * TAU / 18; c.save(); c.translate(360 + Math.cos(a) * 320, 363 + Math.sin(a) * 320); c.rotate(a);
        c.fillStyle = '#061b20'; c.fillRect(-15, -23, 30, 46); c.strokeStyle = '#4d68604d'; c.strokeRect(-15, -23, 30, 46); c.restore();
      }
      this.circle(360, 363, 306, '#2e494120', '#8396883a', 2); this.circle(360, 363, 291, null, '#8ea28f25');
      this.circle(360, 363, 250, null, '#8ba29220'); this.circle(360, 363, 155, null, '#8ba29218'); this.circle(360, 363, 65, '#b7c4aa04', '#8ba29218');
      c.strokeStyle = '#8ba29217'; c.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12; c.beginPath(); c.moveTo(360 + Math.cos(a) * 66, 363 + Math.sin(a) * 66); c.lineTo(360 + Math.cos(a) * 290, 363 + Math.sin(a) * 290); c.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8, x = 360 + Math.cos(a) * 274, y = 363 + Math.sin(a) * 274;
        c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2); c.fillStyle = '#8d9b7c21'; c.fillRect(-8, -17, 16, 34); c.fillStyle = '#a2b08c35'; c.fillRect(-5, -11, 10, 2); c.fillRect(-5, 2, 10, 2); c.restore();
      }
      for (const x of [56, 664]) for (const y of [180, 550]) {
        c.fillStyle = '#071a1e'; c.fillRect(x - 9, y - 24, 18, 40);
        this.circle(x, y - 25, 26, '#f5b56b0b'); this.circle(x, y - 25, 15, '#f5b56b12');
        c.fillStyle = '#d4b475'; c.fillRect(x - 4, y - 30, 8, 15); c.fillStyle = '#f8db99'; c.fillRect(x - 2, y - 28, 4, 8);
      }
      c.save(); c.globalAlpha = .11; c.strokeStyle = '#bcd7cf'; c.lineWidth = 1;
      if (this.options.effects !== false) for (const r of this.rain) { const y = (r.y + this.clock * r.speed) % 760 - 20; c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x - 8, y + 21); c.stroke(); }
      c.restore();
    }
    drawTell(a) {
      const c = this.ctx, t = clamp(a.elapsed / a.duration, 0, 1), color = a.red ? '#ef927d' : '#efd296';
      c.save(); c.lineWidth = 2; c.strokeStyle = color;
      if (a.type === 'sweep' || a.type === 'twin') {
        c.beginPath(); c.moveTo(a.x, a.y); c.arc(a.x, a.y, 216, a.angle - 1.4, a.angle + 1.4); c.closePath(); c.fillStyle = `rgba(235,190,112,${.06 + t * .10})`; c.fill(); c.stroke();
        c.beginPath(); c.arc(a.x, a.y, 216, a.angle - 1.4, a.angle - 1.4 + 2.8 * t); c.strokeStyle = '#fff0b9'; c.lineWidth = 6; c.stroke();
      } else if (a.type === 'rush') {
        const dx = Math.sin(a.angle) * 54, dy = -Math.cos(a.angle) * 54;
        c.beginPath(); c.moveTo(a.x + dx, a.y + dy); c.lineTo(a.ex + dx, a.ey + dy); c.lineTo(a.ex - dx, a.ey - dy); c.lineTo(a.x - dx, a.y - dy); c.closePath(); c.fillStyle = '#edc87e1f'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + (a.ex - a.x) * t, a.y + (a.ey - a.y) * t); c.lineWidth = 5; c.stroke();
      } else if (a.type === 'leap') {
        this.circle(a.tx, a.ty, 116, '#e6785a19', color, 2); this.circle(a.tx, a.ty, 116 * t, '#e6785a27', color, 2);
        this.text('危', a.tx, a.ty + 12, 34, color);
      } else { this.circle(a.x, a.y, 70 + t * 35, '#e6785a18', color, 3); this.text('危', a.x, a.y - 87, 28, color); }
      if (t > .78) { this.circle(this.boss.x, this.boss.y - 60, 10 + Math.sin(this.clock * 30) * 3, color); }
      c.restore();
    }
    drawBoss() {
      const c = this.ctx, b = this.boss, broken = this.broken > 0;
      c.save(); c.translate(b.x, b.y); if (broken) c.rotate(.15 * Math.sin(this.clock * 7));
      c.scale(1, .5); this.circle(0, 20, 60, '#00000049'); c.scale(1, 2);
      // A massive horned tide-warden in lamellar armor, holding an oversized cleaver.
      c.fillStyle = '#091c23'; c.beginPath(); c.moveTo(-32, 0); c.lineTo(-48, 62); c.lineTo(-11, 48); c.lineTo(0, 65); c.lineTo(23, 47); c.lineTo(45, 59); c.lineTo(31, -1); c.closePath(); c.fill();
      c.fillStyle = b.flash > 0 ? '#ecdfb4' : '#52675c'; c.strokeStyle = '#9fa88a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -42); c.lineTo(43, -22); c.lineTo(32, 24); c.lineTo(0, 43); c.lineTo(-32, 24); c.lineTo(-43, -22); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#203b3d'; for (let y = -14; y <= 24; y += 11) { c.fillRect(-27, y, 54, 6); c.strokeStyle = '#a0ae864b'; c.strokeRect(-27, y, 54, 6); }
      for (const side of [-1, 1]) {
        c.fillStyle = '#405b54'; c.beginPath(); c.moveTo(side * 18, -34); c.lineTo(side * 54, -25); c.lineTo(side * 60, -3); c.lineTo(side * 27, -8); c.closePath(); c.fill(); c.strokeStyle = '#9da37d'; c.stroke();
        c.beginPath(); c.moveTo(side * 15, -48); c.lineTo(side * 39, -78); c.lineTo(side * 31, -39); c.closePath(); c.fillStyle = '#c2bd91'; c.fill();
      }
      c.fillStyle = '#0c252b'; c.beginPath(); c.moveTo(-22, -53); c.lineTo(22, -53); c.lineTo(17, -25); c.lineTo(0, -18); c.lineTo(-17, -25); c.closePath(); c.fill();
      c.strokeStyle = broken ? '#a2fae8' : this.phase === 3 ? '#f29576' : '#e1cb8f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-14, -40); c.lineTo(-4, -37); c.moveTo(14, -40); c.lineTo(4, -37); c.stroke();
      c.save(); c.translate(42, 4); c.rotate(this.attack ? this.attack.angle - Math.PI / 2 - .4 : .2);
      c.fillStyle = '#978f6a'; c.fillRect(-3, -24, 6, 106); c.fillStyle = b.flash > 0 ? '#fff5cf' : '#adc0a8'; c.beginPath(); c.moveTo(-4, -87); c.lineTo(25, -103); c.lineTo(37, -37); c.lineTo(8, -17); c.lineTo(-4, -28); c.closePath(); c.fill(); c.strokeStyle = '#e3d6a3'; c.stroke(); c.restore();
      if (broken) { c.setLineDash([7, 6]); this.circle(0, 0, 72, null, '#ffdd91', 3); c.setLineDash([]); this.text('斩', 0, -86, 34, '#ffe0a0'); }
      c.restore();
    }
    drawPlayer(p, ghost = false) {
      const c = this.ctx; c.save(); c.translate(p.x, p.y);
      if (!ghost) this.circle(0, 2, 27, '#a5fbe50b', '#a5fbe54a', 1.5);
      c.scale(1.18, 1.18);
      if (!ghost) { c.save(); c.scale(1, .45); this.circle(0, 16, 27, '#00000069'); c.restore(); }
      c.rotate(p.angle + Math.PI / 2);
      c.fillStyle = ghost ? '#a5fbe5' : '#dfe6d0'; c.beginPath(); c.moveTo(-12, -10); c.lineTo(12, -10); c.lineTo(22, 27); c.lineTo(3, 19); c.lineTo(-19, 31); c.lineTo(-14, 2); c.closePath(); c.fill();
      c.fillStyle = '#38615a'; c.fillRect(-12, 1, 25, 5); c.fillStyle = '#0e272e'; c.fillRect(-4, -27, 8, 10);
      this.circle(0, -16, 9, ghost ? '#a5fbe5' : '#eadbbb'); c.fillStyle = '#163a3a'; c.fillRect(-9, -24, 18, 7);
      c.beginPath(); c.moveTo(-7, -17); c.lineTo(-30, -7); c.lineTo(-18, 0); c.lineTo(-40, 7); c.lineWidth = 5; c.strokeStyle = '#70b6a0'; c.stroke();
      c.strokeStyle = '#e5f3d8'; c.lineWidth = 4; c.beginPath(); c.moveTo(14, 1); c.lineTo(28, -42); c.stroke(); c.strokeStyle = '#d4b679'; c.lineWidth = 3; c.beginPath(); c.moveTo(7, -4); c.lineTo(24, 2); c.stroke();
      c.restore();
      if (ghost) return;
      if (p.guard > 0) { c.save(); c.globalAlpha = .6 + p.guard / 2; this.circle(p.x, p.y, 40, '#ead58e18', '#ffe6a5', 3); this.text('御', p.x, p.y - 47, 20, '#ffe2a0'); c.restore(); }
      if (this.attackHeld) { this.circle(p.x, p.y, 39, null, '#7d93854d', 3); c.beginPath(); c.arc(p.x, p.y, 39, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.chargeTime / .52, 0, 1)); c.strokeStyle = this.chargeTime >= .52 ? '#f5db95' : '#a1ead8'; c.lineWidth = 4; c.stroke(); }
    }
    drawEffects() {
      const c = this.ctx;
      for (const e of this.effects) {
        c.save(); const t = 1 - e.life / e.max; c.globalAlpha = Math.min(1, e.life / e.max * 1.8);
        if (e.kind === 'slash') {
          c.translate(e.x, e.y); c.rotate(e.angle); c.strokeStyle = e.color; c.lineWidth = e.heavy ? 17 * (1 - t) + 2 : 8 * (1 - t) + 1;
          c.beginPath(); c.arc(0, 0, e.radius * (.72 + t * .28), -1.2 + t * .9, .75 + t * .9); c.stroke();
          c.strokeStyle = '#f1ffe5'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, e.radius * (.75 + t * .28), -1 + t * .9, .75 + t * .9); c.stroke();
        } else if (e.kind === 'line') {
          c.strokeStyle = '#ffdc92'; c.lineWidth = 30 * (1 - t); c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.ex, e.ey); c.stroke();
        } else if (e.kind === 'burst') this.circle(e.x, e.y, e.radius * (.7 + t * .5), '#d88d6614', e.color, 8 * (1 - t));
        else if (e.kind === 'execute') {
          c.translate(e.x, e.y); c.rotate(-.4); c.strokeStyle = '#fff5c1'; c.lineWidth = 27 * (1 - t) + 2; c.beginPath(); c.moveTo(-240 * t, 280 * t); c.lineTo(240 * t, -280 * t); c.stroke();
          this.circle(0, 0, 45 + t * 220, null, '#f6dc97', 4);
        }
        c.restore();
      }
    }
    draw() {
      const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H); c.save();
      if (this.shake > 0 && this.options.effects !== false) { const s = this.shake * 50; c.translate(Math.sin(this.clock * 147) * s, Math.cos(this.clock * 131) * s); }
      this.drawArena();
      if (this.attack && this.state === 'playing') this.drawTell(this.attack);
      for (const r of this.rings) { this.circle(r.x, r.y, r.radius + 4, null, '#e7a28127', 22); this.circle(r.x, r.y, r.radius, null, '#f3a185', 4); }
      for (const p of this.trails) { c.save(); c.globalAlpha = p.life / p.max * .35; this.drawPlayer(p, true); c.restore(); }
      if (this.player.y < this.boss.y) { this.drawPlayer(this.player); this.drawBoss(); } else { this.drawBoss(); this.drawPlayer(this.player); }
      this.drawEffects();
      for (const t of this.texts) { c.save(); c.globalAlpha = Math.min(1, t.life * 3); this.text(t.text, t.x, t.y - (1 - t.life / t.max) * 42, t.size, t.color); c.restore(); }
      if (this.bannerTime > 0) {
        c.save(); c.globalAlpha = Math.min(1, this.bannerTime * 3); c.fillStyle = '#091e28b8'; c.fillRect(120, 86, 480, 55); this.text(this.banner, 360, 123, 26, '#f0dfb5'); c.restore();
      }
      if (this.state === 'playing' && this.broken > 0) { this.text('破 防', 360, 630, 32, '#f5d99a'); this.text('按斩击处决  ·  ' + this.broken.toFixed(1) + 's', 360, 659, 18, '#e7d2a6'); }
      if (this.flash > 0 && this.options.effects !== false) { c.globalAlpha = this.flash * 1.2; c.fillStyle = this.flashColor; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
      c.restore();
    }
  }
  const installArt = typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./duel-art.js') : root.NightfallArt;
  if (typeof installArt === 'function') installArt(Nightfall);
  if (typeof module !== 'undefined' && module.exports) module.exports = { Nightfall };
  root.Nightfall = Nightfall;
})(typeof globalThis !== 'undefined' ? globalThis : this);
