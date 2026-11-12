(function (global) {
  'use strict';
  const M = global.Matter;
  if (!M) throw new Error('ShiftEngine requires Matter.js');
  const { Engine, Bodies, Body, Composite } = M;
  const STEP = 1 / 60;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const SPECS = {
    bread: { w: 94, h: 34, r: 0, mass: 1.05, friction: .8, restitution: .1 },
    pot: { w: 56, h: 56, r: 28, mass: 2.3, friction: .64, restitution: .055 },
    monday: { w: 46, h: 44, r: 0, mass: 5.2, friction: .94, restitution: .025 },
    fish: { w: 64, h: 24, r: 0, mass: .85, friction: .24, restitution: .08 },
    coffee: { w: 28, h: 44, r: 0, mass: 1.15, friction: .8, restitution: .04 }
  };
  const NAMES = { bread: '老板画的饼', pot: '同事甩的锅', monday: '沉重的周一', fish: '正在摸的鱼', coffee: '续命咖啡' };
  const ROUTES = {
    normal: { types: ['bread', 'coffee', 'bread', 'pot', 'fish', 'monday'], x: [210, 330, 210, 90, 245, 330], at: [.8, 7.5, 13.5, 20, 26.5, 32] },
    daily: { types: ['bread', 'coffee', 'bread', 'pot', 'fish', 'monday'], x: [210, 330, 210, 86, 245, 330], at: [.8, 7.5, 13.5, 20, 26.5, 32] }
  };
  const NORMAL_ROUTES = [
    { ...ROUTES.normal, name: '稳稳线', tagline: '轻挪接货，先把基础练稳' },
    { ...ROUTES.normal, x: [210, 90, 210, 330, 175, 90], name: '折返线', tagline: '左右换向，练会反手接货' },
    { types: ['bread', 'fish', 'coffee', 'bread', 'pot', 'monday'], x: [210, 330, 90, 210, 330, 90], at: [.8, 7.5, 14, 20.5, 26.5, 33.5], name: '轻重线', tagline: '轻货先到，后半程再接重货' }
  ];
  const DELIVERY_CUTOFF = 39;
  const TAIL_DEADLINE = 42;
  const ROAD = [
    { time: 12, kind: 'bump', text: '前方减速带，轻轻稳住', duration: 1.3, strength: .72 },
    { time: 23, kind: 'wind', text: '左边来风，留意货物', duration: 3.8, strength: .7 },
    { time: 35, kind: 'bump', text: '连续颠簸，准备稳车', duration: 1.8, strength: 1 },
    { time: 46, kind: 'wind', text: '右边来风，留意货物', duration: 4.1, strength: -.85 },
    { time: 55, kind: 'bump', text: '最后一道坎，完整到家', duration: 1.5, strength: .85 }
  ];
  function dateInShanghai() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); }
  function hashSeed(value) { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  class ShiftEngine {
    constructor(onEvent) {
      this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
      this.reset('normal');
      this.status = 'ready';
    }

    _setupWorld() {
      if (this.engine) { Composite.clear(this.engine.world, false); Engine.clear(this.engine); }
      this.engine = Engine.create({ enableSleeping: false, positionIterations: 8, velocityIterations: 8 });
      this.engine.gravity.y = 1.02;
      this.deck = Bodies.rectangle(210, 586, 164, 14, { isStatic: true, friction: .98, frictionStatic: 1, restitution: .035, label: 'truck-deck', chamfer: { radius: 3 } });
      Composite.add(this.engine.world, this.deck);
    }

    reset(mode = 'normal', dateSeed, options = {}) {
      this._resetting = true;
      this._pendingTutorialStart = null;
      this._setupWorld();
      this.mode = ['normal', 'daily', 'tutorial'].includes(mode) ? mode : 'normal';
      this.status = 'playing';
      this.duration = this.mode === 'tutorial' ? 0 : 60;
      this.requiredCatches = this.mode === 'tutorial' ? 0 : 4;
      this.finishReason = null;
      this.settling = false;
      this._settleElapsed = this._settleStable = 0;
      this.assists = this.timeBonus = this.tailBonus = 0;
      this.elapsed = 0;
      this.lives = 3;
      this.score = this.catches = this.saves = this.combo = this.bestCombo = 0;
      this.perfectCatches = this.precision = this.streak = this.bestStreak = this.retries = 0;
      this._catchDetails = [];
      this.lastCrash = null;
      this.cargo = [];
      this.truck = { x: 210, y: 586, angle: 0, vx: 0 };
      this.target = 210;
      this.warning = null;
      this.wind = 0;
      this._accumulator = 0;
      this._paused = this._braking = false;
      this._allCargo = [];
      this._sentIds = new Set();
      this._unavailableIds = new Set();
      this._retryQueue = [];
      this._pendingDelivery = null;
      this._planIndex = 0;
      this._lastDropAt = -10;
      this._recovery = 0;
      this._recoveryInfo = null;
      this._recoveryInfoUntil = -1;
      this._invulnerableUntil = 0;
      this._lastCrash = this._lastChaos = this._lastSave = this._lastControl = -10;
      this._controlHistory = [];
      this._deliveriesClosed = false;
      this._rescueSeconds = 0;
      this._rescueId = null;
      this._rescueLatch = null;
      this._rescueHandoff = null;
      this._lastAssist = -10;
      this._warned = new Set();
      this.dateSeed = String(dateSeed ?? dateInShanghai());
      const h = hashSeed(this.dateSeed);
      const variant = this.mode === 'daily' ? h % 3 : ((Math.trunc(Number(options.variant) || 0) % 3) + 3) % 3;
      const route = this.mode === 'daily' ? ROUTES.daily : NORMAL_ROUTES[variant];
      this.route = { name: this.mode === 'tutorial' ? '上车练习' : this.mode === 'daily' ? '每日同题' : route.name, tagline: this.mode === 'tutorial' ? '挪车、松手，再把弹起的货接回' : this.mode === 'daily' ? '同一天同一单，接完整单再停两站' : route.tagline, variant };
      if (this.mode === 'normal') { const nextVariant = (variant + 1) % NORMAL_ROUTES.length, next = NORMAL_ROUTES[nextVariant]; this.route.next = { name: next.name, tagline: next.tagline, variant: nextVariant }; }
      this._tail = { active: false, completed: false, startAt: null, step: 1, total: 2, targetX: [145, 285, 130][variant], progress: 0, title: '收工两站', variant, bonus: 0, targets: [[145, 275], [285, 155], [130, 265]][variant].slice(), originX: 210, moved: 0, released: false, hold: 0, grace: 0 };
      this._dropPlan = route.x.map((x, i) => ({ id: i + 1, type: route.types[i], x: x + (this.mode === 'daily' && i ? ((h >>> (i * 4)) % 13) - 6 : 0), time: route.at[i], retry: false, delayed: 0 }));
      this._tutorial = null;
      if (this.mode === 'tutorial') this._enterTutorialStep(1);
      else this._prepareDelivery();
      this._resetting = false;
      return this.snapshot();
    }

    setTarget(x) {
      if (!Number.isFinite(x) || this.settling) return;
      const next = clamp(x, 80, 340);
      if (this._braking || Math.abs(next - this.target) > .15) this._lastControl = this.elapsed;
      this._braking = false;
      if (this._tail?.active && !this._tail.completed) this._tail.released = false;
      this.target = next;
    }

    releaseControl() {
      this._beginBrake();
      if (this._tutorial && this._tutorial.step === 2) this._tutorial.userReleased = true;
      if (this._tail?.active && !this._tail.completed && this._tail.moved >= 18) this._tail.released = true;
    }

    _beginBrake() { this._braking = true; this.target = this.truck.x; }
    pause(value = true) { this._paused = Boolean(value); this._accumulator = 0; }

    step(dt) {
      if (this.status !== 'playing' || this._paused) return this.snapshot();
      this._accumulator += clamp(Number(dt) || 0, 0, .12);
      while (this._accumulator + 1e-9 >= STEP && this.status === 'playing') { this._accumulator -= STEP; this._tick(STEP); }
      return this.snapshot();
    }

    _tick(dt) {
      if (this._pendingTutorialStart) { const event = this._pendingTutorialStart; this._pendingTutorialStart = null; this._emit('tutorial', event); }
      if (!this.settling) this.elapsed = this.mode === 'tutorial' ? this.elapsed + dt : Math.min(60, this.elapsed + dt);
      this._updateRoad();
      this._moveTruck(dt);
      if (this._recovery > 0) { this._recovery -= dt; if (this._recovery <= 0) this._restoreCargo(); }
      if (this.mode !== 'tutorial' && !this.settling) this._updateDeliveries(dt);
      this._applyContactGrip();
      if (this.wind) for (const item of this.cargo) {
        const sensitivity = item.type === 'bread' ? 1.6 : item.type === 'monday' ? .32 : 1;
        Body.applyForce(item.body, item.body.position, { x: .00007 * this.wind * sensitivity * item.mass, y: 0 });
      }
      Engine.update(this.engine, dt * 1000);
      this._updateContacts();
      if (this.mode !== 'tutorial') this._updateRescueIntent(dt);
      if (this.mode === 'tutorial') this._updateTutorial(dt);
      else if (!this.settling) {
        this._updateRescueCheckpoint(dt);
        this._updateTail(dt);
        if (this.status === 'playing' && this._recovery <= 0) this.score += dt * this.cargo.filter(c => c.caught && c.supported).length * (1 + Math.min(this.combo, 5) * .12);
      }
      if (this.status !== 'playing') return;
      if (this.settling) { this._updateSettling(dt); return; }
      for (const item of this.cargo) {
        const p = item.body.position;
        if ((p.y > 660 || p.x < -100 || p.x > 520) && this.elapsed >= this._invulnerableUntil && this.elapsed - this._lastCrash > .9) { this._crash(item); break; }
      }
      if (this._finishIfNoDeliveryChance()) return;
      if (this.mode !== 'tutorial' && this.status === 'playing' && this.elapsed >= 60) {
        this._startSettling();
      } else if (this.mode !== 'tutorial' && this.status === 'playing' && this._tail.completed && this.catches >= this.requiredCatches && this._arrivalStable()) {
        this._startSettling();
      }
    }

    _moveTruck(dt) {
      const previous = { ...this.truck };
      if (this._braking) {
        this.truck.vx *= Math.exp(-12 * dt);
        if (Math.abs(this.truck.vx) < 1) this.truck.vx = 0;
      } else {
        const velocity = clamp((this.target - this.truck.x) * 9, -310, 310);
        this.truck.vx += clamp(velocity - this.truck.vx, -1250 * dt, 1250 * dt);
        if (Math.abs(this.target - this.truck.x) < .3 && Math.abs(this.truck.vx) < 2) this.truck.vx = 0;
      }
      const nextX = this.truck.x + this.truck.vx * dt;
      this.truck.x = clamp(nextX, 80, 340);
      if (nextX !== this.truck.x) this.truck.vx = 0;
      if (this._braking) this.target = this.truck.x;
      const acceleration = (this.truck.vx - previous.vx) / dt;
      const distance = Math.abs(this.truck.x - previous.x);
      if (this.elapsed - this._lastControl < 1.4 && distance > .01) this._controlHistory.push({ time: this.elapsed, distance });
      this._controlHistory = this._controlHistory.filter(s => this.elapsed - s.time < 1.4);
      let roadY = 0, roadAngle = 0;
      const strengthScale = this.elapsed < 30 ? .45 : .7;
      if (this.mode !== 'tutorial') for (const event of ROAD) {
        const age = this.elapsed - event.time;
        if (event.kind === 'bump' && age >= 0 && age < event.duration) {
          const envelope = Math.sin(Math.PI * age / event.duration) * event.strength * strengthScale;
          roadY += Math.sin(age * 15) * envelope * 5;
          roadAngle += Math.sin(age * 11) * envelope * .035 * (this.mode === 'normal' && this.route.variant === 1 ? -1 : 1);
        }
      }
      this.truck.y = 586 + roadY + (this.mode === 'tutorial' ? 0 : Math.sin(this.elapsed * 7) * .3);
      const angle = clamp(acceleration * .000014 + this.wind * .018 + roadAngle, -.09, .09);
      this.truck.angle += (angle - this.truck.angle) * Math.min(1, dt * 9);
      Body.setPosition(this.deck, { x: this.truck.x, y: this.truck.y }, true);
      Body.setAngle(this.deck, this.truck.angle, true);
    }

    _applyContactGrip() {
      for (const item of this.cargo) if (item.caught && item.supported) {
        // Contact traction dissipates relative sliding; it never moves the cart.
        const grip = this._braking ? .28 : .22;
        Body.setVelocity(item.body, { x: item.body.velocity.x + (this.truck.vx / 60 - item.body.velocity.x) * grip, y: item.body.velocity.y });
        Body.setAngularVelocity(item.body, item.body.angularVelocity * .92);
      }
    }

    _updateRoad() {
      this.wind = 0; this.warning = null;
      if (this.mode === 'tutorial' || this.settling) return;
      for (let i = 0; i < ROAD.length; i++) {
        const event = ROAD[i], until = event.time - this.elapsed, age = this.elapsed - event.time;
        const mirror = this.mode === 'normal' && this.route.variant === 1;
        const text = mirror && event.kind === 'wind' ? event.text.replace('左边', 'TEMP').replace('右边', '左边').replace('TEMP', '右边') : event.text;
        if (until > 0 && until <= 1.3) {
          this.warning = { text, kind: event.kind, progress: 1 - until / 1.3, phase: 'upcoming', inSeconds: until };
          if (!this._warned.has(i)) { this._warned.add(i); this._emit('warning', { text, kind: event.kind, phase: 'upcoming', inSeconds: until }); }
        }
        if (age >= 0 && age < event.duration) {
          this.warning = { text, kind: event.kind, progress: 1 - age / event.duration, phase: 'active', inSeconds: 0, remainingSeconds: event.duration - age };
          if (event.kind === 'wind') this.wind = Math.sin(Math.PI * age / event.duration) * event.strength * .7 * (mirror ? -1 : 1);
        }
      }
    }

    _deliveryLead(x, retry = false) {
      const distance = Math.abs(x - this.truck.x);
      return Math.max(retry ? 3 : 2.8, distance > 190 ? 5.8 : 0, Math.min(6.2, distance / 55 + 1.2));
    }

    _deliveryOutcomes() {
      // Presentation only: the scheduling sets retain their existing meaning.
      // A withdrawn original was never thrown; an expired retry really was.
      const unsigned = [...this._unavailableIds].filter(id => !this._allCargo.find(info => info.id === id)?.caught);
      const unthrownCount = unsigned.filter(id => !this._sentIds.has(id)).length;
      const retryExpiredCount = unsigned.length - unthrownCount;
      const unavailableItems = unsigned.map(cargoId => {
        const index = this._dropPlan.findIndex(item => item.id === cargoId);
        const original = this._dropPlan[index] || this._allCargo.find(item => item.id === cargoId);
        const kind = this._sentIds.has(cargoId) ? 'retryExpired' : 'unthrown';
        const reasonText = `${kind === 'unthrown' ? '原单投递' : '补发'}需在${DELIVERY_CUTOFF}秒前留够接货预告；本趟窗口不足，${kind === 'unthrown' ? '不再投出' : '不再补发'}。`;
        return { cargoId, cargoType: original?.type || null, order: index < 0 ? cargoId : index + 1, kind, reasonText };
      }).sort((a, b) => a.order - b.order);
      return { unthrownCount, retryExpiredCount, unavailableDeliveries: unsigned.length, unavailableItems, cutoffSeconds: DELIVERY_CUTOFF };
    }

    _deliveryOutcomeLabels(outcomes) {
      const labels = [];
      const names = kind => outcomes.unavailableItems.filter(item => item.kind === kind).map(item => `第${item.order}件${NAMES[item.cargoType] || '货物'}`).join('、');
      if (outcomes.unthrownCount) labels.push(`${outcomes.unthrownCount}件原单未投出（${names('unthrown')}）`);
      if (outcomes.retryExpiredCount) labels.push(`${outcomes.retryExpiredCount}件漏接，补发窗口已过（${names('retryExpired')}）`);
      return labels;
    }

    _recoverySummary(restoredCount, restored = false) {
      const outcomes = this._deliveryOutcomes();
      const retryType = this._retryQueue[0]?.type;
      const parts = [restoredCount ? `${restoredCount}件已签收货物${restored ? '已归位' : '归位中'}` : '没有已签收货物需归位'];
      if (retryType) parts.push(restored ? '漏接件准备补发' : '漏接件稍后补发');
      parts.push(...this._deliveryOutcomeLabels(outcomes));
      if (!retryType && !outcomes.unavailableDeliveries) parts.push(restored ? '不加分' : '不重复计分');
      return { text: parts.join('，'), restoredCount, ...outcomes, ...(retryType ? { retryType } : {}) };
    }

    _expireDelivery(delivery) {
      this._unavailableIds.add(delivery.id);
      const restoredCount = this._allCargo.filter(info => info.caught).length;
      const outcomes = this._deliveryOutcomes();
      this._recoveryInfo = { text: `${this._deliveryOutcomeLabels(outcomes).join('，')}，未签收不计分`, restoredCount, ...outcomes };
      this._recoveryInfoUntil = this.elapsed + 3.2;
      this._emit('recovery', { ...this._recoveryInfo, phase: 'expired', cargoId: delivery.id, cargoType: delivery.type });
    }

    _prepareDelivery() {
      if (this._pendingDelivery || this._recovery > 0 || this.mode === 'tutorial' || this._deliveriesClosed || this.settling) return;
      while (this._retryQueue.length) {
        const retry = this._retryQueue.shift();
        const lead = this._deliveryLead(retry.x, true);
        if (this.elapsed + lead > DELIVERY_CUTOFF) { this._expireDelivery(retry); continue; }
        this._pendingDelivery = { ...retry, time: this.elapsed + lead, retry: true, delayed: 0, lead };
        return;
      }
      const planned = this._dropPlan[this._planIndex];
      if (!planned) { if (this._dropPlan.length && this._planIndex >= this._dropPlan.length && !this.cargo.some(item => !item.caught)) this._closeDeliveries(); return; }
      const first = this._planIndex === 0 && this.elapsed < .8;
      const preview = first ? 0 : this._deliveryLead(planned.x);
      if (first || planned.time - this.elapsed <= preview) {
        const time = Math.max(planned.time, this.elapsed + preview);
        if (time > DELIVERY_CUTOFF) { this._closeDeliveries(); return; }
        this._pendingDelivery = { ...planned, time, retry: false, delayed: 0, lead: preview };
      }
    }

    _updateDeliveries(dt) {
      this._prepareDelivery();
      const pending = this._pendingDelivery;
      if (!pending || this._recovery > 0) return;
      if (pending.time > DELIVERY_CUTOFF || this.elapsed >= TAIL_DEADLINE) { this._closeDeliveries(); return; }
      const rescue = this._rescueCargo();
      if (rescue) {
        // A delivery never overrides rescue. The round's 60s boundary bounds
        // waiting; unreceived deliveries are neither scored nor installed.
        pending.time = Math.max(pending.time + dt, this.elapsed + Math.max(pending.lead || 0, this._deliveryLead(pending.x, pending.retry)));
        pending.delayed += dt;
        if (pending.retry) pending.time = Math.max(pending.time, this.elapsed + 3);
        return;
      }
      const alreadyFalling = this.cargo.some(item => !item.caught);
      if (alreadyFalling || this.elapsed - this._lastDropAt < 1.6) {
        pending.time = Math.max(pending.time, this.elapsed + .2);
        return;
      }
      if (this.elapsed + 1e-7 >= pending.time) this._spawnDelivery(pending);
    }

    _closeDeliveries() {
      for (const item of this._retryQueue) this._unavailableIds.add(item.id);
      if (this._pendingDelivery) this._unavailableIds.add(this._pendingDelivery.id);
      for (const item of this._dropPlan.slice(this._planIndex)) this._unavailableIds.add(item.id);
      this._pendingDelivery = null;
      this._retryQueue = [];
      this._deliveriesClosed = true;
    }

    _finishIfNoDeliveryChance() {
      if (this.mode === 'tutorial' || this.settling || this.status !== 'playing' || !this._deliveriesClosed || this.catches >= this.requiredCatches) return false;
      const unsigned = new Set(this.cargo.filter(item => {
        const p = item.body.position;
        return !item.caught && !this._allCargo.find(info => info.id === item.id)?.caught && p.y <= 660 && p.x >= -100 && p.x <= 520;
      }).map(item => item.id));
      if (this.catches + unsigned.size >= this.requiredCatches) return false;
      this.status = 'lose'; this.finishReason = 'incomplete';
      this._beginBrake();
      this._emit('lose', { text: `本趟已无足够货物可签收，还差${this.requiredCatches - this.catches}件，下一趟再试`, score: Math.floor(this.score), lives: this.lives, finishReason: 'incomplete', requiredCatches: this.requiredCatches, catches: this.catches, timeBonus: 0, tailBonus: this.tailBonus });
      return true;
    }

    _spawnDelivery(delivery) {
      let info = this._allCargo.find(c => c.id === delivery.id);
      if (!info) { info = { id: delivery.id, type: delivery.type, x: delivery.x, caught: false }; this._allCargo.push(info); }
      if (info.caught || this.cargo.some(c => c.id === info.id)) { this._pendingDelivery = null; return; }
      const spawned = this._createCargo(info, delivery.x, 142);
      this._sentIds.add(info.id);
      spawned.retry = Boolean(delivery.retry);
      this._lastDropAt = this.elapsed;
      if (delivery.retry) this.retries++;
      else this._planIndex++;
      this._pendingDelivery = null;
      this._emit('spawn', { cargoId: info.id, cargoType: info.type, retry: Boolean(delivery.retry), text: `${delivery.retry ? '补发' : '新货'}：${NAMES[info.type]}`, x: delivery.x, y: 142 });
    }

    _createCargo(info, x, y, restored = false) {
      const spec = SPECS[info.type];
      const options = { label: 'cargo:' + info.id, friction: spec.friction, frictionStatic: spec.friction * 2, frictionAir: .01, restitution: spec.restitution, slop: .025, density: .002 };
      const body = info.type === 'pot' ? Bodies.rectangle(x, y, 56, 48, { ...options, chamfer: { radius: 14 } }) : Bodies.rectangle(x, y, spec.w, spec.h, { ...options, chamfer: { radius: info.type === 'bread' ? 9 : 3 } });
      Body.setMass(body, spec.mass);
      if (restored) Body.setVelocity(body, { x: this.truck.vx / 60, y: 0 });
      const item = { ...info, ...spec, body, caught: Boolean(info.caught), restored, retry: false, supported: restored, riskyAt: -10, lastSave: -10, airborneFor: 0 };
      body._shiftCargo = item;
      this.cargo.push(item); Composite.add(this.engine.world, body);
      return item;
    }

    _registerCatch(item) {
      if (item.caught) return;
      item.caught = true;
      const info = this._allCargo.find(c => c.id === item.id);
      if (info && info.caught) return;
      if (info) info.caught = true;
      this.catches++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      const perfect = Math.abs(item.body.position.x - this.truck.x) <= 24 && Math.abs(this.truck.vx) < 95;
      this.streak = perfect ? this.streak + 1 : 0;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (perfect) this.perfectCatches++;
      this.precision = Math.round(100 * this.perfectCatches / this.catches);
      const points = this.mode === 'tutorial' ? 0 : perfect ? 50 + Math.min(this.streak - 1, 4) * 10 : 25;
      this.score += points;
      const offsetX = item.body.position.x - this.truck.x, speed = this.truck.vx;
      const offsetMiss = Math.abs(offsetX) > 24, speedMiss = Math.abs(speed) >= 95;
      const detail = { cargoId: item.id, cargoType: item.type, order: this._dropPlan.findIndex(info => info.id === item.id) + 1 || item.id, quality: perfect ? 'perfect' : 'good', offsetX, speed, reason: perfect ? null : offsetMiss && speedMiss ? 'offset_speed' : offsetMiss ? 'offset' : 'speed', correction: perfect ? null : offsetMiss ? offsetX < 0 ? 'left' : 'right' : 'brake', at: this.elapsed, retry: Boolean(item.retry) };
      this._catchDetails.push(detail);
      this._emit('catch', { ...detail, text: perfect ? '精准签收！' : '接住了，松手稳住', points, streak: this.streak, combo: this.combo, x: item.body.position.x, y: item.body.position.y });
      if (this._tutorial?.step === 1) { this._emit('tutorial', { step: 1, phase: 'success', text: '第一步完成：真的挪车接住了！' }); this._enterTutorialStep(2); }
    }

    _updateContacts() {
      const supported = new Set([this.deck]);
      for (let pass = 0; pass < 7; pass++) for (const pair of this.engine.pairs.list) {
        if (!pair.isActive) continue;
        const a = pair.bodyA, b = pair.bodyB;
        if (supported.has(a) && b.position.y < a.position.y + 12) supported.add(b);
        if (supported.has(b) && a.position.y < b.position.y + 12) supported.add(a);
      }
      for (const item of this.cargo) {
        const landed = supported.has(item.body) && item.airborneFor > .12;
        item.supported = supported.has(item.body);
        if (item.supported) {
          if (!item.caught) this._registerCatch(item);
          else if (landed && this.elapsed - item.riskyAt < 1.3 && this.elapsed - item.lastSave > 3 && this.elapsed - this._lastSave > 1.4 && this._recentControlDistance() >= 8) {
            item.lastSave = this.elapsed; item.riskyAt = -10; this._lastSave = this.elapsed; this.saves++;
            const points = this.mode === 'tutorial' ? 0 : 45;
            this.score += points;
            this._emit('save', { cargoId: item.id, cargoType: item.type, text: '接回来了！', points, x: item.body.position.x, y: item.body.position.y });
          }
          if (landed && this._tutorial?.step === 3 && this._tutorial.phase === 'air' && this._tutorial.movedAfterLaunch >= 12 && this._recentControlDistance() >= 8) this._completeTutorial();
          item.airborneFor = 0;
        } else {
          item.airborneFor += STEP;
          if (item.caught && (Math.abs(item.body.position.x - this.truck.x) > 40 || item.body.velocity.y < -2)) item.riskyAt = this.elapsed;
        }
      }
    }

    _crash(item) {
      this._lastCrash = this.elapsed;
      const dx = item.body.position.x - this.truck.x;
      const side = dx < -20 ? 'left' : dx > 20 ? 'right' : 'center';
      const word = side === 'left' ? '左' : '右';
      const cause = !item.caught ? '漏接' : side === 'center' ? '货物落地' : `从${word}侧滑落`;
      const advice = !item.caught ? '看落点，提前挪过去，到位后松手。' : side === 'center' ? '货物弹起时稳住车，等它落回。' : `向${word}轻挪，把车送到它下面。`;
      this.lastCrash = { cargoId: item.id, cargoType: item.type, side, cause, advice, x: item.body.position.x, y: item.body.position.y, at: this.elapsed };
      if (this.mode !== 'tutorial') { this.lives--; this.combo = this.streak = 0; this.score = Math.max(0, this.score - 35); }
      if (this.mode === 'tutorial') {
        this._tutorial.detail = '没关系，免费重试，不扣机会。';
        this._emit('tutorial', { step: this._tutorial.step, phase: 'retry', text: this._tutorial.detail });
      }
      else this._emit('crash', { ...this.lastCrash, text: `${NAMES[item.type]}：${cause}`, lives: this.lives, tutorial: false });
      if (this.lives <= 0) { this.status = 'lose'; this.finishReason = 'crash'; this._emit('lose', { text: '这趟散架了，下次再稳一点。', score: Math.floor(this.score), lives: 0, finishReason: 'crash' }); return; }
      if (this.mode !== 'tutorial' && this._pendingDelivery?.retry && !this._retryQueue.some(c => c.id === this._pendingDelivery.id)) {
        const pending = this._pendingDelivery;
        this._retryQueue.unshift({ id: pending.id, type: pending.type, x: pending.x });
      }
      if (this.mode !== 'tutorial') for (const pending of this.cargo.filter(c => !c.caught)) {
        if (!this._retryQueue.some(c => c.id === pending.id)) this._retryQueue.push({ id: pending.id, type: pending.type, x: this._allCargo.find(c => c.id === pending.id)?.x ?? clamp(pending.body.position.x, 100, 320) });
      }
      // An announced future delivery yields to a missed item's full retry window.
      this._pendingDelivery = null;
      for (const c of this.cargo) Composite.remove(this.engine.world, c.body);
      this.cargo = []; this._recovery = .8; this._invulnerableUntil = this.elapsed + 2;
      this._beginBrake();
      if (this.mode !== 'tutorial') {
        this._retryQueue = this._retryQueue.filter(retry => {
          if (this.elapsed + this._recovery + this._deliveryLead(retry.x, true) <= DELIVERY_CUTOFF) return true;
          this._expireDelivery(retry); return false;
        });
        if (!this._retryQueue.length && this._planIndex >= this._dropPlan.length) this._closeDeliveries();
      }
      const count = this._allCargo.filter(c => c.caught).length;
      const retryType = this._retryQueue[0]?.type;
      this._recoveryInfo = this._recoverySummary(count);
      this._recoveryInfoUntil = this.elapsed + 4;
      this._emit('recovery', { ...this._recoveryInfo, retry: Boolean(retryType), phase: 'start' });
      if (this._tutorial) { this._tutorial.hold = 0; this._tutorial.userReleased = false; this._tutorial.retryAfterRecovery = true; }
    }

    _restoreCargo() {
      this._rescueLatch = null;
      this._rescueHandoff = null;
      let cursor = this.truck.y - 7;
      const priority = { bread: 0, monday: 1, pot: 2, fish: 3, coffee: 4 };
      const signed = this._allCargo.filter(info => info.caught).sort((a, b) => priority[a.type] - priority[b.type]);
      for (let i = 0; i < signed.length; i++) {
        const info = signed[i], spec = SPECS[info.type];
        this._createCargo(info, this.truck.x + (i % 2 ? 1 : -1), cursor - spec.h / 2 - .5, true);
        cursor -= spec.h + .7;
      }
      const retryType = this._retryQueue[0]?.type;
      this._recoveryInfo = this._recoverySummary(signed.length, true);
      this._recoveryInfoUntil = this.elapsed + 3.2;
      this._emit('recovery', { ...this._recoveryInfo, retry: Boolean(retryType), phase: 'restored' });
      if (this._tutorial?.retryAfterRecovery) {
        this._tutorial.retryAfterRecovery = false;
        this._tutorial.phase = this._tutorial.step === 1 ? 'retry' : this._tutorial.step === 3 ? 'prepare' : 'move';
        this._tutorial.retryAt = this.elapsed + 1.2;
        this._tutorial.launchAt = this.elapsed + 1.2;
        this._tutorial.detail = this._tutorial.step === 1 ? '饼会重新落下，停在亮区接住。' : this._tutorial.step === 2 ? '向左轻挪到亮区，松手停稳。' : '先松手等一下，饼马上会再弹起。';
        if (this._tutorial.step === 3) this._tutorial.targetX = this.truck.x;
        this._emit('tutorial', { step: this._tutorial.step, phase: 'retry', text: '免费重试，按提示再做一次' });
      }
    }

    _enterTutorialStep(step) {
      const titles = ['挪车接第一件货', '到位松手，稳住小车', '挪到下方，把饼接回'];
      const details = ['向右轻挪到亮区，等饼落下来。', '带着饼向左轻挪到亮区，松手停稳一小会。', '饼会轻轻弹起；主动挪车到它下方，再接回来。'];
      this._tutorial = { step, total: 3, title: titles[step - 1], detail: details[step - 1], targetX: step === 1 ? 245 : step === 2 ? 180 : this.truck.x, completed: false, progress: 0, phase: step === 1 ? 'move' : step === 2 ? 'move' : 'prepare', originX: this.truck.x, moved: 0, movedAfterLaunch: 0, hold: 0, userReleased: false, launchAt: this.elapsed + .9 };
      this._emit('tutorial', { step, total: 3, phase: 'start', text: this._tutorial.detail, title: this._tutorial.title });
    }

    _updateTutorial(dt) {
      const lesson = this._tutorial;
      if (!lesson || lesson.completed || this._recovery > 0) return;
      lesson.moved = Math.max(lesson.moved, Math.abs(this.truck.x - lesson.originX));
      if (lesson.step === 1) {
        if ((lesson.phase === 'move' && lesson.moved >= 20 && Math.abs(this.truck.x - lesson.targetX) < 13) || (lesson.phase === 'retry' && this.elapsed >= lesson.retryAt)) {
          let info = this._allCargo.find(c => c.id === 1);
          if (!info) { info = { id: 1, type: 'bread', x: lesson.targetX, caught: false }; this._allCargo.push(info); }
          const item = this._createCargo(info, lesson.targetX, 260);
          item.retry = Boolean(lesson.retryAt);
          lesson.phase = 'catch';
          this._emit('spawn', { cargoId: 1, cargoType: 'bread', x: lesson.targetX, y: 260, retry: Boolean(lesson.retryAt), tutorial: true, text: '停在落点下面，接住这张饼' });
        }
        lesson.progress = lesson.phase === 'catch' ? .7 : Math.min(.6, lesson.moved / 35 * .6);
      } else if (lesson.step === 2) {
        const steady = lesson.moved >= 20 && Math.abs(this.truck.x - lesson.targetX) < 13 && lesson.userReleased && this._braking && Math.abs(this.truck.vx) < 8 && this.cargo.some(c => c.caught && c.supported);
        lesson.hold = steady ? lesson.hold + dt : 0;
        lesson.progress = Math.min(1, (lesson.moved >= 20 ? .4 : 0) + lesson.hold / .6 * .6);
        if (lesson.hold >= .6) { this._emit('tutorial', { step: 2, phase: 'success', text: '松手制动学会了，车真的停住了！' }); this._enterTutorialStep(3); }
      } else {
        const item = this.cargo.find(c => c.caught);
        if (lesson.phase === 'prepare' && item && this.elapsed >= lesson.launchAt) {
          const direction = this.truck.x > 245 ? -1 : 1;
          Body.setVelocity(item.body, { x: direction * 2.15, y: -6.1 });
          Body.setAngularVelocity(item.body, direction * .025);
          item.supported = false; item.airborneFor = .13; item.riskyAt = this.elapsed;
          lesson.phase = 'air'; lesson.originX = this.truck.x; lesson.movedAfterLaunch = 0; lesson.airStartedAt = this.elapsed;
          lesson.targetX = clamp(item.body.position.x + direction * 75, 90, 330);
          lesson.detail = direction > 0 ? '饼向右弹起来了，向右轻挪到它下方接回！' : '饼向左弹起来了，向左轻挪到它下方接回！';
          this._emit('tutorial', { step: 3, phase: 'launch', text: lesson.detail });
        }
        if (lesson.phase === 'air') {
          lesson.movedAfterLaunch = Math.max(lesson.movedAfterLaunch, Math.abs(this.truck.x - lesson.originX));
          if (item) lesson.targetX = clamp(this._landingX(item), 90, 330);
          lesson.progress = Math.min(.85, .3 + lesson.movedAfterLaunch / 70 * .55);
          if (item?.supported && this.elapsed - lesson.airStartedAt > 1.25) {
            lesson.phase = 'prepare'; lesson.launchAt = this.elapsed + 1.1; lesson.progress = .1;
            lesson.targetX = this.truck.x; lesson.detail = '这次要主动挪车接回，免费再练一次。';
            this._emit('tutorial', { step: 3, phase: 'retry', text: '这次要主动挪车接回，免费再练一次' });
          }
        }
      }
    }

    _completeTutorial() {
      if (!this._tutorial || this._tutorial.completed) return;
      this._tutorial.completed = true; this._tutorial.progress = 1; this.status = 'win';
      this._emit('tutorial', { step: 3, phase: 'success', text: '三步完成：会挪、会停，也会接回来了！' });
      this._emit('win', { tutorial: true, text: '上车练习完成，准备正式下班！', score: 0, lives: 3 });
    }

    triggerChaos() {
      if (this.mode === 'tutorial' || this.settling || this.status !== 'playing' || this._paused || this.elapsed - this._lastChaos < 5 || this._recovery > 0) return false;
      const caught = this.cargo.filter(c => c.caught);
      if (!caught.length) return false;
      this._lastChaos = this.elapsed;
      for (let i = 0; i < caught.length; i++) {
        const item = caught[i];
        Body.setVelocity(item.body, { x: (i % 2 ? -1 : 1) * 2.8, y: -8.5 - i * .45 });
        Body.setAngularVelocity(item.body, i % 2 ? -.065 : .065); item.riskyAt = this.elapsed; item.supported = false;
      }
      this._emit('warning', { text: '全车起飞，先把旧货接回！', kind: 'chaos' }); return true;
    }

    _recentControlDistance() { return this._controlHistory.reduce((sum, s) => this.elapsed - s.time < 1.4 ? sum + s.distance : sum, 0); }
    _cargoRisk(item) {
      if (!item.caught) return 0;
      const dx = item.body.position.x - this.truck.x;
      const predicted = dx + clamp((item.body.velocity.x * 60 - this.truck.vx) * .16, -35, 35);
      return clamp(Math.max((Math.max(Math.abs(dx), Math.abs(predicted)) - 40) / 60, (item.body.position.y - this.truck.y - 15) / 65, 0) + Math.max(0, item.airborneFor - .15) * .18, 0, 1);
    }
    _supportMargin(item, horizon = 0) {
      let margin = -Infinity;
      const x = item.body.position.x;
      for (const pair of this.engine.pairs.list) {
        if (!pair.isActive) continue;
        const other = pair.bodyA === item.body ? pair.bodyB : pair.bodyB === item.body ? pair.bodyA : null;
        if (!other || other.position.y <= item.body.position.y + 1 || (other !== this.deck && !other._shiftCargo?.supported)) continue;
        const supportVx = other === this.deck ? this.truck.vx : other.velocity.x * 60;
        const projectedX = x + (item.body.velocity.x * 60 - supportVx) * horizon;
        margin = Math.max(margin, Math.min(x - other.bounds.min.x, other.bounds.max.x - x, projectedX - other.bounds.min.x, other.bounds.max.x - projectedX));
      }
      return Number.isFinite(margin) ? margin : item.supported ? 82 - Math.max(Math.abs(x - this.truck.x), Math.abs(x - this.truck.x + (item.body.velocity.x * 60 - this.truck.vx) * horizon)) : -82;
    }

    _rescueSafe(item) {
      const moving = Math.abs(this.truck.vx) >= 12;
      return item.supported && (!moving || this._supportMargin(item, .2) >= 1) &&
        Math.abs(item.body.velocity.x * 60 - this.truck.vx) < 16 &&
        Math.abs(item.body.velocity.y * 60) < 18 && Math.abs(item.body.angularVelocity * 60) < .5;
    }

    _rescueCandidate() {
      return this.cargo.filter(item => item.caught && item.body.position.y < 660 && this._cargoRisk(item) > .52 && !this._rescueSafe(item))
        .reduce((a, b) => !a || this._cargoRisk(b) > this._cargoRisk(a) ? b : a, null);
    }

    _updateRescueIntent(dt) {
      const candidate = this._rescueCandidate();
      let held = this._rescueLatch && this.cargo.find(item => item.id === this._rescueLatch.id && item.caught && item.body.position.y < 660);
      if (held) {
        this._rescueLatch.safeFor = this._rescueSafe(held) ? this._rescueLatch.safeFor + dt : 0;
        if (this._rescueLatch.safeFor >= .2) { this._rescueHandoff = { id: held.id, until: this.elapsed + .12 }; this._rescueLatch = null; held = null; }
      } else this._rescueLatch = null;
      if (candidate && (!held || this._cargoRisk(candidate) > this._cargoRisk(held) + .15)) this._rescueLatch = { id: candidate.id, safeFor: 0 };
    }

    _rescueCargo() {
      // Physical scheduling/checkpoint rules stay identical to V8. Only the
      // displayed handoff receives hysteresis; it never grants another assist.
      return this.cargo.filter(item => {
        const calm = item.supported && Math.abs(item.body.velocity.x * 60 - this.truck.vx) < 16 && Math.abs(item.body.velocity.y * 60) < 18 && Math.abs(item.body.angularVelocity * 60) < .5;
        return item.caught && item.body.position.y < 660 && !calm && this._cargoRisk(item) > .52;
      }).reduce((a, b) => !a || this._cargoRisk(b) > this._cargoRisk(a) ? b : a, null);
    }

    _rescueHintCargo() {
      return (this._rescueLatch && this.cargo.find(item => item.id === this._rescueLatch.id && item.caught && item.body.position.y < 660)) || this._rescueCandidate() ||
        (this._rescueHandoff && this.elapsed < this._rescueHandoff.until && this.cargo.find(item => item.id === this._rescueHandoff.id && item.caught && item.body.position.y < 660));
    }

    _rescueState(item) {
      const landingX = this._landingX(item);
      return landingX < 4 || landingX > 416 ? 'edge' : 'recovering';
    }

    _updateRescueCheckpoint(dt) {
      const rescue = this._rescueCargo();
      if (!rescue) { this._rescueSeconds = 0; this._rescueId = null; return; }
      // Switching the most endangered parcel is still the same rescue episode.
      this._rescueId = rescue.id;
      this._rescueSeconds += dt;
      if (this._rescueSeconds < 3 || this.elapsed - this._lastAssist < 6) return;
      this._lastAssist = this.elapsed;
      this._rescueSeconds = 0;
      this.assists++;
      this.score = Math.max(0, this.score - 25);
      if (this._pendingDelivery?.retry && !this._retryQueue.some(c => c.id === this._pendingDelivery.id)) this._retryQueue.unshift({ id: this._pendingDelivery.id, type: this._pendingDelivery.type, x: this._pendingDelivery.x });
      for (const item of this.cargo.filter(c => !c.caught)) if (!this._retryQueue.some(c => c.id === item.id)) this._retryQueue.push({ id: item.id, type: item.type, x: this._allCargo.find(c => c.id === item.id)?.x ?? clamp(item.body.position.x, 100, 320) });
      this._pendingDelivery = null;
      for (const item of this.cargo) Composite.remove(this.engine.world, item.body);
      this.cargo = [];
      this._restoreCargo();
      this._invulnerableUntil = this.elapsed + .7;
      this._tail.hold = 0;
      if (!this._tail.completed) this._tail.progress = 0;
      this._tail.grace = 0;
      const restoredCount = this.cargo.length;
      this._recoveryInfo = { text: `扶正${restoredCount}件已签收货，扣25分，不重复签收`, restoredCount, ...this._deliveryOutcomes(), assist: true };
      this._recoveryInfoUntil = this.elapsed + 2.5;
      this._emit('recovery', { ...this._recoveryInfo, phase: 'assist', points: -25, assists: this.assists });
    }

    _canStartTailEarly() {
      // Finishing the minimum job is not permission to cancel the last parcels.
      // A round may transition only after the whole plan was really sent,
      // all retries were signed, and every signed parcel has safely settled.
      return this.mode !== 'tutorial' && this._dropPlan.length > 0 && (this._deliveriesClosed || this._planIndex >= this._dropPlan.length) &&
        !this._pendingDelivery && !this._retryQueue.length && this.catches >= this.requiredCatches &&
        !this.cargo.some(item => !item.caught) && !this._rescueCargo() && this._arrivalStable();
    }

    _updateTail(dt) {
      const tail = this._tail;
      if (tail.completed || (!tail.active && this.elapsed < TAIL_DEADLINE && !this._canStartTailEarly())) return;
      if (!tail.active) {
        if (Math.abs(tail.targets[0] - this.truck.x) < 50) tail.targets.reverse();
        tail.active = true; tail.startAt = this.elapsed; tail.step = 1; tail.targetX = tail.targets[0]; tail.originX = this.truck.x;
        tail.moved = 0; tail.released = false; tail.hold = tail.progress = 0; tail.title = '收工第1站';
        this._closeDeliveries();
        if (this._finishIfNoDeliveryChance()) return;
        this._emit('tail', { phase: 'start', step: 1, startAt: tail.startAt, targetX: tail.targetX, points: 0, text: `收工两站：先到${tail.targetX < this.truck.x ? '左' : '右'}边亮区，松手停稳` });
      }
      tail.moved = Math.max(tail.moved, Math.abs(this.truck.x - tail.originX));
      const assessment = this._tailAssessment();
      const good = assessment.eligible;
      if (good) { tail.hold += dt; tail.grace = 0; }
      else if (assessment.soft && tail.hold > 0) { tail.grace += dt; if (tail.grace > .12) tail.hold = Math.max(0, tail.hold - dt * .45); }
      else { tail.hold = 0; tail.grace = 0; }
      tail.progress = Math.min(1, tail.hold / .45);
      if (!good || tail.hold < .45) return;
      this.score += 60; this.tailBonus += 60; tail.bonus = this.tailBonus;
      this._emit('tail', { phase: 'station', step: tail.step, targetX: tail.targetX, points: 60, text: `第${tail.step}站停稳，+60分` });
      if (tail.step === 1) {
        tail.step = 2; tail.targetX = tail.targets[1]; tail.originX = this.truck.x; tail.moved = 0;
        tail.released = false; tail.hold = tail.progress = tail.grace = 0; tail.title = '收工第2站';
      } else {
        tail.completed = true; tail.progress = 1; tail.title = '两站完成';
        this.score += 80; this.tailBonus += 80; tail.bonus = this.tailBonus;
        this._emit('tail', { phase: 'complete', step: 2, points: 80, text: this.catches >= this.requiredCatches ? '两站完成，+80分，检查货物稳住后收工' : '两站完成，+80分，最后的货还需真实签收' });
      }
    }

    _tailAssessment() {
      const tail = this._tail;
      const progress = tail.completed ? 1 : Math.min(1, tail.hold / .45);
      const base = { eligible: false, phase: 'approach', text: '', detail: '', blockingCargoId: null, blockingCargoType: null, progress, direction: 'steady', targetX: tail.targetX };
      if (tail.completed) return { ...base, phase: 'complete', text: '两站都已停稳', detail: this.catches >= this.requiredCatches ? '货物稳稳归位后就能收工。' : '还有货物在途中，真实签收满4件后才能收工。' };
      if (this._recovery > 0 || this.settling) return { ...base, phase: 'recovery', text: '货物归位中，暂不计站', detail: '先让已签收货物回到车上，归位后重新停稳。', direction: 'stop' };
      const close = Math.abs(tail.targetX - this.truck.x) <= 25;
      if (!close) return { ...base, text: `收工第${tail.step}站：向${tail.targetX < this.truck.x ? '左' : '右'}挪到亮区`, detail: '先把小车停进这一站的亮区。', direction: tail.targetX < this.truck.x ? 'left' : 'right' };
      if (tail.moved < 18) {
        const nudge = clamp(tail.originX + (tail.targetX < 210 ? 20 : -20), 80, 340);
        return { ...base, text: '已在亮区，先轻挪一下', detail: '这一站需要实际挪车，再松手停稳。', direction: nudge < this.truck.x ? 'left' : 'right', targetX: nudge };
      }
      if (!tail.released || !this._braking) return { ...base, phase: 'release', text: '已经到位，请松手', detail: '松开方向键或手指，先把小车刹住。', direction: 'stop' };
      if (Math.abs(this.truck.vx) >= 12) return { ...base, phase: 'braking', text: '已经到位，正在刹车', detail: '车还在滑，保持松手，停住后再计站。', direction: 'stop' };
      const signed = this._allCargo.filter(info => info.caught);
      const carried = this.cargo.filter(item => item.caught);
      const missing = signed.find(info => !carried.some(item => item.id === info.id));
      const unstable = this._rescueCargo() || carried.find(item => !item.supported || Math.abs(item.body.velocity.x * 60 - this.truck.vx) >= 25);
      const blocker = missing || unstable;
      if (!signed.length || missing || unstable || carried.length !== signed.length) {
        const type = blocker?.type;
        const name = type ? NAMES[type] : '货物';
        const detail = missing ? `${name}还未归位，这一站暂不计时。` : unstable && !unstable.supported ? `${name}还没落到稳定支撑上，等它落稳再计站。` : unstable && Math.abs(unstable.body.velocity.x * 60 - this.truck.vx) >= 25 ? `${name}仍在横向滑动，稳住后才开始计站。` : `${name}还在晃动，先接稳它，再开始计站。`;
        const soft = !missing && !this._rescueCargo() && carried.length === signed.length && carried.every(item => item.body.position.y < 620 && this._cargoRisk(item) < .4 && Math.abs(item.body.velocity.x * 60 - this.truck.vx) < 42 && (item.supported || item.airborneFor < .14));
        return { ...base, soft, phase: 'cargo_wait', text: `车已停好，等${name}稳住`, detail: soft && tail.hold > 0 ? `${name}轻晃，保留停站进度，落稳后继续。` : detail, blockingCargoId: blocker?.id ?? null, blockingCargoType: type ?? null, direction: 'stop' };
      }
      return { ...base, eligible: true, phase: 'holding', text: '车货已稳，正在计站', detail: '保持松手，等停站进度走满。', direction: 'stop' };
    }

    _arrivalStable() {
      const signed = this._allCargo.filter(info => info.caught);
      return this._recovery <= 0 && Math.abs(this.truck.vx) < 12 && signed.length > 0 && this.cargo.length === signed.length && this.cargo.every(c => c.caught && c.supported && c.body.position.y < 640 && c.body.position.x > 0 && c.body.position.x < 420 && Math.abs(c.body.velocity.x * 60 - this.truck.vx) < 22 && Math.abs(c.body.velocity.y * 60) < 22);
    }

    _startSettling() {
      if (this.settling || this.status !== 'playing') return;
      this.settling = true; this._settleElapsed = this._settleStable = 0;
      this._closeDeliveries(); this._beginBrake(); this.wind = 0; this.warning = null;
      if (!this._arrivalStable()) {
        for (const item of this.cargo) Composite.remove(this.engine.world, item.body);
        this.cargo = [];
        this._recovery = Math.max(this._recovery, .25);
        const count = this._allCargo.filter(c => c.caught).length;
        this._recoveryInfo = { text: `收工清点：等${count}件已签收货归位`, restoredCount: count, ...this._deliveryOutcomes() };
        this._recoveryInfoUntil = this.elapsed + 3;
        this._emit('recovery', { ...this._recoveryInfo, phase: 'arrival' });
      }
    }

    _updateSettling(dt) {
      this._settleElapsed += dt;
      this._settleStable = this._arrivalStable() ? this._settleStable + dt : 0;
      if (this._settleStable >= .3) this._finishArrival(true);
      else if (this._settleElapsed + 1e-8 >= 2) this._finishArrival(false);
    }

    _finishArrival(safe) {
      if (this.status !== 'playing') return;
      const complete = this.catches >= this.requiredCatches;
      this.finishReason = !complete ? 'incomplete' : !this._tail.completed ? 'tail_incomplete' : !safe ? 'unsafe_arrival' : 'arrived';
      const won = this.finishReason === 'arrived';
      this.status = won ? 'win' : 'lose';
      this.settling = false;
      if (won) { this.timeBonus = Math.max(0, Math.floor((60 - this.elapsed) * 12)); this.score += this.lives * 80 + this.timeBonus; }
      const text = won ? `两站停稳，安全到家！提前收工+${this.timeBonus}分` : this.finishReason === 'incomplete' ? `还差${this.requiredCatches - this.catches}件真实签收` : this.finishReason === 'tail_incomplete' ? '收工两站还没完成，下趟记得挪车停稳' : '货物还没安全归位，这趟未能收工';
      this._emit(won ? 'win' : 'lose', { text, score: Math.floor(this.score), lives: this.lives, finishReason: this.finishReason, requiredCatches: this.requiredCatches, catches: this.catches, timeBonus: this.timeBonus, tailBonus: this.tailBonus });
    }
    _landingX(item) {
      const body = item.body, dy = Math.max(0, this.truck.y - 7 - item.h / 2 - body.position.y), vy = body.velocity.y * 60;
      const t = clamp((-vy + Math.sqrt(vy * vy + 2040 * dy)) / 1020, 0, 1.3);
      return clamp(body.position.x + body.velocity.x * 60 * t * .8, -30, 450);
    }
    _balance() {
      const carried = this.cargo.filter(c => c.caught && c.body.position.y < 660);
      if (!carried.length) return { centerX: this.truck.x, centerY: this.truck.y, offset: 0, risk: 0, correction: 'steady', projectedX: this.truck.x, atRiskId: null };
      const mass = carried.reduce((s, c) => s + c.mass, 0);
      const centerX = carried.reduce((s, c) => s + c.body.position.x * c.mass, 0) / mass;
      const centerY = carried.reduce((s, c) => s + c.body.position.y * c.mass, 0) / mass;
      const velocity = carried.reduce((s, c) => s + c.body.velocity.x * 60 * c.mass, 0) / mass;
      const projectedX = centerX + clamp((velocity - this.truck.vx) * .16, -35, 35);
      const offset = clamp((projectedX - this.truck.x) / 82, -1, 1);
      const worst = carried.reduce((a, b) => this._cargoRisk(b) > this._cargoRisk(a) ? b : a);
      const risk = clamp(Math.max((Math.abs(offset) - .18) / .75, this._cargoRisk(worst) * .85), 0, 1);
      const correction = Math.abs(projectedX - this.truck.x) < 17 ? 'steady' : projectedX < this.truck.x ? 'left' : 'right';
      return { centerX, centerY, projectedX, offset, risk, correction, atRiskId: this._cargoRisk(worst) > .4 ? worst.id : null };
    }
    _nextDrop() {
      const p = this._pendingDelivery;
      return p ? { x: p.x, type: p.type, inSeconds: Math.max(0, p.time - this.elapsed), retry: Boolean(p.retry), delayed: p.delayed > .05, cargoId: p.id } : null;
    }
    _guidance() {
      const directionTo = x => Math.abs(x - this.truck.x) < 12 ? 'stop' : x < this.truck.x ? 'left' : 'right';
      if (this.settling) return { kind: 'recovery', direction: 'stop', text: '收工清点，等货物稳稳归位', targetX: this.truck.x };
      if (this._tutorial) {
        const t = this._tutorial;
        if (t.completed) return { kind: 'tutorial', direction: 'steady', text: '练习完成，可以正式出发了', targetX: this.truck.x, cargoId: 1 };
        if (this._recovery > 0) return { kind: 'tutorial', direction: 'stop', text: '免费重试，先停稳小车', targetX: this.truck.x, cargoId: 1 };
        const direction = directionTo(t.targetX);
        let text;
        if (t.step === 1 && (t.phase === 'catch' || t.phase === 'retry' || Math.abs(this.truck.x - t.targetX) < 13)) return { kind: 'tutorial', direction: 'stop', text: '松手停稳，等饼落下', targetX: t.targetX, cargoId: 1 };
        if (t.step === 2 && Math.abs(this.truck.x - t.targetX) < 13) return { kind: 'tutorial', direction: 'stop', text: '松手刹车，停稳一小会', targetX: t.targetX, cargoId: 1 };
        if (t.step === 3 && t.phase !== 'air') return { kind: 'tutorial', direction: 'stop', text: '先停稳，准备救货', targetX: this.truck.x, cargoId: 1 };
        if (direction === 'stop') text = '松手稳住，等饼落回';
        else text = `${direction === 'left' ? '向左' : '向右'}${t.step === 3 ? '挪，把饼接回' : '轻挪到亮区'}`;
        return { kind: 'tutorial', direction, text, targetX: t.targetX, cargoId: 1 };
      }
      if (this._recovery > 0) return { kind: 'recovery', direction: 'stop', text: this._recoveryInfo?.text || '已签收货物归位中', targetX: this.truck.x };
      const rescue = this._rescueHintCargo();
      if (rescue) {
        const x = clamp(this._landingX(rescue), 80, 340);
        const state = this._rescueState(rescue);
        const direction = directionTo(x);
        const side = x < 210 ? '左' : '右';
        if (state === 'edge') return { kind: 'rescue', rescueState: state, direction, text: direction === 'stop' ? `已近${side}边界，先刹稳` : `向${side}追到边，到边刹住`, detail: `${NAMES[rescue.type]}已在可追边缘外，先稳住其余货；下趟在它偏出前提前接近。`, targetX: x, cargoId: rescue.id };
        const deliveryEnded = this._deliveriesClosed || this._planIndex >= this._dropPlan.length;
        return { kind: 'rescue', rescueState: state, direction, text: direction === 'stop' ? `先刹住，等${NAMES[rescue.type]}稳住` : `先向${side}接近${NAMES[rescue.type]}`, detail: this._tail.active || deliveryEnded ? '风险还未解除，先稳住旧货，再去收工亮区。' : '风险还未解除，新货稍等；接稳旧货后再去落点。', targetX: x, cargoId: rescue.id };
      }
      const essentialFalling = this._deliveriesClosed && this.catches < this.requiredCatches ? this.cargo.find(item => !item.caught) : null;
      if (essentialFalling) {
        const x = clamp(this._landingX(essentialFalling), 80, 340);
        const close = Math.abs(x - this.truck.x) < 24;
        return { kind: close ? 'brake' : 'pickup', direction: close ? 'stop' : directionTo(x), text: close ? '到位松手，先接齐货' : '先接齐货，再停两站', detail: '这件仍有机会接住，真实签收满4件后再收工。', targetX: x, cargoId: essentialFalling.id };
      }
      if (this._tail.active && !this._tail.completed) {
        const feedback = this._tailAssessment();
        return { kind: 'tail', direction: feedback.direction, text: feedback.text, detail: feedback.detail, targetX: feedback.targetX, ...(feedback.blockingCargoId === null ? {} : { cargoId: feedback.blockingCargoId }) };
      }
      const falling = this.cargo.find(c => !c.caught);
      const next = this._nextDrop();
      if (falling || next) {
        const x = falling ? clamp(this._landingX(falling), 80, 340) : next.x;
        const atTarget = Math.abs(x - this.truck.x) < 24;
        if (atTarget) return { kind: 'brake', direction: 'stop', text: `${next?.retry ? '补发将到，' : ''}到位了，松手刹住等货`, targetX: x, cargoId: falling?.id ?? next.cargoId };
        return { kind: 'pickup', direction: directionTo(x), text: `${next?.retry ? '补发准备：' : ''}提前挪到落点，到位松手`, targetX: x, cargoId: falling?.id ?? next.cargoId };
      }
      if (Math.abs(this.truck.vx) > 40) return { kind: 'brake', direction: 'stop', text: '松手刹住，先把车稳下来', targetX: this.truck.x };
      if (this._deliveriesClosed || this._planIndex >= this._dropPlan.length) return { kind: 'steady', direction: 'steady', text: '投递已结束，稳住准备停站', detail: '保持松手，等旧货稳住后进入两站。', targetX: this.truck.x };
      return { kind: 'steady', direction: 'steady', text: '稳稳的，等下一件货', targetX: this.truck.x };
    }

    _job() {
      const planned = new Set(this.mode === 'tutorial' ? [] : this._dropPlan.map(item => item.id));
      const sent = [...planned].filter(id => this._sentIds.has(id)).length;
      const unsigned = new Set(this.cargo.filter(item => !item.caught && !this._allCargo.find(info => info.id === item.id)?.caught).map(item => item.id));
      const retryIds = new Set(this._retryQueue.map(item => item.id));
      if (this._pendingDelivery?.retry) retryIds.add(this._pendingDelivery.id);
      for (const item of this.cargo) if (item.retry && unsigned.has(item.id)) retryIds.add(item.id);
      for (const id of retryIds) if (this._allCargo.find(info => info.id === id)?.caught) retryIds.delete(id);
      const terminal = this.status === 'win' || this.status === 'lose';
      const remainingDeliveries = planned.size - sent;
      const minimumMet = this.mode === 'tutorial' ? Boolean(this._tutorial?.completed) : this.catches >= this.requiredCatches;
      const outcomes = this._deliveryOutcomes();
      const unavailableDeliveries = outcomes.unavailableDeliveries;
      const outcomeText = this._deliveryOutcomeLabels(outcomes).join('，');
      const cutoffReason = outcomeText ? `投递需在${DELIVERY_CUTOFF}秒前留够接货预告，本趟窗口不足，不再安排这些货` : '';
      const phase = terminal ? 'complete' : this.settling ? 'settling' : this._tail.active ? 'tail' : unsigned.size || (!this._deliveriesClosed && (remainingDeliveries || retryIds.size)) ? 'delivery' : 'settling';
      let detail;
      if (this.mode === 'tutorial') detail = this._tutorial?.completed ? '三步练习完成，可以正式接单。' : '先完成挪车、松手和救货三步练习。';
      else if (terminal) {
        const result = this.status === 'win' ? `签收${this.catches}/${planned.size}件，两站停稳，安全收工` : this.finishReason === 'incomplete' ? `投递已结束，签收${this.catches}/${this.requiredCatches}件，未能接齐` : `本趟结束，已签收${this.catches}件`;
        detail = `${result}${outcomeText ? `；${outcomeText}；${cutoffReason}，原线再试时留意预告` : ''}。`;
      }
      else if (this._deliveriesClosed && (remainingDeliveries || retryIds.size || unavailableDeliveries)) detail = `后续投递已结束${outcomeText ? `，${outcomeText}；${cutoffReason}` : ''}${unsigned.size ? `；还有${unsigned.size}件在途中，先接稳它` : `；${this._tail.active ? '先完成收工两站' : '先把已签收货稳住'}`}。`;
      else if (retryIds.size) detail = `待补发${retryIds.size}件，接住才算签收${remainingDeliveries ? `；另有${remainingDeliveries}件待投递` : ''}。`;
      else if (remainingDeliveries) detail = `${minimumMet ? `已达最低${this.requiredCatches}件` : `还差${this.requiredCatches - this.catches}件达标`}，整单还剩${remainingDeliveries}件待投递。`;
      else if (unsigned.size) detail = `整单已投出，${unsigned.size}件仍在途中，接稳后停两站。`;
      else if (this._tail.active && !this._tail.completed) detail = `整单投递结束，停稳收工第${this._tail.step}站。`;
      else detail = `全部投递完成，先把${this.catches}件已签收货稳住。`;
      return { minimumMet, required: this.requiredCatches, total: planned.size, sent, remainingDeliveries, airborneUnsigned: unsigned.size, retryCount: retryIds.size, ...outcomes, deliveriesClosed: this._deliveriesClosed, phase, detail };
    }

    snapshot() {
      const tutorial = this._tutorial ? { step: this._tutorial.step, total: 3, title: this._tutorial.title, detail: this._tutorial.detail, targetX: this._tutorial.targetX, completed: this._tutorial.completed, progress: this._tutorial.progress } : null;
      const assessment = this._tailAssessment();
      const feedback = { phase: assessment.phase, text: assessment.text, detail: assessment.detail, blockingCargoId: assessment.blockingCargoId, blockingCargoType: assessment.blockingCargoType, progress: assessment.progress };
      const rescue = this._rescueHintCargo();
      return {
        status: this.status, mode: this.mode, elapsed: this.elapsed, duration: this.duration, lives: this.lives, requiredCatches: this.requiredCatches, finishReason: this.finishReason,
        job: this._job(), route: { ...this.route, ...(this.route.next ? { next: { ...this.route.next } } : {}), options: NORMAL_ROUTES.map((route, variant) => ({ variant, name: route.name, tagline: route.tagline })) },
        rescue: rescue ? { cargoId: rescue.id, state: this._rescueState(rescue), risk: this._cargoRisk(rescue), supportMargin: this._supportMargin(rescue), projectedSupportMargin: this._supportMargin(rescue, .2), safeFor: this._rescueLatch?.id === rescue.id ? this._rescueLatch.safeFor : 0 } : null,
        score: Math.floor(this.score), catches: this.catches, saves: this.saves, combo: this.combo, bestCombo: this.bestCombo,
        settling: this.settling, assists: this.assists, timeBonus: this.timeBonus, tailBonus: this.tailBonus,
        perfectCatches: this.perfectCatches, precision: this.precision, streak: this.streak, bestStreak: this.bestStreak, retries: this.retries, catchDetails: this._catchDetails.map(detail => ({ ...detail })),
        truck: { ...this.truck, braking: this._braking },
        cargo: this.cargo.map(c => ({ id: c.id, type: c.type, x: c.body.position.x, y: c.body.position.y, angle: c.body.angle, vx: c.body.velocity.x, vy: c.body.velocity.y, w: c.w, h: c.h, r: c.r, mass: c.mass, caught: c.caught, restored: c.restored, retry: c.retry, supported: c.supported, risk: this._cargoRisk(c), landingX: this._landingX(c) })),
        warning: this.warning ? { ...this.warning } : null, stage: Math.min(3, 1 + Math.floor(this.elapsed / 20)), wind: this.wind,
        paused: this._paused, chaosCooldown: Math.max(0, 5 - (this.elapsed - this._lastChaos)), balance: this._balance(),
        nextDrop: this._nextDrop(), guidance: this._guidance(), recovery: this._recoveryInfo && this.elapsed < this._recoveryInfoUntil ? { ...this._recoveryInfo, ...(this._recoveryInfo.unavailableItems ? { unavailableItems: this._recoveryInfo.unavailableItems.map(item => ({ ...item })) } : {}) } : null,
        lastCrash: this.lastCrash ? { ...this.lastCrash } : null, dateSeed: this.dateSeed, tutorial,
        tail: this.mode === 'tutorial' ? null : { active: this._tail.active, completed: this._tail.completed, startAt: this._tail.startAt, step: this._tail.step, total: 2, targetX: this._tail.targetX, progress: this._tail.progress, title: this._tail.title, variant: this._tail.variant, bonus: this.tailBonus, feedback }
      };
    }
    _emit(type, details) {
      if (this._resetting) { if (type === 'tutorial' && details.phase === 'start') this._pendingTutorialStart = details; return; }
      this.onEvent({ type, elapsed: this.elapsed, ...details });
    }
  }
  global.ShiftEngine = ShiftEngine;
})(typeof window !== 'undefined' ? window : globalThis);
