'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const install = require('./dist/duel-art.js');
function context() {
  let styles = { globalAlpha: 1 }, stack = [], calls = [];
  const methods = new Set(['save','restore','translate','scale','rotate','beginPath','moveTo','lineTo','closePath','fill','stroke','arc','setLineDash','fillText','fillRect']);
  return new Proxy({ calls, get depth() { return stack.length; }, clear() { calls.length = 0; } }, {
    get(target, key) {
      if (key in target) return target[key];
      if (methods.has(key)) return (...args) => {
        for (const value of args.flat()) if (typeof value === 'number') assert.ok(Number.isFinite(value), `nonfinite ${key}`);
        if (key === 'save') stack.push({ ...styles });
        if (key === 'restore') { assert.ok(stack.length, 'unbalanced restore'); styles = stack.pop(); }
        if (key === 'arc') assert.ok(args[2] > 0, 'arc radius');
        calls.push({ key, args });
      };
      return styles[key];
    },
    set(_target, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), `nonfinite ${String(key)}`); styles[key] = value; return true; }
  });
}
class Scene {
  constructor(reduced = false) {
    this.ctx = context(); this.options = { effects: !reduced }; this.clock = 2.3; this.time = 2.3; this.state = 'playing';
    this.player = { x: 360, y: 450, angle: -Math.PI / 2, hp: 100, maxHp: 100, inv: 0, guard: 0, guardAge: 0, dash: 0, dodgeWindow: 0 };
    this.boss = { x: 360, y: 280, angle: Math.PI / 2, r: 44, hp: 4000, maxHp: 5200, flash: 0 };
    this.input = { x: 1, y: 0 }; this.attackHeld = false; this.chargeTime = 0; this.combo = 1; this.broken = 0; this.phase = 2; this.executionTime = 0; this.riposte = 0; this.effects = []; this.texts = []; this.trails = [];
  }
  circle(x, y, r, fill, stroke, width = 1) { const c = this.ctx; c.beginPath(); c.arc(x, y, Math.max(.1, r), 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  text(value, x, y) { this.ctx.fillText(String(value), x, y); }
}
install(Scene);
const state = g => JSON.stringify({ player:g.player,boss:g.boss,input:g.input,actor:g.actor,bossPose:g.bossPose,attack:g.attack,effects:g.effects,attackHeld:g.attackHeld,chargeTime:g.chargeTime,phase:g.phase,broken:g.broken,style:g.style });
function draw(g, fn) { const before = state(g); fn(); assert.equal(state(g), before, 'art must not alter combat state'); assert.equal(g.ctx.depth, 0, 'balanced save/restore'); assert.equal(g.ctx.globalAlpha, 1, 'restored opacity'); }
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
check('CommonJS and browser-global installation are idempotent', () => {
  const before = Scene.prototype.drawPlayer; install(Scene); assert.equal(Scene.prototype.drawPlayer, before);
  const sandbox = {}; vm.runInNewContext(fs.readFileSync(require.resolve('./dist/duel-art.js'),'utf8'), sandbox);
  assert.equal(typeof sandbox.NightfallArt, 'function');
});
check('all player poses, charge and ghost trails render without changing combat', () => {
  for (const reduced of [false,true]) for (const action of ['idle','light1','light2','finisher','heavy','guard','parry','dash','hurt','execute']) for (const phase of [0,.3,.8,1]) {
    const g = new Scene(reduced); g.actor = {action,age:phase*.4,duration:.4,angle:-1,force:1};
    if (action === 'guard') g.player.guard = .3;
    if (action === 'dash') g.player.dash = .1;
    draw(g, () => g.drawPlayer(g.player)); draw(g, () => g.drawPlayer({ ...g.player, x: 340 }, true));
  }
  for (const charge of [0,.26,.52,1.2]) { const g=new Scene(); g.attackHeld=true;g.chargeTime=charge;draw(g,()=>g.drawPlayer(g.player)); }
});
check('boss windups, recoveries, phases and breaks have finite balanced drawing', () => {
  for (const reduced of [false,true]) for (const type of ['sweep','twin','rush','leap','ring','thrust','cross','cleave','feint','geyser']) for (const phase of [0,.4,.9,1]) {
    const g = new Scene(reduced); g.attack={type,angle:1.2,elapsed:phase,duration:1,red:['leap','ring','cleave','geyser'].includes(type)};
    draw(g,()=>g.drawBoss()); g.attack=null; g.bossPose={action:type,age:phase*.4,duration:.4,angle:1.2}; draw(g,()=>g.drawBoss());
  }
  for (const phase of [1,2,3]) { const g=new Scene();g.phase=phase;g.broken=2;draw(g,()=>g.drawBoss()); }
});
check('new fan and lane telegraphs use the explicit damage geometry', () => {
  const g=new Scene(); const a={type:'cleave',x:300,y:250,angle:.6,radius:235,halfAngle:1.8,elapsed:.6,duration:1,red:true};
  draw(g,()=>g.drawTell(a));
  assert.ok(g.ctx.calls.some(c=>c.key==='arc'&&c.args[0]===300&&c.args[1]===250&&c.args[2]===235&&c.args[3]===a.angle-a.halfAngle&&c.args[4]===a.angle+a.halfAngle));
  g.ctx.clear(); draw(g,()=>g.drawTell({type:'thrust',x:100,y:100,angle:0,ex:400,ey:100,halfWidth:50,elapsed:.8,duration:1,red:false}));
  assert.ok(g.ctx.calls.some(c=>c.key==='moveTo'&&c.args[0]===100&&c.args[1]===50));
  assert.ok(g.ctx.calls.some(c=>c.key==='arc'&&c.args[0]===400&&c.args[1]===100&&c.args[2]===50&&c.args[3]===-Math.PI/2&&c.args[4]===Math.PI/2));
});
check('rush and thrust warnings include the actual capsule end caps in both modes', () => {
  for(const reduced of [false,true]) for(const [type,halfWidth] of [['rush',63],['thrust',50]]) {
    const g=new Scene(reduced), a={type,x:140,y:160,ex:440,ey:160,angle:0,halfWidth,elapsed:.7,duration:1,red:false};
    draw(g,()=>g.drawTell(a));
    const arcs=g.ctx.calls.filter(c=>c.key==='arc'&&c.args[2]===halfWidth);
    assert.ok(arcs.some(c=>c.args[0]===440&&c.args[1]===160&&c.args[3]===-Math.PI/2&&c.args[4]===Math.PI/2));
    assert.ok(arcs.some(c=>c.args[0]===140&&c.args[1]===160&&c.args[3]===Math.PI/2&&c.args[4]===Math.PI*1.5));
    assert.ok(g.ctx.calls.some(c=>c.key==='fill'),'capsule must be a filled warning region');
  }
});
check('leap without hazard points shows one marked target circle', () => {
  for(const reduced of [false,true]) {
    const g=new Scene(reduced), a={type:'leap',x:360,y:280,tx:320,ty:430,radius:123,elapsed:.8,duration:1,red:true};
    draw(g,()=>g.drawTell(a));
    assert.equal(g.ctx.calls.filter(c=>c.key==='arc'&&c.args[0]===320&&c.args[1]===430&&c.args[2]===123).length,1);
    assert.equal(g.ctx.calls.filter(c=>c.key==='translate'&&c.args[0]===320&&c.args[1]===430).length,1,'one danger marker');
  }
});
check('three styles have distinct idle blade and foot poses without altering state', () => {
  const captures=['hunter','warden','trickster'].map(id=>{const g=new Scene();g.style={id};draw(g,()=>g.drawBoss());return g.ctx.calls;});
  const rotations=captures.map(c=>c.filter(v=>v.key==='rotate').map(v=>v.args[0]));
  assert.notDeepEqual(rotations[0],rotations[1]);assert.notDeepEqual(rotations[1],rotations[2]);
  const feet=captures.map(c=>c.filter(v=>v.key==='lineTo'&&[49,61,64].includes(v.args[1])).slice(0,4));
  assert.notDeepEqual(feet[0],feet[1]);assert.notDeepEqual(feet[1],feet[2]);
});
check('three geysers retain distinct marked areas in gentle effects mode', () => {
  const g=new Scene(true), points=[{x:120,y:220},{x:360,y:390},{x:580,y:250}];
  draw(g,()=>g.drawTell({type:'geyser',x:360,y:280,points,radius:68,elapsed:.95,duration:1,red:true}));
  for(const p of points) assert.ok(g.ctx.calls.some(c=>c.key==='arc'&&c.args[0]===p.x&&c.args[1]===p.y&&c.args[2]===68));
});
check('impact effects are bounded and gentle mode removes optional sparks', () => {
  for(const reduced of [false,true]) {
    const g=new Scene(reduced);
    for(const kind of ['slash','line','burst','impact','sparks','execute']) g.effects.push({kind,x:360,y:280,ex:500,ey:400,angle:.5,radius:160,color:'#f5d391',heavy:true,count:1000,seed:42,life:.5,max:.8});
    draw(g,()=>g.drawEffects()); assert.ok(g.ctx.calls.length<650,'bounded particle work');
    g.ctx.clear();g.effects=[{kind:'sparks',x:360,y:280,angle:0,count:1000,seed:1,life:.5,max:.8}];draw(g,()=>g.drawEffects());
    if(reduced) assert.equal(g.ctx.calls.length,0);else assert.equal(g.ctx.calls.filter(x=>x.key==='stroke').length,16);
  }
});
check('all tell types stay visible in both effects modes', () => {
  for(const reduced of [false,true]) for(const type of ['sweep','twin','rush','leap','ring','thrust','cross','cleave','feint','geyser']) {
    const g=new Scene(reduced);draw(g,()=>g.drawTell({type,x:360,y:280,tx:360,ty:450,angle:1.2,ex:500,ey:510,elapsed:.95,duration:1,red:['leap','ring','cleave','geyser'].includes(type),comboIndex:1,comboTotal:2}));
    assert.ok(g.ctx.calls.some(x=>x.key==='stroke'));
  }
});
console.log(`Duel art checks: ${passed} groups passed.`);
