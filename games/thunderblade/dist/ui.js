(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const panels = ['start-screen', 'pause-screen', 'result-screen', 'help-screen'];
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(n) || 0));
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const touchLayout = () => window.matchMedia('(pointer:coarse)').matches || window.innerWidth <= 760;
  let best = Math.max(0, Number(read('nightfall-best-active60', 0)) || 0);
  let soundOn = read('nightfall-sound', false) === true;
  let effectsOn = read('nightfall-effects', !window.matchMedia('(prefers-reduced-motion: reduce)').matches) === true;
  let game, audio, noiseBuffer, audioVoices = 0, audioAttempt = 0, activePanel = 'start-screen', helpReturn = 'start-screen', helpFocus = null;
  const lastSound = new Map();
  let feedbackUntil = 0, hudAt = -1, previous = performance.now(), attackPointer = null, attackPointerHeld = false;
  let movePointer = null, moveStart = null, moveTarget = null, stick = { x: 0, y: 0 }, keyAttack = false;
  const actionPointers = new Map();
  const keys = new Set();
  const record = () => $('record').textContent = best ? best.toLocaleString() : '—';
  function settings() {
    $('sound').textContent = '声音：' + (soundOn ? '开' : '关'); $('sound').setAttribute('aria-pressed', String(soundOn));
    $('effects').textContent = '特效：' + (effectsOn ? '标准' : '柔和'); $('effects').setAttribute('aria-pressed', String(effectsOn));
    document.body.classList.toggle('low-effects', !effectsOn);
  }
  function copyForDevice() {
    $('start-controls').textContent = touchLayout() ? '左拇指摇杆走位 · 右拇指斩击、格挡、闪避' : 'J按住蓄力、松开出刀 · K格挡 · 空格闪避';
    $('move-copy').innerHTML = touchLayout() ? '<strong>左摇杆 · 走位</strong>' : '<strong>摇杆走位</strong><small>W A S D</small>';
  }
  function updateMovement() {
    if (!game || game.state !== 'playing') return;
    let x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + stick.x;
    let y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + stick.y;
    const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
    game.movementInput(x, y);
  }
  function releaseCapture(element, pointer) { if (pointer !== null && element.hasPointerCapture?.(pointer)) element.releasePointerCapture(pointer); }
  function releaseMove() {
    const oldMove = movePointer, oldTarget = moveTarget;
    movePointer = null; moveStart = null; moveTarget = null; stick = { x: 0, y: 0 };
    $('move-pad').classList.remove('active'); $('joystick-nub').style.transform = 'translate(-50%,-50%)';
    if (oldTarget) releaseCapture(oldTarget, oldMove);
    updateMovement();
  }
  function cancelAttackPointer() {
    const oldAttack = attackPointer;
    attackPointer = null; attackPointerHeld = false;
    $('attack').classList.remove('pressed');
    releaseCapture($('attack'), oldAttack); game?.cancelAttack();
  }
  function clearInput() {
    releaseMove();
    const oldAttack = attackPointer;
    attackPointer = null; attackPointerHeld = keyAttack = false;
    keys.clear(); releaseCapture($('attack'), oldAttack);
    for (const [id, pointer] of actionPointers) { $(id).classList.remove('pressed'); releaseCapture($(id), pointer); }
    actionPointers.clear(); $('attack').classList.remove('pressed');
    game?.resetInput();
  }
  function show(panel) {
    activePanel = panel;
    panels.forEach(id => $(id).hidden = id !== panel);
    const playing = !panel && game?.state === 'playing';
    $('control-deck').inert = !playing; $('fight-cues').hidden = !playing; $('pause').disabled = !playing;
    if (panel) {
      clearInput();
      requestAnimationFrame(() => { if (activePanel === panel) $(panel).querySelector('button:not([disabled])')?.focus({ preventScroll: true }); });
    } else if (playing) canvas.focus({ preventScroll: true });
  }
  function feedback(message) {
    if (!message) return;
    $('battle-feedback').textContent = typeof message === 'string' ? message : message.text || '';
    $('battle-feedback').hidden = false; feedbackUntil = performance.now() + 1700;
  }
  async function initAudio() {
    if (!soundOn) return;
    const attempt = ++audioAttempt;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('audio unavailable');
      if (!audio) audio = new Audio();
      if (audio.state !== 'running') await audio.resume();
      if (attempt !== audioAttempt || !soundOn) return;
      if (audio.state !== 'running') throw new Error('audio suspended');
    } catch (_) {
      if (attempt !== audioAttempt || !soundOn) return;
      soundOn = false; save('nightfall-sound', false); settings(); feedback('声音未能启动，可点击「声音」重试');
    }
  }
  function tone(type) {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const alias = { slash: 'light1', block: 'guard', wave: 'ring', guardbreak: 'break', redwarning: 'warning' };
    const event = typeof type === 'string' ? type : type?.name;
    const name = alias[event] || event;
    const recipes = {
      light1: () => { note(390, 230, .075, .021, 'triangle'); noise(.065, .014, 'highpass', 1900); },
      light2: () => { note(510, 300, .08, .021, 'triangle'); noise(.075, .015, 'highpass', 2300); },
      finisher: () => { note(180, 74, .13, .032); note(640, 320, .08, .012, 'triangle'); noise(.11, .021, 'bandpass', 1300); },
      heavy: () => { note(130, 62, .17, .027); noise(.13, .021, 'lowpass', 1800); },
      hit: () => { note(170, 64, .065, .027); noise(.045, .018, 'bandpass', 900); },
      heavyHit: () => { note(82, 36, .16, .037); note(240, 90, .07, .018, 'triangle'); noise(.085, .025, 'lowpass', 1200); },
      stagger: () => { note(130, 44, .18, .034); noise(.09, .018, 'bandpass', 780); },
      counter: () => { note(620, 850, .13, .018, 'triangle'); note(1240, 980, .11, .012, 'sine', .025); },
      charge: () => note(320, 550, .12, .009),
      guard: () => { note(620, 380, .07, .014, 'triangle'); noise(.035, .01, 'highpass', 2400); },
      parry: () => { note(1160, 830, .16, .023, 'triangle'); note(1740, 1220, .20, .013, 'sine', .015); note(240, 100, .075, .018); noise(.045, .013, 'highpass', 2200); },
      dash: () => { note(280, 140, .09, .011); noise(.10, .013, 'highpass', 1100); },
      hurt: () => { note(100, 48, .14, .030); noise(.06, .014, 'lowpass', 900); },
      break: () => { note(230, 80, .22, .030); note(930, 520, .26, .016, 'triangle'); noise(.15, .024, 'bandpass', 1700); },
      execute: () => { note(66, 31, .42, .043); note(310, 64, .15, .022, 'triangle'); noise(.22, .027, 'lowpass', 1900); note(920, 480, .22, .012, 'sine', .10); },
      tell: () => note(540, 450, .085, .013, 'triangle'),
      warning: () => { note(135, 108, .12, .019); note(135, 94, .13, .017, 'sine', .16); },
      ring: () => { note(100, 50, .28, .025); noise(.26, .015, 'lowpass', 550); },
      phase: () => { note(85, 46, .33, .028); note(420, 260, .26, .011, 'triangle', .06); },
      win: () => { note(440, 440, .25, .017, 'sine'); note(550, 550, .28, .014, 'sine', .09); note(660, 660, .38, .016, 'sine', .18); },
      lose: () => { note(190, 145, .32, .018); note(130, 80, .38, .015, 'sine', .15); }
    };
    if (!recipes[name]) return;
    const now = audio.currentTime;
    if (now - (lastSound.get(name) ?? -Infinity) < (name === 'charge' ? .14 : .035)) return;
    lastSound.set(name, now);
    function connectVoice(source, duration, volume, delay, filter) {
      if (audioVoices >= 18) return false;
      const start = now + delay, gain = audio.createGain();
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      if (filter) { source.connect(filter); filter.connect(gain); } else source.connect(gain);
      gain.connect(audio.destination); audioVoices++;
      source.onended = () => { audioVoices = Math.max(0, audioVoices - 1); source.disconnect(); filter?.disconnect(); gain.disconnect(); };
      source.start(start); source.stop(start + duration + .015); return true;
    }
    function note(hz, end, duration, volume, wave = 'sine', delay = 0) {
      if (audioVoices >= 18) return;
      const oscillator = audio.createOscillator(); oscillator.type = wave;
      oscillator.frequency.setValueAtTime(hz, now + delay);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, end), now + delay + duration);
      connectVoice(oscillator, duration, volume, delay);
    }
    function noise(duration, volume, filterType, cutoff) {
      if (audioVoices >= 18 || !audio.createBufferSource || !audio.createBuffer) return;
      if (!noiseBuffer) {
        noiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * .45), audio.sampleRate);
        const channel = noiseBuffer.getChannelData(0); let seed = 17019;
        for (let i = 0; i < channel.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; channel[i] = seed / 2147483648 - 1; }
      }
      const source = audio.createBufferSource(); source.buffer = noiseBuffer;
      const filter = audio.createBiquadFilter?.();
      if (filter) { filter.type = filterType; filter.frequency.setValueAtTime(cutoff, now); filter.Q?.setValueAtTime(.6, now); }
      connectVoice(source, duration, volume, 0, filter);
    }
    try {
      recipes[name]();
    } catch (_) {}
  }
  function renderHud(s) {
    if (!s) return;
    const remaining = clamp(s.remaining ?? 60 - s.time, 0, 60), whole = Math.floor(remaining), tenth = Math.floor((remaining - whole) * 10);
    $('timer').innerHTML = String(whole).padStart(2, '0') + '<span>.' + tenth + '</span>';
    $('timer').parentElement.classList.toggle('urgent', remaining <= 10);
    $('health-fill').style.width = clamp(s.hp / s.maxHp) * 100 + '%';
    $('hp-text').textContent = `${Math.ceil(s.hp || 0)} / ${s.maxHp || 100}`;
    const bossPct = clamp(s.bossHp / s.bossMax);
    $('boss-fill').style.width = bossPct * 100 + '%'; $('boss-health-text').textContent = Math.ceil(bossPct * 100) + '%';
    $('phase').textContent = s.phaseName || ['一式 · 试锋', '二式 · 逐浪', '终式 · 断潮'][clamp(s.phase, 1, 3) - 1];
    const styleChosen = Boolean(s.styleName && s.state !== 'menu');
    $('boss-style').hidden = !styleChosen;
    $('boss-style').textContent = s.styleName || '';
    $('boss-style').setAttribute('title', s.styleHint || '');
    $('bottom-caption').textContent = styleChosen ? '本局刀路 · ' + s.styleName : '每一刀，都由你决定';
    $('bottom-caption').setAttribute('title', s.styleHint || '');
    $('posture-fill').style.width = clamp(s.posture / 100) * 100 + '%';
    $('posture-text').textContent = s.broken > 0 ? s.broken.toFixed(1) + '秒' : s.postureLock > 0 ? s.postureLock.toFixed(1) + '秒' : `${Math.round(s.posture || 0)} / 100`;
    $('posture-label').textContent = s.broken > 0 ? '破防' : s.postureLock > 0 ? '稳势' : '架势'; $('posture-label').parentElement.classList.toggle('broken', s.broken > 0);
    const holding = Boolean(s.attackHeld), charged = holding && s.charge >= 1, broken = s.broken > 0;
    $('charge-fill').style.height = clamp(s.charge) * 100 + '%';
    $('attack').classList.toggle('charged', charged); $('attack').classList.toggle('execution', broken);
    $('attack').classList.toggle('riposte', s.riposte > 0 && !broken); $('attack').classList.toggle('pressed', holding);
    $('attack-label').textContent = broken ? '处决' : charged ? '重斩' : '斩击';
    $('attack-caption').textContent = broken ? '点击处决 · E' : charged ? '松开 · 重斩' : holding ? '蓄力中…' : s.attackQueued ? '续招待发' : s.attackCd > .05 ? '收刀中…' : touchLayout() ? '按住蓄力' : 'J · 按住蓄力';
    $('attack').setAttribute('aria-label', broken ? '首领破防，点击处决，E键' : '出刀，按住蓄力，松开攻击');
    $('dash-caption').textContent = s.dashCd > .05 ? s.dashCd.toFixed(1) + '秒' : s.dodgeNow ? '现在闪避' : touchLayout() ? '红光躲开' : '空格';
    $('guard-caption').textContent = s.guardCd > .05 ? s.guardCd.toFixed(1) + '秒' : s.parryNow ? '现在格挡' : touchLayout() ? '金光弹反' : 'K · 弹反';
    $('guard').classList.toggle('timing-now', Boolean(s.parryNow) && s.guardCd <= .05);
    $('dash').classList.toggle('timing-now', Boolean(s.dodgeNow) && s.dashCd <= .05);
    $('dash').setAttribute('aria-disabled', String(s.dashCd > .05)); $('guard').setAttribute('aria-disabled', String(s.guardCd > .05));
    $('attack-tell').textContent = [s.pressureName || s.attackName || '观察首领起手', s.attackCombo].filter(Boolean).join(' · ');
    $('attack-tell').classList.toggle('danger', Boolean(s.danger));
    $('attack-tell').classList.toggle('opening', s.punish > 0 && !s.danger && !broken);
    $('context-hint').textContent = broken ? '首领破防！点击「处决」或 E' : s.attackName === '处决' ? '断潮处决 · 刀势未尽' : s.parryNow ? '现在格挡！迎住金色刀锋' : s.dodgeNow ? '现在闪避！避开红色危招' : s.riposte > 0 ? '弹反成功！下一刀强化 · 趁势反击' : s.punish > 0 ? '首领收势 · 轻斩连击或蓄力重斩追击' : s.hint || '按住蓄力，松开重斩 · 金色格挡 / 红色闪避';
    $('context-hint').classList.toggle('execution', broken);
  }
  function renderResult(data) {
    const stats = data.stats || {};
    best = Math.max(best, Number(data.score) || 0); save('nightfall-best-active60', best); record();
    const styleName = data.styleName || game?.snapshot().styleName || '';
    $('result-kicker').textContent = (data.win ? '潮落 / VICTORY' : '再来一刀 / TRY AGAIN') + (styleName ? ' · ' + styleName : '');
    $('result-title').textContent = data.win ? '一刀，断潮' : data.reason === 'timeout' || data.time >= 60 ? '潮声未歇' : '刀锋暂折';
    const dealt = Math.round((1 - clamp(data.bossHp / data.bossMax)) * 100);
    let review;
    if (!stats.hits) review = '靠近首领，先试轻斩三连。';
    else if (!stats.parries) review = '金光将满时格挡，再接强化追击。';
    else if (!stats.executions) review = '架势打满后，点「处决」爆发并回血。';
    else if (!stats.weakHits) review = '整套连势结束后，抓收势空隙追击。';
    else if (!stats.counters) review = '弹反后接下一刀，吃满强化追击。';
    else review = stats.maxCombo >= 3 ? '连斩与反击都已接上，下一局留意不同刀路。' : '轻斩第三刀更强，可在收势时补完整段。';
    $('result-desc').textContent = (data.win ? `用时 ${Number(data.time).toFixed(1)} 秒 · 余下 ${Math.ceil(data.hp || 0)} 点气血。` : `压制首领 ${dealt}% · ${data.reason === 'timeout' || data.time >= 60 ? '六十秒已到' : '气血耗尽'}。`) + review;
    $('result-parries').textContent = stats.parries || 0; $('result-executions').textContent = stats.executions || 0; $('result-score').textContent = (Number(data.score) || 0).toLocaleString();
    $('best-score').textContent = `本机最佳 ${best.toLocaleString()} · 命中 ${stats.hits || 0} 次` + (stats.weakHits ? ` · 破绽追击 ${stats.weakHits} 次` : '');
    $('frame-state').textContent = data.win ? '潮落，天明' : '等待再战';
    show('result-screen');
  }
  game = new Nightfall(canvas, { dpr: Math.min(window.devicePixelRatio || 1, 2), effects: effectsOn, onEvent(type, data) {
    if (type === 'sound') tone(data);
    else if (type === 'threat') { feedbackUntil = 0; $('battle-feedback').hidden = true; }
    else if (type === 'feedback') feedback(data);
    else if (type === 'start' || type === 'resume') { show(null); $('frame-state').textContent = '决斗进行中'; }
    else if (type === 'pause') { $('pause-stats').textContent = game ? `还剩 ${Math.max(0, game.snapshot().remaining).toFixed(1)} 秒 · 出刀之前，看准起手` : ''; show('pause-screen'); $('frame-state').textContent = '战斗已暂停'; }
    else if (type === 'result') renderResult(data);
  }});
  function begin() { clearInput(); feedbackUntil = 0; $('battle-feedback').hidden = true; initAudio(); game.start(); renderHud(game.snapshot()); show(null); }
  function home() { clearInput(); game.home(); $('frame-state').textContent = '等待拔刀'; show('start-screen'); renderHud(game.snapshot()); }
  function pause() { if (game.state === 'playing') game.pause(); }
  function resume() { if (game.state !== 'paused') return; clearInput(); initAudio(); game.resume(); show(null); }
  function openHelp() {
    if (activePanel === 'help-screen') return;
    helpFocus = document.activeElement;
    if (game.state === 'playing') { game.pause(); helpReturn = 'pause-screen'; }
    else helpReturn = activePanel || 'start-screen';
    show('help-screen');
  }
  function closeHelp() { show(helpReturn); requestAnimationFrame(() => { if (helpFocus?.isConnected && !helpFocus.closest('[hidden]')) helpFocus.focus({ preventScroll: true }); }); }
  $('start').addEventListener('click', begin); $('restart').addEventListener('click', begin); $('restart-paused').addEventListener('click', begin);
  $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
  $('return-title').addEventListener('click', home); $('exit-paused').addEventListener('click', home);
  $('home').addEventListener('click', event => { event.preventDefault(); home(); });
  $('help-top').addEventListener('click', openHelp); $('help-paused').addEventListener('click', openHelp); $('close-help').addEventListener('click', closeHelp);
  $('effects').addEventListener('click', () => { effectsOn = !effectsOn; game.effectsOn = effectsOn; game.options.effects = effectsOn; save('nightfall-effects', effectsOn); settings(); });
  $('sound').addEventListener('click', () => { soundOn = !soundOn; ++audioAttempt; save('nightfall-sound', soundOn); settings(); if (soundOn) initAudio(); });
  const act = fn => { if (game.state !== 'playing') return; initAudio(); updateMovement(); fn(); canvas.focus({ preventScroll: true }); };
  function immediateAction(id, action) {
    const button = $(id);
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || game.state !== 'playing' || actionPointers.has(id)) return;
      event.preventDefault(); actionPointers.set(id, event.pointerId); button.setPointerCapture(event.pointerId);
      button.classList.add('pressed'); act(action);
    });
    const release = event => {
      if (actionPointers.get(id) !== event.pointerId) return;
      actionPointers.delete(id); button.classList.remove('pressed'); releaseCapture(button, event.pointerId);
    };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', event => { if (event.detail === 0) act(action); });
  }
  immediateAction('guard', () => game.guard()); immediateAction('dash', () => game.dash());
  $('attack').addEventListener('pointerdown', event => {
    if (event.button !== 0 || attackPointer !== null || keyAttack || game.state !== 'playing') return;
    event.preventDefault(); initAudio(); attackPointer = event.pointerId; $('attack').setPointerCapture(event.pointerId);
    $('attack').classList.add('pressed');
    if (game.snapshot().broken > 0) { attackPointerHeld = false; game.execute(); } else { attackPointerHeld = true; game.attackDown(); }
  });
  $('attack').addEventListener('pointerup', event => {
    if (event.pointerId !== attackPointer) return;
    event.preventDefault(); const id = attackPointer, held = attackPointerHeld; attackPointer = null; attackPointerHeld = false;
    $('attack').classList.remove('pressed');
    releaseCapture($('attack'), id); if (held && game.state === 'playing') game.attackUp();
    if (game.state === 'playing') canvas.focus({ preventScroll: true });
  });
  $('attack').addEventListener('pointercancel', event => { if (event.pointerId === attackPointer) cancelAttackPointer(); });
  $('attack').addEventListener('lostpointercapture', event => { if (event.pointerId === attackPointer) cancelAttackPointer(); });
  $('attack').addEventListener('click', event => { if (event.detail === 0) act(() => { if (game.snapshot().broken > 0) game.execute(); else { game.attackDown(); game.attackUp(); } }); });
  function moveStick(event) {
    if (event.pointerId !== movePointer || !moveStart || game.state !== 'playing') return;
    event.preventDefault(); const dx = event.clientX - moveStart.x, dy = event.clientY - moveStart.y;
    const length = Math.hypot(dx, dy), clipped = Math.min(1, length / 44), strength = Math.max(0, (clipped - .1) / .9);
    stick = length > 0 ? { x: dx / length * strength, y: dy / length * strength } : { x: 0, y: 0 };
    $('joystick-nub').style.transform = `translate(calc(-50% + ${stick.x * 29}px),calc(-50% + ${stick.y * 29}px))`; updateMovement();
  }
  for (const target of [$('move-pad'), canvas]) {
    target.addEventListener('pointerdown', event => {
      if (event.button !== 0 || movePointer !== null || game.state !== 'playing') return;
      event.preventDefault(); canvas.focus({ preventScroll: true }); initAudio(); movePointer = event.pointerId; moveTarget = target;
      const rect = target.getBoundingClientRect();
      moveStart = target === canvas ? { x: event.clientX, y: event.clientY } : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      target.setPointerCapture(event.pointerId); $('move-pad').classList.add('active'); moveStick(event);
    });
    target.addEventListener('pointermove', moveStick);
    target.addEventListener('pointerup', event => { if (event.pointerId === movePointer) { event.preventDefault(); releaseMove(); } });
    target.addEventListener('pointercancel', event => { if (event.pointerId === movePointer) releaseMove(); });
    target.addEventListener('lostpointercapture', event => { if (event.pointerId === movePointer) releaseMove(); });
  }
  const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (event.key === 'Tab' && activePanel) {
      const nodes = [...$(activePanel).querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(el => !el.hidden && el.offsetParent !== null);
      if (nodes.length && (event.shiftKey && (document.activeElement === nodes[0] || !$(activePanel).contains(document.activeElement)) || !event.shiftKey && (document.activeElement === nodes.at(-1) || !$(activePanel).contains(document.activeElement)))) { event.preventDefault(); (event.shiftKey ? nodes.at(-1) : nodes[0]).focus(); }
      return;
    }
    if (key === 'escape' || key === 'p') {
      if (event.repeat) return;
      if (activePanel === 'help-screen') { event.preventDefault(); closeHelp(); }
      else if (game.state === 'playing') { event.preventDefault(); pause(); }
      else if (game.state === 'paused') { event.preventDefault(); resume(); }
      return;
    }
    if (game.state !== 'playing') return;
    if (movementKeys.has(key)) { event.preventDefault(); keys.add(key); updateMovement(); }
    else if (key === 'j') { event.preventDefault(); if (!event.repeat && !keyAttack && attackPointer === null) { keyAttack = true; initAudio(); if (game.snapshot().broken > 0) game.execute(); else game.attackDown(); } }
    else if (!event.repeat && ['k', ' ', 'e'].includes(key)) { event.preventDefault(); act(() => key === 'k' ? game.guard() : key === ' ' ? game.dash() : game.execute()); }
  });
  document.addEventListener('keyup', event => {
    const key = event.key.toLowerCase();
    if (movementKeys.has(key)) { keys.delete(key); updateMovement(); if (game.state === 'playing') event.preventDefault(); }
    else if (key === 'j' && keyAttack) { keyAttack = false; event.preventDefault(); if (game.state === 'playing') game.attackUp(); }
  });
  window.addEventListener('blur', () => { clearInput(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
  window.addEventListener('resize', copyForDevice);
  function frame(now) {
    const dt = Math.max(0, Math.min(.05, (now - previous) / 1000)); previous = now;
    game.update(dt); game.draw();
    if (now - hudAt > 45) { renderHud(game.snapshot()); hudAt = now; }
    if (feedbackUntil && now >= feedbackUntil) { $('battle-feedback').hidden = true; feedbackUntil = 0; }
    requestAnimationFrame(frame);
  }
  record(); settings(); copyForDevice(); renderHud(game.snapshot()); show('start-screen'); requestAnimationFrame(frame);
})();


