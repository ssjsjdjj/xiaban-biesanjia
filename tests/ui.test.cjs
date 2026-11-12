'use strict';
// Exercise the real app handlers against a controlled engine and a minimal DOM.
// Physics belongs in engine.test.cjs; responsive layout still needs browser QA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),assert=require('node:assert/strict');
const base=path.join(__dirname,'../dist');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),app=fs.readFileSync(path.join(base,'app.js'),'utf8');
function makeHarness(storage={},options={}){
 let clockDay=options.day||'2026-10-30',engine; const timers=[],events={},data=new Map(Object.entries(storage)),audioCalls={oscillators:0};
 function element(id,classes=''){
  const classSet=new Set(classes.split(/\s+/).filter(Boolean));
  return {id,textContent:'',innerHTML:'',style:{setProperty(name,value){this[name]=value}},disabled:false,open:false,clientWidth:336,clientHeight:600,offsetWidth:168,offsetTop:145,offsetHeight:72,scrollTop:0,scrollLeft:0,dataset:{},children:{},attrs:{},listeners:{},classList:{add(...a){a.forEach(x=>classSet.add(x))},remove(...a){a.forEach(x=>classSet.delete(x))},contains(x){return classSet.has(x)},toggle(x,v){if(v??!classSet.has(x)){classSet.add(x);return true}classSet.delete(x);return false}},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},querySelector(s){return this.children[s]??=element(s)},querySelectorAll(){return[]},addEventListener(k,f){this.listeners[k]=f},focus(){},getContext(){return new Proxy({},{get:(t,k)=>t[k]||(()=>new Proxy({},{get:()=>()=>{}}))})},getBoundingClientRect(){return{width:336,height:600}},setPointerCapture(){},showModal(){this.open=true},close(){this.open=false},scrollIntoView(){},scrollTo(){this.scrollTop=0}};
 }
 const all={};for(const tag of html.match(/<[^>]+\bid="[^"]+"[^>]*>/g)||[]){const id=tag.match(/\bid="([^"]+)"/)[1],classes=tag.match(/\bclass="([^"]*)"/)?.[1]||'';all[id]=element(id,classes)}
 const modes=['tutorial','normal','daily'].map(m=>Object.assign(element(m),{dataset:{mode:m}})),dots=[element('dot0'),element('dot1')];
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clockDay+'T04:00:00Z']))}static now(){return new Date(clockDay+'T04:00:00Z').getTime()}}
 class EngineStub{
  constructor(cb){engine=this;this.cb=cb;this.resets=[];this.reset('normal');this.status='ready'}
  reset(mode='normal',dateSeed,opts={}){this.mode=mode;this.dateSeed=dateSeed||clockDay;this.variant=opts.variant??0;this.elapsed=0;this.duration=mode==='tutorial'?0:60;this.status='playing';this.paused=false;this.overrides={};this.resets.push({mode,dateSeed:this.dateSeed,variant:this.variant,opts:{...opts}});return this.snapshot()}
  snapshot(){const route={name:this.mode==='daily'?'测试同题'+this.dateSeed:'测试路线'+this.variant,tagline:'metadata '+this.mode+' '+(this.mode==='daily'?this.dateSeed:this.variant),variant:this.variant,options:[0,1,2].map(variant=>({variant,name:'测试路线'+variant,tagline:'metadata normal '+variant})),next:this.mode==='normal'?{name:'测试路线'+((this.variant+1)%3),tagline:'metadata normal '+((this.variant+1)%3),variant:(this.variant+1)%3}:null};const job={minimumMet:false,required:4,total:6,sent:0,remainingDeliveries:6,airborneUnsigned:0,retryCount:0,unthrownCount:0,retryExpiredCount:0,unavailableItems:[],cutoffSeconds:39,phase:'delivery',detail:'等待模拟投递'};return {route,job,catchDetails:[],status:this.status,mode:this.mode,elapsed:this.elapsed,duration:this.duration,dateSeed:this.dateSeed,truck:{x:210,y:586,vx:0},cargo:[],lives:3,requiredCatches:4,score:0,catches:0,saves:0,perfectCatches:0,streak:0,assists:0,retries:0,tail:{active:false,completed:false,step:1,variant:this.variant,bonus:0},tutorial:this.mode==='tutorial'?{step:1}:null,...this.overrides}}
  pause(v){this.paused=v}releaseControl(){this.releases=(this.releases||0)+1}step(dt){if(!this.paused)this.elapsed+=dt}setTarget(x){this.target=x}triggerChaos(){return !this.paused}
 }
 const document={body:element('body'),hidden:false,getElementById:id=>{if(!all[id])throw Error('Missing HTML ID '+id);return all[id]},querySelector:s=>element(s),querySelectorAll:s=>s==='[data-mode]'?modes:s==='#tailDots i'?dots:[],addEventListener:(k,f)=>events[k]=f};
 class AudioStub{constructor(){this.currentTime=0;this.destination={}}createOscillator(){audioCalls.oscillators++;return{frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}}
 const context={console,Math,Date:ClockDate,Set,performance:{now:()=>0},setTimeout:f=>timers.push(f),clearTimeout(){},matchMedia:q=>({matches:q.includes('prefers-reduced-motion')?Boolean(options.reducedMotion):Boolean(options.mobile)&&q.includes('max-width')}),localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))},requestAnimationFrame(){},document,window:{devicePixelRatio:1,AudioContext:AudioStub,addEventListener:(k,f)=>events[k]=f,scrollTo(){}},ShiftEngine:EngineStub};
 const instrumented=app.replace(/\}\)\(\);\s*$/,"window.__review={start,finish,pause,goHome,playReplay,stopReplay,nextGoal,recordKey,bestLabel,refreshMode,hud,state:()=>({mode,activeVariant,snap,menuOpen,isPaused,runStage}),effects:()=>({particles:particles.length,texts:texts.length}),sync:()=>{snap=engine.snapshot()},accident:v=>{lastAccident=v}};})();");
 vm.runInNewContext(instrumented,context,{filename:'app.js'});
 const review=context.window.__review;if(!review)throw Error('Failed to instrument app closure');
 const flush=()=>{while(timers.length)timers.shift()()};
 function force(overrides={}){if(overrides.status)engine.status=overrides.status;if(overrides.elapsed!==undefined)engine.elapsed=overrides.elapsed;engine.overrides={...engine.overrides,...overrides};review.sync()}
 function end(overrides={}){force({status:'lose',elapsed:55,finishReason:'crash',catches:5,lives:0,score:300,lastCrash:{cargoType:'fish',cause:'从左侧滑落',advice:'向左轻挪'},...overrides});engine.cb({type:engine.status});flush()}
 return {all,engine,review,events,data,document,audioCalls,click:id=>{if(typeof all[id]?.onclick!=='function')throw Error('Unbound button '+id);all[id].onclick()},key:key=>events.keydown({key,repeat:false,preventDefault(){}}),flush,force,end,setDay:v=>{clockDay=v},latest:()=>engine.resets.at(-1)};
}
const same=(a,b)=>a.mode===b.mode&&a.variant===b.variant&&(a.mode!=='daily'||a.dateSeed===b.dateSeed);

const retryCases=[['quickRestart',x=>x.click('quickRestart'),false],['hudRestart',x=>x.click('hudRestart'),false],['menu retry',x=>{x.click('pauseBtn');x.click('pauseRestartBtn')},false],['R',x=>x.key('r'),false],['result retry',x=>x.click('restartBtn'),true],['Space at result',x=>x.key(' '),true]];
for(const mode of ['normal','daily'])for(const [name,action,needsResult]of retryCases)test(mode+' preserves '+(mode==='daily'?'mode/variant/date':'mode/variant')+' via '+name,()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click(mode==='normal'?'menuNormal':'menuDaily');const before=x.latest();if(needsResult)x.end();x.setDay('2026-10-31');action(x);assert(same(before,x.latest()),JSON.stringify({before,after:x.latest()}))});
for(const [name,action,needsResult]of retryCases.filter(x=>!x[2]))test('tutorial preserves mode via '+name,()=>{const x=makeHarness();x.click('menuTutorial');const before=x.latest();action(x);assert(same(before,x.latest()),JSON.stringify({before,after:x.latest()}))});
test('the ordinary explicit route switch changes variant while retry stays on that new route',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');const a=x.latest();x.end();x.click('resultNewRoute');assert(x.latest().mode==='normal'&&x.latest().variant!==a.variant,'route did not change');const b=x.latest();x.end();x.click('restartBtn');assert(same(b,x.latest()),'retry changed new route')});
test('normal record keys are separated by variant',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');const a=x.review.recordKey();x.end({score:301});x.click('resultNewRoute');const b=x.review.recordKey();assert(a!==b,'shared key '+a);x.end({score:205});const records=[...x.data].filter(([k,v])=>k.includes('best')).map(([k,v])=>[k,JSON.parse(v)]);assert(records.some(([,v])=>v[a]?.score===301&&v[b]?.score===205),'not saved in separate keys: '+JSON.stringify(records))});
test('daily record keys are separated by date',()=>{const a=makeHarness({'xiaban-tutorial-v3':'done'}),b=makeHarness({'xiaban-tutorial-v3':'done'});a.click('menuDaily');b.setDay('2026-10-31');b.click('menuDaily');assert(a.review.recordKey()!==b.review.recordKey(),'same daily key');assert(a.review.recordKey().includes('2026-10-30')&&b.review.recordKey().includes('2026-10-31'),'key lacks actual date')});
test('five-catch slide failure goal does not ask for four catches',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();const text=x.all.nextRunHint.textContent;assert(!/接齐\s*4|签收\s*4|还差.*件/.test(text),'misleading goal: '+text);assert(/滑|救|稳|落|松|慢|侧/.test(text),'goal lacks stability advice: '+text)});
test('win with assist recommends no-assist challenge',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end({status:'win',finishReason:'arrived',lives:3,perfectCatches:3,assists:1});assert(/扶正|扶回|帮助|辅助/.test(x.all.nextRunHint.textContent),'goal: '+x.all.nextRunHint.textContent)});
test('result mode enabled then cleared on retry',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();assert(x.document.body.classList.contains('result-mode'),'no result-mode');x.click('restartBtn');assert(!x.document.body.classList.contains('result-mode'),'retry kept result-mode');assert(x.all.resultOverlay.classList.contains('hidden'),'overlay visible')});
test('replay exits result mode then restores it',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');assert(!x.document.body.classList.contains('result-mode'),'replay kept result-mode');assert(x.all.gameWindow.classList.contains('replaying'),'no replay class');x.click('exitReplay');assert(x.document.body.classList.contains('result-mode'),'no result-mode restore');assert(!x.all.gameWindow.classList.contains('replaying'),'kept replay class')});
test('home clears result/replay/tail/tutorial modes',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();x.all.gameWindow.classList.add('replaying','tail-mode','tutorial-mode');x.click('resultHome');for(const c of ['replaying','tail-mode','tutorial-mode'])assert(!x.all.gameWindow.classList.contains(c),'kept '+c);assert(!x.document.body.classList.contains('result-mode'),'body result mode');assert(x.engine.status==='ready','not ready');assert(x.all.resultOverlay.classList.contains('hidden'),'result visible');assert(!x.document.body.classList.contains('playing'),'playing body')});
test('new result scroll/dock/menu entry exist and menu returns to result',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});assert(x.all.resultScroll&&x.all.resultDock,'result regions missing');x.click('menuNormal');x.end();const menuId=['resultMenu','resultMenuBtn'].find(id=>x.all[id]);assert(menuId,'result menu missing');x.click(menuId);assert(!x.all.pauseOverlay.classList.contains('hidden'),'menu hidden');x.click('resumeBtn');assert(x.all.pauseOverlay.classList.contains('hidden')&&!x.all.resultOverlay.classList.contains('hidden'),'did not return to result')});

test('tail feedback fields and hold progress are wired to HTML',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.force({elapsed:43,tail:{active:true,completed:false,step:2,targetX:275,variant:0,feedback:{phase:'holding',text:'车货已稳，正在计站',detail:'保持松手，等停站进度走满。',progress:.6}},guidance:{kind:'tail',direction:'stop',text:'车货已稳，正在计站',detail:'保持松手，等停站进度走满。',targetX:275}});x.review.hud();assert(x.all.parkingLabel.textContent==='收工站 2 / 2','station label wrong');assert(x.all.tailStatus.textContent==='停稳计站 60%','status wrong');assert(x.all.tailHoldBar.style.width==='60%','progress wrong');assert(x.all.parkingBadge.dataset.phase==='holding','phase wrong');assert(x.all.guideDetail.textContent==='保持松手，等停站进度走满。','detail wrong')});
test('result menu makes report inert and clears it on resume/retry/home',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();x.click('resultMenu');assert(x.all.resultOverlay.inert===true,'not inert');x.click('resumeBtn');assert(x.all.resultOverlay.inert===false,'still inert');x.click('resultMenu');x.click('pauseRestartBtn');assert(x.all.resultOverlay.inert===false&&!x.document.body.classList.contains('result-mode'),'retry still inert/result');x.end();x.click('resultMenu');x.click('menuHome');assert(x.all.resultOverlay.inert===false&&!x.document.body.classList.contains('result-mode'),'home still inert/result')});
test('result home actually clears body result-mode',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();assert(x.document.body.classList.contains('result-mode'),'no result mode');x.click('resultHome');assert(!x.document.body.classList.contains('result-mode'),'kept body result mode')});
test('opening menu during replay returns to inert report and exits cleanly',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuNormal');x.end();x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.click('menuBtn');assert(!x.all.gameWindow.classList.contains('replaying'),'still replaying');assert(x.document.body.classList.contains('result-mode'),'no report');assert(x.all.resultOverlay.inert===true,'report active behind menu');x.click('resumeBtn');assert(x.all.resultOverlay.inert===false,'report still inert')});
test('daily retry record remains old date after midnight then lobby shows today',()=>{const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click('menuDaily');x.setDay('2026-10-31');x.end({score:333});assert(x.review.recordKey()==='daily:2026-10-30','terminal key moved to tomorrow');x.click('restartBtn');assert(x.review.recordKey()==='daily:2026-10-30','retry key moved');x.end({score:334});x.click('resultHome');assert(x.review.recordKey()==='daily:2026-10-31','lobby not today')});

test('parking status card stays below the guide and inside the game window', () => {
  const x = makeHarness({'xiaban-tutorial-v3': 'done'});
  x.click('menuNormal');
  x.all.gameWindow.clientWidth = 336;
  x.all.gameWindow.clientHeight = 568;
  x.all.actionGuide.offsetTop = 178;
  x.all.actionGuide.offsetHeight = 90;
  x.all.parkingBadge.offsetWidth = 226;
  x.all.parkingBadge.offsetHeight = 70;
  x.force({
    elapsed: 43,
    tail: {active: true, completed: false, step: 1, targetX: 285},
    guidance: {kind: 'tail', direction: 'right', targetX: 285}
  });
  x.review.hud();
  const centerX = parseFloat(x.all.parkingBadge.style.left);
  const centerY = parseFloat(x.all.parkingBadge.style.top);
  assert(centerX - 113 >= 10, 'card extends past the left inset');
  assert(centerX + 113 <= 326, 'card extends past the right inset');
  assert(centerY - 35 >= 178 + 90 + 12, 'card overlaps the guide');
});
// V6 regression additions, appended only after app/index integration is ready.
function completedTail(stops) {
  return {active:true,completed:stops===2,step:stops===0?1:2,targetX:275,variant:0,bonus:stops===2?200:stops*60};
}
function normalHarness(storage={}) {
  const x=makeHarness({'xiaban-tutorial-v3':'done',...storage});
  x.click('menuNormal');
  return x;
}
function recentRecords(x) { return JSON.parse(x.data.get('xiaban-last-v8')||'{}'); }
function bestRecords(x) { return JSON.parse(x.data.get('xiaban-best-v8')||'{}'); }

test('upcoming road warning reuses the stage row and preserves the pickup instruction',()=>{
  const x=normalHarness();
  const text='前方减速带，轻轻稳住';
  x.force({warning:{kind:'bump',phase:'upcoming',text,inSeconds:1.2},guidance:{kind:'pickup',direction:'right',text:'提前挪到落点，到位松手',targetX:260},nextDrop:{type:'bread',x:260,inSeconds:2.5}});
  x.review.hud();
  assert(x.all.stage.textContent.includes(text.split('，')[0]),'warning is absent from stage row');
  assert(/2\s*秒/.test(x.all.stage.textContent),'upcoming warning lacks rounded countdown');
  assert(x.all.stage.classList.contains('road-alert'),'warning row has no alert treatment');
  assert.equal(x.all.stage.dataset.roadPhase,'upcoming');
  assert(!x.all.actionGuide.classList.contains('hidden'),'warning hid the action instruction');
  assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');
});
test('active warning is shown without an upcoming zero-second countdown',()=>{
  const x=normalHarness();
  x.force({warning:{kind:'wind',phase:'active',text:'右边来风，留意货物',inSeconds:0},guidance:{kind:'brake',direction:'stop',text:'松手刹车',targetX:210}});
  x.review.hud();
  assert(x.all.stage.textContent.includes('右边来风'),'active warning missing');
  assert(!/0\s*秒后/.test(x.all.stage.textContent),'active warning still treated as upcoming');
  assert.equal(x.all.stage.dataset.roadPhase,'active');
  assert.equal(x.all.guideText.textContent,'松手刹车');
});
test('stage row returns to the route stage after warning ends',()=>{
  const x=normalHarness();
  x.force({stage:2,warning:{kind:'wind',phase:'active',text:'右边来风',inSeconds:0}});
  x.review.hud();
  x.force({warning:null});
  x.review.hud();
  assert(!x.all.stage.textContent.includes('右边来风'),'expired warning remained');
  assert(/第二段/.test(x.all.stage.textContent),'route stage was not restored');
  assert(!x.all.stage.classList.contains('road-alert'),'expired alert treatment remained');
  assert.equal(x.all.stage.dataset.roadPhase,'');
});
test('braking at a pending delivery retains its target and wait label',()=>{
  const x=normalHarness();
  x.force({cargo:[],guidance:{kind:'brake',direction:'stop',text:'到位了，松手刹住等货',targetX:260},nextDrop:{type:'pot',x:260,inSeconds:1.4,retry:false}});
  x.review.hud();
  assert(!x.all.dropBadge.classList.contains('hidden'),'pending delivery target disappeared');
  assert(x.all.dropBadge.classList.contains('at-target'),'pending target lacks arrival state');
  assert(/已到位.*等锅/.test(x.all.dropBadge.textContent),'wait label: '+x.all.dropBadge.textContent);
  assert(Math.abs(parseFloat(x.all.dropBadge.style.left)-260/420*x.all.gameWindow.clientWidth)<.01,'pending target moved');
});
test('braking under an unsigned falling cargo retains that cargo target',()=>{
  const x=normalHarness();
  x.force({nextDrop:null,cargo:[{id:1,type:'bread',caught:false,x:190,landingX:220}],guidance:{kind:'brake',direction:'stop',text:'到位了，松手刹住等货',targetX:220}});
  x.review.hud();
  assert(!x.all.dropBadge.classList.contains('hidden'),'falling cargo target disappeared');
  assert(/已到位.*等饼/.test(x.all.dropBadge.textContent),'wait label: '+x.all.dropBadge.textContent);
  assert(Math.abs(parseFloat(x.all.dropBadge.style.left)-220/420*x.all.gameWindow.clientWidth)<.01,'falling target moved');
});
test('braking without a real pending delivery does not invent a target',()=>{
  const x=normalHarness();
  x.force({nextDrop:null,cargo:[],guidance:{kind:'brake',direction:'stop',text:'松手刹住，先把车稳下来',targetX:210}});
  x.review.hud();
  assert(x.all.dropBadge.classList.contains('hidden'),'invented pickup target for ordinary braking');
});
test('delivery marker disappears once the cargo was really signed',()=>{
  const x=normalHarness();
  const guidance={kind:'brake',direction:'stop',text:'到位了，松手刹住等货',targetX:220};
  x.force({nextDrop:null,cargo:[{id:1,type:'bread',caught:false,x:220,landingX:220}],guidance});
  x.review.hud();
  assert(!x.all.dropBadge.classList.contains('hidden'),'precondition: unsigned target hidden');
  x.force({cargo:[{id:1,type:'bread',caught:true,x:220,landingX:220}]});
  x.review.hud();
  assert(x.all.dropBadge.classList.contains('hidden'),'old signed cargo still has pickup marker');
});
test('first formal run stores a recent result without showing a comparison',()=>{
  const x=normalHarness();
  const key=x.review.recordKey();
  x.end({score:500,tail:completedTail(0)});
  assert(x.all.resultDelta.classList.contains('hidden'),'first run shows comparison');
  assert.equal(recentRecords(x)[key]?.score,500,'first run was not saved');
});
test('every result updates the latest run even below the personal best',()=>{
  const x=normalHarness();
  const key=x.review.recordKey();
  x.end({score:500,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:300,tail:completedTail(1)});
  assert.equal(bestRecords(x)[key]?.score,500,'personal best was lowered');
  assert.equal(recentRecords(x)[key]?.score,300,'lower-scoring latest run was not saved');
  assert(!x.all.resultDelta.classList.contains('hidden'),'second run has no comparison');
});
test('comparison uses the immediately preceding run rather than the best score',()=>{
  const x=normalHarness();
  x.end({score:500,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:300,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:350,tail:completedTail(1)});
  assert(/50/.test(x.all.resultDelta.textContent),'comparison did not use 300 as baseline: '+x.all.resultDelta.textContent);
  assert(!/150/.test(x.all.resultDelta.textContent),'comparison used 500 best score');
});
test('an additional completed station is progress even when the score is lower',()=>{
  const x=normalHarness();
  x.end({score:500,tail:completedTail(0)});
  x.click('restartBtn');
  x.end({score:300,finishReason:'tail_incomplete',tail:completedTail(1)});
  const text=x.all.resultDelta.textContent;
  assert(!x.all.resultDelta.classList.contains('hidden'),'station progress comparison is hidden');
  assert(/站/.test(text)&&/多|进步|\+1/.test(text),'station progress not recognized: '+text);
});
test('changing normal variants starts a separate recent-run comparison',()=>{
  const x=normalHarness();
  const first=x.review.recordKey();
  x.end({score:500,tail:completedTail(1)});
  x.click('resultNewRoute');
  const second=x.review.recordKey();
  x.end({score:300,tail:completedTail(0)});
  assert.notEqual(first,second);
  assert(x.all.resultDelta.classList.contains('hidden'),'different route was compared');
  assert.equal(recentRecords(x)[first]?.score,500);
  assert.equal(recentRecords(x)[second]?.score,300);
});
test('daily results on different dates are never compared',()=>{
  const x=makeHarness({'xiaban-tutorial-v3':'done'});
  x.click('menuDaily');
  x.end({score:500,tail:completedTail(1)});
  x.click('resultHome');
  x.setDay('2026-10-31');
  x.click('menuDaily');
  x.end({score:300,tail:completedTail(0)});
  assert(x.all.resultDelta.classList.contains('hidden'),'different date was compared');
  assert.equal(recentRecords(x)['daily:2026-10-30']?.score,500);
  assert.equal(recentRecords(x)['daily:2026-10-31']?.score,300);
});
test('daily original-line retry compares against the original date after midnight',()=>{
  const x=makeHarness({'xiaban-tutorial-v3':'done'});
  x.click('menuDaily');
  x.end({score:300,tail:completedTail(1)});
  x.setDay('2026-10-31');
  x.click('restartBtn');
  x.end({score:350,tail:completedTail(1)});
  assert(!x.all.resultDelta.classList.contains('hidden'),'same original daily route lost comparison');
  assert(/50/.test(x.all.resultDelta.textContent),'wrong daily comparison: '+x.all.resultDelta.textContent);
  assert.equal(recentRecords(x)['daily:2026-10-30']?.score,350);
  assert.equal(recentRecords(x)['daily:2026-10-31'],undefined,'retry wrote to new date');
});
test('tutorial hides prior comparison and never writes a formal recent result',()=>{
  const x=normalHarness();
  x.end({score:300,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:350,tail:completedTail(1)});
  assert(!x.all.resultDelta.classList.contains('hidden'),'precondition: comparison unavailable');
  const before=x.data.get('xiaban-last-v8');
  x.click('menuTutorial');
  x.end({status:'win',finishReason:null,catches:0,score:0});
  assert(x.all.resultDelta.classList.contains('hidden'),'tutorial shows formal comparison');
  assert.equal(x.data.get('xiaban-last-v8'),before,'tutorial changed formal last result');
});
test('V8 scores use a new best key while the existing route preference remains',()=>{
  const x=normalHarness({'xiaban-v5-route':'2','xiaban-best-v5':JSON.stringify({'normal:2':{score:9999,won:true,time:45}})});
  assert.equal(x.latest().variant,2,'existing route preference was lost');
  x.end({score:300,tail:completedTail(1)});
  assert.equal(bestRecords(x)['normal:2']?.score,300,'V5 score contaminated V8 record');
  assert.equal(JSON.parse(x.data.get('xiaban-best-v5'))['normal:2'].score,9999,'old record data was mutated');
});

test('reopening a finished report or replay does not overwrite the previous-run comparison',()=>{
  const x=normalHarness();
  x.end({score:300,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:350,tail:completedTail(1)});
  const saved=x.data.get('xiaban-last-v8'),delta=x.all.resultDelta.textContent;
  assert(/50/.test(delta),'precondition: comparison is missing');
  x.review.finish(false);
  assert.equal(x.data.get('xiaban-last-v8'),saved,'same terminal was saved again');
  assert.equal(x.all.resultDelta.textContent,delta,'same terminal changed its comparison');
  x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});
  x.click('replayBtn');
  x.click('exitReplay');
  assert.equal(x.data.get('xiaban-last-v8'),saved,'replay wrote a fake new run');
  assert.equal(x.all.resultDelta.textContent,delta,'replay changed the comparison');
});
test('lobby next goal follows the latest loss even when a stronger best win exists',()=>{
  const x=normalHarness();
  x.end({status:'win',finishReason:'arrived',score:1000,lives:3,perfectCatches:3,tail:completedTail(2)});
  x.click('restartBtn');
  x.end({score:100,tail:completedTail(0),lastCrash:{cargoType:'fish',cause:'从左侧滑落',side:'left',advice:'向左轻挪'}});
  x.click('resultHome');
  assert(/鱼/.test(x.all.nextChallengeHint.textContent),'lobby goal ignored latest crash');
  assert(!/保持S/.test(x.all.nextChallengeHint.textContent),'lobby goal still uses the best win');
  assert.equal(bestRecords(x)['normal:0']?.score,1000,'best win was replaced by the loss');
});

test('a reopened session compares against its persisted latest run',()=>{
  const first=normalHarness();
  first.end({score:500,tail:completedTail(1)});
  first.click('restartBtn');
  first.end({score:300,tail:completedTail(1)});
  const reopened=normalHarness(Object.fromEntries(first.data));
  reopened.end({score:350,tail:completedTail(1)});
  assert(!reopened.all.resultDelta.classList.contains('hidden'),'persisted comparison was lost');
  assert(/50/.test(reopened.all.resultDelta.textContent),'reopened session compared to its best: '+reopened.all.resultDelta.textContent);
  assert.equal(recentRecords(reopened)['normal:0']?.score,350);
  assert.equal(bestRecords(reopened)['normal:0']?.score,500);
});
// V7 additions: append only after source opening and UI integration are ready.
function achievementRecords(x){return JSON.parse(x.data.get('xiaban-achievements-v7')||'{}');}
function winResult(x,overrides={}){x.end({status:'win',finishReason:'arrived',catches:4,lives:3,perfectCatches:3,assists:0,tail:completedTail(2),...overrides});}
function neutralComparison(x){assert.equal(x.all.resultDelta.dataset.tone,'neutral','regression was colored as improvement');assert(!x.all.resultDelta.classList.contains('hidden'),'neutral comparison disappeared');}

test('winning then failing stays neutral despite signing more cargo and scoring higher',()=>{
  const x=normalHarness();
  winResult(x,{score:800});
  x.click('restartBtn');
  x.end({finishReason:'unsafe_arrival',catches:6,lives:3,perfectCatches:4,score:1000,tail:completedTail(2)});
  neutralComparison(x);
  assert(/(本|这)趟未收工/.test(x.all.resultDelta.textContent),'failure was not made explicit');
  assert(/单项.*多签收.*2/.test(x.all.resultDelta.textContent),'single-metric progress was not qualified: '+x.all.resultDelta.textContent);
});
test('a station regression remains neutral even when more cargo was signed',()=>{
  const x=normalHarness();
  x.end({score:400,catches:4,tail:completedTail(1)});
  x.click('restartBtn');
  x.end({score:600,catches:6,tail:completedTail(0)});
  neutralComparison(x);
});
test('partial runs can still improve cargo progress without losing station progress',()=>{
  const x=normalHarness();
  x.end({score:500,catches:3,tail:completedTail(0)});
  x.click('restartBtn');
  x.end({score:300,catches:4,tail:completedTail(0)});
  assert.equal(x.all.resultDelta.dataset.tone,'improved');
  assert(/多签收.*1/.test(x.all.resultDelta.textContent),'real partial progress was lost');
});
test('lower-scoring S achievement survives a later loss and a session reload',()=>{
  const x=normalHarness();
  const key=x.review.recordKey();
  winResult(x,{score:1000,lives:2,perfectCatches:2});
  assert.equal(achievementRecords(x)[key]?.grade,'A');
  x.click('restartBtn');
  winResult(x,{score:800});
  assert.equal(achievementRecords(x)[key]?.grade,'S','lower score did not unlock S');
  assert.equal(bestRecords(x)[key]?.score,1000,'achievement replaced the score record');
  assert(/S/.test(x.all.resultAchievement.textContent),'result omitted the unlocked S');
  x.click('restartBtn');
  x.end({score:200,tail:completedTail(0)});
  assert.equal(achievementRecords(x)[key]?.grade,'S','loss erased S');
  assert(/S/.test(x.all.resultAchievement.textContent),'later failure hid the permanent S');
  const reopened=normalHarness(Object.fromEntries(x.data));
  assert.equal(achievementRecords(reopened)[key]?.grade,'S','reload erased S');
  assert.equal(bestRecords(reopened)[key]?.score,1000,'reload changed the highest score');
  assert(/S/.test(reopened.all.gradeRecord.textContent),'lobby omitted the permanent S');
});
test('normal route achievements remain separated by variant',()=>{
  const x=normalHarness();
  const first=x.review.recordKey();
  winResult(x,{score:800});
  x.click('resultNewRoute');
  const second=x.review.recordKey();
  winResult(x,{score:1000,lives:2});
  assert.notEqual(first,second);
  assert.equal(achievementRecords(x)[first]?.grade,'S');
  assert.equal(achievementRecords(x)[second]?.grade,'A','S leaked into another route');
});
test('daily achievements keep the original date on retry and remain separate the next day',()=>{
  const x=makeHarness({'xiaban-tutorial-v3':'done'});
  x.click('menuDaily');
  winResult(x,{score:800});
  x.setDay('2026-10-31');
  x.click('restartBtn');
  x.end({score:200});
  assert.equal(achievementRecords(x)['daily:2026-10-30']?.grade,'S');
  assert.equal(achievementRecords(x)['daily:2026-10-31'],undefined,'retry wrote tomorrow achievement');
  x.click('resultHome');
  x.click('menuDaily');
  winResult(x,{score:1000,lives:2});
  assert.equal(achievementRecords(x)['daily:2026-10-30']?.grade,'S');
  assert.equal(achievementRecords(x)['daily:2026-10-31']?.grade,'A');
});
test('tutorial completion does not create or downgrade formal achievements',()=>{
  const x=normalHarness();
  winResult(x,{score:800});
  const before=x.data.get('xiaban-achievements-v7');
  x.click('menuTutorial');
  winResult(x,{score:9999});
  assert.equal(x.data.get('xiaban-achievements-v7'),before,'tutorial wrote a formal achievement');
});
test('reopening the same terminal and replay does not rewrite achievement history',()=>{
  const x=normalHarness();
  winResult(x,{score:800});
  const before=x.data.get('xiaban-achievements-v7');
  x.setDay('2026-10-31');
  x.review.finish(true);
  x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});
  x.click('replayBtn');x.click('exitReplay');
  assert.equal(x.data.get('xiaban-achievements-v7'),before,'same run changed achievement date/history');
});
test('V6 best and recent results can import earned grades without importing their scores',()=>{
  const oldBest={
    'normal:0':{score:1500,won:true,time:48,lives:2,assists:0,perfect:3},
    'normal:1':{score:1400,won:true,time:47,lives:3,assists:0,perfect:3},
    'daily:2026-10-30':{score:1300,won:true,time:49,lives:2,assists:0,perfect:2}
  };
  const oldRecent={'normal:0':{score:800,won:true,time:45,lives:3,assists:0,perfectCatches:3}};
  const x=normalHarness({'xiaban-best-v6':JSON.stringify(oldBest),'xiaban-last-v6':JSON.stringify(oldRecent)});
  assert.equal(achievementRecords(x)['normal:0']?.grade,'S','recent S was missed behind best A');
  assert.equal(achievementRecords(x)['normal:1']?.grade,'S','best S was not inferred');
  assert.equal(achievementRecords(x)['daily:2026-10-30']?.grade,'A');
  assert.equal(bestRecords(x)['normal:0'],undefined,'legacy score entered the new rule record');
  assert.equal(recentRecords(x)['normal:0'],undefined,'legacy recent score entered the new comparison');
  x.end({score:300});
  assert.equal(bestRecords(x)['normal:0']?.score,300);
  assert.equal(JSON.parse(x.data.get('xiaban-best-v6'))['normal:0'].score,1500,'legacy scores were mutated');
});
test('achievement migration is marked once and does not rerun after reload',()=>{
  const x=normalHarness({'xiaban-best-v6':JSON.stringify({'normal:0':{score:1000,won:true,lives:2,assists:0,perfect:3}})});
  assert(x.data.get('xiaban-achievements-v8-migrated'),'migration sentinel is missing');
  const storage=Object.fromEntries(x.data);
  storage['xiaban-best-v6']=JSON.stringify({'normal:1':{score:900,won:true,lives:3,assists:0,perfect:3}});
  const reopened=normalHarness(storage);
  assert.equal(achievementRecords(reopened)['normal:0']?.grade,'A');
  assert.equal(achievementRecords(reopened)['normal:1'],undefined,'migration reran despite its sentinel');
});
const jobCases=[
  ['remaining deliveries',{remainingDeliveries:2,airborneUnsigned:0,retryCount:0,phase:'delivery',detail:'已达最低4件，整单还剩2件待投递。'},/2件.*待投/],
  ['unsigned airborne cargo',{remainingDeliveries:0,airborneUnsigned:1,retryCount:0,phase:'delivery',detail:'整单已投出，1件仍在途中，接稳后停两站。'},/正在落下|接住这一件/],
  ['pending retry',{remainingDeliveries:0,airborneUnsigned:0,retryCount:1,phase:'delivery',detail:'待补发1件，接住才算签收。'},/补发/],
  ['arrival settling',{remainingDeliveries:0,airborneUnsigned:0,retryCount:0,phase:'settling',detail:'全部投递完成，先把4件已签收货稳住。'},/稳住|靠站|清点/]
];
for(const [label,job,expected]of jobCases)test('minimum catch target still shows '+label,()=>{
  const x=normalHarness();
  x.force({catches:4,settling:job.phase==='settling',tail:{active:false,completed:false,step:1,variant:0},job:{minimumMet:true,required:4,total:6,sent:6-job.remainingDeliveries,...job}});
  x.review.hud();
  assert(!x.all.jobPanel.classList.contains('hidden'),'job panel disappeared after reaching four catches');
  assert.equal(x.all.jobPanel.dataset.phase,job.phase,'job phase was not wired from engine');
  assert(expected.test(x.all.jobTitle.textContent+' '+x.all.jobDetail.textContent),'remaining task not explained');
});
test('job panel stays out of pre-target, tutorial and active-tail instructions',()=>{
  const x=normalHarness();
  x.force({catches:3,job:{minimumMet:false,required:4,total:6,sent:4,remainingDeliveries:2,airborneUnsigned:0,retryCount:0,phase:'delivery',detail:'还差1件达标。'}});
  x.review.hud();assert(x.all.jobPanel.classList.contains('hidden'),'pre-target panel shown');
  x.force({catches:4,job:{minimumMet:true,required:4,total:6,sent:6,remainingDeliveries:0,airborneUnsigned:0,retryCount:0,phase:'tail',detail:'停稳收工第1站。'},tail:{active:true,completed:false,step:1,targetX:145,variant:0}});
  x.review.hud();assert(x.all.jobPanel.classList.contains('hidden'),'panel obscures active tail guidance');
  x.click('menuTutorial');x.review.hud();assert(x.all.jobPanel.classList.contains('hidden'),'tutorial shows formal job panel');
});
test('route brief follows route metadata and remains stable across retries and home',()=>{
  const x=normalHarness({'xiaban-v5-route':'2'});
  const route=x.engine.snapshot().route;
  assert(route,'harness needs route metadata');
  const brief=x.all.routeBrief.textContent;
  assert(brief.includes(route.name)&&brief.includes(route.tagline),'route brief ignores engine metadata');
  x.click('quickRestart');
  assert.equal(x.all.routeBrief.textContent,brief,'same route retry changed its description');
  assert.equal(x.engine.snapshot().route.variant,route.variant);
  x.click('menuBtn');x.click('menuHome');
  assert.equal(x.all.routeBrief.textContent,brief,'home preview switched route metadata');
});
test('explicit route change updates its metadata brief while daily retries retain theirs',()=>{
  const x=normalHarness();
  const before=x.all.routeBrief.textContent;
  x.end();x.click('resultNewRoute');
  const route=x.engine.snapshot().route;
  assert.notEqual(x.all.routeBrief.textContent,before,'route description did not change');
  assert(x.all.routeBrief.textContent.includes(route.name)&&x.all.routeBrief.textContent.includes(route.tagline));
  x.click('menuDaily');
  const dailyBrief=x.all.routeBrief.textContent;
  x.setDay('2026-10-31');x.click('quickRestart');
  assert.equal(x.all.routeBrief.textContent,dailyBrief,'daily retry changed the original route metadata');
});

test('a pending retry remains explicit when later deliveries are also outstanding',()=>{
  const x=normalHarness();
  x.force({
    catches:4,
    tail:{active:false,completed:false,step:1,variant:0},
    job:{minimumMet:true,required:4,total:6,sent:5,remainingDeliveries:1,airborneUnsigned:0,retryCount:1,phase:'delivery',detail:'待补发1件，另有1件待投递。'},
    nextDrop:{type:'pot',x:220,inSeconds:2,retry:true},
    guidance:{kind:'pickup',direction:'right',text:'补发准备：提前挪到落点，到位松手',targetX:220}
  });
  x.review.hud();
  assert(!x.all.jobPanel.classList.contains('hidden'),'mixed delivery status is hidden');
  assert(/补发/.test(x.all.jobTitle.textContent),'future deliveries hid the immediate retry');
  assert(/先.*补发/.test(x.all.jobDetail.textContent),'retry priority is unclear');
  assert(/另有1件待投/.test(x.all.jobDetail.textContent),'later delivery count was lost');
});

for(const airborneUnsigned of [0,1])test('closed delivery window does not promise cancelled work, airborne='+airborneUnsigned,()=>{
  const x=normalHarness();
  x.force({catches:4,tail:{active:false,completed:false,step:1,variant:0},
    job:{minimumMet:true,required:4,total:6,sent:5,remainingDeliveries:1,airborneUnsigned,retryCount:1,deliveriesClosed:true,phase:'settling',detail:'投递已截止'},
    guidance:{kind:'steady',direction:'steady',text:'货已投完，稳住准备停站'}});
  x.review.hud();
  const message=x.all.jobTitle.textContent+' '+x.all.jobDetail.textContent;
  assert(!/待投|补发/.test(message),'cancelled work still promised: '+message);
  assert(airborneUnsigned?/落下|接货机会/.test(message):/投递已结束/.test(message));
  assert(!/等预告/.test(x.all.guideDetail.textContent),'main guide still promises another delivery');
});

test('post-minimum job status defers to the active rescue instruction',()=>{
  const x=normalHarness();
  x.force({catches:4,tail:{active:false,completed:false,step:1,variant:0},
    job:{minimumMet:true,remainingDeliveries:2,retryCount:0,airborneUnsigned:0,phase:'delivery'},
    guidance:{kind:'rescue',direction:'right',text:'先救回锅，新货稍等'}});
  x.review.hud();
  assert(/2件待投/.test(x.all.jobTitle.textContent));
  assert(/先救稳旧货/.test(x.all.jobDetail.textContent));
  assert(!/先看下一件|先接补发/.test(x.all.jobDetail.textContent));
});
// V8 additions: wait for app/index and source opening before appending.
const mixedPerformanceCases=[
 ['S to A with fewer perfect catches',{lives:3,assists:0,perfectCatches:3,elapsed:45},{lives:3,assists:0,perfectCatches:2,elapsed:45},/精准|S.*A|A级|评级/],
 ['more crashes',{lives:3,assists:0,perfectCatches:3,elapsed:45},{lives:1,assists:0,perfectCatches:3,elapsed:45},/翻车|机会|A级|评级/],
 ['more assists within A grade',{lives:3,assists:1,perfectCatches:3,elapsed:45},{lives:3,assists:3,perfectCatches:3,elapsed:45},/扶正/],
 ['slower completion within S grade',{lives:3,assists:0,perfectCatches:3,elapsed:45},{lives:3,assists:0,perfectCatches:3,elapsed:58},/慢|耗时|用时|秒/]
];
for(const[label,previous,current,tradeoff]of mixedPerformanceCases)test('more signed cargo is qualified when accompanied by '+label,()=>{
  const x=normalHarness();
  winResult(x,{score:1000,catches:4,...previous});
  x.click('restartBtn');
  winResult(x,{score:1100,catches:6,...current});
  const text=x.all.resultDelta.textContent;
  assert.equal(x.all.resultDelta.dataset.tone,'neutral','mixed result is still green');
  assert(!/更稳|更熟练/.test(text),'unqualified stability praise: '+text);
  assert(/签收/.test(text),'single-metric benefit disappeared: '+text);
  assert(tradeoff.test(text),'performance cost was omitted: '+text);
});
test('extra signed cargo can still be a positive result when safety and time do not regress',()=>{
  const x=normalHarness();
  winResult(x,{score:1000,catches:4,lives:3,assists:0,elapsed:45});
  x.click('restartBtn');
  winResult(x,{score:1100,catches:6,lives:3,assists:0,elapsed:45});
  assert.equal(x.all.resultDelta.dataset.tone,'improved');
  assert(/签收.*2/.test(x.all.resultDelta.textContent),'true local improvement was lost');
});
test('V8 migration runs independently while retaining permanent S and isolating old scores',()=>{
  const permanent={'normal:0':{grade:'S',achievedAt:'2026-10-01'}};
  const oldBest={'normal:0':{won:true,score:15000,lives:2,assists:0,perfect:3},'daily:2026-10-30':{won:true,score:14000,lives:3,assists:0,perfect:3}};
  const oldRecent={'normal:1':{won:true,score:13000,lives:3,assists:0,perfectCatches:3}};
  const x=normalHarness({'xiaban-achievements-v7':JSON.stringify(permanent),'xiaban-achievements-v7-migrated':'done','xiaban-best-v7':JSON.stringify(oldBest),'xiaban-last-v7':JSON.stringify(oldRecent)});
  assert.equal(x.data.get('xiaban-achievements-v8-migrated'),'done');
  assert.equal(achievementRecords(x)['normal:0']?.grade,'S','existing S was downgraded');
  assert.equal(achievementRecords(x)['normal:0']?.achievedAt,'2026-10-01','existing S date changed');
  assert.equal(achievementRecords(x)['normal:1']?.grade,'S','old recent S was not merged');
  assert.equal(achievementRecords(x)['daily:2026-10-30']?.grade,'S');
  assert.equal(bestRecords(x)['normal:0'],undefined,'old best score leaked into V8');
  assert.equal(recentRecords(x)['normal:0'],undefined,'old recent score leaked into V8');
  x.end({score:300});
  assert.equal(bestRecords(x)['normal:0']?.score,300);
  assert(x.all.resultDelta.classList.contains('hidden'),'first V8 run compared to V7 history');
  assert.equal(JSON.parse(x.data.get('xiaban-best-v7'))['normal:0'].score,15000);
});
test('V8 grade import requires proof of S and ignores failed high-score records',()=>{
  const old={
    'normal:0':{won:true,score:10000,lives:3,perfect:3},
    'normal:1':{won:false,score:12000,lives:3,assists:0,perfect:5},
    'normal:2':{won:true,score:8000,lives:3,assists:1,perfect:4}
  };
  const x=normalHarness({'xiaban-achievements-v7-migrated':'done','xiaban-best-v7':JSON.stringify(old)});
  assert.equal(achievementRecords(x)['normal:0']?.grade,'A','unknown assists were treated as no assists');
  assert.equal(achievementRecords(x)['normal:1'],undefined,'a failed record earned a grade');
  assert.equal(achievementRecords(x)['normal:2']?.grade,'A','assisted win imported as S');
});
test('V8 grade migration has its own one-time sentinel',()=>{
  const x=normalHarness({'xiaban-achievements-v7-migrated':'done','xiaban-best-v7':JSON.stringify({'normal:0':{won:true,score:1000,lives:2,assists:0,perfect:3}})});
  assert.equal(x.data.get('xiaban-achievements-v8-migrated'),'done');
  const storage=Object.fromEntries(x.data);
  storage['xiaban-last-v7']=JSON.stringify({'normal:1':{won:true,score:800,lives:3,assists:0,perfectCatches:3}});
  const reopened=normalHarness(storage);
  assert.equal(achievementRecords(reopened)['normal:0']?.grade,'A');
  assert.equal(achievementRecords(reopened)['normal:1'],undefined,'V8 migration reran after its sentinel');
});
for(const variant of [0,1,2])test('next route preview identifies the route that one click actually starts from variant '+variant,()=>{
  const x=normalHarness({'xiaban-v5-route':String(variant)});
  const next=x.engine.snapshot().route.next;
  assert(next,'engine stub needs next-route metadata');
  x.end();
  assert(!x.all.resultNewRoute.classList.contains('hidden'),'normal route switch was hidden');
  assert(x.all.resultNewRoute.textContent.includes(next.name),'switch button does not name the next route');
  assert(!x.all.routeNextHint.classList.contains('hidden'),'next route preview is hidden');
  assert(x.all.routeNextHint.textContent.includes(next.tagline),'preview is unrelated to next route');
  const before=x.engine.resets.length;
  x.click('resultNewRoute');
  assert.equal(x.engine.resets.length,before+1,'route switch introduced an extra confirmation/reset');
  assert.equal(x.latest().variant,next.variant);
  assert.equal(x.engine.snapshot().route.name,next.name);
});
for(const mode of ['daily','tutorial'])test(mode+' report does not advertise a normal next-route preview',()=>{
  const x=makeHarness({'xiaban-tutorial-v3':'done'});
  x.click(mode==='daily'?'menuDaily':'menuTutorial');
  winResult(x);
  assert(x.all.resultNewRoute.classList.contains('hidden'),'normal route switch leaked into '+mode);
  assert(x.all.routeNextHint.classList.contains('hidden'),'normal preview leaked into '+mode);
});
test('A-grade retry goal names the cargo and correction that blocked S',()=>{
  const x=normalHarness();
  winResult(x,{lives:2,lastCrash:{cargoType:'fish',cause:'从左侧滑落',side:'left',advice:'鱼滑到左侧时，提前把车送到它下面。'}});
  const hint=x.all.nextRunHint.textContent;
  assert(/鱼/.test(hint)&&/左/.test(hint),'A-grade goal is not tied to the actual crash: '+hint);
  assert(/翻车|机会|S/.test(hint),'goal does not explain the grade barrier');
  assert(!/只练/.test(hint),'goal sounds like a separate practice mode');
  x.click('resultHome');
  assert(/鱼/.test(x.all.nextChallengeHint.textContent)&&/左/.test(x.all.nextChallengeHint.textContent),'lobby lost the saved correction');
  const reopened=normalHarness(Object.fromEntries(x.data));
  assert(/鱼/.test(reopened.all.nextChallengeHint.textContent)&&/左/.test(reopened.all.nextChallengeHint.textContent),'reload lost the saved correction');
});
test('failed station goal clearly retries the original route rather than promising a separate exercise',()=>{
  const x=normalHarness();
  x.end({finishReason:'tail_incomplete',tail:completedTail(1)});
  assert(/原线/.test(x.all.nextRunHint.textContent),'retry scope is unclear');
  assert(/第2站/.test(x.all.nextRunHint.textContent),'concrete station goal is missing');
  assert(!/只练/.test(x.all.nextRunHint.textContent),'goal promises a separate exercise');
  const before=x.latest();x.click('restartBtn');assert(same(before,x.latest()),'focused retry changed the route');
});

for(const [label,overrides,reason]of [['assisted A',{assists:1},/扶正/],['imprecise A',{perfectCatches:2},/精准|中心/]])test(label+' goal explicitly repeats the original route with a focused objective',()=>{
  const x=normalHarness();winResult(x,overrides);
  assert(!/只练/.test(x.all.nextRunHint.textContent),'goal still suggests a separate exercise');
  assert(/原线/.test(x.all.nextRunHint.textContent),'goal does not explain the retry scope');
  assert(reason.test(x.all.nextRunHint.textContent),'goal omits the relevant S-grade barrier');
});
test('current report grade clears after failure while the earned S remains visible',()=>{
  const x=normalHarness();winResult(x);
  assert.equal(x.all.resultOverlay.dataset.grade,'S');
  assert(/S级/.test(x.all.resultTitle.textContent),'S success lacks a distinct report title');
  x.click('restartBtn');x.end({score:200});
  assert.equal(x.all.resultOverlay.dataset.grade,'','failure inherited the S visual treatment');
  assert.equal(achievementRecords(x)['normal:0']?.grade,'S');
  assert(/S/.test(x.all.resultAchievement.textContent),'failure hid the retained achievement');
});

test('V7 higher-score A and lower-score recent S merge to S for the same route',()=>{
  const x=normalHarness({
    'xiaban-achievements-v7-migrated':'done',
    'xiaban-best-v7':JSON.stringify({'normal:0':{won:true,score:1500,lives:2,assists:0,perfect:3}}),
    'xiaban-last-v7':JSON.stringify({'normal:0':{won:true,score:800,lives:3,assists:0,perfectCatches:3}})
  });
  assert.equal(achievementRecords(x)['normal:0']?.grade,'S','higher score hid the recent S');
  assert.equal(bestRecords(x)['normal:0'],undefined,'V7 best score entered V8');
  assert.equal(recentRecords(x)['normal:0'],undefined,'V7 recent score entered V8');
});

test('first safe completion remains positive despite a weaker individual performance',()=>{
  const x=normalHarness();
  x.end({score:1500,catches:6,lives:2,assists:0,elapsed:20,tail:completedTail(0)});
  x.click('restartBtn');
  winResult(x,{score:800,catches:4,lives:1,assists:2,perfectCatches:1,elapsed:55});
  assert.equal(x.all.resultDelta.dataset.tone,'improved','first safe completion was treated as regression');
  assert(/安全收工/.test(x.all.resultDelta.textContent),'first success was not acknowledged');
});

test('combined tradeoffs report the correct signed-cargo, crash, assist and time deltas',()=>{
  const x=normalHarness();
  winResult(x,{score:1000,catches:4,lives:3,assists:0,elapsed:45});
  x.click('restartBtn');
  winResult(x,{score:1100,catches:6,lives:1,assists:3,elapsed:58});
  const text=x.all.resultDelta.textContent;
  assert.equal(x.all.resultDelta.dataset.tone,'neutral');
  for(const fact of ['签收+2件','翻车+2次','扶正+3次','用时+13.00秒'])assert(text.includes(fact),'missing or wrong fact: '+fact+' in '+text);
  assert(!/更稳|更熟练/.test(text),'mixed performance still receives unqualified praise');
});

test('tail assistance explains the reset while keeping the current station instruction',()=>{
  const x=normalHarness();
  x.force({catches:4,tail:{active:true,completed:false,step:1,targetX:145},
    recovery:{assist:true,restoredCount:4,text:'扶正4件已签收货，扣25分，不重复签收'},
    guidance:{kind:'tail',direction:'stop',text:'车货已稳，正在计站',detail:'保持松手，等停站进度走满。',targetX:145}});
  x.review.hud();
  assert.equal(x.all.guideText.textContent,'车货已稳，正在计站');
  assert(/扶正4件/.test(x.all.guideDetail.textContent));
  assert(/扣25分/.test(x.all.guideDetail.textContent));
  assert(/保持松手.*重新计站/.test(x.all.guideDetail.textContent));
});

test('expired work explains unreceived cargo instead of promising another delivery',()=>{
  const x=normalHarness();
  x.force({catches:4,tail:{active:false,completed:false,step:1},
    job:{minimumMet:true,remainingDeliveries:0,airborneUnsigned:0,retryCount:0,unavailableDeliveries:1,unthrownCount:0,retryExpiredCount:1,deliveriesClosed:true,phase:'settling'},
    guidance:{kind:'steady',direction:'steady',text:'货已投完，稳住准备停站'}});
  x.review.hud();
  const text=x.all.jobTitle.textContent+' '+x.all.jobDetail.textContent;
  assert(/截止|投递已结束/.test(text)&&/1件补发过窗/.test(text));
  assert(!/待补发|待投|等下一/.test(text));
});
// V9 additions: apply only once root app/index interfaces are ready.
function challengeRecords(x){return JSON.parse(x.data.get('xiaban-s-challenges-v9')||'{}');}
function playerRecord(x){return JSON.parse(x.data.get('xiaban-player-v9')||'null');}
function legacyRun(overrides={}){return{won:true,score:1000,time:45.98,catches:4,stops:2,lives:3,assists:0,perfectCatches:3,requiredCatches:4,finishReason:'arrived',tail:{step:2},lastCrash:null,...overrides};}

test('a completely new player still starts with the tutorial',()=>{
  const x=makeHarness();assert.equal(x.review.state().mode,'tutorial');x.click('startBtn');assert.equal(x.latest().mode,'tutorial');
});
for(const mobile of[false,true])test('skipping before a result persists a formal entry on reload, mobile='+mobile,()=>{
  const x=makeHarness({}, {mobile});x.click('skipTutorial');
  assert.equal(playerRecord(x)?.mode,'normal','skip did not persist the formal mode');
  const reopened=makeHarness(Object.fromEntries(x.data),{mobile});
  assert.equal(reopened.review.state().mode,'normal','reload returned to teaching');
  reopened.click('startBtn');assert.equal(reopened.latest().mode,'normal');
});
test('the latest normal variant survives manual tutorial practice and reload',()=>{
  const x=normalHarness();winResult(x);x.click('resultNewRoute');winResult(x);x.click('resultNewRoute');
  assert.equal(x.latest().variant,2);const saved=JSON.stringify(playerRecord(x));
  x.click('menuTutorial');assert.equal(JSON.stringify(playerRecord(x)),saved,'practice changed last formal entry');
  winResult(x);assert.equal(JSON.stringify(playerRecord(x)),saved,'completed practice changed last formal entry');
  const reopened=makeHarness(Object.fromEntries(x.data));assert.equal(reopened.review.state().mode,'normal');assert.equal(reopened.review.state().activeVariant,2);
});
test('daily mode is remembered but a fresh next-day session starts today rather than yesterday',()=>{
  const x=makeHarness();x.click('menuDaily');const saved=JSON.stringify(playerRecord(x));
  x.click('menuTutorial');assert.equal(JSON.stringify(playerRecord(x)),saved);
  const reopened=makeHarness(Object.fromEntries(x.data),{day:'2026-10-31'});
  assert.equal(reopened.review.state().mode,'daily');assert.equal(reopened.review.state().snap.dateSeed,'2026-10-31');
});
test('legacy normal variant two records identify an experienced player without teaching flags',()=>{
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:2':legacyRun()})});
  assert.equal(x.review.state().mode,'normal');assert.equal(x.review.state().activeVariant,2);
  assert(!x.all.gradeRecord.classList.contains('hidden')||!x.all.routeBrief.classList.contains('hidden'),'formal home remains hidden');
});
test('legacy daily-only formal history resumes daily without requiring the tutorial',()=>{
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'daily:2026-10-30':legacyRun()})});
  assert.equal(x.review.state().mode,'daily');
});
test('an existing earned grade alone still identifies an experienced player',()=>{
  const x=makeHarness({'xiaban-achievements-v7':JSON.stringify({'normal:2':{grade:'S',achievedAt:'2026-10-01'}})});
  assert.equal(x.review.state().mode,'normal');assert.equal(x.review.state().activeVariant,2);assert(/S/.test(x.all.gradeRecord.textContent));
});
test('an S raw time of 45.98 has a single challenge target across report, home and reload',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98});const key=x.review.recordKey();
  assert.equal(recentRecords(x)[key].time,45.98,'latest time lost centisecond precision');
  assert.equal(bestRecords(x)[key].time,45.98,'best time lost centisecond precision');
  assert.deepEqual(challengeRecords(x)[key],{bestTimeCs:4598,targetSeconds:45});
  const reportGoal=x.all.nextRunHint.textContent;
  x.click('resultHome');assert.equal(x.all.nextChallengeHint.textContent,reportGoal,'home changed the target');
  const reopened=makeHarness(Object.fromEntries(x.data));assert.equal(reopened.all.nextChallengeHint.textContent,reportGoal,'reload changed the target');
  assert(/45/.test(reportGoal),'expected fixed 45-second target missing');
});
test('slower S, faster A and failures never loosen the fixed S challenge',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98,score:1000});const key=x.review.recordKey(),before=challengeRecords(x)[key];
  x.click('restartBtn');winResult(x,{elapsed:58.2,score:1500});assert.deepEqual(challengeRecords(x)[key],before,'slow S loosened the target');
  x.click('restartBtn');winResult(x,{elapsed:40,score:1600,lives:2});assert.deepEqual(challengeRecords(x)[key],before,'A changed an S challenge');
  x.click('restartBtn');x.end({elapsed:35,score:1700});assert.deepEqual(challengeRecords(x)[key],before,'failure changed an S challenge');
  assert.equal(bestRecords(x)[key].score,1700,'score record was wrongly tied to S timing');
  x.click('restartBtn');winResult(x,{elapsed:43.25,score:900});assert.deepEqual(challengeRecords(x)[key],{bestTimeCs:4325,targetSeconds:43});
});
test('an equivalent centisecond S result does not rewrite the challenge baseline',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98});const before=x.data.get('xiaban-s-challenges-v9');
  x.click('restartBtn');winResult(x,{elapsed:45.981});assert.equal(x.data.get('xiaban-s-challenges-v9'),before);
});
test('challenge migration chooses the fastest provable v8 S independently from score',()=>{
  const x=normalHarness({
    'xiaban-best-v8':JSON.stringify({'normal:0':legacyRun({score:1500,time:50,lives:2}),'normal:1':legacyRun({score:1400,time:43,perfect:3,perfectCatches:undefined})}),
    'xiaban-last-v8':JSON.stringify({'normal:0':legacyRun({score:1100,time:45.98}),'normal:1':legacyRun({score:900,time:48})})
  });
  assert.deepEqual(challengeRecords(x)['normal:0'],{bestTimeCs:4598,targetSeconds:45});
  assert.deepEqual(challengeRecords(x)['normal:1'],{bestTimeCs:4300,targetSeconds:42});
  assert.equal(bestRecords(x)['normal:0'].score,1500,'v8 score history was reset');
  assert.equal(recentRecords(x)['normal:0'].score,1100,'v8 latest history was reset');
});
test('an S badge with no provable S time never invents a timing challenge',()=>{
  const x=normalHarness({
    'xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S',achievedAt:'2026-10-01'}}),
    'xiaban-best-v8':JSON.stringify({'normal:0':legacyRun({lives:2,time:40})}),
    'xiaban-last-v8':JSON.stringify({'normal:0':legacyRun({won:false,time:35})})
  });
  assert.equal(challengeRecords(x)['normal:0'],undefined);assert.equal(achievementRecords(x)['normal:0'].grade,'S');
  assert(!x.all.challengeRecord.classList.contains('hidden'),'unknown-time S lacks an explanation');
  assert(/S/.test(x.all.challengeRecord.textContent)&&/再|用时|记录/.test(x.all.challengeRecord.textContent));
});
test('normal timing challenges remain separated by variant',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98});x.click('resultNewRoute');winResult(x,{elapsed:50.2});
  assert.deepEqual(challengeRecords(x)['normal:0'],{bestTimeCs:4598,targetSeconds:45});
  assert.deepEqual(challengeRecords(x)['normal:1'],{bestTimeCs:5020,targetSeconds:50});
});
test('daily original-line timing challenges keep their date across midnight',()=>{
  const x=makeHarness();x.click('menuDaily');winResult(x,{elapsed:46});x.setDay('2026-10-31');x.click('restartBtn');winResult(x,{elapsed:45.98});
  assert.deepEqual(challengeRecords(x)['daily:2026-10-30'],{bestTimeCs:4598,targetSeconds:45});
  assert.equal(challengeRecords(x)['daily:2026-10-31'],undefined);
  x.click('resultHome');x.click('menuDaily');winResult(x,{elapsed:50.2});assert.deepEqual(challengeRecords(x)['daily:2026-10-31'],{bestTimeCs:5020,targetSeconds:50});
});
const practiceCrash={cargoId:5,cargoType:'fish',cause:'从左侧滑落',side:'left',advice:'向左轻挪，把车送到鱼下面。',at:30.4};
function retryWithCrash(mode='normal'){
  const x=makeHarness({'xiaban-tutorial-v3':'done'});x.click(mode==='daily'?'menuDaily':'menuNormal');
  x.end({lastCrash:{...practiceCrash},finishReason:'crash'});x.click('restartBtn');return x;
}
function practiceFrame(x,{elapsed=24,cargoId=5,type='fish',kind='pickup',cargo=[],next=true,tail,settling=false}={}){
  x.force({elapsed,cargo,nextDrop:next?{cargoId,type,x:220,inSeconds:2}:null,guidance:{kind,cargoId,direction:kind==='rescue'?'left':'right',targetX:220,text:kind==='rescue'?'先救回饼，新货稍等':'提前挪到落点，到位松手',detail:kind==='rescue'?'先把这件旧货接稳':'当前动作指令'},settling,...(tail?{tail}:{})});x.review.hud();
}
test('last crash persists the cargo identity and original at timestamp for an original-line retry',()=>{
  const x=normalHarness();x.end({lastCrash:{...practiceCrash}});const saved=recentRecords(x)[x.review.recordKey()].lastCrash;
  assert.equal(saved.cargoId,5);assert.equal(saved.cargoType,'fish');assert.equal(saved.at,30.4);assert.equal(saved.side,'left');assert.equal(saved.advice,practiceCrash.advice);assert.equal(saved.elapsed,undefined,'wrong elapsed field survived the new writer');
});
test('the opening practice row gives the previous fact without changing the current action',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  assert(!x.all.practiceHint.classList.contains('hidden'),'opening context is missing');
  assert(/鱼/.test(x.all.practiceHint.textContent),'opening fact names the wrong cargo');
  assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');assert.equal(x.all.guideDetail.textContent,'当前动作指令');
});
test('a known crashed cargo is reminded when it is the actual foreground target',()=>{
  const x=retryWithCrash();practiceFrame(x);
  assert(!x.all.practiceHint.classList.contains('hidden'),'related cargo reminder is missing');
  assert(/鱼/.test(x.all.practiceHint.textContent)&&/左/.test(x.all.practiceHint.textContent),'specific correction is missing');
});
test('practice context stays hidden when an unrelated foreground conflicts with the old accident window',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:29,cargoId:6,type:'monday'});
  assert(x.all.practiceHint.classList.contains('hidden'),'unrelated active cargo received the old instruction');
});
test('a previously crashed but now supported cargo does not keep the row visible after its window',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:35,cargoId:6,type:'monday',cargo:[{id:5,type:'fish',caught:true,supported:true,risk:0}]});
  assert(x.all.practiceHint.classList.contains('hidden'),'stable old cargo kept a stale reminder visible');
});
test('an unrelated rescue instruction keeps priority over inherited practice context',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:29,cargoId:3,type:'bread',kind:'rescue'});
  assert.equal(x.all.guideText.textContent,'先救回饼，新货稍等');assert.equal(x.all.guideDetail.textContent,'先把这件旧货接稳');
  assert(x.all.practiceHint.classList.contains('hidden'),'unrelated rescue is distracted by old context');
});
test('pause and tutorial hide the practice row',()=>{
  const x=retryWithCrash();practiceFrame(x);assert(!x.all.practiceHint.classList.contains('hidden'));
  x.click('pauseBtn');x.review.hud();assert(x.all.practiceHint.classList.contains('hidden'),'paused practice row remains visible');
  x.click('menuTutorial');x.review.hud();assert(x.all.practiceHint.classList.contains('hidden'),'tutorial inherited formal practice');
});
test('new normal route does not inherit the previous route accident reminder',()=>{
  const x=retryWithCrash();x.end({lastCrash:{...practiceCrash}});x.click('resultNewRoute');practiceFrame(x);
  assert(x.all.practiceHint.classList.contains('hidden'),'crash context leaked across variants');
});
test('daily original-line retry inherits practice across midnight while a new date does not',()=>{
  const x=retryWithCrash('daily');x.setDay('2026-10-31');x.end({lastCrash:{...practiceCrash}});x.click('restartBtn');practiceFrame(x);
  assert.equal(x.review.state().snap.dateSeed,'2026-10-30');assert(!x.all.practiceHint.classList.contains('hidden'),'original daily context was lost');
  x.click('menuBtn');x.click('menuHome');x.click('menuDaily');practiceFrame(x);
  assert.equal(x.review.state().snap.dateSeed,'2026-10-31');assert(x.all.practiceHint.classList.contains('hidden'),'practice leaked into another daily date');
});
test('legacy duplicate bread with no identity or time has only the opening fact',()=>{
  const old=legacyRun({won:false,lives:0,finishReason:'crash',lastCrash:{cargoType:'bread',cause:'漏接',side:'left',advice:'提前到落点。'}});
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':old})});x.click('startBtn');
  practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});assert(!x.all.practiceHint.classList.contains('hidden'),'opening legacy fact is missing');
  practiceFrame(x,{elapsed:8,cargoId:3,type:'bread'});assert(x.all.practiceHint.classList.contains('hidden'),'ambiguous bread was treated as a known old parcel');
});
test('a failed station reminder applies to its station rather than every tail stop',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(1)});x.click('restartBtn');
  x.force({elapsed:45,catches:4,tail:{active:true,completed:false,step:1,targetX:145},guidance:{kind:'tail',direction:'left',text:'收工第1站',targetX:145}});x.review.hud();
  assert(x.all.practiceHint.classList.contains('hidden'),'second-station context shown at first station');
  x.force({tail:{active:true,completed:false,step:2,targetX:275},guidance:{kind:'tail',direction:'right',text:'收工第2站',targetX:275}});x.review.hud();
  assert(!x.all.practiceHint.classList.contains('hidden'),'relevant second-station context missing');assert(/2站/.test(x.all.practiceHint.textContent));assert.equal(x.all.guideText.textContent,'收工第2站');
});

test('a known accident time can remind before the accident when no foreground conflicts',()=>{
  const x=retryWithCrash();x.force({elapsed:30,cargo:[],nextDrop:null,guidance:{kind:'steady',direction:'steady',text:'货物稳定',detail:'保持当前操作'}});x.review.hud();
  assert(!x.all.practiceHint.classList.contains('hidden'),'non-conflicting accident window was ignored');assert(/鱼/.test(x.all.practiceHint.textContent));assert.equal(x.all.guideText.textContent,'货物稳定');
});
test('legacy unique cargo without identity or time can be reminded at that cargo',()=>{
  const old=legacyRun({won:false,lives:0,finishReason:'crash',lastCrash:{cargoType:'fish',cause:'从左侧滑落',side:'left',advice:'向左接鱼。'}});
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':old})});x.click('startBtn');practiceFrame(x);
  assert(!x.all.practiceHint.classList.contains('hidden'),'safe unique-type legacy fallback was lost');assert(/鱼/.test(x.all.practiceHint.textContent));
});
test('tutorial and replay never update or display a formal timing challenge as a new result',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98});const before=x.data.get('xiaban-s-challenges-v9');
  x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.click('exitReplay');assert.equal(x.data.get('xiaban-s-challenges-v9'),before,'replay changed timing history');
  x.click('menuTutorial');winResult(x,{elapsed:10});assert.equal(x.data.get('xiaban-s-challenges-v9'),before,'tutorial changed formal timing history');
});

test('an assisted A keeps its stability fact for opening and relevant rescue only',()=>{
  const x=normalHarness();winResult(x,{assists:1,lastCrash:null});x.click('restartBtn');
  practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  assert(/扶正/.test(x.all.practiceHint.textContent),'assisted result did not create a stability focus');
  x.force({elapsed:8,cargo:[],nextDrop:null,guidance:{kind:'steady',direction:'steady',text:'稳稳的'}});x.review.hud();
  assert(x.all.practiceHint.classList.contains('hidden'),'stability fact remained outside its relevant action');
  practiceFrame(x,{elapsed:10,cargoId:1,type:'bread',kind:'rescue'});
  assert(!x.all.practiceHint.classList.contains('hidden'));assert.equal(x.all.practiceHint.dataset.relevant,'true');
  assert.equal(x.all.guideText.textContent,'先救回饼，新货稍等');
});

test('an imprecise A reminds about the center during an actual pickup without replacing braking',()=>{
  const x=normalHarness();winResult(x,{perfectCatches:2,lastCrash:null});x.click('restartBtn');
  x.force({elapsed:8,cargo:[],nextDrop:null,guidance:{kind:'steady',direction:'steady',text:'货物稳定'}});x.review.hud();
  assert(x.all.practiceHint.classList.contains('hidden'),'precision fact has no active delivery');
  x.force({elapsed:9,nextDrop:{cargoId:2,type:'coffee',x:220,inSeconds:2},guidance:{kind:'brake',cargoId:2,direction:'stop',text:'到位了，松手刹车',detail:'当前刹车指令',targetX:220}});x.review.hud();
  assert(!x.all.practiceHint.classList.contains('hidden'));assert(/精准|中心/.test(x.all.practiceHint.textContent));
  assert.equal(x.all.practiceHint.dataset.relevant,'true');assert.equal(x.all.guideText.textContent,'到位了，松手刹车');assert.equal(x.all.guideDetail.textContent,'当前刹车指令');
});

test('R after a live crash prefers that crash over the older finished run and keeps it in the pause summary',()=>{
  const x=retryWithCrash();
  x.force({elapsed:12,lastCrash:{cargoId:2,cargoType:'coffee',cause:'漏接',side:'right',advice:'提前接住咖啡。',at:12}});x.key('r');
  practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  assert(/咖啡/.test(x.all.practiceHint.textContent),'R reused the older fish accident');
  assert(!/鱼/.test(x.all.practiceHint.textContent),'old and current accidents were mixed');
  assert.equal(recentRecords(x)['normal:0'].lastCrash.cargoType,'fish','an unfinished retry overwrote completed history');
  x.click('pauseBtn');assert(/咖啡/.test(x.all.menuSummary.textContent),'pause lost the active focus');assert(/暂停/.test(x.all.menuSummary.textContent));
});

test('arrival focus waits for arrival rather than following an unrelated earlier cargo crash',()=>{
  const x=normalHarness();x.end({finishReason:'unsafe_arrival',tail:completedTail(2),lastCrash:{...practiceCrash}});x.click('restartBtn');
  practiceFrame(x);assert(x.all.practiceHint.classList.contains('hidden'),'arrival focus appeared during normal delivery');
  x.force({elapsed:60,catches:4,settling:true,tail:{active:true,completed:true,step:2},nextDrop:null,guidance:{kind:'recovery',direction:'stop',text:'收工清点',targetX:210}});x.review.hud();
  assert(!x.all.practiceHint.classList.contains('hidden'),'arrival focus is missing at arrival');assert(/靠站/.test(x.all.practiceHint.textContent));
});

test('legacy elapsed accident times stay scoped to both the time window and cargo type',()=>{
  const old=legacyRun({won:false,lives:0,finishReason:'crash',lastCrash:{cargoType:'fish',cause:'从左侧滑落',side:'left',elapsed:30.4}});
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':old})});x.click('startBtn');
  practiceFrame(x,{elapsed:30});assert(!x.all.practiceHint.classList.contains('hidden'),'legacy accident time was ignored');
  practiceFrame(x,{elapsed:30,cargoId:6,type:'monday'});assert(x.all.practiceHint.classList.contains('hidden'),'legacy time overrode a different cargo');
  practiceFrame(x,{elapsed:40});assert(x.all.practiceHint.classList.contains('hidden'),'legacy accident reminder outlived its time window');
});

test('accident replay does not expose the inherited live practice row',()=>{
  const x=retryWithCrash();practiceFrame(x);assert(!x.all.practiceHint.classList.contains('hidden'));
  x.end({lastCrash:{...practiceCrash}});x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.review.hud();
  assert(x.all.practiceHint.classList.contains('hidden'),'live practice appeared over the replay');
});

// V10: the timed S stage is fixed at launch and evaluated before the next stage is stored.
function timedHarness(){return normalHarness({'xiaban-s-challenges-v9':JSON.stringify({'normal:0':{bestTimeCs:4598,targetSeconds:45}}),'xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S',achievedAt:'2026-10-01'}})});}
function emitGame(x,type,details={}){x.engine.cb({type,elapsed:x.review.state().snap.elapsed,...details});}
function parcel(id,type,extra={}){return{id,type,caught:true,supported:true,risk:0,x:210,y:550,...extra};}

test('timed HUD uses total perfect signatures rather than the current streak',()=>{
  const x=timedHarness();x.force({elapsed:10,catches:2,perfectCatches:2,streak:9});x.review.hud();
  assert(/S关余35s/.test(x.all.streak.textContent));assert(/精准2\/3/.test(x.all.streak.textContent));assert(!/可冲关|S有效/.test(x.all.streak.textContent));
  assert(/总精准2\/3/.test(x.all.streak.attrs['aria-label']));
  x.force({perfectCatches:3,streak:0,catches:6});x.review.hud();assert(/可冲关/.test(x.all.streak.textContent));assert.equal(x.all.streak.dataset.challenge,'active');assert.equal(x.all.runGoal.textContent,'签收4/4+');
});
for(const[label,stats,reason]of[['crash',{lives:2},/翻车/],['assist',{assists:1},/扶正/]])test('timed HUD explicitly loses S eligibility after '+label,()=>{
  const x=timedHarness();x.force({elapsed:20,perfectCatches:3,...stats});x.review.hud();
  assert.equal(x.all.streak.dataset.challenge,'failed');assert(/S已失格/.test(x.all.streak.textContent));assert(reason.test(x.all.streak.textContent));
});
test('exceeding the time stage does not falsely revoke the S grade',()=>{
  const x=timedHarness();x.force({elapsed:45.02,perfectCatches:3});x.review.hud();
  assert(/限时未达/.test(x.all.streak.textContent));assert(/仍可S/.test(x.all.streak.textContent));assert(!/S已失格/.test(x.all.streak.textContent));
  winResult(x,{elapsed:45.02,lastCrash:null});assert.equal(x.all.resultOverlay.dataset.grade,'S');assert(/S级/.test(x.all.resultTitle.textContent));assert.equal(x.all.resultChallenge.dataset.state,'failed');assert(/S已保持/.test(x.all.resultChallenge.textContent));
});
test('HUD and final stage verdict use the same centisecond boundary',()=>{
  const x=timedHarness();x.force({elapsed:45.001,perfectCatches:3});x.review.hud();assert(/可冲关/.test(x.all.streak.textContent));
  winResult(x,{elapsed:45.001,lastCrash:null});assert.equal(x.all.resultChallenge.dataset.state,'achieved');assert.equal(x.all.resultTime.textContent,'45.00');
  const y=timedHarness();y.force({elapsed:45.006,perfectCatches:3});y.review.hud();assert(/未达/.test(y.all.streak.textContent));winResult(y,{elapsed:45.006,lastCrash:null});assert.equal(y.all.resultChallenge.dataset.state,'failed');assert.equal(y.all.resultTime.textContent,'45.01');
});
test('pause contains the fixed stage and current eligibility in a compact summary',()=>{
  const x=timedHarness();x.force({elapsed:10,perfectCatches:2,streak:9});x.click('pauseBtn');
  assert(/45秒/.test(x.all.menuSummary.textContent)&&/保持S/.test(x.all.menuSummary.textContent));assert(/精准2\/3/.test(x.all.menuSummary.textContent));assert(/翻车0/.test(x.all.menuSummary.textContent)&&/扶正0/.test(x.all.menuSummary.textContent));
  assert(x.all.menuSummary.textContent.length<90,'pause summary is unnecessarily repetitive');
});
test('A below the time target explains that time passed but S did not',()=>{
  const x=timedHarness();winResult(x,{elapsed:44,lives:2,lastCrash:null});
  assert.equal(x.all.resultChallenge.dataset.state,'failed');assert(/44\.00秒已达45秒目标/.test(x.all.resultChallenge.textContent));assert(/翻车1次/.test(x.all.resultChallenge.textContent));assert(/未保持S/.test(x.all.resultChallenge.textContent));
  assert.equal(achievementRecords(x)['normal:0'].grade,'S');assert.deepEqual(challengeRecords(x)['normal:0'],{bestTimeCs:4598,targetSeconds:45});
});
test('nearby S times are displayed at hundredths and receive different old-stage verdicts',()=>{
  const over=timedHarness();winResult(over,{elapsed:45+1/60,lastCrash:null});
  assert.equal(over.all.resultTime.textContent,'45.02');assert(/45\.02秒/.test(over.all.resultSummary.textContent));assert.equal(over.all.resultChallenge.dataset.state,'failed');assert(/超出45秒目标0\.02秒/.test(over.all.resultChallenge.textContent));
  const under=timedHarness();winResult(under,{elapsed:45-1/60,lastCrash:null});
  assert.equal(under.all.resultTime.textContent,'44.98');assert.equal(under.all.resultChallenge.dataset.state,'achieved');assert(/45秒S关已达成/.test(under.all.resultChallenge.textContent));assert(/44\.98秒/.test(under.all.resultChallenge.textContent));assert(/全准|6件.*精准/.test(under.all.nextRunHint.textContent));assert(!/下一关/.test(under.all.resultChallenge.textContent),'the result repeats the next-stage line');
});
test('a first trustworthy S records a time without inventing an old stage success',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98,lastCrash:null});
  assert.equal(x.all.resultChallenge.dataset.state,'recorded');assert(/已记录.*45\.98秒/.test(x.all.resultChallenge.textContent));assert(!/已达成|本关未达/.test(x.all.resultChallenge.textContent));assert(/≤45秒/.test(x.all.nextRunHint.textContent));
});
test('a badge without a trustworthy time requests a real S recording and never invents a time limit',()=>{
  const x=normalHarness({'xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S',achievedAt:'2026-10-01'}})});x.force({streak:2,perfectCatches:2});x.review.hud();
  assert(/记录S.*精准2\/3/.test(x.all.streak.textContent));assert(!/S关余|≤.*秒/.test(x.all.streak.textContent));assert.equal(x.review.state().runStage.targetSeconds,null);x.end({lastCrash:null});assert(x.all.resultChallenge.classList.contains('hidden'));assert.equal(achievementRecords(x)['normal:0'].grade,'S');
});
test('retry resets the live time-stage state and a new variant never borrows the old target',()=>{
  const x=timedHarness();x.force({elapsed:50,lives:2,assists:1,perfectCatches:2});x.review.hud();assert.equal(x.all.streak.dataset.challenge,'failed');
  x.key('r');x.review.hud();assert(/精准0\/3/.test(x.all.streak.textContent));assert.equal(x.all.streak.dataset.challenge,'active');
  x.end({lastCrash:null});x.click('resultNewRoute');x.review.hud();assert.equal(x.all.streak.dataset.challenge,'active');assert.equal(x.review.state().runStage.kind,'s');assert.equal(x.review.state().runStage.targetSeconds,null);assert(!/S关余|S≤45/.test(x.all.streak.textContent));
});
test('the frozen old-stage report survives replay and duplicate finish after the time chapter is earned',()=>{
  const x=timedHarness();winResult(x,{elapsed:44.98,lastCrash:null});const text=x.all.resultChallenge.textContent,stored=x.data.get('xiaban-s-challenges-v9');
  x.review.finish(true);x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.click('exitReplay');
  assert.equal(x.all.resultChallenge.textContent,text);assert(/45秒S关已达成/.test(text));assert.equal(x.data.get('xiaban-s-challenges-v9'),stored);assert.deepEqual(challengeRecords(x)['normal:0'],{bestTimeCs:4498,targetSeconds:44});assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);
});

test('precision practice acknowledges total progress in game time and stops highlighting the old shortage',()=>{
  const x=normalHarness();winResult(x,{perfectCatches:2,lastCrash:null});x.click('restartBtn');
  practiceFrame(x,{elapsed:20,cargoId:4,type:'pot'});x.force({perfectCatches:3,streak:0});x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'achieved');assert.equal(x.all.practiceHint.dataset.relevant,'false');assert(!/不足/.test(x.all.practiceHint.textContent));assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');
  x.click('pauseBtn');x.engine.step(10);x.click('resumeBtn');x.review.hud();assert(!x.all.practiceHint.classList.contains('hidden'),'pause consumed the game-time acknowledgement');
  x.force({elapsed:22});x.review.hud();assert(!x.all.practiceHint.classList.contains('hidden'));
  x.force({elapsed:22.6});x.review.hud();assert(x.all.practiceHint.classList.contains('hidden'),'completed precision stays highlighted indefinitely');
  winResult(x,{perfectCatches:5,lastCrash:null});assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/本趟精准5件/.test(x.all.resultPractice.textContent));assert(!/继续稳车/.test(x.all.resultPractice.textContent));
});

test('catching the practice parcel gives temporary progress and final independent holding requires safe completion',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:20,cargoId:6,type:'monday',cargo:[parcel(5,'fish')]});emitGame(x,'catch',{cargoId:5,cargoType:'fish'});x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'progress');assert(/已接妥.*继续保货/.test(x.all.practiceHint.textContent));assert(!/独立|终点/.test(x.all.practiceHint.textContent));
  x.force({elapsed:23});x.review.hud();assert(x.all.practiceHint.classList.contains('hidden'),'short catch notice became a permanent instruction');
  winResult(x,{lastCrash:null,cargo:[parcel(5,'fish')]});assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/鱼独立保到了终点/.test(x.all.resultPractice.textContent));
});

test('a held practice parcel can be reminded near its old accident while another pickup remains the main action',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:29,cargoId:6,type:'monday',cargo:[parcel(5,'fish')]});
  assert(!x.all.practiceHint.classList.contains('hidden'));assert(/已接妥/.test(x.all.practiceHint.textContent));assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');
  practiceFrame(x,{elapsed:29,cargoId:3,type:'bread',kind:'rescue',cargo:[parcel(5,'fish')]});
  assert(x.all.practiceHint.classList.contains('hidden'),'urgent other rescue did not suppress the old practice reminder');assert.equal(x.all.guideText.textContent,'先救回饼，新货稍等');
});

test('a practice parcel caught then dropped remains a repeated mistake even after restoration',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:24,cargo:[parcel(5,'fish')]});emitGame(x,'catch',{cargoId:5,cargoType:'fish'});
  const accident={cargoId:5,cargoType:'fish',cause:'从左侧滑落',at:25};x.force({elapsed:25,lives:2,cargo:[],lastCrash:accident});emitGame(x,'crash',accident);
  x.force({cargo:[parcel(5,'fish',{restored:true})]});emitGame(x,'recovery',{phase:'restored'});
  winResult(x,{lives:2,lastCrash:accident,cargo:[parcel(5,'fish',{restored:true})]});assert.equal(x.all.resultPractice.dataset.state,'failed');assert(/接到后又掉落.*终局已归位/.test(x.all.resultPractice.textContent));assert(!/这次把鱼独立/.test(x.all.resultPractice.textContent));
});

test('missing coffee then signing its retry is partial recovery rather than a clean first catch',()=>{
  const x=normalHarness(),old={cargoId:2,cargoType:'coffee',cause:'漏接',side:'right',at:10};x.end({lastCrash:old});x.click('restartBtn');
  practiceFrame(x,{elapsed:10,cargoId:2,type:'coffee'});x.force({lives:2,lastCrash:old});emitGame(x,'crash',old);emitGame(x,'spawn',{cargoId:2,cargoType:'coffee',retry:true});
  x.force({elapsed:13,cargo:[parcel(2,'coffee')]});emitGame(x,'catch',{cargoId:2,cargoType:'coffee'});x.review.hud();assert.equal(x.all.practiceHint.dataset.state,'progress');assert(/补发已接到/.test(x.all.practiceHint.textContent));
  winResult(x,{lives:2,lastCrash:old,cargo:[parcel(2,'coffee')]});assert.equal(x.all.resultPractice.dataset.state,'progress');assert(/补发后已签收并保到终点.*首次投递仍漏接/.test(x.all.resultPractice.textContent));
});

test('assisted practice cargo is not reported as independently held at the finish',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:24,cargo:[parcel(5,'fish')]});emitGame(x,'catch',{cargoId:5,cargoType:'fish'});
  x.force({assists:1,cargo:[parcel(5,'fish',{restored:true})]});emitGame(x,'recovery',{phase:'assist',assist:true});
  winResult(x,{assists:1,lastCrash:null,cargo:[parcel(5,'fish',{restored:true})]});assert.equal(x.all.resultPractice.dataset.state,'progress');assert(/扶正.*不作独立保货/.test(x.all.resultPractice.textContent));
});

test('an authoritative safe win can confirm held practice cargo without imposing a second risk threshold',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:30,cargo:[parcel(5,'fish',{risk:.45})]});assert(/仍需救稳/.test(x.all.practiceHint.textContent));
  winResult(x,{lastCrash:null,cargo:[parcel(5,'fish',{risk:.45})]});assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/独立保到了终点/.test(x.all.resultPractice.textContent));assert(!/未安全收工/.test(x.all.resultPractice.textContent));
});

test('losing on another parcel confirms only local receipt rather than whole-run holding',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:24,cargo:[parcel(5,'fish')]});emitGame(x,'catch',{cargoId:5,cargoType:'fish'});
  x.end({cargo:[parcel(5,'fish')],lastCrash:{cargoId:6,cargoType:'monday',cause:'漏接',at:50}});assert.equal(x.all.resultPractice.dataset.state,'progress');assert(/鱼本次已接到.*整趟还未安全收工/.test(x.all.resultPractice.textContent));
});

test('practice evidence distinguishes identical bread parcels by cargo ID',()=>{
  const x=normalHarness();x.end({lastCrash:{cargoId:3,cargoType:'bread',cause:'漏接',at:17}});x.click('restartBtn');
  practiceFrame(x,{elapsed:10,cargoId:3,type:'bread',cargo:[parcel(1,'bread')]});emitGame(x,'catch',{cargoId:1,cargoType:'bread'});x.review.hud();assert.equal(x.all.practiceHint.dataset.state,'waiting');assert(!/已接妥/.test(x.all.practiceHint.textContent));
  x.force({cargo:[parcel(1,'bread'),parcel(3,'bread')]});emitGame(x,'catch',{cargoId:3,cargoType:'bread'});emitGame(x,'crash',{cargoId:1,cargoType:'bread',cause:'从左侧滑落'});x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'progress');assert(/已接妥/.test(x.all.practiceHint.textContent));assert(!/又掉落/.test(x.all.practiceHint.textContent));
});

test('an individually passed practice station is acknowledged without changing the current station action',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(0)});x.click('restartBtn');
  x.force({elapsed:45,catches:4,tail:{active:true,completed:false,step:2},guidance:{kind:'tail',text:'收工第2站',direction:'right'}});x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'achieved');assert.equal(x.all.practiceHint.dataset.relevant,'false');assert(/第1站这次已停稳/.test(x.all.practiceHint.textContent));assert.equal(x.all.guideText.textContent,'收工第2站');
  x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(1)});assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/第1站这次已停稳.*整趟未安全收工/.test(x.all.resultPractice.textContent));assert(!/继续保货/.test(x.all.resultPractice.textContent));
});

test('practice station report confirms safe completion with a terminal sentence',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(1)});x.click('restartBtn');winResult(x,{lastCrash:null});
  assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/第2站这次已停稳.*已安全收工/.test(x.all.resultPractice.textContent));assert(!/继续保货/.test(x.all.resultPractice.textContent));
});

test('legacy repeated bread without an identity never receives a fabricated individual holding verdict',()=>{
  const old=legacyRun({won:false,lives:0,finishReason:'crash',lastCrash:{cargoType:'bread',cause:'漏接'}}),x=normalHarness({'xiaban-last-v8':JSON.stringify({'normal:0':old})});
  winResult(x,{lastCrash:null,cargo:[parcel(1,'bread'),parcel(3,'bread')]});assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/缺少饼的编号/.test(x.all.resultPractice.textContent));
});

test('an A result retains the known time-stage number in the lobby beside its separate practice suggestion',()=>{
  const x=timedHarness();winResult(x,{elapsed:44,lives:2,lastCrash:null});x.click('resultHome');
  assert(/S最快45\.98秒.*限时章≤45秒且保持S/.test(x.all.challengeRecord.textContent));assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);assert(/保住三次机会/.test(x.all.nextChallengeHint.textContent));
});

test('new-route and tutorial starts clear old result feedback and do not inherit the practice focus',()=>{
  const x=retryWithCrash();winResult(x,{lastCrash:null,cargo:[parcel(5,'fish')]});assert(!x.all.resultPractice.classList.contains('hidden'));
  x.click('resultNewRoute');x.review.hud();assert(x.all.resultPractice.classList.contains('hidden'));assert(x.all.resultChallenge.classList.contains('hidden'));practiceFrame(x);assert(x.all.practiceHint.classList.contains('hidden'));
  x.click('menuTutorial');winResult(x,{lastCrash:null});assert(x.all.resultPractice.classList.contains('hidden'));assert(x.all.resultChallenge.classList.contains('hidden'));
});

// V11: finite, independently earned route chapters. These exercise real app
// handlers; the controlled engine only supplies observable game outcomes.
function stageRecords(x){return JSON.parse(x.data.get('xiaban-stages-v11')||'{}');}
function stagedHarness(badges={s:true,time:false,full:false},targetSeconds=45,options={}){
  const x=makeHarness({'xiaban-tutorial-v3':'done','xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S',achievedAt:'2026-10-01'}}),'xiaban-s-challenges-v9':JSON.stringify({'normal:0':{bestTimeCs:4598,targetSeconds:45}}),'xiaban-stages-v11':JSON.stringify({'normal:0':{badges,targetSeconds}})},options);
  x.click('menuNormal');return x;
}

for(const [kind,badges,target]of [['s',{s:false,time:false,full:false},null],['time',{s:true,time:false,full:false},45],['full',{s:true,time:true,full:false},45],['complete',{s:true,time:true,full:true},45]])test('the launch chapter is the first missing chapter: '+kind,()=>{
  const x=stagedHarness(badges,target),launched=x.review.state().runStage;
  assert.equal(launched.kind,kind);assert.equal(launched.targetSeconds,target);
  for(const [id,key]of [['badgeS','s'],['badgeTime','time'],['badgeFull','full']])assert.equal(x.all[id].dataset.earned,String(badges[key]),id);
  assert.equal(x.all.routeStages.dataset.state,kind==='complete'?'complete':'progress');
});

test('the S slot counts down its own target while the main clock remains the sixty-second round',()=>{
  const x=stagedHarness();x.force({elapsed:10,perfectCatches:3});x.review.hud();
  assert(/S.*余35s/.test(x.all.streak.textContent),x.all.streak.textContent);assert.equal(String(x.all.timer.textContent),'50');
  assert(!/余50|≤45/.test(x.all.streak.textContent));
});
for(const [elapsed,remaining]of [[41.99,'4s'],[42,'3.00s'],[42.02,'2.98s'],[44.98,'0.02s'],[45.001,'0.00s']])test('the S countdown boundary at '+elapsed+' shows '+remaining,()=>{
  const x=stagedHarness();x.force({elapsed,perfectCatches:3});x.review.hud();
  assert(x.all.streak.textContent.includes('余'+remaining),x.all.streak.textContent);assert.equal(x.all.streak.dataset.challenge,'active');assert.equal(x.all.streak.dataset.urgent,String(Math.round(elapsed*100)>=4200));
});
test('one centisecond beyond the target is late and never displays a negative countdown',()=>{
  const x=stagedHarness();x.force({elapsed:45.006,perfectCatches:3});x.review.hud();
  assert.equal(x.all.streak.dataset.challenge,'failed');assert.equal(x.all.streak.dataset.urgent,'false');assert(/限时未达|45s未达/.test(x.all.streak.textContent));assert(/仍可S/.test(x.all.streak.textContent));assert(!/余-/.test(x.all.streak.textContent));
});
test('pause preserves the same remaining S time and terminal verdict uses its centisecond boundary',()=>{
  const x=stagedHarness();x.force({elapsed:42.02,perfectCatches:3});x.review.hud();const before=x.all.streak.textContent;
  x.click('pauseBtn');x.engine.step(5);x.review.hud();assert.equal(x.all.streak.textContent,before);assert(/2\.98/.test(x.all.menuSummary.textContent),x.all.menuSummary.textContent);
  x.click('resumeBtn');winResult(x,{elapsed:45.001,lastCrash:null});assert.equal(stageRecords(x)['normal:0'].badges.time,true);assert.equal(x.all.resultTime.textContent,'45.00');
});

test('a first full S earns S and full chapters but cannot retroactively pass a time target',()=>{
  const x=normalHarness();winResult(x,{elapsed:41.87,catches:6,perfectCatches:6,lastCrash:null});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:false,full:true},targetSeconds:42});
  assert.equal(x.all.stageReward.dataset.kind,'badge');assert.equal(String(x.all.stageReward.dataset.count),'2');assert.equal(String(x.all.stageReward.dataset.newCount),'2');assert(!x.all.stageReward.classList.contains('hidden'));assert(/S|全准/.test(x.all.stageReward.textContent));
});
test('the first S freezes a target once while later fastest S records continue improving independently',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98,lastCrash:null});assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);
  x.click('restartBtn');winResult(x,{elapsed:43.25,lastCrash:null});const chapters=stageRecords(x)['normal:0'];
  assert.equal(chapters.targetSeconds,45);assert.equal(chapters.badges.time,true);assert.equal(challengeRecords(x)['normal:0'].bestTimeCs,4325);assert.equal(achievementRecords(x)['normal:0'].grade,'S');
  x.click('restartBtn');winResult(x,{elapsed:41.87,lastCrash:null});assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);assert.equal(challengeRecords(x)['normal:0'].bestTimeCs,4187);
});
test('a new first S builds the next-run baseline without claiming a pre-existing time chapter',()=>{
  const x=normalHarness();winResult(x,{elapsed:45.98,lastCrash:null});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:false,full:false},targetSeconds:45});
  assert(!/限时章.*获得|45秒.*已达成/.test(x.all.stageReward.textContent));assert(/45/.test(x.all.nextRunHint.textContent));
});
test('a stored target without its prerequisite S chapter cannot make the first S also pass the time chapter',()=>{
  const x=stagedHarness({s:false,time:false,full:false},45);assert.equal(x.review.state().runStage.kind,'s');winResult(x,{elapsed:44,lastCrash:null});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:false,full:false},targetSeconds:45});assert.equal(x.all.stageReward.dataset.newCount,'1');
});
test('one existing time target can award time and full together and visibly graduate',()=>{
  const x=stagedHarness();winResult(x,{elapsed:44.98,catches:6,perfectCatches:6,lastCrash:null});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:true,full:true},targetSeconds:45});
  assert.equal(x.all.stageReward.dataset.kind,'graduate');assert.equal(String(x.all.stageReward.dataset.count),'3');assert.equal(String(x.all.stageReward.dataset.newCount),'2');assert(/限时|全准/.test(x.all.stageReward.textContent));
  x.click('resultHome');assert.equal(x.all.routeStages.dataset.state,'complete');assert(/3\s*\/\s*3/.test(x.all.stageCount.textContent));assert(/换线|自由/.test(x.all.nextChallengeHint.textContent));
});
for(const [label,stats]of [['only five signed',{catches:5,perfectCatches:6}],['one imperfect',{catches:6,perfectCatches:5}],['crash disqualifies S',{catches:6,perfectCatches:6,lives:2}],['assist disqualifies S',{catches:6,perfectCatches:6,assists:1}]])test('the full chapter rejects '+label,()=>{
  const x=stagedHarness({s:true,time:true,full:false});winResult(x,{elapsed:44,lastCrash:null,...stats});assert.equal(stageRecords(x)['normal:0'].badges.full,false);
});
test('an A inside the time target earns neither the time nor full S chapter',()=>{
  const x=stagedHarness();winResult(x,{elapsed:44,catches:6,perfectCatches:6,lives:2,lastCrash:null});
  assert.deepEqual(stageRecords(x)['normal:0'].badges,{s:true,time:false,full:false});assert(x.all.stageReward.classList.contains('hidden'));assert.equal(achievementRecords(x)['normal:0'].grade,'S');
});
test('graduated routes keep their frozen target and offer free play or another route instead of tighter seconds',()=>{
  const x=stagedHarness({s:true,time:true,full:true});winResult(x,{elapsed:41.87,catches:6,perfectCatches:6,lastCrash:null});
  assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);assert(x.all.stageReward.classList.contains('hidden'));assert(!/≤41秒|≤40秒|下一关.*秒/.test(x.all.nextRunHint.textContent));assert(/换线|自由/.test(x.all.nextRunHint.textContent));
});
test('duplicate finish and accident replay neither grant chapters twice nor restart reward effects',()=>{
  const x=stagedHarness();winResult(x,{elapsed:44.98,catches:6,perfectCatches:6,lastCrash:null});const stored=x.data.get('xiaban-stages-v11'),reward=x.all.stageReward.textContent,effects={...x.review.effects()};
  x.review.finish(true);assert.equal(x.data.get('xiaban-stages-v11'),stored);assert.equal(x.all.stageReward.textContent,reward);assert.deepEqual({...x.review.effects()},effects);
  x.review.accident({event:{cargoType:'fish'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.click('exitReplay');assert.equal(x.data.get('xiaban-stages-v11'),stored);assert.equal(x.all.stageReward.textContent,reward);
});
test('reload cannot turn the newly recorded first S into a retroactive time chapter or reward',()=>{
  const x=normalHarness();winResult(x,{elapsed:41.87,catches:6,perfectCatches:6,lastCrash:null});const stored=x.data.get('xiaban-stages-v11');
  const reopened=makeHarness(Object.fromEntries(x.data));assert.equal(reopened.data.get('xiaban-stages-v11'),stored);assert.equal(stageRecords(reopened)['normal:0'].badges.time,false);assert(reopened.all.stageReward.classList.contains('hidden'));assert.equal(reopened.audioCalls.oscillators,0);
});
test('an existing stage entry cannot gain time from historical latest records during reload',()=>{
  const x=normalHarness({'xiaban-stages-v11':JSON.stringify({'normal:0':{badges:{s:true,time:false,full:false},targetSeconds:45}}),'xiaban-last-v8':JSON.stringify({'normal:0':legacyRun({time:44.98})})});
  assert.equal(stageRecords(x)['normal:0'].badges.time,false);assert.equal(stageRecords(x)['normal:0'].targetSeconds,45);
});
test('provable historical S 41.87 with six real signatures migrates to all three chapters silently',()=>{
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':legacyRun({time:41.87,catches:6,perfectCatches:6})})});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:true,full:true},targetSeconds:42});assert.equal(x.all.routeStages.dataset.state,'complete');assert(x.all.stageReward.classList.contains('hidden'));assert.equal(x.audioCalls.oscillators,0);
});
test('an old S badge without a proven time preserves only its S chapter',()=>{
  const x=normalHarness({'xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S',achievedAt:'2026-10-01'}})});
  assert.deepEqual(stageRecords(x)['normal:0'],{badges:{s:true,time:false,full:false},targetSeconds:null});assert.equal(x.all.routeStages.dataset.state,'progress');assert(/1\s*\/\s*3/.test(x.all.stageCount.textContent));
});
test('historical best.perfect six without a signed count cannot fabricate the full chapter',()=>{
  const x=normalHarness({'xiaban-best-v8':JSON.stringify({'normal:0':{won:true,score:1200,time:41.87,lives:3,assists:0,perfect:6}})});
  assert.equal(stageRecords(x)['normal:0'].badges.s,true);assert.equal(stageRecords(x)['normal:0'].badges.time,true);assert.equal(stageRecords(x)['normal:0'].badges.full,false);assert.equal(bestRecords(x)['normal:0'].score,1200);
});
test('chapters stay separated by normal variant and original daily date after midnight',()=>{
  const x=normalHarness();winResult(x,{elapsed:41.87,catches:6,perfectCatches:6,lastCrash:null});x.click('resultNewRoute');assert.notEqual(x.review.recordKey(),'normal:0');winResult(x,{elapsed:50,lastCrash:null});
  assert.equal(stageRecords(x)['normal:0'].badges.full,true);assert.equal(stageRecords(x)['normal:1'].badges.full,false);assert.equal(stageRecords(x)['normal:1'].targetSeconds,49);
  x.click('menuDaily');winResult(x,{elapsed:46,lastCrash:null});x.setDay('2026-10-31');x.click('restartBtn');winResult(x,{elapsed:44.98,lastCrash:null});assert.equal(stageRecords(x)['daily:2026-10-30'].badges.time,true);assert.equal(stageRecords(x)['daily:2026-10-31'],undefined);
});
test('tutorial and a newly selected route clear chapter reward presentation without changing prior chapters',()=>{
  const x=normalHarness();winResult(x,{elapsed:41.87,catches:6,perfectCatches:6,lastCrash:null});const original=stageRecords(x)['normal:0'];
  x.click('resultNewRoute');assert(x.all.stageReward.classList.contains('hidden'));assert.deepEqual(stageRecords(x)['normal:0'],original);const stored=x.data.get('xiaban-stages-v11');x.click('menuTutorial');winResult(x,{elapsed:10,catches:6,perfectCatches:6,lastCrash:null});assert.equal(x.data.get('xiaban-stages-v11'),stored);assert(x.all.stageReward.classList.contains('hidden'));assert(x.all.routeStages.classList.contains('hidden'));
});
test('muted chapter rewards do not create synthesized sound and reduced motion suppresses new celebration particles',()=>{
  const x=stagedHarness(undefined,45,{reducedMotion:true}),baseline=stagedHarness({s:true,time:true,full:true},45,{reducedMotion:true});
  for(const h of[x,baseline])winResult(h,{elapsed:44.98,catches:6,perfectCatches:6,lastCrash:null});
  assert.equal(x.audioCalls.oscillators,0);assert.equal(x.review.effects().particles,baseline.review.effects().particles,'the chapter reward adds no particles beyond the existing safe-win effect');assert.equal(x.all.stageReward.dataset.kind,'graduate');
});
test('an audible new graduation adds feedback once beyond the ordinary S win',()=>{
  const x=stagedHarness(),baseline=stagedHarness({s:true,time:true,full:true});
  for(const h of[x,baseline]){h.click('soundBtn');winResult(h,{elapsed:44.98,catches:6,perfectCatches:6,lastCrash:null});}
  assert(x.audioCalls.oscillators>baseline.audioCalls.oscillators,'new graduation lacks its additional sound');assert(x.review.effects().particles>baseline.review.effects().particles,'new graduation lacks its additional visual feedback');
  const sounded=x.audioCalls.oscillators;x.review.finish(true);assert.equal(x.audioCalls.oscillators,sounded,'duplicate finish played the graduation again');
});

test('dying before the old parcel ever appears reports neutral not-yet-practised',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:10,cargoId:2,type:'coffee'});x.end({elapsed:10,cargo:[],lastCrash:{cargoId:1,cargoType:'bread',cause:'从左侧滑落',at:10}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/尚未练到|未练到/.test(x.all.resultPractice.textContent));assert(!/未确认接住|本次仍漏接/.test(x.all.resultPractice.textContent));
});
test('a preview alone is not evidence that the old practice parcel was actually attempted',()=>{
  const x=retryWithCrash();practiceFrame(x,{elapsed:24,cargoId:5,type:'fish'});x.end({elapsed:24,cargo:[],lastCrash:{cargoId:1,cargoType:'bread',cause:'从左侧滑落',at:24}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/未练到/.test(x.all.resultPractice.textContent));
});
test('a real old-parcel spawn followed by its miss is a repeated failed attempt',()=>{
  const x=retryWithCrash();emitGame(x,'spawn',{cargoId:5,cargoType:'fish',retry:false});const miss={cargoId:5,cargoType:'fish',cause:'漏接',at:30};emitGame(x,'crash',miss);x.end({elapsed:30,cargo:[],lastCrash:miss});
  assert.equal(x.all.resultPractice.dataset.state,'failed');assert(/漏接|未接/.test(x.all.resultPractice.textContent));assert(!/未练到/.test(x.all.resultPractice.textContent));
});
test('a spawned practice parcel still in flight at another crash is unfinished rather than a fabricated miss',()=>{
  const x=retryWithCrash();emitGame(x,'spawn',{cargoId:5,cargoType:'fish',retry:false});x.end({elapsed:25,cargo:[parcel(5,'fish',{caught:false,supported:false})],lastCrash:{cargoId:1,cargoType:'bread',cause:'从左侧滑落',at:25}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/已投出.*尚未完成/.test(x.all.resultPractice.textContent));assert(!/本次仍漏接|未练到/.test(x.all.resultPractice.textContent));
});
for(const step of[1,2])test('dying before practice station '+step+' is neutral, not a parking failure',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(step-1)});x.click('restartBtn');x.end({elapsed:10,tail:{active:false,completed:false,step:1},lastCrash:{cargoId:1,cargoType:'bread',cause:'漏接',at:10}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/未练到/.test(x.all.resultPractice.textContent));assert(!/这次仍未停稳/.test(x.all.resultPractice.textContent));
});
test('reaching only station one does not count as attempting an old station-two practice',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(1)});x.click('restartBtn');x.force({elapsed:45,tail:{active:true,completed:false,step:1},guidance:{kind:'tail',direction:'left',text:'收工第1站'}});x.review.hud();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:{active:true,completed:false,step:1}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/未练到第2站/.test(x.all.resultPractice.textContent));
});
test('actually entering the old station and failing to park is still a failed practice attempt',()=>{
  const x=normalHarness();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:completedTail(1)});x.click('restartBtn');x.force({elapsed:45,tail:{active:true,completed:false,step:2,targetX:275},guidance:{kind:'tail',direction:'right',text:'收工第2站',targetX:275}});x.review.hud();x.end({finishReason:'tail_incomplete',lastCrash:null,tail:{active:true,completed:false,step:2}});
  assert.equal(x.all.resultPractice.dataset.state,'failed');assert(/未停稳/.test(x.all.resultPractice.textContent));
});
test('arrival practice is neutral before arrival but failed after entering an unsafe final check',()=>{
  const x=normalHarness();x.end({finishReason:'unsafe_arrival',tail:completedTail(2),lastCrash:null});x.click('restartBtn');x.end({elapsed:10,tail:{active:false,completed:false,step:1}});assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/未练到/.test(x.all.resultPractice.textContent));
  const y=normalHarness();y.end({finishReason:'unsafe_arrival',tail:completedTail(2),lastCrash:null});y.click('restartBtn');y.force({elapsed:60,settling:true,tail:completedTail(2)});y.review.hud();y.end({finishReason:'unsafe_arrival',settling:true,tail:completedTail(2),lastCrash:null});assert.equal(y.all.resultPractice.dataset.state,'failed');assert(/未安全靠站/.test(y.all.resultPractice.textContent));
});

for(const [label,unthrownCount,retryExpiredCount,positive,negative]of [['original never sent',1,0,/1件(?:原单)?未投出/,/补发.*过窗|未能签收/],['real missed retry expired',0,1,/1件.*补发|补发.*1件/,/1件(?:原单)?未投出/],['both categories',1,1,/未投出.*补发|补发.*未投出/,/2件(?:原单)?未投出/]])test('job UI reports '+label+' from real classified counts',()=>{
  const x=normalHarness();x.force({catches:4,tail:{active:false,completed:false,step:1},job:{minimumMet:true,required:4,total:6,sent:6-unthrownCount,remainingDeliveries:unthrownCount,airborneUnsigned:0,retryCount:0,unavailableDeliveries:unthrownCount+retryExpiredCount,unthrownCount,retryExpiredCount,deliveriesClosed:true,phase:'settling'},guidance:{kind:'steady',direction:'steady',text:'稳住准备停站'}});x.review.hud();const text=x.all.jobTitle.textContent+' '+x.all.jobDetail.textContent;
  assert(positive.test(text),text);assert(!negative.test(text),text);assert(!/待补发|待投递|等下一件/.test(text),text);
});
test('recovery copy preserves the engine distinction between never-thrown originals and expired real retries',()=>{
  const x=normalHarness();x.force({catches:5,recovery:{restoredCount:5,unthrownCount:1,retryExpiredCount:0,text:'5件已签收货已归位；1件原单未投出'},guidance:{kind:'recovery',direction:'stop',text:'5件已签收货已归位；1件原单未投出'}});x.review.hud();
  assert(/1件原单未投出/.test(x.all.guideText.textContent+' '+x.all.recoveryNote.textContent));assert(!/补发窗口已过/.test(x.all.guideText.textContent+' '+x.all.recoveryNote.textContent));
});

// V12: the next original-line attempt must have a specific, evidenced exercise.
const V12_PROGRESS='xiaban-progress-v12';
const V12_TYPES=['bread','coffee','bread','pot','fish','monday'];
function v12Catch(cargoId=2,overrides={}){
  return {cargoId,cargoType:V12_TYPES[cargoId-1],order:cargoId,quality:'good',offsetX:31,speed:0,reason:'offset',correction:'right',at:cargoId*5,retry:false,...overrides};
}
function v12Details(badId=2,overrides={}){
  return V12_TYPES.map((cargoType,index)=>v12Catch(index+1,index+1===badId?overrides:{quality:'perfect',offsetX:0,reason:null,correction:null}));
}
function v12FullHarness(catchDetails=v12Details(),extra={},options={}){
  const old=legacyRun({time:50,catches:6,perfectCatches:5,catchDetails,lastCrash:null});
  const x=makeHarness({'xiaban-player-v9':JSON.stringify({mode:'normal',variant:0}),'xiaban-last-v8':JSON.stringify({'normal:0':old}),'xiaban-achievements-v7':JSON.stringify({'normal:0':{grade:'S'}}),'xiaban-s-challenges-v9':JSON.stringify({'normal:0':{bestTimeCs:4498,targetSeconds:44}}),'xiaban-stages-v11':JSON.stringify({'normal:0':{badges:{s:true,time:true,full:false},targetSeconds:45}}),...extra},options);
  x.click('startBtn');return x;
}
function v12Progress(x){return JSON.parse(x.data.get(V12_PROGRESS)||'{}');}
function v12Milestones(overrides={}){return{milestones:{fourCatches:true,twoStops:true,finish:true},bestPerfect:5,...overrides};}
function v12Graduated(extra={},badges={s:true,time:true,full:true}){
  return {'xiaban-player-v9':JSON.stringify({mode:'normal',variant:0}),'xiaban-stages-v11':JSON.stringify({'normal:0':{badges,targetSeconds:45},...extra})};
}

test('a five-of-six full chapter names the actual parcel and carries its offset exercise into original-line retry',()=>{
  const x=v12FullHarness();
  practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  assert(!x.all.practiceHint.classList.contains('hidden'));
  assert(/第?2件|2号/.test(x.all.practiceHint.textContent),x.all.practiceHint.textContent);
  assert(/咖啡/.test(x.all.practiceHint.textContent),x.all.practiceHint.textContent);
  assert(/偏|右|中心/.test(x.all.practiceHint.textContent),x.all.practiceHint.textContent);
  assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');
  practiceFrame(x,{elapsed:9,cargoId:2,type:'coffee'});
  assert(!x.all.practiceHint.classList.contains('hidden'),'the exercise did not return at the real parcel preview');
  assert(/咖啡/.test(x.all.practiceHint.textContent));
  winResult(x,{elapsed:51,catches:6,perfectCatches:5,lastCrash:null,catchDetails:v12Details()});
  assert(/咖啡/.test(x.all.nextRunHint.textContent+' '+x.all.resultPractice.textContent),'terminal feedback lost the specific exercise');
  const saved=recentRecords(x)['normal:0'].catchDetails;
  assert(saved.some(d=>d.cargoId===2&&d.quality==='good'&&d.reason==='offset'),'real parcel detail was not retained');
  x.click('restartBtn');practiceFrame(x,{elapsed:9,cargoId:2,type:'coffee'});
  assert(!x.all.practiceHint.classList.contains('hidden'));assert(/咖啡/.test(x.all.practiceHint.textContent));
});

test('a speed-only precision error recommends braking rather than inventing a lateral mistake',()=>{
  const x=v12FullHarness(v12Details(2,{offsetX:4,speed:115,reason:'speed',correction:'brake'}));
  practiceFrame(x,{elapsed:9,cargoId:2,type:'coffee'});const text=x.all.practiceHint.textContent;
  assert(/咖啡/.test(text)&&/快|松手|刹|停稳/.test(text),text);
  assert(!/偏左|偏右|落在车[左右]侧/.test(text),'centred but moving catch was falsely labelled lateral: '+text);
});

test('an offset-and-speed catch explains both observed reasons without replacing the current foreground action',()=>{
  const x=v12FullHarness(v12Details(4,{offsetX:-35,speed:120,reason:'offset_speed',correction:'left'}));
  practiceFrame(x,{elapsed:19,cargoId:4,type:'pot'});const text=x.all.practiceHint.textContent;
  assert(/锅/.test(text)&&/左|偏|中心/.test(text)&&/快|松手|刹|停稳/.test(text),text);
  assert.equal(x.all.guideText.textContent,'提前挪到落点，到位松手');
});

test('precision practice distinguishes the third parcel of bread from the first identical type',()=>{
  const x=v12FullHarness(v12Details(3));
  practiceFrame(x,{elapsed:8,cargoId:1,type:'bread'});
  assert(x.all.practiceHint.classList.contains('hidden'),'the first bread inherited the third bread exercise');
  practiceFrame(x,{elapsed:14,cargoId:3,type:'bread'});
  assert(!x.all.practiceHint.classList.contains('hidden'));assert(/第?3件|3号/.test(x.all.practiceHint.textContent));
});

test('an unknown legacy five-of-six record never fabricates a named parcel for precision practice',()=>{
  const x=v12FullHarness([]);practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  const text=x.all.practiceHint.classList.contains('hidden')?'':x.all.practiceHint.textContent;
  assert(!/咖啡|锅|鱼|第2件|第3件/.test(text),text);
  assert(/6|全|精准/.test(x.all.streak.textContent+' '+x.all.nextChallengeHint.textContent));
});

test('precision practice before its parcel is thrown is neutral at an unrelated early failure',()=>{
  const x=v12FullHarness();x.end({elapsed:5,catches:1,perfectCatches:1,catchDetails:[v12Catch(1,{quality:'perfect',reason:null,correction:null,offsetX:0})],lastCrash:{cargoId:1,cargoType:'bread',cause:'从左侧滑落',at:5}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/未练到|尚未/.test(x.all.resultPractice.textContent),x.all.resultPractice.textContent);
  assert(!/本次仍|接偏|又/.test(x.all.resultPractice.textContent));
});

test('a real ordinary catch of the practised parcel is failed precision practice',()=>{
  const x=v12FullHarness(),detail=v12Catch();practiceFrame(x,{elapsed:10,cargoId:2,type:'coffee',cargo:[parcel(2,'coffee')]});emitGame(x,'catch',detail);x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'failed');assert(/咖啡/.test(x.all.practiceHint.textContent));
  winResult(x,{catches:6,perfectCatches:5,lastCrash:null,catchDetails:v12Details()});
  assert.equal(x.all.resultPractice.dataset.state,'failed');assert(/偏|精准未|仍未|非精准/.test(x.all.resultPractice.textContent),x.all.resultPractice.textContent);
});

test('a true perfect catch fulfils the parcel exercise even if the whole run later fails elsewhere',()=>{
  const x=v12FullHarness(),detail=v12Catch(2,{quality:'perfect',reason:null,correction:null,offsetX:0});
  practiceFrame(x,{elapsed:10,cargoId:2,type:'coffee',cargo:[parcel(2,'coffee')]});emitGame(x,'catch',detail);x.review.hud();
  assert.equal(x.all.practiceHint.dataset.state,'achieved');
  x.end({elapsed:20,catches:3,perfectCatches:3,catchDetails:[detail],lastCrash:{cargoId:4,cargoType:'pot',cause:'从右侧滑落',at:20}});
  assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/咖啡/.test(x.all.resultPractice.textContent));
  assert(/精准/.test(x.all.resultPractice.textContent));assert(!/整趟.*成功|已安全收工/.test(x.all.resultPractice.textContent));
});

test('a real missed precision parcel is a failed attempt rather than not-yet-practised',()=>{
  const x=v12FullHarness(),miss={cargoId:2,cargoType:'coffee',cause:'漏接',at:10};
  emitGame(x,'spawn',{cargoId:2,cargoType:'coffee'});emitGame(x,'crash',miss);
  x.end({elapsed:10,catches:1,perfectCatches:1,catchDetails:[],lastCrash:miss});
  assert.equal(x.all.resultPractice.dataset.state,'failed');assert(/咖啡/.test(x.all.resultPractice.textContent));assert(/漏接|未接/.test(x.all.resultPractice.textContent));assert(!/未练到/.test(x.all.resultPractice.textContent));
});

test('restoring a good catch does not retroactively turn the precision exercise into perfect',()=>{
  const x=v12FullHarness(),detail=v12Catch();emitGame(x,'catch',detail);x.force({cargo:[parcel(2,'coffee',{restored:true})]});emitGame(x,'recovery',{phase:'restored'});
  winResult(x,{catches:6,perfectCatches:5,lastCrash:null,cargo:[parcel(2,'coffee',{restored:true})],catchDetails:v12Details()});
  assert.equal(x.all.resultPractice.dataset.state,'failed');
  const saved=recentRecords(x)['normal:0'].catchDetails.filter(d=>d.cargoId===2);
  assert.equal(saved.length,1);assert.equal(saved[0].quality,'good');assert.equal(saved[0].offsetX,31);
});

test('the next full-chapter retry still prioritizes an actual crash over an earlier off-centre catch',()=>{
  const x=v12FullHarness();winResult(x,{catches:6,perfectCatches:5,lives:2,catchDetails:v12Details(),lastCrash:{cargoId:5,cargoType:'fish',cause:'从左侧滑落',side:'left',at:30}});
  x.click('restartBtn');practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  assert(/鱼/.test(x.all.practiceHint.textContent));assert(!/咖啡/.test(x.all.practiceHint.textContent));
});

test('an unthrown parcel cannot be invented as an imprecise signed parcel',()=>{
  const x=v12FullHarness(v12Details().filter(d=>d.cargoId!==2));
  winResult(x,{catches:5,perfectCatches:5,lastCrash:null,catchDetails:v12Details(0).filter(d=>d.cargoId!==2),job:{unthrownCount:1,retryExpiredCount:0,unavailableItems:[{cargoId:2,cargoType:'coffee',order:2,kind:'unthrown',reasonText:'投递需在39秒前留够预告，本趟窗口不足。'}],cutoffSeconds:39}});
  const details=recentRecords(x)['normal:0'].catchDetails;assert(!details.some(d=>d.cargoId===2));
  x.click('restartBtn');practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  const text=x.all.practiceHint.classList.contains('hidden')?'':x.all.practiceHint.textContent;
  assert(!/咖啡.*接偏|咖啡.*太快/.test(text),text);
});

const V12_UNTHROWN={cargoId:6,cargoType:'monday',order:6,kind:'unthrown',reasonText:'投递需在39秒前留够预告，本趟窗口不足。'};
const V12_EXPIRED={cargoId:2,cargoType:'coffee',order:2,kind:'retryExpired',reasonText:'补发需在39秒前留够预告，本趟不再补发。'};
for(const [label,items,unthrownCount,retryExpiredCount]of [['original',[V12_UNTHROWN],1,0],['retry',[V12_EXPIRED],0,1],['mixed',[V12_UNTHROWN,V12_EXPIRED],1,1]])test('the '+label+' unavailable-delivery explanation survives into the report with identity and deadline reason',()=>{
  const x=normalHarness();winResult(x,{catches:5,perfectCatches:5,lives:2,lastCrash:null,job:{unthrownCount,retryExpiredCount,unavailableItems:items,cutoffSeconds:39,deliveriesClosed:true}});
  assert(!x.all.resultDelivery.classList.contains('hidden'));
  assert.equal(x.all.resultDelivery.dataset.state,'unavailable');
  assert.equal(String(x.all.resultDelivery.dataset.unthrown),String(unthrownCount));assert.equal(String(x.all.resultDelivery.dataset.retryExpired),String(retryExpiredCount));
  const text=x.all.resultDelivery.textContent;
  for(const item of items)assert(text.includes(item.cargoType==='monday'?'周一':'咖啡'),text);
  assert(/39/.test(text)&&/预告|窗口/.test(text),text);
  assert(/不再|本趟|结束/.test(text),text);
  if(label==='original'){assert(/未投/.test(text));assert(!/漏接.*周一|周一.*漏接|补发过期/.test(text),text)}
  if(label==='retry'){assert(/补发/.test(text));assert(!/原单未投/.test(text),text)}
  x.click('resultMenu');x.click('resumeBtn');assert.equal(x.all.resultDelivery.textContent,text);assert(!x.all.resultDelivery.classList.contains('hidden'));
});

test('a clean report hides the previous unavailable-delivery explanation and retry clears it before the next attempt',()=>{
  const x=normalHarness();winResult(x,{job:{unthrownCount:1,retryExpiredCount:0,unavailableItems:[V12_UNTHROWN],cutoffSeconds:39}});assert(!x.all.resultDelivery.classList.contains('hidden'));
  x.click('restartBtn');assert(x.all.resultDelivery.classList.contains('hidden'));
  winResult(x,{lastCrash:null,job:{unthrownCount:0,retryExpiredCount:0,unavailableItems:[],cutoffSeconds:39}});assert(x.all.resultDelivery.classList.contains('hidden'));
});

test('a graduated route recommends the next unfinished line and previews its remaining chapter',()=>{
  const x=normalHarness(v12Graduated({'normal:1':{badges:{s:true,time:true,full:true},targetSeconds:45},'normal:2':{badges:{s:true,time:false,full:false},targetSeconds:48}}));
  winResult(x,{catches:6,perfectCatches:6,lastCrash:null});
  assert.equal(x.all.resultDock.dataset.graduated,'true');assert(!x.all.graduateNextBtn.classList.contains('hidden'));
  assert.equal(x.all.graduateNextBtn.dataset.mode,'normal');assert.equal(String(x.all.graduateNextBtn.dataset.variant),'2');assert.equal(x.all.graduateNextBtn.dataset.key,'normal:2');
  const text=x.all.graduateNextBtn.textContent+' '+x.all.routeNextHint.textContent;
  assert(/测试路线2/.test(text),text);assert(/1\s*\/\s*3/.test(text),text);assert(/限时|48/.test(text),text);
  x.click('graduateNextBtn');assert.equal(x.latest().mode,'normal');assert.equal(x.latest().variant,2);assert.equal(x.review.recordKey(),'normal:2');
});

for(const action of['restartBtn','r',' '])test('graduation keeps '+JSON.stringify(action)+' as an original-line retry despite the new primary recommendation',()=>{
  const x=normalHarness(v12Graduated());winResult(x,{catches:6,perfectCatches:6,lastCrash:null});const original=x.latest();
  if(action==='restartBtn')x.click(action);else x.key(action);
  assert(same(original,x.latest()),JSON.stringify({original,after:x.latest()}));assert(x.all.graduateNextBtn.classList.contains('hidden'));
});

test('normal-line graduation recommends today only after all three ordinary lines are complete',()=>{
  const x=normalHarness(v12Graduated(Object.fromEntries([1,2].map(i=>['normal:'+i,{badges:{s:true,time:true,full:true},targetSeconds:45}]))));
  winResult(x,{catches:6,perfectCatches:6,lastCrash:null});
  assert.equal(x.all.graduateNextBtn.dataset.mode,'daily');assert.equal(x.all.graduateNextBtn.dataset.key,'daily:2026-10-30');
  assert.equal(stageRecords(x)['daily:2026-10-30'],undefined,'a recommendation fabricated an unplayed daily-stage entry');
  x.click('graduateNextBtn');assert.equal(x.latest().mode,'daily');assert.equal(x.latest().dateSeed,'2026-10-30');
});

test('all current routes complete yields honest free play instead of a fake new challenge',()=>{
  const extra=Object.fromEntries([1,2].map(i=>['normal:'+i,{badges:{s:true,time:true,full:true},targetSeconds:45}]));extra['daily:2026-10-30']={badges:{s:true,time:true,full:true},targetSeconds:45};
  const x=normalHarness(v12Graduated(extra));winResult(x,{catches:6,perfectCatches:6,lastCrash:null});
  assert(x.all.graduateNextBtn.classList.contains('hidden'));assert(/自由/.test(x.all.restartBtn.textContent+' '+x.all.nextRunHint.textContent));
});

test('a newly recommended route does not carry over the graduated route precision exercise',()=>{
  const x=v12FullHarness();winResult(x,{catches:6,perfectCatches:6,lastCrash:null,catchDetails:v12Details(0)});
  x.click('graduateNextBtn');practiceFrame(x,{elapsed:9,cargoId:2,type:'coffee'});
  assert(x.all.practiceHint.classList.contains('hidden'),'old precision exercise leaked into the next route');assert.equal(stageRecords(x)['normal:0'].badges.full,true);
});

test('ordinary A completion earns small milestones without lowering any S or full-chapter conditions',()=>{
  const x=normalHarness();winResult(x,{catches:6,perfectCatches:5,lives:2,lastCrash:null});const progress=v12Progress(x)['normal:0'];
  assert.deepEqual(progress.milestones,{fourCatches:true,twoStops:true,finish:true});assert.equal(progress.bestPerfect,5);
  assert.deepEqual(stageRecords(x)['normal:0'].badges,{s:false,time:false,full:false});assert(!x.all.resultMilestone.classList.contains('hidden'));
  assert.equal(x.all.resultMilestone.dataset.state,'achieved');assert.equal(x.all.resultMilestone.dataset.kind,'milestone');assert(!/S章.*到手|全单精准章.*到手/.test(x.all.resultMilestone.textContent));
});

test('four actual signatures can earn a local milestone even when the run later fails before station one',()=>{
  const x=normalHarness();x.end({catches:4,perfectCatches:2,lastCrash:null,tail:completedTail(0)});const progress=v12Progress(x)['normal:0'];
  assert.equal(progress.milestones.fourCatches,true);assert.equal(progress.milestones.twoStops,false);assert.equal(progress.milestones.finish,false);
  assert(!x.all.resultMilestone.classList.contains('hidden'));assert(/签收|4件/.test(x.all.resultMilestone.textContent));assert(!/安全收工.*达成|整趟.*更稳/.test(x.all.resultMilestone.textContent));
});

test('parking both stations can be recognized without fabricating a safe arrival',()=>{
  const x=normalHarness();x.end({finishReason:'unsafe_arrival',catches:4,perfectCatches:2,lastCrash:null,tail:completedTail(2)});const p=v12Progress(x)['normal:0'];
  assert.equal(p.milestones.twoStops,true);assert.equal(p.milestones.finish,false);assert(/两站|停稳/.test(x.all.resultMilestone.textContent));
});

test('an actual higher precision count remains useful in a failed full-chapter attempt and is labelled as a local best',()=>{
  const extra={[V12_PROGRESS]:JSON.stringify({'normal:0':v12Milestones({bestPerfect:5})})};const x=v12FullHarness(v12Details(),extra);
  x.end({catches:6,perfectCatches:6,lastCrash:{cargoId:4,cargoType:'pot',cause:'从右侧滑落',at:35},catchDetails:v12Details(0)});
  assert.equal(v12Progress(x)['normal:0'].bestPerfect,6);assert(!x.all.resultMilestone.classList.contains('hidden'));
  assert.equal(x.all.resultMilestone.dataset.kind,'personal-best');assert(/精准|单项/.test(x.all.resultMilestone.textContent)&&/6/.test(x.all.resultMilestone.textContent),x.all.resultMilestone.textContent);
  assert(!/这趟更稳|整趟.*进步|安全收工.*达成/.test(x.all.resultMilestone.textContent));assert.equal(achievementRecords(x)['normal:0'].grade,'S');assert.equal(stageRecords(x)['normal:0'].badges.full,false);
});

test('small milestones and best precision never retreat after a worse attempt or reload',()=>{
  const initial=v12Milestones();const x=normalHarness({[V12_PROGRESS]:JSON.stringify({'normal:0':initial})});x.end({catches:1,perfectCatches:1,lastCrash:null,tail:completedTail(0)});
  assert.deepEqual(v12Progress(x)['normal:0'],initial);assert(x.all.resultMilestone.classList.contains('hidden'));
  const reopened=makeHarness(Object.fromEntries(x.data));assert.deepEqual(v12Progress(reopened)['normal:0'],initial);assert(reopened.all.resultMilestone.classList.contains('hidden'));assert.equal(reopened.audioCalls.oscillators,0);
});

test('trusted historical milestone evidence imports silently without fabricating a first-time reward',()=>{
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':legacyRun({catches:6,stops:2,perfectCatches:5,lives:2})})});const progress=v12Progress(x)['normal:0'];
  assert.deepEqual(progress.milestones,{fourCatches:true,twoStops:true,finish:true});assert.equal(progress.bestPerfect,5);assert(x.all.resultMilestone.classList.contains('hidden'));assert.equal(x.audioCalls.oscillators,0);
});

test('historical partial progress does not invent an unplayed second station or a finished trip',()=>{
  const old=legacyRun({won:false,catches:4,stops:1,perfectCatches:3,lives:0,finishReason:'tail_incomplete',tail:{step:2}});
  const x=makeHarness({'xiaban-last-v8':JSON.stringify({'normal:0':old})});const p=v12Progress(x)['normal:0'];
  assert.equal(p.milestones.fourCatches,true);assert.equal(p.milestones.twoStops,false);assert.equal(p.milestones.finish,false);assert.equal(p.bestPerfect,3);
});

test('S chapter celebration keeps priority while earned small milestones are still saved',()=>{
  const x=normalHarness();winResult(x,{catches:4,perfectCatches:3,lastCrash:null});
  assert(!x.all.stageReward.classList.contains('hidden'));assert(x.all.resultMilestone.classList.contains('hidden'));
  assert.deepEqual(v12Progress(x)['normal:0'].milestones,{fourCatches:true,twoStops:true,finish:true});
});

test('duplicate finish and replay cannot re-award a small milestone or precision-best celebration',()=>{
  const x=normalHarness();x.click('soundBtn');winResult(x,{catches:6,perfectCatches:5,lives:2,lastCrash:null});
  const before={storage:x.data.get(V12_PROGRESS),text:x.all.resultMilestone.textContent,audio:x.audioCalls.oscillators,effects:{...x.review.effects()}};
  x.review.finish(true);assert.equal(x.data.get(V12_PROGRESS),before.storage);assert.equal(x.all.resultMilestone.textContent,before.text);assert.equal(x.audioCalls.oscillators,before.audio);assert.deepEqual({...x.review.effects()},before.effects);
  x.review.accident({event:{cargoType:'pot'},frames:[{elapsed:1},{elapsed:2}]});x.click('replayBtn');x.click('exitReplay');assert.equal(x.data.get(V12_PROGRESS),before.storage);assert.equal(x.audioCalls.oscillators,before.audio);
});

test('new milestones respect mute and reduced-motion preferences',()=>{
  const x=makeHarness({'xiaban-tutorial-v3':'done'},{reducedMotion:true}),baseline=makeHarness({'xiaban-tutorial-v3':'done',[V12_PROGRESS]:JSON.stringify({'normal:0':v12Milestones()})},{reducedMotion:true});
  for(const h of[x,baseline]){h.click('menuNormal');winResult(h,{catches:6,perfectCatches:5,lives:2,lastCrash:null})}
  assert.equal(x.audioCalls.oscillators,0);assert.equal(x.review.effects().particles,baseline.review.effects().particles);assert(!x.all.resultMilestone.classList.contains('hidden'));
});

test('small milestones remain separate by ordinary route and the original daily date across midnight',()=>{
  const x=normalHarness();x.end({catches:4,perfectCatches:2,lastCrash:null,tail:completedTail(0)});x.click('resultNewRoute');x.end({catches:2,perfectCatches:1,lastCrash:null,tail:completedTail(0)});
  assert.equal(v12Progress(x)['normal:0'].milestones.fourCatches,true);assert.equal(v12Progress(x)['normal:1'].milestones.fourCatches,false);
  x.click('menuDaily');x.end({catches:4,perfectCatches:2,lastCrash:null,tail:completedTail(0)});x.setDay('2026-10-31');x.click('restartBtn');winResult(x,{catches:5,perfectCatches:4,lives:2,lastCrash:null});
  assert.equal(v12Progress(x)['daily:2026-10-30'].milestones.finish,true);assert.equal(v12Progress(x)['daily:2026-10-31'],undefined);
});

test('tutorial never grants or rewrites formal milestones and clears the new report sections',()=>{
  const x=normalHarness();winResult(x,{catches:6,perfectCatches:5,lives:2,lastCrash:null,job:{unthrownCount:1,retryExpiredCount:0,unavailableItems:[V12_UNTHROWN],cutoffSeconds:39}});const before=x.data.get(V12_PROGRESS);
  x.click('menuTutorial');winResult(x,{catches:6,perfectCatches:6,lastCrash:null});assert.equal(x.data.get(V12_PROGRESS),before);
  for(const id of['resultMilestone','resultDelivery','graduateNextBtn','milestoneProgress'])assert(x.all[id].classList.contains('hidden'),id+' leaked into tutorial');
});

test('badge controls expose concise real conditions rather than leaving chapter names unexplained',()=>{
  const x=stagedHarness({s:true,time:false,full:false},45);
  for(const id of['badgeS','badgeTime','badgeFull'])assert(new RegExp('<button\\b[^>]*id="'+id+'"').test(html),id+' is not an accessible button');
  x.click('badgeFull');assert(!x.all.badgeInfo.classList.contains('hidden'));assert(/6/.test(x.all.badgeInfo.textContent)&&/精准/.test(x.all.badgeInfo.textContent)&&/S/.test(x.all.badgeInfo.textContent),x.all.badgeInfo.textContent);
  x.click('badgeTime');assert(/45/.test(x.all.badgeInfo.textContent)&&/S/.test(x.all.badgeInfo.textContent),x.all.badgeInfo.textContent);
  x.click('badgeS');assert(/3/.test(x.all.badgeInfo.textContent)&&/翻车/.test(x.all.badgeInfo.textContent)&&/扶正/.test(x.all.badgeInfo.textContent),x.all.badgeInfo.textContent);
});

test('a real good catch of bread one cannot fail the bread-three precision exercise',()=>{
  const x=v12FullHarness(v12Details(3));emitGame(x,'spawn',{cargoId:1,cargoType:'bread'});emitGame(x,'catch',v12Catch(1));
  x.end({elapsed:8,catches:1,perfectCatches:0,catchDetails:[v12Catch(1)],lastCrash:{cargoId:1,cargoType:'bread',cause:'从右侧滑落',at:8}});
  assert.equal(x.all.resultPractice.dataset.state,'neutral');assert(/第?3件|3号/.test(x.all.resultPractice.textContent));assert(!/本次漏接|这次仍未精准/.test(x.all.resultPractice.textContent));
});

test('malformed catch details and unknown quality never create a made-up precision exercise',()=>{
  const broken=[null,'coffee',{cargoId:0,cargoType:'coffee',quality:'good'},{cargoId:7,cargoType:'coffee',quality:'good'},{cargoId:2,cargoType:'unknown',quality:'good'},{cargoId:2,cargoType:'coffee',quality:'excellent'},{cargoId:2.5,cargoType:'coffee',quality:'good'}];
  const x=v12FullHarness(broken);practiceFrame(x,{elapsed:1,cargoId:1,type:'bread'});
  const text=x.all.practiceHint.classList.contains('hidden')?'':x.all.practiceHint.textContent;
  assert(!/咖啡|unknown|第7件|第0件/.test(text),text);
  winResult(x,{catches:6,perfectCatches:5,lastCrash:null,catchDetails:broken});assert.deepEqual(recentRecords(x)['normal:0'].catchDetails,[]);
});

test('a repeated catch identity preserves its first real quality rather than replacing good with perfect',()=>{
  const x=v12FullHarness(),good=v12Catch(),later=v12Catch(2,{quality:'perfect',reason:null,correction:null,offsetX:0,at:12});
  emitGame(x,'catch',good);emitGame(x,'catch',later);
  winResult(x,{catches:6,perfectCatches:5,lastCrash:null,catchDetails:[good,later]});
  assert.equal(x.all.resultPractice.dataset.state,'failed');
  const records=recentRecords(x)['normal:0'].catchDetails.filter(d=>d.cargoId===2);assert.equal(records.length,1);assert.equal(records[0].quality,'good');assert.equal(records[0].at,10);
});

test('a valid engine snapshot can establish parcel precision even when no UI catch callback was observed',()=>{
  const x=v12FullHarness(),perfect=v12Catch(2,{quality:'perfect',offsetX:0,reason:null,correction:null});
  x.end({elapsed:20,catches:2,perfectCatches:2,lastCrash:{cargoId:4,cargoType:'pot',cause:'从左侧滑落',at:20},catchDetails:[perfect]});
  assert.equal(x.all.resultPractice.dataset.state,'achieved');assert(/咖啡.*精准/.test(x.all.resultPractice.textContent));
});

test('an invalid unavailable-delivery identity is ignored rather than shown as a missing real parcel',()=>{
  const bad=[null,{...V12_UNTHROWN,cargoId:0},{...V12_UNTHROWN,cargoId:7},{...V12_UNTHROWN,cargoId:1.5},{...V12_UNTHROWN,cargoType:'unknown'},{...V12_UNTHROWN,kind:'waiting'}];
  const x=normalHarness();winResult(x,{lastCrash:null,job:{unthrownCount:0,retryExpiredCount:0,unavailableItems:bad,cutoffSeconds:39}});
  assert(x.all.resultDelivery.classList.contains('hidden'),'an impossible parcel got a delivery failure report');assert.deepEqual(recentRecords(x)['normal:0'].deliveryOutcomes,[]);
});

test('graduating an old daily after midnight recommends a real unfinished normal line while R keeps the old daily',()=>{
  const stored={'xiaban-player-v9':JSON.stringify({mode:'daily',variant:1}),'xiaban-stages-v11':JSON.stringify({'daily:2026-10-30':{badges:{s:true,time:true,full:true},targetSeconds:45},'normal:2':{badges:{s:true,time:true,full:true},targetSeconds:45},'normal:0':{badges:{s:true,time:false,full:false},targetSeconds:46}})};
  const x=makeHarness(stored);x.click('startBtn');x.setDay('2026-10-31');winResult(x,{catches:6,perfectCatches:6,lastCrash:null});
  assert.equal(x.all.graduateNextBtn.dataset.mode,'normal');assert.equal(x.all.graduateNextBtn.dataset.key,'normal:0');assert.equal(stageRecords(x)['daily:2026-10-31'],undefined);
  x.key('r');assert.equal(x.latest().mode,'daily');assert.equal(x.latest().dateSeed,'2026-10-30');
  winResult(x,{catches:6,perfectCatches:6,lastCrash:null});x.click('graduateNextBtn');assert.equal(x.latest().mode,'normal');assert.equal(x.latest().variant,0);
});

test('a trusted V11 full chapter silently imports its proven six-perfect finish and short milestones',()=>{
  const x=makeHarness(v12Graduated()),p=v12Progress(x)['normal:0'];
  assert.deepEqual(p.milestones,{fourCatches:true,twoStops:true,finish:true});assert.equal(p.bestPerfect,6);
  assert(x.all.resultMilestone.classList.contains('hidden'));assert(x.all.stageReward.classList.contains('hidden'));assert.equal(x.audioCalls.oscillators,0);
  assert.deepEqual(stageRecords(x)['normal:0'].badges,{s:true,time:true,full:true});
});

test('an S chapter alone cannot fabricate a six-perfect full-chapter history',()=>{
  const x=makeHarness(v12Graduated({},{s:true,time:false,full:false})),p=v12Progress(x)['normal:0'];
  assert((p?.bestPerfect||0)<6);assert.equal(stageRecords(x)['normal:0'].badges.full,false);assert(x.all.resultMilestone.classList.contains('hidden'));
});

test('an existing V12 progress record is not silently rewritten by old chapter migration on reload',()=>{
  const original={milestones:{fourCatches:true,twoStops:false,finish:false},bestPerfect:3};
  const x=makeHarness({...v12Graduated(),[V12_PROGRESS]:JSON.stringify({'normal:0':original})});
  assert.deepEqual(v12Progress(x)['normal:0'],original);assert(x.all.resultMilestone.classList.contains('hidden'));assert.equal(x.audioCalls.oscillators,0);
});
