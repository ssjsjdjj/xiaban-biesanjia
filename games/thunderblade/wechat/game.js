/* 原创 60 秒主动战斗。与浏览器共用引擎，不依赖网络或外部素材。 */
const { Nightfall } = require('./engine.js');
const screen = wx.createCanvas();
const scene = wx.createCanvas();
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const W = info.windowWidth, H = info.windowHeight;
const dpr = Math.min(info.pixelRatio || 2, 2);
screen.width = Math.round(W * dpr); screen.height = Math.round(H * dpr);
const ctx = screen.getContext('2d');
const safe = info.safeArea || { top: 0, bottom: H };
const top = Math.max(12, (safe.top || 0) + 8);
const bottom = Math.max(10, H - (safe.bottom || H) + 8);
// Reserve one stable thumb zone on each side; the arena gives up height first.
const controlBottom = H - bottom, controlTop = controlBottom - 154;
const arenaTop = top + 116;
const arenaSize = Math.max(120, Math.min(W - 20, controlTop - arenaTop - 32));
const arenaX = (W - arenaSize) / 2;
const arenaY = arenaTop + Math.max(0, controlTop - arenaTop - 32 - arenaSize) * .32;
const hintY = controlTop - 27;
const controlY = controlBottom - 72;
const stickBase = { x: Math.min(82, W * .225), y: controlBottom - 70 };
const moveZone = { x: 8, y: controlTop, w: Math.min(144, W * .46) - 8, h: 154 };
const actionLayout = {
  attack: { x: W - 53, y: controlY, radius: 41 },
  guard: { x: W - 133, y: controlBottom - 118, radius: 29.5 },
  dash: { x: W - 133, y: controlBottom - 38, radius: 29.5 }
};
const color = { ink: '#081719', panel: '#102a2b', line: '#335451', pale: '#e4e5cb', muted: '#91aca4', cyan: '#9de3d2', gold: '#e8bd75', red: '#e89582' };
let best = 0;
try { best = Number(wx.getStorageSync('nightfall-gauntlet-best')) || 0; } catch (_) {}
let game = null, result = null, buttons = [], moveTouch = null, attackTouch = null;
let stickPoint = null, feedback = '', feedbackUntil = 0;
const actionTouches = new Map(), pulses = { guard: 0, dash: 0 };
let last = Date.now(), frameId = null;

function clearTouches() {
  moveTouch = null; attackTouch = null; stickPoint = null; actionTouches.clear();
  if (game) game.resetInput();
}
game = new Nightfall(scene, { dpr: 1, onEvent(type, data) {
  if (['start', 'pause', 'resume', 'result', 'intermission'].includes(type)) clearTouches();
  if (type === 'feedback') { feedback = String(data || ''); feedbackUntil = Date.now() + 1500; }
  if (type === 'threat') { feedback = ''; feedbackUntil = 0; }
  if (type === 'result') {
    result = data;
    const key = data.challenge ? 'nightfall-gauntlet-best' : 'nightfall-active60-best';
    try { best = Number(wx.getStorageSync(key)) || 0; } catch (_) { best = 0; }
    best = Math.max(best, data.score || 0);
    try { wx.setStorageSync(key, best); } catch (_) {}
  }
}});

function text(value, x, y, size = 14, fill = color.pale, align = 'left', maxWidth) {
  ctx.fillStyle = fill; ctx.font = `${size}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (maxWidth) ctx.fillText(String(value), x, y, maxWidth); else ctx.fillText(String(value), x, y);
}
function wrap(value, x, y, width, size = 13, fill = color.muted, leading = 22) {
  ctx.font = `${size}px sans-serif`; let line = '', row = 0;
  for (const char of String(value)) {
    if (line && ctx.measureText(line + char).width > width) { text(line, x, y + row++ * leading, size, fill); line = ''; }
    line += char;
  }
  if (line) text(line, x, y + row++ * leading, size, fill);
  return row * leading;
}
function bar(x, y, w, ratio, fill, height = 5) {
  ctx.fillStyle = '#243d3b'; ctx.fillRect(x, y, w, height);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio || 0)), height);
}
function rectButton(label, x, y, w, h, action, primary = false) {
  ctx.fillStyle = primary ? color.gold : color.panel; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = primary ? color.gold : color.line; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  text(label, x + w / 2, y + h / 2, 16, primary ? color.ink : color.pale, 'center');
  buttons.push({ shape: 'rect', x, y, w, h, action });
}
function roundButton(key, label, sub, x, y, radius, action, primary = false, charge = 0, ready = true, hold = false, cue = false) {
  const pressed = primary ? attackTouch !== null : [...actionTouches.values()].includes(key) || Date.now() < pulses[key];
  ctx.fillStyle = pressed ? primary ? '#577463' : '#405343' : primary ? '#304d43' : color.panel;
  ctx.strokeStyle = ready ? primary ? color.gold : color.cyan : color.line;
  ctx.lineWidth = primary ? 2 : 1;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (cue) {
    ctx.strokeStyle = key === 'guard' ? color.gold : color.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, radius + 4, 0, Math.PI * 2); ctx.stroke();
  }
  if (charge > 0) {
    ctx.strokeStyle = color.gold; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, charge)); ctx.stroke();
  }
  text(label, x, y - 5, primary ? 22 : 16, ready ? primary ? color.gold : color.pale : color.muted, 'center');
  text(sub, x, y + (primary ? 21 : 16), primary ? 10 : 9, color.muted, 'center');
  buttons.push({ shape: 'circle', key, x, y, radius, action, hold });
}
function begin(challenge = true) { clearTouches(); result = null; feedback = ''; buttons = []; if (challenge) game.startChallenge(); else game.start(); }
function restart() { begin(Boolean(game.snapshot().challenge)); }
function continueStage(choice) { clearTouches(); feedback = ''; buttons = []; game.continueChallenge(choice); }
function home() { clearTouches(); result = null; feedback = ''; buttons = []; game.home(); try { best = Number(wx.getStorageSync('nightfall-gauntlet-best')) || 0; } catch (_) {} }
function attack() {
  if (game.snapshot().broken > 0) { game.execute(); return false; }
  return game.attackDown() !== false && game.state === 'playing';
}
function drawHud(s) {
  text(s.challenge ? `${s.stageNumber}/${s.stageCount}境 · ${s.sceneName}` : '惊雷 · 断潮', 16, top + 10, 14, color.pale, 'left', W * .41);
  text(`${Math.ceil(s.remaining || 0).toString().padStart(2, '0')}`, W / 2, top + 10, 30, s.remaining <= 10 ? color.red : color.gold, 'center');
  if (game.state === 'playing') rectButton('Ⅱ', W - 53, top - 6, 37, 33, () => game.pause());
  text(`气血 ${Math.ceil(s.hp || 0)}/${s.maxHp || 100}`, 16, top + 38, 11, color.muted);
  bar(16, top + 50, W - 32, (s.hp || 0) / (s.maxHp || 100), color.cyan, 4);
  text(`${s.bossName || s.styleName || '裂潮'} · ${s.phaseName || '试锋'}`, 16, top + 71, 11, color.pale, 'left', W - 72);
  text(`${Math.ceil(100 * (s.bossHp || 0) / (s.bossMax || 1))}%`, W - 16, top + 71, 12, color.muted, 'right');
  bar(16, top + 82, W - 32, (s.bossHp || 0) / (s.bossMax || 1), color.red, 5);
  text(s.broken > 0 ? `破防 ${s.broken.toFixed(1)}s · 按「决」处决` : s.postureLock > 0 ? `稳势 ${s.postureLock.toFixed(1)}s` : s.bossId === 'colossus' ? s.armorOpen > 0 ? `破甲 ${s.armorOpen.toFixed(1)}s` : `重甲 · 再满蓄 ${s.armor || 0} 次` : '架势 · 打满触发破防', 16, top + 102, 11, s.broken > 0 ? color.gold : color.muted);
  bar(W * .53, top + 99, W * .47 - 16, s.posture / 100, color.gold, 4);
}
function drawControls(s) {
  const sx = stickBase.x, sy = stickBase.y;
  ctx.strokeStyle = moveTouch === null ? color.line : color.cyan; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(21,49,48,.6)';
  ctx.beginPath(); ctx.arc(sx, sy, 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#577e7350'; ctx.beginPath(); ctx.arc(sx, sy, 27, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = moveTouch === null ? '#668b80' : '#a1d0ba'; ctx.beginPath(); ctx.arc(stickPoint ? stickPoint.x : sx, stickPoint ? stickPoint.y : sy, 18, 0, Math.PI * 2); ctx.fill();
  text('摇杆走位', sx, controlBottom - 12, 11, color.muted, 'center');
  const a = actionLayout.attack, g = actionLayout.guard, d = actionLayout.dash;
  roundButton('attack', s.broken > 0 ? '处决' : '斩击', s.broken > 0 ? '立即点击' : s.charge >= 1 ? '松手重斩' : s.attackQueued ? '续招待发' : s.attackCd > .05 ? '收刀中' : s.riposte > 0 ? '反击强化' : '按住蓄力', a.x, a.y, a.radius, attack, true, s.charge, true, true);
  roundButton('guard', '格挡', s.guardCd > .05 ? `${s.guardCd.toFixed(1)}s` : s.parryNow ? '现在格挡' : '点按', g.x, g.y, g.radius, () => { pulses.guard = Date.now() + 130; game.guard(); }, false, 0, s.guardCd <= .05, false, !!s.parryNow);
  roundButton('dash', '闪避', s.dashCd > .05 ? `${s.dashCd.toFixed(1)}s` : s.dodgeNow ? '现在闪避' : '点按', d.x, d.y, d.radius, () => { pulses.dash = Date.now() + 130; game.dash(); }, false, 0, s.dashCd <= .05, false, !!s.dodgeNow);
}
function overlay() { ctx.fillStyle = 'rgba(5,18,20,.94)'; ctx.fillRect(0, 0, W, H); }
function drawMenu() {
  overlay(); const x = 27, middle = Math.max(top + 62, Math.min(H * .22, H - bottom - 428));
  text('原创动作试玩 / 三境连战', x, middle - 35, 12, color.gold);
  text('惊 雷', x, middle + 15, 48, color.pale); text('断 潮', x, middle + 65, 32, color.pale);
  text('雨庭弹反，竹海走位，熔炉破甲。', x, middle + 107, 14, color.muted);
  let y = middle + 147;
  text('斩', x, y, 21, color.cyan); text('轻点连斩，按住蓄力再松手', x + 34, y, 13, color.pale, 'left', W - 88);
  text('格', x, y + 34, 21, color.gold); text('金光将满时格挡，精准反击', x + 34, y + 34, 12, color.pale, 'left', W - 88);
  text('闪', x, y + 68, 21, color.red); text('红色攻击不可格挡，用闪避', x + 34, y + 68, 12, color.pale, 'left', W - 88);
  y += 113;
  rectButton('拔刀 · 开始三境连战 →', x, y, W - 2 * x, 48, () => begin(true), true);
  rectButton('先练一场 · 60秒剑客', x, y + 59, W - 2 * x, 38, () => begin(false));
  text(`连战最佳  ${best}`, W / 2, y + 119, 12, color.muted, 'center');
}
function drawPause(s) {
  overlay(); const x = 30, y = Math.max(top + 60, Math.min(H * .23, H - bottom - 400));
  text('雨声未歇', x, y, 36); text(`战斗已暂停 · 还剩 ${Math.ceil(s.remaining)} 秒`, x, y + 42, 14, color.muted);
  wrap('左手摇杆走位。轻点斩击，按住蓄力；金光格挡，红光闪避。破防后点击处决。', x, y + 83, W - x * 2, 14, color.pale, 23);
  rectButton('继续决战 →', x, y + 166, W - x * 2, 48, () => game.resume(), true);
  rectButton('重新开始', x, y + 226, W - x * 2, 44, restart);
  rectButton('返回题名', x, y + 282, W - x * 2, 44, home);
}
function drawResult() {
  overlay(); const x = 28, y = Math.max(top + 80, Math.min(H * .22, H - bottom - 438)), r = result || {}, stats = r.stats || {};
  const pressure = Math.round(100 * (1 - (r.bossHp || 0) / (r.bossMax || 1)));
  text((r.styleName ? r.styleName + ' · ' : '') + (r.win ? '潮退 · 刃归鞘' : '再看清一招'), x, y - 30, 12, color.gold, 'left', W - x * 2);
  text(r.challenge ? r.win ? '三境尽破' : `止步第 ${Math.min((r.cleared || 0) + 1, r.stageCount || 3)} 境` : r.win ? '一刀断潮' : r.reason === 'timeout' || r.time >= 60 ? '时尽，潮未平' : '此战未尽', x, y + 16, 34, color.pale, 'left', W - x * 2);
  text(r.challenge ? `已破 ${r.cleared || 0}/${r.stageCount || 3} 境 · ${(r.time || 0).toFixed(1)}秒` : r.win ? `用时 ${(r.time || 0).toFixed(1)} 秒` : `首领压制 ${pressure}%`, x, y + 65, 17, color.cyan);
  text(`反击 ${stats.parries || 0}   ·   处决 ${stats.executions || 0}   ·   命中 ${stats.hits || 0}`, x, y + 101, 14, color.pale, 'left', W - x * 2);
  text(`战绩 ${r.score || 0}   /   本机最佳 ${best}`, x, y + 132, 14, color.muted);
  wrap(r.win ? '抓住了破绽。再来一次，试试更快断潮。' : '金光将满时再格挡。破防后点击处决，可以回血。', x, y + 170, W - x * 2, 13, color.muted, 23);
  rectButton(r.challenge ? '重闯三境 →' : '再练一场 →', x, y + 226, W - x * 2, 52, restart, true);
  rectButton('返回题名', x, y + 294, W - x * 2, 44, home);
}
function drawIntermission(s) {
  overlay(); const x = 28, y = Math.max(top + 40, Math.min(H * .19, H - bottom - 385)), next = s.nextBoss || {};
  text(`已破 ${s.cleared} / ${s.stageCount} 境 · 场间整备`, x, y, 12, color.gold);
  text(next.name || '下一境', x, y + 40, 30, color.pale, 'left', W - x * 2);
  wrap([next.sceneName, next.hint].filter(Boolean).join(' · '), x, y + 80, W - x * 2, 13, color.muted, 22);
  text(`气血 ${Math.ceil(s.hp)}/${s.maxHp} · 强化 +${Math.round((s.powerBonus || 0) * 100)}%`, x, y + 139, 14, color.cyan);
  text('选一项整备，带着当前气血继续', x, y + 168, 11, color.muted);
  const healed = Math.min(32, s.maxHp - s.hp);
  rectButton(`调息 · 回血 +${healed} → ${Math.min(s.maxHp, s.hp + 32)}`, x, y + 197, W - x * 2, 48, () => continueStage('heal'), true);
  rectButton(`砺刃 · 余下战斗伤害 +12%`, x, y + 257, W - x * 2, 48, () => continueStage('power'));
  rectButton('结束挑战 · 返回题名', x, y + 321, W - x * 2, 38, home);
}
function render() {
  game.draw(); const s = game.snapshot(); buttons = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = color.ink; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(scene, arenaX, arenaY, arenaSize, arenaSize);
  if (game.state === 'menu') { drawMenu(); return; }
  drawHud(s);
  if (game.state === 'playing') {
    const message = Date.now() < feedbackUntil ? feedback : s.broken > 0 ? '架势已破 · 点击「处决」' : s.inputHint || s.hint || '摇杆走位 · 金光格挡 · 红光闪避';
    text(message, W / 2, hintY + 8, 11, s.broken > 0 ? color.gold : color.pale, 'center', W - 24);
    drawControls(s);
  } else if (game.state === 'paused') drawPause(s);
  else if (game.state === 'intermission') drawIntermission(s);
  else if (game.state === 'won' || game.state === 'lost') drawResult();
}
function point(touch) { return { x: Number(touch.clientX ?? touch.x), y: Number(touch.clientY ?? touch.y) }; }
function hitButton(p) {
  return buttons.find(b => b.shape === 'circle' ? Math.hypot(p.x - b.x, p.y - b.y) <= b.radius : p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
}
function move(p) {
  const dx = p.x - stickBase.x, dy = p.y - stickBase.y, length = Math.hypot(dx, dy), limit = 44, dead = 4.4;
  const power = length <= dead ? 0 : (Math.min(length, limit) - dead) / (limit - dead);
  const nx = length ? dx / length : 0, ny = length ? dy / length : 0;
  stickPoint = { x: stickBase.x + nx * power * 26, y: stickBase.y + ny * power * 26 };
  game.movementInput(nx * power, ny * power);
}
wx.onTouchStart(event => {
  const initialState = game.state;
  for (const touch of event.changedTouches || []) {
    const p = point(touch), button = hitButton(p);
    if (button) {
      if (button.hold) {
        if (attackTouch === null && game.state === 'playing' && button.action()) attackTouch = touch.identifier;
      } else { if (button.key) actionTouches.set(touch.identifier, button.key); button.action(); }
      if (game.state !== initialState) break;
      continue;
    }
    if (game.state === 'playing' && moveTouch === null && p.x >= moveZone.x && p.x <= moveZone.x + moveZone.w && p.y >= moveZone.y && p.y <= moveZone.y + moveZone.h) {
      moveTouch = touch.identifier;
      move(p);
    }
  }
});
wx.onTouchMove(event => {
  if (game.state !== 'playing') return;
  const touch = (event.touches || []).find(t => t.identifier === moveTouch);
  if (touch) move(point(touch));
});
wx.onTouchEnd(event => {
  const ended = event.changedTouches || [];
  for (const touch of ended) actionTouches.delete(touch.identifier);
  if (ended.some(t => t.identifier === moveTouch)) { moveTouch = null; stickPoint = null; game.movementInput(0, 0); }
  if (ended.some(t => t.identifier === attackTouch)) { attackTouch = null; if (game.state === 'playing') game.attackUp(); }
});
wx.onTouchCancel(event => {
  const canceled = event && event.changedTouches;
  const all = !canceled || canceled.length === 0;
  if (all) actionTouches.clear(); else for (const touch of canceled) actionTouches.delete(touch.identifier);
  if (moveTouch !== null && (all || canceled.some(t => t.identifier === moveTouch))) { moveTouch = null; stickPoint = null; game.movementInput(0, 0); }
  if (attackTouch !== null && (all || canceled.some(t => t.identifier === attackTouch))) { attackTouch = null; game.cancelAttack(); }
});
function loop() {
  const now = Date.now(); game.update(Math.min(.05, Math.max(0, (now - last) / 1000))); last = now;
  render(); frameId = requestAnimationFrame(loop);
}
wx.onHide(() => {
  clearTouches(); if (game.state === 'playing') game.pause();
  if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
});
wx.onShow(() => { if (frameId === null) { last = Date.now(); loop(); } });
loop();
