/* 下班别散架 · canvas presentation, pointer controls and synthesized sound. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const put=(id,value)=>{const text=String(value);if($(id).textContent!==text)$(id).textContent=text};
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const W=420,H=740,INK='#282b26',KEYBOARD_SPEED=55;
  const NAMES={bread:'饼',monday:'周一',pot:'锅',fish:'鱼',coffee:'咖啡'};
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pixelRatio=Math.min(2,window.devicePixelRatio||1);canvas.width=W*pixelRatio;canvas.height=H*pixelRatio;ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  let mode='tutorial', muted=true, audio=null, last=performance.now(), visualTime=0, shake=0, flash=0, slowmo=0, messageUntil=0, chaosCooldown=0, pointer=null, isPaused=false, particles=[], texts=[], keys=new Set(), runId=0;
  let history=[],lastSample=-1,lastAccident=null,replay=null,wreck=null,recoveryNoteUntil=0,lastRecoveryText='',menuOpen=false,activeVariant=0,routeContext=null,lastReportRun=-1,practice=null,runStage=null,runEvidence=emptyEvidence();
  const readStore=(key,fallback={})=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback}catch{return fallback}};
  const routeVariant=value=>((Math.trunc(Number(value)||0)%3)+3)%3;
  const formalKey=key=>/^(normal:[0-2]|daily:\d{4}-\d{2}-\d{2})$/.test(key);
  let best=readStore('xiaban-best-v8'),recentRuns=readStore('xiaban-last-v8'),achievements=readStore('xiaban-achievements-v7'),sChallenges=readStore('xiaban-s-challenges-v9'),stages=readStore('xiaban-stages-v11'),formalMemory=readStore('xiaban-player-v9',null),routePreference=null;
  try{routePreference=localStorage.getItem('xiaban-v5-route');activeVariant=routeVariant(routePreference);muted=localStorage.getItem('xiaban-sound')!=='on'}catch{}
  const gradeFor=s=>s?.won?(s.lives===3&&(s.perfectCatches??s.perfect??0)>=3&&s.assists===0?'S':'A'):null;
  function keepAchievement(key,grade){const old=achievements[key]?.grade;if(!grade||old==='S'||old===grade)return false;achievements[key]={grade,achievedAt:todaySeed()};try{localStorage.setItem('xiaban-achievements-v7',JSON.stringify(achievements))}catch{}return true}
  // Changed routes get fresh scores; earned grades survive independently.
  try{if(localStorage.getItem('xiaban-achievements-v8-migrated')!=='done'){for(const source of ['xiaban-best-v6','xiaban-last-v6','xiaban-best-v7','xiaban-last-v7']){const records=JSON.parse(localStorage.getItem(source)||'{}');for(const [key,run]of Object.entries(records))if(/^(normal:[0-2]|daily:\d{4}-\d{2}-\d{2})$/.test(key))keepAchievement(key,gradeFor(run))}localStorage.setItem('xiaban-achievements-v8-migrated','done')}}catch{}
  function rememberFormal(){if(mode==='tutorial')return;formalMemory={mode,variant:activeVariant};try{localStorage.setItem('xiaban-player-v9',JSON.stringify(formalMemory))}catch{}}
  function restoreEntry(){
    if(['normal','daily'].includes(formalMemory?.mode)){mode=formalMemory.mode;activeVariant=routeVariant(formalMemory.variant??activeVariant);return}
    const keys=[...new Set([...Object.keys(best),...Object.keys(recentRuns),...Object.keys(achievements)].filter(formalKey))];
    const normal=keys.filter(key=>key.startsWith('normal:'));
    if(normal.length){mode='normal';if(routePreference===null)activeVariant=Number(normal[0].slice(-1))}
    else if(keys.some(key=>key.startsWith('daily:')))mode='daily';
    else try{if(localStorage.getItem('xiaban-tutorial-v3')==='done')mode='normal'}catch{}
    rememberFormal();
  }
  function challengeFor(key=recordKey()){
    const cs=sChallenges[key]?.bestTimeCs;
    return Number.isInteger(cs)&&cs>0&&cs<=6000?{bestTimeCs:cs,targetSeconds:Math.max(1,Math.ceil(cs/100)-1)}:null;
  }
  function keepSChallenge(key,seconds){
    if(!formalKey(key)||!Number.isFinite(Number(seconds)))return;
    const bestTimeCs=Math.round(Number(seconds)*100);if(bestTimeCs<=0||bestTimeCs>6000)return;
    const old=challengeFor(key);if(old&&old.bestTimeCs<=bestTimeCs)return;
    sChallenges[key]={bestTimeCs,targetSeconds:Math.max(1,Math.ceil(bestTimeCs/100)-1)};
    try{localStorage.setItem('xiaban-s-challenges-v9',JSON.stringify(sChallenges))}catch{}
  }
  const timeCs=seconds=>Math.round(Number(seconds||0)*100);
  const timeText=seconds=>(timeCs(seconds)/100).toFixed(2);
  const STAGE_NAMES={s:'S章',time:'限时章',full:'全单精准章'};
  const targetFrom=cs=>Math.max(42,Math.ceil(cs/100)-1);
  function saveStages(){try{localStorage.setItem('xiaban-stages-v11',JSON.stringify(stages))}catch{}}
  function stageFor(key=recordKey()){
    if(!stages[key]){stages[key]={badges:{s:false,time:false,full:false},targetSeconds:null};saveStages()}
    const value=stages[key];
    value.badges={s:!!value.badges?.s,time:!!value.badges?.time,full:!!value.badges?.full};
    if(!Number.isInteger(value.targetSeconds)||value.targetSeconds<42||value.targetSeconds>59)value.targetSeconds=null;
    return value;
  }
  const stageKind=value=>!value.badges.s?'s':!value.badges.time?'time':!value.badges.full?'full':'complete';
  const stageCount=value=>Object.values(value.badges).filter(Boolean).length;
  function importStages(){
    const keys=new Set([...Object.keys(best),...Object.keys(recentRuns),...Object.keys(achievements),...Object.keys(sChallenges)]);
    let changed=false;
    for(const key of keys){
      if(!formalKey(key)||Object.prototype.hasOwnProperty.call(stages,key))continue;
      const proven=[best[key],recentRuns[key]].filter(run=>gradeFor(run)==='S');
      const times=proven.map(run=>Number(run.time)).filter(t=>Number.isFinite(t)&&t>0&&t<=60).map(timeCs);
      const known=challengeFor(key);if(known)times.push(known.bestTimeCs);
      const initial=times.length?Math.min(...times):null,target=initial===null?null:targetFrom(initial);
      stages[key]={badges:{s:achievements[key]?.grade==='S'||proven.length>0||!!known,time:initial!==null&&initial<=target*100,full:proven.some(run=>run.catches>=6&&(run.perfectCatches??run.perfect??0)>=6)},targetSeconds:target};
      changed=true;
    }
    if(changed)saveStages();
  }
  function keepRunStages(s,won,elite){
    const value=stageFor(),before={...value.badges};
    if(elite){
      value.badges.s=true;
      if(runStage?.kind==='time'&&runStage.targetSeconds!==null&&timeCs(s.elapsed)<=runStage.targetSeconds*100)value.badges.time=true;
      if(s.catches>=6&&(s.perfectCatches||0)>=6)value.badges.full=true;
      if(value.targetSeconds===null)value.targetSeconds=targetFrom(timeCs(s.elapsed));
    }
    saveStages();
    return {earned:Object.keys(value.badges).filter(key=>value.badges[key]&&!before[key]),graduated:stageCount(value)===3&&Object.values(before).filter(Boolean).length<3};
  }
  function stageGoal(value=stageFor()){
    const kind=stageKind(value);
    return kind==='s'?'下一章：保持S，精准至少3件、无翻车无扶正，安全收工。':kind==='time'?(value.targetSeconds===null?'下一章：再获S记录用时，确定一次固定限时。':`下一章：限时章，保持S且≤${value.targetSeconds}秒安全收工。`):kind==='full'?'下一章：全单精准章，6件全部精准并保持S收工。':'本线三章毕业！可自由再跑，或换下一条线收章。';
  }
  function emptyEvidence(){return {spawned:new Map(),caught:new Set(),retried:new Set(),retryCaught:new Set(),restored:new Set(),assisted:new Set(),crashes:[],stations:new Set(),arrival:false}}
  function recordEvidence(e){
    if(e.type==='spawn')runEvidence.spawned.set(e.cargoId,e.cargoType);
    if(e.type==='tail'){
      if(e.phase==='start')runEvidence.stations.add(1);
      if(e.phase==='station'){runEvidence.stations.add(e.step);if(e.step===1)runEvidence.stations.add(2)}
      if(e.phase==='complete'){runEvidence.stations.add(1);runEvidence.stations.add(2);runEvidence.arrival=true}
    }
    if(e.type==='recovery'&&e.phase==='arrival')runEvidence.arrival=true;
    if(e.type==='spawn'&&e.retry)runEvidence.retried.add(e.cargoId);
    if(e.type==='catch'){
      if(runEvidence.retried.has(e.cargoId)||runEvidence.crashes.some(c=>c.cargoId===e.cargoId&&c.cause==='漏接'))runEvidence.retryCaught.add(e.cargoId);
      runEvidence.caught.add(e.cargoId);
    }
    if(e.type==='crash')runEvidence.crashes.push({...e,at:e.at??e.elapsed,caughtBefore:runEvidence.caught.has(e.cargoId)||!!e.cause&&e.cause!=='漏接'});
    if(practice?.kind==='cargo'&&['catch','crash'].includes(e.type)&&(practice.cargoId!==null?e.cargoId===practice.cargoId:practice.type!=='bread'&&e.cargoType===practice.type))practice.noticeAt=e.elapsed;
    if(e.type==='recovery'&&(e.phase==='restored'||e.phase==='assist'||e.assist)){
      const ids=engine.snapshot().cargo.filter(c=>c.caught).map(c=>c.id);
      for(const id of ids){runEvidence.restored.add(id);if(e.phase==='assist'||e.assist)runEvidence.assisted.add(id)}
    }
  }
  function challengeState(s){
    if(!runStage)return null;
    const target=runStage.kind==='time'?runStage.targetSeconds:null,perfect=s.perfectCatches||0,crashes=Math.max(0,3-s.lives),assists=s.assists||0,late=target!==null&&timeCs(s.elapsed)>target*100;
    const left=target===null?null:Math.max(0,target*100-timeCs(s.elapsed)),remaining=left===null?'':left>300?String(Math.ceil(left/100)):(left/100).toFixed(2);
    const reasons=[];if(crashes)reasons.push(`翻车${crashes}次`);if(assists)reasons.push(`扶正${assists}次`);if(perfect<3)reasons.push(`总精准${perfect}/3`);
    let text,state='active';
    if(runStage.kind==='complete')return {text:'本线已毕业 · 自由跑',state:'achieved',urgent:false,summary:'本线三章已集齐；自由再跑仍按原条件评S。',detail:'本线S章、限时章、全单精准章已集齐。可自由再跑或换线收章。'};
    if(crashes||assists){text=`S已失格 · ${[crashes?'翻车':'',assists?'扶正':''].filter(Boolean).join('/')}`;state='failed'}
    else if(runStage.kind==='full'){text=s.catches>perfect?'全准未达 · 仍可S':`全单精准${Math.min(6,perfect)}/6`;if(s.catches>perfect)state='failed'}
    else if(late){text='限时未达 · 仍可S';state='failed'}
    else if(target!==null)text=`S关余${remaining}s · ${perfect<3?`精准${perfect}/3`:'可冲关'}`;
    else text=`${runStage.kind==='s'?'S章':'记录S'} · ${perfect<3?`精准${perfect}/3`:'待安全收工'}`;
    const eligibility=crashes||assists?`本趟S资格已失去：${reasons.join('、')}`:perfect<3?`尚待总精准达到3件（当前${perfect}件）`:'S条件已具备，仍需安全收工';
    const goal=runStage.kind==='full'?`全单精准章：签收${s.catches}/6、总精准${perfect}/6且保持S`:target!==null?`本关≤${target}秒且保持S，S关剩余${remaining}秒`:runStage.kind==='s'?'本关争取S章':'再获S记录用时，随后确定固定限时';
    return {text,state,perfect,late,crashes,assists,reasons,urgent:target!==null&&!late&&left<=300&&!crashes&&!assists,summary:`${goal}${runStage.kind==='full'?'，':`：精准${perfect}/3，`}翻车${crashes}、扶正${assists}。${crashes||assists?'S已失格。':late?'限时已过，仍可争S。':''}`,detail:`${goal}；须无翻车、无扶正，总精准至少3件并安全收工。总精准${perfect}/3，翻车${crashes}次，扶正${assists}次。${late?'限时目标已超出，S评级仍按原条件判定。':''}${eligibility}。`};
  }
  function challengeResult(s,won,elite){
    if(!runStage||runStage.kind==='complete')return null;
    if(runStage.kind==='full')return {state:won&&elite&&s.catches>=6&&(s.perfectCatches||0)>=6?'achieved':'failed',text:won&&elite&&s.catches>=6&&(s.perfectCatches||0)>=6?'全单精准章已达：6件全部精准，保持S。':`本趟${won?'已收工':'未安全收工'}，签收${s.catches}/6、精准${s.perfectCatches||0}/6${won&&!elite?'，未保持S':''}；全单精准章未达。`};
    if(runStage.kind!=='time'||runStage.targetSeconds===null)return elite?{state:'recorded',text:`已记录本线S用时${timeText(s.elapsed)}秒，限时从下一趟开始。`}:null;
    const target=runStage.targetSeconds,within=timeCs(s.elapsed)<=target*100,current=timeText(s.elapsed),live=challengeState(s);
    if(!won)return {state:'failed',text:`本趟未安全收工，${target}秒S关未达；S成就记录仍独立保留。`};
    if(elite&&within)return {state:'achieved',text:`${target}秒S关已达成！本趟${current}秒，保持S。`};
    if(!elite)return {state:'failed',text:`用时${current}秒${within?`已达${target}秒目标`:`超出${target}秒目标`}；${live.reasons.join('、')}，未保持S，本关未达。`};
    return {state:'failed',text:`S已保持；本趟${current}秒，超出${target}秒目标${((timeCs(s.elapsed)-target*100)/100).toFixed(2)}秒，本关未达。`};
  }
  // Only known S runs on the unchanged V8 routes can seed a time challenge.
  for(const records of [best,recentRuns])for(const [key,run]of Object.entries(records))if(gradeFor(run)==='S')keepSChallenge(key,run.time);
  importStages();
  restoreEntry();
  const engine = new ShiftEngine(onEvent);
  let snap=engine.snapshot();
  const round=(c,x,y,w,h,r=5)=>{c.beginPath();c.roundRect(x,y,w,h,r)};
  const line=(c,x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()};
  function sound(kind){if(muted)return;try{audio ||= new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime;const notes=kind==='graduate'?[523,659,784,1047,1319,1568]:kind==='badge'?[659,880,1047,1319]:kind==='elite'?[659,784,1047,1319,1568]:kind==='win'?[523,659,784,1047]:kind==='save'?[550,825,1100]:kind==='catch'?[420,630]:kind==='crash'?[160,95,65]:[270];notes.forEach((f,i)=>{const osc=audio.createOscillator(),g=audio.createGain();osc.type=kind==='crash'?'sawtooth':'triangle';osc.frequency.setValueAtTime(f,now+i*.065);osc.frequency.exponentialRampToValueAtTime(f*.7,now+i*.065+.15);g.gain.setValueAtTime(.0001,now+i*.065);g.gain.exponentialRampToValueAtTime(kind==='crash'?.055:.09,now+i*.065+.008);g.gain.exponentialRampToValueAtTime(.0001,now+i*.065+.19);osc.connect(g);g.connect(audio.destination);osc.start(now+i*.065);osc.stop(now+i*.065+.2)})}catch{}}
  function popup(text,kind='',duration=1.05){$('gameMessage').textContent=text;$('gameMessage').className=`game-message show ${kind}`;messageUntil=visualTime+duration}
  function burst(x,y,color,n=12){for(let i=0;i<n;i++){const a=Math.PI*2*i/n;particles.push({x,y,vx:Math.cos(a)*(55+Math.random()*100),vy:Math.sin(a)*(60+Math.random()*90)-30,life:.6+Math.random()*.4,max:1,color,size:3+Math.random()*4})}}
  function onEvent(e){
    recordEvidence(e);
    const x=e.x??210,y=e.y??450;
    if(e.type==='tutorial'){$('commentary').textContent=e.text||'跟着当前指令，慢慢练。';if(e.completed||e.success||e.phase==='success'){popup(e.step===3?'三步学会了！':`第${e.step}步，稳了！`,'perfect',.8);sound('catch')}if(e.phase==='retry'){lastRecoveryText='教学免费重试，不扣机会，照提示再来一次。';recoveryNoteUntil=visualTime+3}}
    if(e.type==='recovery'){lastRecoveryText=e.text||'已签收货物已扶回；漏接的会重新投递。';recoveryNoteUntil=visualTime+3;$('commentary').textContent=lastRecoveryText}
    if(e.type==='tail'){if(e.phase==='start')sound('warning');if(e.phase==='station'||e.phase==='complete'){const tx=e.targetX??snap.truck.x;burst(tx,650,'#a7c6a5',22);sound('save');if(e.points)texts.push({text:`停站 +${e.points}`,x:tx,y:615,life:1,color:'#557851'})}$('commentary').textContent=e.text||'跟着亮区，到位松手停稳。'}
    if(e.type==='catch'){
      const perfect=e.quality==='perfect';burst(x,y,perfect?'#c5a6e2':'#f7ef59',perfect?22:10);sound(perfect?'save':'catch');
      texts.push({text:mode==='tutorial'?'接住了！':`${perfect?'精准！':'签收'} +${e.points??25}`,x,y:y-35,life:1,color:perfect?'#7955a1':INK});
      if(perfect&&mode!=='tutorial')popup((e.streak||0)>=3?`漂亮！精准连签 ×${e.streak}`:'完美签收！','perfect',.85);
      $('commentary').textContent=perfect?'车中心接住，慢下来也能加分。':e.text||'接住了！下一件也提前挪过去。';
    }
    if(e.type==='spawn'){$('commentary').textContent=e.retry?'补发到了，重新接住才算签收。':e.text||'新货到了。看虚线，提前挪过去。';if(e.retry){lastRecoveryText='补发货物需重新接取，精准机会保留。';recoveryNoteUntil=visualTime+3}}
    if(e.type==='save'){popup(mode==='tutorial'?'这一下，救回来了！':`极限接锅！ +${e.points??45}`);burst(x,y,'#f7ef59',26);slowmo=.32;shake=reducedMotion?0:4;sound('save');$('commentary').textContent='这一下是你救回来的！再稳一会儿。'}
    if(e.type==='crash'){
      const frames=history.slice();if(snap.cargo.length)frames.push(copyFrame(snap));lastAccident={event:{...e},frames};
      wreck={cargo:snap.cargo.map(b=>({...b})),ttl:.65,cargoId:e.cargoId};
      popup('散 架 了！','crash',.8);shake=reducedMotion?0:14;flash=reducedMotion?.08:.22;burst(x,Math.min(y,600),'#ed705b',28);sound('crash');
      $('commentary').textContent=`${NAMES[e.cargoType]||'货物'}${e.cause==='漏接'?'没接到':e.cause||'掉了'}。${e.advice||'提前挪车，慢慢接。'}`;
    }
    if(e.type==='warning'){sound('warning');$('commentary').textContent=e.text||'前方路况不太对，准备稳住。'}
    if(e.type==='win'||e.type==='lose'){pointer=null;keys.clear();const completedRun=runId;setTimeout(()=>{if(completedRun===runId)finish(e.type==='win')},e.type==='win'?350:700);if(e.type==='win'){const ended=engine.snapshot();sound(mode!=='tutorial'&&ended.lives===3&&ended.perfectCatches>=3&&!ended.assists?'elite':'win');for(let i=0;i<4;i++)burst(70+i*90,270-i%2*70,['#f7ef59','#a7c6a5','#a397d2','#ed705b'][i],25)}}
  }
  function todaySeed(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}
  function recordKey(){return mode==='daily'?`daily:${snap.status!=='ready'&&routeContext?.mode==='daily'?routeContext.dateSeed:todaySeed()}`:`normal:${activeVariant}`}
  function routeName(){return mode==='daily'?`同题 · ${routeContext?.mode==='daily'&&snap.status!=='ready'?routeContext.dateSeed.slice(5):todaySeed().slice(5)}`:`${snap.route?.name||`收工线 ${activeVariant+1}`}`}
  function practiceFrom(source){
    if(source?.finishReason==='tail_incomplete')return {kind:'station',step:Math.max(1,Math.min(2,source.tail?.step||1))};
    if(source?.finishReason==='unsafe_arrival')return {kind:'arrival'};
    const won=source?.won??source?.status==='win';
    if(won&&source.assists>0)return {kind:'stability'};
    const a=source?.lastCrash;if(!a||!NAMES[a.cargoType])return won&&(source.perfectCatches??source.perfect??0)<3?{kind:'precision'}:null;
    return {kind:'cargo',cargoId:Number.isInteger(a.cargoId)&&a.cargoId>0?a.cargoId:null,type:a.cargoType,cause:a.cause,side:a.side,at:Number.isFinite(a.at)?a.at:Number.isFinite(a.elapsed)?a.elapsed:null};
  }
  function practiceLabel(p=practice){
    if(!p)return '';
    if(p.kind==='station')return `本趟重点 · 第${p.step}站上趟没停稳`;
    if(p.kind==='arrival')return '本趟重点 · 上趟最后靠站未稳';
    if(p.kind==='stability')return '本趟重点 · 上趟发生扶正，留意旧货状态';
    if(p.kind==='precision')return '本趟重点 · 上趟精准不足3件，留意车中心';
    return `本趟重点 · ${NAMES[p.type]}${p.cause==='漏接'?'上趟漏接，留意落点':p.side==='left'?'上趟从左侧滑落，留意重心':p.side==='right'?'上趟从右侧滑落，留意重心':'上趟掉落，留意支撑'}`;
  }
  function practiceMatches(p,item){return p.cargoId!==null?item.id===p.cargoId:item.type===p.type}
  function practiceStatus(s,final=false){
    if(!practice)return null;
    const p=practice,won=s.status==='win',ended=final||s.status==='win'||s.status==='lose';
    if(p.kind==='precision'){
      const n=s.perfectCatches||0;
      if(n>=3&&p.achievedAt===undefined)p.achievedAt=s.elapsed;
      return n>=3?{state:'achieved',text:ended?`本趟精准${n}件，已补齐上趟不足3件。`:`精准${n}件已达，继续稳车。`}:ended?{state:'failed',text:`本趟总精准${n}/3，还需练中心接货。`}:{state:'waiting',text:practiceLabel(p)};
    }
    if(p.kind==='station'){
      const passed=!!s.tail?.completed||(s.tail?.step||1)>p.step;
      const attempted=passed||runEvidence.stations.has(p.step)||!!s.tail?.active&&s.tail.step>=p.step;
      if(passed&&p.achievedAt===undefined)p.achievedAt=s.elapsed;
      return passed?{state:'achieved',text:`第${p.step}站这次已停稳${ended?(won?'，并已安全收工':'；整趟未安全收工'):'，继续保货'}。`}:ended?attempted?{state:'failed',text:`第${p.step}站这次仍未停稳，原线再练。`}:{state:'neutral',text:`本趟尚未练到第${p.step}站，先看本次失误再重来。`}:{state:'waiting',text:practiceLabel(p)};
    }
    if(p.kind==='arrival'){
      const attempted=runEvidence.arrival||s.settling||s.tail?.completed;
      return won?{state:'achieved',text:'这次已安全靠站，保到了终点。'}:ended?attempted?{state:'failed',text:'这次还未安全靠站，继续练整车停稳。'}:{state:'neutral',text:'本趟尚未练到最后靠站，先看本次失误再重来。'}:attempted?{state:'progress',text:'正在靠站，货物稳住后才算完成。'}:{state:'waiting',text:practiceLabel(p)};
    }
    if(p.kind==='stability'){
      if(s.assists>0)return {state:'failed',text:'本次又发生扶正，继续按主指令救稳旧货。'};
      if(ended)return won?{state:'achieved',text:`本趟未发生扶正，已安全收工${s.lives<3?'；翻车机会仍需保住':''}。`}:{state:'progress',text:'本趟未用扶正；整趟仍未安全收工。'};
      return {state:'waiting',text:practiceLabel(p)};
    }
    const parcels=s.cargo.filter(c=>practiceMatches(p,c)),item=parcels.find(c=>c.caught),id=p.cargoId??item?.id,name=NAMES[p.type];
    const matches=c=>p.cargoId!==null?c.cargoId===p.cargoId:c.cargoType===p.type;
    const crashes=runEvidence.crashes.filter(matches);
    if(s.lastCrash&&matches(s.lastCrash)&&!crashes.some(c=>c.at===s.lastCrash.at&&c.cargoId===s.lastCrash.cargoId))crashes.push({...s.lastCrash,caughtBefore:!!s.lastCrash.cause&&s.lastCrash.cause!=='漏接'});
    const missed=crashes.some(c=>c.cause==='漏接'&&!c.caughtBefore),dropped=crashes.some(c=>c.caughtBefore||!!c.cause&&c.cause!=='漏接');
    const caught=!!item||(id!==undefined&&runEvidence.caught.has(id)),retryCaught=id!==undefined&&(runEvidence.retryCaught.has(id)||missed&&caught);
    const attempted=caught||crashes.length>0||parcels.length>0||[...runEvidence.spawned].some(([cargoId,type])=>p.cargoId!==null?cargoId===p.cargoId:type===p.type);
    const restored=!!item?.restored||(id!==undefined&&runEvidence.restored.has(id)),assisted=id!==undefined&&runEvidence.assisted.has(id);
    const stable=!!item?.supported&&(item.risk||0)<.4;
    if(p.cargoId===null&&p.type==='bread')return ended?{state:crashes.length?'failed':'neutral',text:crashes.length?'本趟仍有饼漏接或掉落；旧记录缺编号，未单独判保货。':'旧记录缺少饼的编号，本趟未单独判保货。'}:{state:'waiting',text:practiceLabel(p)};
    if(dropped)return {state:'failed',text:ended?`${name}本次接到后又掉落，${item?'终局已归位':'终局未保住'}；还未独立保到终点。`:`${name}本次又掉落，归位后继续保货。`};
    if(ended){
      if(!item)return caught?{state:'progress',text:`本次接到了${name}，但终局未确认仍在车上，继续练保货。`}:missed?{state:'failed',text:`${name}本次仍漏接，原线继续练落点。`}:{state:'neutral',text:attempted?`${name}已投出，尚未完成这项练习；先看本次失误。`:`本趟尚未练到${name}，先看本次失误再重来。`};
      if(restored||assisted)return {state:'progress',text:`${name}终局仍在车上；中途有${assisted?'扶正':'归位'}辅助，不作独立保货。`};
      if(retryCaught)return {state:'progress',text:`${name}补发后已签收${won?'并保到终点':''}；首次投递仍漏接。`};
      if(won)return {state:'achieved',text:`这次把${name}独立保到了终点。`};
      return {state:'progress',text:`${name}本次已接到；整趟还未安全收工。`};
    }
    if(caught)return {state:'progress',text:restored?`${name}已归位，继续保货。`:retryCaught?`${name}补发已接到，继续保货。`:stable?`${name}已接妥，继续保货。`:`${name}已签收，仍需救稳。`};
    if(missed)return {state:'failed',text:`${name}本次仍漏接，先按当前提示继续。`};
    return {state:'waiting',text:practiceLabel(p)};
  }
  function practiceState(s,playing,teaching){
    if(!practice||!playing||teaching)return null;
    const p=practice,start=s.elapsed<=4,g=s.guidance,falling=s.cargo.filter(b=>!b.caught),next=s.nextDrop;
    let relevant=false,suppressed=false;
    if(p.kind==='station')relevant=!!s.tail?.active&&!s.tail.completed&&s.tail.step===p.step;
    else if(p.kind==='arrival')relevant=!!s.settling||!!s.tail?.completed;
    else if(p.kind==='stability')relevant=g?.kind==='rescue'||!!s.recovery?.assist;
    else if(p.kind==='precision')relevant=['pickup','brake'].includes(g?.kind)&&!!(next||falling.length);
    else{
      const id=g?.cargoId??(['pickup','brake'].includes(g?.kind)?next?.cargoId:null)??falling.at(-1)?.id;
      const type=s.cargo.find(b=>b.id===id)?.type||(next&&next.cargoId===id?next.type:null);
      const near=p.at!==null&&s.elapsed>=p.at-4&&s.elapsed<=p.at+2;
      const urgentOther=['rescue','recovery'].includes(g?.kind)&&(p.cargoId!==null?id!==p.cargoId:type!==p.type);
      suppressed=urgentOther;
      if(!urgentOther){
        if(p.cargoId!==null)relevant=id===p.cargoId||falling.some(b=>b.id===p.cargoId)||(near&&(id===undefined||id===null||id===p.cargoId||s.cargo.some(b=>b.id===p.cargoId&&b.caught)));
        // Legacy records cannot identify which of the repeated bread parcels failed.
        else relevant=p.at!==null?near&&(!type||type===p.type):p.type!=='bread'&&type===p.type;
      }
    }
    const status=practiceStatus(s);
    if(p.kind==='precision'&&status.state==='achieved')relevant=false;
    if(p.kind==='station'&&status.state==='achieved')relevant=false;
    const acknowledged=(p.kind==='precision'||p.kind==='station')&&status.state==='achieved'&&s.elapsed-p.achievedAt<=2.5&&!['rescue','recovery'].includes(g?.kind);
    const notice=Number.isFinite(p.noticeAt)&&s.elapsed>=p.noticeAt&&s.elapsed-p.noticeAt<=2.5&&!suppressed;
    return start||relevant||acknowledged||notice?{...status,relevant:status.state==='achieved'?false:relevant}:null;
  }
  function nextGoal(won=false,s=snap){
    const required=s.requiredCatches||4,a=s.lastCrash,name=NAMES[a?.cargoType]||'货物';
    if(!won){
      if(s.finishReason==='incomplete')return `下一趟：还差${Math.max(1,required-(s.catches||0))}件，${a?.cause==='漏接'?`提前对准${name}的落点再松手。`:'看准投递预告，先把货接齐。'}`;
      if(s.finishReason==='tail_incomplete')return `原线重来，重点练第${s.tail?.step||1}站：到亮区松手，等整车货物稳住。`;
      if(s.finishReason==='unsafe_arrival')return '下一趟：到站后松手，等整车货物稳住再收工。';
      if(a?.cause==='漏接')return `原线重来，重点接${name}：提前到落点，松手等它落上车。`;
      if(a?.side==='left'||a?.side==='right')return `原线重来，重点救${name}：向${a.side==='left'?'左':'右'}轻挪，把车送到它下面。`;
      if(a)return `原线重来，重点救${name}：弹起时别猛拉，稳住等它落回。`;
      return (s.catches||0)>=required?'下一趟：货已接齐，轻挪并松手，先保住剩余机会。':'下一趟：提前到落点，松手接住新货。';
    }
    if(s.assists>0)return '原线重来，重点救稳旧货，争取全程无扶正。';
    if(s.lives<3){
      if(a?.cause==='漏接')return `原线重来，重点接${name}：提前对准落点，松手等货。`;
      if(a?.side==='left'||a?.side==='right')return `原线重来，重点救${name}：向${a.side==='left'?'左':'右'}轻挪接回，保住这次机会。`;
      if(a)return `原线重来，重点救${name}：${a.advice||'弹起时别猛拉，稳住等它落回。'}`;
      return '原线重来，重点保住三次机会，全程不翻车。';
    }
    if((s.perfectCatches||0)<3)return '原线重来，重点练中心接货，精准至少3件。';
    return stageGoal();
  }
  function compareRuns(previous,current){
    if(!previous)return {text:'',improved:false};
    const p=previous,c=current,up=text=>({text,improved:true});
    const baseline={text:`上趟基准：${p.won?'已收工 · ':''}签收${p.catches}件 · 停稳${p.stops}/2站`,improved:false};
    if(p.won&&!c.won)return {text:`上趟已收工；这趟未收工，${c.stops<2?`停稳${c.stops}/2站`:'靠站安全还需练习'}。${c.catches>p.catches?`单项多签收${c.catches-p.catches}件。`:''}`,improved:false};
    if(c.stops<p.stops)return {text:`签收${c.catches}件；停稳${c.stops}/2站，比上趟少${p.stops-c.stops}站。`,improved:false};
    if(c.catches<p.catches&&!c.won)return baseline;
    if(c.won&&!p.won)return up('比上一趟更进一步：这次安全收工了！');
    const safetyRegressed=c.lives<p.lives||c.assists>p.assists;
    const slower=c.won&&p.won&&c.time>p.time+.1;
    const qualityRegressed=c.perfectCatches<p.perfectCatches||(gradeFor(p)==='S'&&gradeFor(c)!=='S');
    if(safetyRegressed||slower||qualityRegressed||c.catches<p.catches){
      const facts=[],delta=(value,label,unit)=>{if(value)facts.push(`${label}${value>0?'+':''}${value}${unit}`)};
      delta(c.catches-p.catches,'签收','件');delta(c.stops-p.stops,'停站','站');delta(p.lives-c.lives,'翻车','次');delta(c.assists-p.assists,'扶正','次');
      if(c.won&&p.won&&Math.abs(c.time-p.time)>.1)facts.push(`用时${c.time>p.time?'+':'−'}${Math.abs(c.time-p.time).toFixed(2)}秒`);
      delta(c.perfectCatches-p.perfectCatches,'精准','次');
      return {text:`较上趟：${facts.join(' · ')||'本趟评级下降'}`,improved:false};
    }
    if(c.stops>p.stops)return up(`比上一趟多停稳${c.stops-p.stops}站。`);
    if(c.catches>p.catches)return up(`比上一趟多签收${c.catches-p.catches}件。`);
    const progressKept=c.catches>=p.catches&&c.stops>=p.stops&&(!p.won||c.won);
    if(progressKept&&c.lives>p.lives)return up(`比上一趟少翻车${c.lives-p.lives}次，继续保持。`);
    if(progressKept&&c.assists<p.assists)return up(`比上一趟少扶正${p.assists-c.assists}次，离独立收工更近了。`);
    if(progressKept&&c.won&&p.won&&c.time+.05<p.time)return up(`同一条线，比上一趟快了${(p.time-c.time).toFixed(2)}秒。`);
    if(progressKept&&c.perfectCatches>p.perfectCatches)return up(`比上一趟多了${c.perfectCatches-p.perfectCatches}次精准签收。`);
    if(progressKept&&c.score>p.score)return up(`同一条线，比上一趟多了${c.score-p.score}分。`);
    return baseline;
  }
  function syncRoutePreview(){const next=mode==='normal'?snap.route?.next:null;$('routeNextHint').classList.toggle('hidden',!next);if(next){put('routeNextHint',`下条：${next.name} · ${next.tagline}`);put('resultNewRoute',`换到${next.name} ↗`);$('resultNewRoute').setAttribute('aria-label',`换到${next.name}`);$('resultNewRoute').dataset.variant=String(next.variant)}else put('routeNextHint','')}
  function syncChallengeLabel(){
    const c=challengeFor(),hasS=achievements[recordKey()]?.grade==='S';
    $('challengeRecord').classList.toggle('hidden',mode==='tutorial'||(!c&&!hasS));
    if(mode==='tutorial'){put('challengeRecord','');return}
    const value=stageFor();
    put('challengeRecord',c?`S最快${(c.bestTimeCs/100).toFixed(2)}秒 · ${value.badges.time?'限时章已获得':value.targetSeconds===null?'再获S后确定限时':`限时章≤${value.targetSeconds}秒且保持S`}`:hasS?'S成就已保留 · 再获S后记录用时':'');
  }
  function syncStages(){
    const teaching=mode==='tutorial';$('routeStages').classList.toggle('hidden',teaching);if(teaching)return;
    const value=stageFor();
    for(const [kind,id]of Object.entries({s:'badgeS',time:'badgeTime',full:'badgeFull'})){
      const earned=value.badges[kind];put(id,`${earned?'✓':'○'} ${kind==='full'?'全准章':STAGE_NAMES[kind]}`);$(id).dataset.earned=String(earned);
    }
    const count=stageCount(value);put('stageCount',`${count}/3${count===3?' · 毕业':''}`);$('routeStages').dataset.state=count===3?'complete':'progress';$('routeStages').setAttribute('aria-label',`本线已集${count}/3章。S章：无翻车无扶正、精准至少3件安全收工。限时章：${value.targetSeconds===null?'再获S后确定一次固定限时':`保持S且${value.targetSeconds}秒内收工`}。全单精准章：6件全部精准且保持S。${stageGoal(value)}`);
  }
  function bestLabel(){syncRoutePreview();syncChallengeLabel();syncStages();const teaching=mode==='tutorial';$('routeBrief').classList.toggle('hidden',teaching);$('gradeRecord').classList.toggle('hidden',teaching||!achievements[recordKey()]);if(teaching){$('bestRecord').textContent='三步练习，不限时、不扣机会';put('nextChallengeHint','先学会挪车、松手刹车，再试救货。');return}const b=best[recordKey()],latest=recentRuns[recordKey()],grade=achievements[recordKey()]?.grade;put('routeBrief',`${snap.route?.name||routeName()} · ${snap.route?.tagline||'原线再试，货物与路况不变。'}`);put('gradeRecord',grade?`✦ 本线最高${grade}级 · 成就已保留`:'');$('gradeRecord').dataset.grade=grade||'';$('bestRecord').textContent=b?`${routeName()} · ${b.score}分 · ${b.won?`${b.time}秒收工`:`用时${b.time}秒`}`:`${routeName()} · 等你出发`;put('nextChallengeHint',stageKind(stageFor())==='complete'?stageGoal():latest?nextGoal(latest.won,latest):b?.won?nextGoal(true,{...b,perfectCatches:b.perfect}):stageGoal())}
  function refreshMode(){if(snap.status==='ready'){engine.reset(mode,undefined,{variant:activeVariant});engine.status='ready';snap=engine.snapshot()}document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode))});const teaching=mode==='tutorial';$('startBtn').textContent=teaching?'三步学会稳车 →':'拉上小车，走！ ↗';$('startCopy').innerHTML=teaching?'先学接货、松手刹车，再试救货。<br>三步练习不限时，失误不扣机会。':'至少签收4件，投递结束后停稳两站。<br>达标后仍有新货，进度会告诉你还差什么。';$('skipTutorial').classList.toggle('hidden',!teaching);$('routeLabel').textContent=teaching?'新手三步':routeName();bestLabel()}
  function copyFrame(s){return{status:'playing',elapsed:s.elapsed,truck:{...s.truck},cargo:s.cargo.map(b=>({...b})),wind:s.wind,balance:s.balance?{...s.balance}:null,tail:s.tail?{...s.tail}:null}}
  function recordFrame(){if(snap.elapsed-lastSample<.045||isPaused)return;lastSample=snap.elapsed;history.push(copyFrame(snap));history=history.filter(f=>f.elapsed>=snap.elapsed-2.8)}
  function playReplay(){if(!lastAccident||lastAccident.frames.length<2)return;replay={...lastAccident,time:0};$('resultOverlay').classList.add('hidden');document.body.classList.remove('result-mode');$('replayBanner').classList.remove('hidden');$('gameWindow').classList.add('replaying');$('replayCause').textContent=`${NAMES[replay.event.cargoType]||'货物'}：${replay.event.cause||'货物落地'}`;$('replayAdvice').textContent=replay.event.advice||'提前挪车，到位后慢下来。';$('warning').classList.add('hidden');$('gameMessage').classList.remove('show');particles=[];texts=[];wreck=null;shake=0;flash=0}
  function stopReplay(){replay=null;$('replayBanner').classList.add('hidden');$('gameWindow').classList.remove('replaying');if(['win','lose'].includes(snap.status))showReport()}
  function replayFrame(dt){replay.time+=dt;const frames=replay.frames,start=frames[0].elapsed,end=frames[frames.length-1].elapsed,t=start+replay.time*.65;if(t>end+.7){stopReplay();return snap}let result=frames[0];for(const f of frames){if(f.elapsed>t)break;result=f}return result}
  function start(requestedMode,options={}){
    const nextMode=['tutorial','normal','daily'].includes(requestedMode)?requestedMode:mode;
    const same=options.retry&&routeContext?.mode===nextMode;
    mode=nextMode;
    if(mode==='normal'){
      if(options.newRoute)activeVariant=(activeVariant+1)%3;
      else if(same)activeVariant=routeContext.variant;
      try{localStorage.setItem('xiaban-v5-route',String(activeVariant))}catch{}
    }
    const dateSeed=mode==='daily'&&same?routeContext.dateSeed:undefined;
    const practiceSource=same&&engine.snapshot().lastCrash?engine.snapshot():null;
    runId++;lastReportRun=-1;menuOpen=false;replay=null;history=[];lastSample=-1;lastAccident=null;wreck=null;lastRecoveryText='';recoveryNoteUntil=0;runEvidence=emptyEvidence();practice=null;runStage=null;engine.reset(mode,dateSeed,{variant:activeVariant});snap=engine.snapshot();routeContext={mode,variant:snap.tail?.variant??activeVariant,dateSeed:snap.dateSeed};practice=mode==='tutorial'||options.newRoute?null:practiceFrom(practiceSource||recentRuns[recordKey()]);const chapter=mode==='tutorial'?null:stageFor();runStage=chapter?{key:recordKey(),kind:stageKind(chapter),badges:{...chapter.badges},targetSeconds:chapter.targetSeconds}:null;rememberFormal();isPaused=false;pointer=null;keys.clear();particles=[];texts=[];shake=0;flash=0;slowmo=0;chaosCooldown=0;messageUntil=0;$('gameMessage').classList.remove('show');$('gameMessage').textContent='';canvas.setAttribute('aria-label',mode==='tutorial'?'新手三步：方向键或拖动挪车，松手刹车，再练接回弹起的饼。不限时，失误不扣机会。':'至少签收4件，投递结束后在尾段两站松手停稳。方向键按住轻挪，到位松手；原线重试保留本趟路线。');
    document.body.classList.remove('result-mode');$('resultOverlay').inert=false;$('resultStats').open=false;$('resultScroll').scrollTop=0;
    ['startOverlay','pauseOverlay','resultOverlay','resultChallenge','resultPractice','stageReward','replayBanner','balancePanel','dropBadge','recoveryNote','parkingBadge','settleBanner','tailPanel','jobPanel','practiceHint'].forEach(id=>$(id).classList.add('hidden'));$('gameWindow').classList.remove('replaying','tail-mode');$('gameWindow').classList.toggle('tutorial-mode',mode==='tutorial');document.body.classList.add('playing');if(matchMedia('(max-width:760px)').matches)setFocus(true);$('hud').classList.remove('hidden');$('touchGuide').classList.add('hidden');$('warning').classList.add('hidden');$('chaosBtn').disabled=mode==='tutorial';$('pauseBtn').textContent='☰';refreshMode();$('commentary').textContent=mode==='tutorial'?'三步练习不扣机会，随时可以从菜单跳过。':'至少签收4件，等整单投完，再到两站松手停稳。';sound('start');canvas.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>document.querySelector('.arcade').scrollIntoView({block:'start',behavior:'auto'}));
  }
  function retryRun(){start(mode,{retry:true})}
  function showReport(){document.body.classList.add('result-mode');$('resultOverlay').classList.remove('hidden');$('resultScroll').scrollTop=0;$('chaosBtn').disabled=true;requestAnimationFrame(()=>{if(!document.body.classList.contains('result-mode')||menuOpen)return;if(matchMedia('(max-width:760px)').matches)document.querySelector('.arcade').scrollIntoView({block:'start',behavior:'auto'});$('restartBtn').focus({preventScroll:true})})}
  function rewardStages(reward){
    if(!reward.earned.length)return;
    const value=stageFor(),count=stageCount(value),names=reward.earned.map(kind=>STAGE_NAMES[kind]).join('、');
    put('stageReward',reward.graduated?`三章集齐，本线毕业！${names}到手`:`${names}到手！本线已集${count}/3章`);
    $('stageReward').dataset.kind=reward.graduated?'graduate':'badge';$('stageReward').dataset.count=String(count);$('stageReward').dataset.newCount=String(reward.earned.length);$('stageReward').classList.remove('hidden');
    sound(reward.graduated?'graduate':'badge');
    if(!reducedMotion)for(let i=0;i<(reward.graduated?4:2);i++)burst(115+i*(reward.graduated?65:190),250-i%2*35,['#f7ef59','#a7c6a5','#a397d2'][i%3],reward.graduated?20:14);
  }
  function finish(won){
    if(engine.snapshot().status==='playing')return;snap=engine.snapshot();if(lastReportRun===runId){showReport();return}const teaching=mode==='tutorial';$('resultOverlay').dataset.grade='';$('resultOverlay').querySelector('.result-score').classList.toggle('hidden',teaching);$('resultStats').classList.toggle('hidden',teaching);$('resultSummary').classList.toggle('hidden',teaching);['resultAchievement','resultChallenge','resultPractice','stageReward'].forEach(id=>$(id).classList.add('hidden'));$('resultNewRoute').classList.toggle('hidden',mode!=='normal');$('resultStats').open=false;$('resultDelta').classList.add('hidden');put('resultDelta','');
    if(teaching){lastReportRun=runId;if(won){try{localStorage.setItem('xiaban-tutorial-v3','done')}catch{}}put('resultKicker','三步练习 · 已学会');put('resultTitle','会接、会停、会救。');put('resultText','正式路线要签收4件、停稳两站。到站反馈会告诉你还差哪一步。');put('restartBtn','开始正式下班 →');put('recordHint','随时点菜单重练，失误也不扣机会。');put('nextRunHint','先接齐货，再到两站亮区松手停稳。');showReport();['replayBtn','warning','touchGuide','balancePanel','actionGuide','tutorialPill','dropBadge','recoveryNote','parkingBadge','settleBanner','tailPanel','jobPanel','practiceHint'].forEach(id=>$(id).classList.add('hidden'));return}
    const score=Math.floor(snap.score),key=recordKey(),old=best[key]?.score??-1,isNew=score>old;
    if(isNew){best[key]={score,won,time:Math.round(snap.elapsed*100)/100,perfect:snap.perfectCatches||0,lives:snap.lives,assists:snap.assists||0};try{localStorage.setItem('xiaban-best-v8',JSON.stringify(best))}catch{}}
    const perfect=snap.perfectCatches||0,accident=snap.lastCrash,incomplete=snap.finishReason==='incomplete',tailFailed=snap.finishReason==='tail_incomplete',unsafe=snap.finishReason==='unsafe_arrival',required=snap.requiredCatches||4,tail=snap.tail,stops=tail?.completed?2:Math.max(0,(tail?.step||1)-1),elite=won&&snap.lives===3&&perfect>=3&&!(snap.assists>0);
    const challengeVerdict=challengeResult(snap,won,elite),practiceVerdict=practiceStatus(snap,true);
    const stageReward=keepRunStages(snap,won,elite);
    if(elite)keepSChallenge(key,snap.elapsed);
    if(challengeVerdict){put('resultChallenge',challengeVerdict.text);$('resultChallenge').dataset.state=challengeVerdict.state;$('resultChallenge').classList.remove('hidden')}
    if(practiceVerdict){put('resultPractice',practiceVerdict.text);$('resultPractice').dataset.state=practiceVerdict.state;$('resultPractice').classList.remove('hidden')}
    const earned=keepAchievement(key,won?(elite?'S':'A'):null),grade=achievements[key]?.grade;put('resultAchievement',elite&&earned?'✦ 首次S级！成就已保留':grade?`✦ 本线最高${grade}级 · 成就已保留`:'');$('resultAchievement').classList.toggle('hidden',!grade);$('resultAchievement').dataset.grade=grade||'';
    $('resultOverlay').dataset.grade=elite?'S':won?'A':'';put('resultKicker',`${routeName()} · ${won?(elite?'S级':'A级'):incomplete?'签收未齐':tailFailed?'停站未完成':unsafe?'靠站未稳':'这趟散架了'}`);
    rewardStages(stageReward);
    put('restartBtn',mode==='daily'?'同题原线再试 ↻':'原线再试一趟 ↻');put('resultTitle',won?(elite?'S级！这趟稳住了':'两站停好，收工！'):incomplete?`还差${Math.max(1,required-snap.catches)}件，原线再试。`:tailFailed?`第${tail?.step||1}站，差一点。`:unsafe?'最后靠站没稳住。':'看懂这次，下趟稳住。');
    put('resultScore',score);put('resultSummary',`签收${snap.catches}件 · 两站${stops}/2 · ${timeText(snap.elapsed)}秒`);put('resultCatches',snap.catches);put('resultPerfect',perfect);put('resultSaves',snap.saves);put('resultTail',`${stops}/2`);put('resultTime',timeText(snap.elapsed));put('resultTimeBonus',`+${snap.timeBonus||0}`);put('resultTailBonus',`+${snap.tailBonus||tail?.bonus||0}`);put('resultAssists',snap.assists||0);put('resultRetries',snap.retries||0);put('resultGap',isNew?'✦ 本线新纪录':`距本线个人纪录还有 ${Math.max(0,old-score)} 分`);
    put('resultText',won?(elite?'无翻车、无扶正，精准签收达标。':`本趟${3-snap.lives}次翻车、${snap.assists||0}次扶正，精准${perfect}件。${accident?`末次：${NAMES[accident.cargoType]||'货物'}${accident.cause==='漏接'?'没接到':accident.cause||'掉落'}。`:''}`):incomplete?`投递已结束，签收${snap.catches}/${required}件，${snap.elapsed<snap.duration?'本趟提前结束。':'本趟未接齐。'}`:tailFailed?`货已接齐，第${tail?.step||1}站还没停稳。到位后还要松手，等整车稳定。`:unsafe?'到站时货物仍未稳定，本趟未能安全收工。':accident?`${NAMES[accident.cargoType]||'货物'}${accident.cause==='漏接'?'没接到':accident.cause}，用完了本趟机会。`:'本趟机会用完了，原线再练一次。');
    const run={won,score,time:Math.round(snap.elapsed*100)/100,catches:snap.catches,stops,lives:snap.lives,assists:snap.assists||0,perfectCatches:perfect,finishReason:snap.finishReason,requiredCatches:required,tail:{step:tail?.step||1},lastCrash:accident?{cargoId:accident.cargoId,cargoType:accident.cargoType,cause:accident.cause,side:accident.side,advice:accident.advice,at:accident.at??accident.elapsed}:null};
    const delta=compareRuns(recentRuns[key],run);put('resultDelta',delta.text);$('resultDelta').classList.toggle('hidden',!delta.text);$('resultDelta').dataset.tone=delta.improved?'improved':'neutral';recentRuns[key]=run;lastReportRun=runId;try{localStorage.setItem('xiaban-last-v8',JSON.stringify(recentRuns))}catch{}bestLabel();
    put('nextRunHint',nextGoal(won,snap));put('recordHint',`${routeName()}单独记录；原线重试保留货物、路况和两站位置。`);$('replayBtn').classList.toggle('hidden',!lastAccident||lastAccident.frames.length<2);showReport();['warning','touchGuide','balancePanel','actionGuide','dropBadge','tutorialPill','recoveryNote','parkingBadge','settleBanner','tailPanel','jobPanel','practiceHint'].forEach(id=>$(id).classList.add('hidden'));
  }
  function setFocus(on){document.body.classList.toggle('focus-mode',on);$('focusBtn').setAttribute('aria-pressed',String(on));put('focusBtn',on?'退出专注':'专注模式')}
  function syncSound(){put('soundBtn',muted?'♪ 声音关':'♪ 声音开');$('soundBtn').setAttribute('aria-pressed',String(!muted));put('menuSound',muted?'♪ 音效：关':'♪ 音效：开');$('menuSound').setAttribute('aria-pressed',String(!muted))}
  function toggleSound(){muted=!muted;try{localStorage.setItem('xiaban-sound',muted?'off':'on')}catch{}syncSound();if(!muted)sound('catch')}
  function pause(value){
    if(value){
      if(replay)stopReplay();menuOpen=true;$('resultOverlay').inert=true;pointer=null;keys.clear();engine.releaseControl();
      if(engine.snapshot().status==='playing'){isPaused=true;engine.pause(true)}
      const current=engine.snapshot(),playing=current.status==='playing',focus=practiceStatus(current),challenge=challengeState(current);
      put('menuTitle',current.status==='ready'?'选条收工路线':playing?'先靠边歇会。':'这趟下班已结束');
      put('menuSummary',playing?[focus?.text,challenge?.summary,'本局已暂停，车和货都等你。'].filter(Boolean).join(' '):'换条线、开声音，或者回大厅。');
      put('resumeBtn',playing?'继续本局 →':current.status==='ready'?'返回当前页面 →':'返回成绩 →');put('menuHome',playing?'返回大厅 · 结束本局':'返回大厅');
      $('menuSkipTutorial').classList.toggle('hidden',mode!=='tutorial'||!playing);syncSound();$('pauseOverlay').classList.remove('hidden');$('resumeBtn').focus({preventScroll:true});
    }else{menuOpen=false;$('resultOverlay').inert=false;$('pauseOverlay').classList.add('hidden');if(engine.snapshot().status==='playing'){isPaused=false;engine.pause(false);canvas.focus({preventScroll:true})}else if(['win','lose'].includes(snap.status))$('restartBtn').focus({preventScroll:true})}
  }
  function goHome(){runId++;practice=null;runStage=null;runEvidence=emptyEvidence();menuOpen=false;isPaused=false;pointer=null;keys.clear();replay=null;wreck=null;particles=[];texts=[];engine.reset(mode);engine.status='ready';snap=engine.snapshot();document.body.classList.remove('playing','result-mode');$('resultOverlay').inert=false;setFocus(false);$('gameWindow').classList.remove('tail-mode','replaying','tutorial-mode');['pauseOverlay','resultOverlay','resultChallenge','resultPractice','stageReward','hud','actionGuide','tutorialPill','dropBadge','parkingBadge','settleBanner','recoveryNote','tailPanel','jobPanel','practiceHint','balancePanel','replayBanner','warning'].forEach(id=>$(id).classList.add('hidden'));$('startOverlay').classList.remove('hidden');$('chaosBtn').disabled=true;$('gameMessage').classList.remove('show');refreshMode();put('commentary','换条线，开点声音，下一趟稳稳回家。');window.scrollTo({top:0,behavior:'auto'})}
  $('startBtn').onclick=()=>start();$('restartBtn').onclick=()=>mode==='tutorial'?start('normal'):retryRun();$('quickRestart').onclick=retryRun;$('hudRestart').onclick=retryRun;$('pauseRestartBtn').onclick=retryRun;$('resultNewRoute').onclick=()=>start('normal',{newRoute:true});$('resultMenu').onclick=()=>pause(true);$('pauseBtn').onclick=()=>pause(!menuOpen);$('resumeBtn').onclick=()=>pause(false);$('skipTutorial').onclick=()=>start('normal');$('tutorialBtn').onclick=()=>start('tutorial');$('focusBtn').onclick=()=>{const on=!document.body.classList.contains('focus-mode');setFocus(on);if(!on&&snap.status==='playing'&&!isPaused)pause(true)};
  $('menuBtn').onclick=$('homeMenu').onclick=()=>pause(true);$('menuHome').onclick=$('resultHome').onclick=goHome;$('menuNormal').onclick=$('menuSkipTutorial').onclick=()=>start('normal');$('menuDaily').onclick=$('resultDaily').onclick=()=>start('daily');$('menuTutorial').onclick=()=>start('tutorial');$('menuSound').onclick=toggleSound;
  $('replayBtn').onclick=playReplay;$('exitReplay').onclick=stopReplay;
  $('chaosBtn').onclick=()=>{if(snap.status!=='playing'||chaosCooldown>0)return;if(engine.triggerChaos()){chaosCooldown=5;$('commentary').textContent='你点的妖风，已为你加急送达。'}else $('commentary').textContent='先接住第一件货，妖风马上到。'};
  $('soundBtn').onclick=toggleSound;
  let helpPaused=false;$('helpBtn').onclick=()=>{helpPaused=engine.snapshot().status==='playing'&&!isPaused;if(helpPaused)pause(true);$('helpDialog').showModal()};const closeHelp=()=>{$('helpDialog').close();if(helpPaused)pause(false);helpPaused=false};$('closeHelp').onclick=closeHelp;$('gotIt').onclick=closeHelp;$('helpDialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp()});
  $('menuHelp').onclick=$('helpBtn').onclick;
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(mode===b.dataset.mode)return;mode=b.dataset.mode;refreshMode();if(snap.status!=='ready')start()});
  canvas.addEventListener('pointerdown',e=>{if(snap.status!=='playing'||isPaused||snap.settling||!e.isPrimary||pointer)return;canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,truck:snap.truck.x};e.preventDefault()});
  canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=(e.clientX-pointer.x)*W/canvas.getBoundingClientRect().width;engine.setTarget(pointer.truck+dx);e.preventDefault()});
  const clearPointer=()=>{if(pointer){pointer=null;engine.releaseControl()}};canvas.addEventListener('pointerup',clearPointer);canvas.addEventListener('pointercancel',clearPointer);canvas.addEventListener('lostpointercapture',clearPointer);
  const directionHeld=()=>['ArrowLeft','ArrowRight','a','A','d','D'].some(k=>keys.has(k));
  window.addEventListener('keydown',e=>{if($('helpDialog').open)return;if(menuOpen){if(e.key==='Escape'){e.preventDefault();pause(false)}return}if(['ArrowLeft','ArrowRight',' ','a','A','d','D'].includes(e.key))e.preventDefault();if(e.repeat&&[' ','r','R','Escape'].includes(e.key))return;if(e.key===' '){if(['ready','win','lose'].includes(snap.status))(mode==='tutorial'&&snap.status==='win'?start('normal'):snap.status==='ready'?start():retryRun());else pause(true)}else if(e.key==='Escape')pause(true);else if(e.key==='r'||e.key==='R')retryRun();else keys.add(e.key)});window.addEventListener('keyup',e=>{keys.delete(e.key);if(['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)&&!directionHeld()&&!pointer)engine.releaseControl()});window.addEventListener('blur',()=>{keys.clear();pointer=null;if(snap.status==='playing'&&!menuOpen)pause(true)});document.addEventListener('visibilitychange',()=>{if(document.hidden&&snap.status==='playing'&&!menuOpen)pause(true)});
  function eye(c,x,y,r=4,panic=false,look=0){c.fillStyle='#fffdf3';c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();c.ellipse(x,y,panic?r*1.15:r,r*(panic?1.35:1.05),0,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=INK;c.beginPath();c.arc(x+look,y+(panic?0:1),Math.max(1.5,r*.43),0,Math.PI*2);c.fill()}
  function cargo(c,b,mini=false){c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);c.strokeStyle=INK;c.lineWidth=mini?2.5:2.7;c.lineJoin='round';const panic=Math.abs(b.vy||0)>3||Math.abs(b.angle||0)>.5;const look=Math.max(-1.5,Math.min(1.5,(b.vx||0)*.25));
    if(b.type==='bread'){const w=b.w||94,h=b.h||34;c.fillStyle='#efc069';round(c,-w/2,-h/2,w,h,12);c.fill();c.stroke();c.fillStyle='#f5d891';round(c,-w/2+6,-h/2+5,w-12,h-10,8);c.fill();c.strokeStyle='#bf894f';c.lineWidth=2;for(let i=-1;i<=1;i++)line(c,i*22-5,-8,i*22+2,0);c.strokeStyle=INK;eye(c,-13,7,3.5,panic,look);eye(c,1,7,3.5,panic,look);c.beginPath();c.arc(-6,12,2,0,Math.PI);c.stroke()}
    else if(b.type==='pot'){const r=b.r||28;c.fillStyle='#9b8cc4';c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#c3b6df';c.beginPath();c.ellipse(0,-6,r-4,12,0,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=INK;round(c,-8,-24,16,7,3);c.fill();c.lineWidth=4;line(c,-r-9,0,-r+1,0);line(c,r-1,0,r+9,0);eye(c,-9,7,4.5,panic,look);eye(c,8,7,4.5,panic,look);c.lineWidth=2;line(c,-4,18,4,18)}
    else if(b.type==='monday'){const w=b.w||46,h=b.h||44;c.fillStyle='#ed705b';round(c,-w/2,-h/2,w,h,4);c.fill();c.stroke();c.fillStyle='#b95043';c.beginPath();c.moveTo(w/2-7,-h/2);c.lineTo(w/2,-h/2+8);c.lineTo(w/2-7,-h/2+8);c.fill();c.fillStyle=INK;c.font='900 11px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('周 一',0,-5);eye(c,-9,6,4,panic,look);eye(c,7,6,4,panic,look);c.lineWidth=2;line(c,-5,16,4,15)}
    else if(b.type==='fish'){const w=b.w||64,h=b.h||24;c.fillStyle='#92b9a9';c.beginPath();c.moveTo(-w/2+12,-7);c.lineTo(-w/2-5,-h/2-3);c.lineTo(-w/2-2,h/2+3);c.lineTo(-w/2+13,7);c.closePath();c.fill();c.stroke();c.fillStyle='#add4bd';c.beginPath();c.ellipse(3,0,w/2-4,h/2,0,0,Math.PI*2);c.fill();c.stroke();eye(c,17,-2,4.8,panic,look);c.lineWidth=1.7;c.beginPath();c.arc(0,0,7,-1,1);c.stroke();line(c,27,4,30,4)}
    else{const w=b.w||28,h=b.h||44;c.fillStyle='#fff8dc';round(c,-w/2,-h/2,w,h,3);c.fill();c.stroke();c.fillStyle='#b89e7f';c.fillRect(-w/2+1,-2,w-2,15);c.fillStyle=INK;round(c,-w/2-3,-h/2-3,w+6,7,2);c.fill();eye(c,-5,5,3,panic,look);eye(c,5,5,3,panic,look);c.strokeStyle='#8a7a70';c.lineWidth=1.5;line(c,-3,-h/2-9,0,-h/2-16)}
    c.restore();
  }
  function drawBackground(c,t,active){const gradient=c.createLinearGradient(0,0,0,650);gradient.addColorStop(0,'#d6cce3');gradient.addColorStop(.6,'#e8dfdf');gradient.addColorStop(1,'#f1e8d2');c.fillStyle=gradient;c.fillRect(0,0,W,H);c.fillStyle='#f8efba';c.beginPath();c.arc(346,160,28,0,Math.PI*2);c.fill();c.fillStyle='#d6cce3';c.beginPath();c.arc(356,150,25,0,Math.PI*2);c.fill();c.strokeStyle='#aaa0ba';c.lineWidth=1;[[35,150],[105,230],[314,275],[381,351],[172,177]].forEach(([x,y],i)=>{let a=.5+Math.sin(t+i)*.3;c.globalAlpha=a;line(c,x-3,y,x+3,y);line(c,x,y-3,x,y+3)});c.globalAlpha=1;
    const scroll=active?t*14:0;c.fillStyle='#c6bdc8';const buildings=[[0,107,44],[44,66,48],[94,130,55],[155,82,52],[208,112,60],[273,75,40],[321,144,56],[377,90,50]];buildings.forEach(([bx,bh,bw],i)=>{const x=((bx-scroll*.2)%480+480)%480-30;c.fillRect(x,570-bh,bw,bh);c.fillStyle='#e6dbb2';for(let col=0;col<3;col++)for(let row=0;row<3;row++){if((col+row+i)%3)c.fillRect(x+8+col*13,580-bh+row*19,5,7)}c.fillStyle='#c6bdc8'});c.fillStyle='#b3afa7';c.fillRect(0,579,W,7);c.fillStyle='#e8e3cc';c.fillRect(0,648,W,92);c.strokeStyle='#9c9f8d';c.lineWidth=2;line(c,0,648,W,648);c.strokeStyle='#cfceb9';c.lineWidth=1;for(let x=-100;x<600;x+=70)line(c,((x-scroll*1.3)%560+560)%560-60,649,((x-scroll*1.3)%560+560)%560-90,705);line(c,0,674,W,674);line(c,0,707,W,707);c.fillStyle='#d9d9c5';c.fillRect(0,635,W,12);c.fillStyle='#989e8b';for(let i=0;i<12;i++){let x=((i*45-scroll*2)%540+540)%540-45;c.beginPath();c.moveTo(x,635);c.lineTo(x+18,635);c.lineTo(x+8,647);c.lineTo(x-10,647);c.closePath();c.fill()}c.fillStyle='#9c9889';c.font='10px monospace';c.textAlign='left';c.fillText('← HOME · 60s',17,697);c.textAlign='right';c.fillText('请 保 持 完 整',401,725);
  }
  function drawTruck(c,truck,t){const {x,y,angle}=truck;c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=INK;c.lineWidth=3;c.fillStyle='#a7c6a5';round(c,-85,-4,170,19,5);c.fill();c.stroke();c.fillStyle='#819e84';c.fillRect(-76,8,152,6);c.fillStyle='#d8dec4';round(c,-63,18,126,17,5);c.fill();c.stroke();c.fillStyle=INK;c.font='900 11px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText('下 班 专 车',0,30);c.lineWidth=3;line(c,-62,36,-54,45);line(c,-54,45,-64,50);line(c,62,36,54,45);line(c,54,45,64,50);[-60,60].forEach(wx=>{c.fillStyle=INK;c.beginPath();c.arc(wx,54,13,0,Math.PI*2);c.fill();c.fillStyle='#f6f3e9';c.beginPath();c.arc(wx,54,6,0,Math.PI*2);c.fill();c.save();c.translate(wx,54);c.rotate(t*7+truck.x*.04);c.lineWidth=2;line(c,-5,0,5,0);line(c,0,-5,0,5);c.restore()});c.lineWidth=3;line(c,84,7,98,-12);line(c,98,-12,105,-12);c.fillStyle='#f7ef59';c.beginPath();c.arc(0,17,5,0,Math.PI*2);c.fill();c.stroke();c.restore();
    // Tiny worker holds on for dear life, with deliberately unhelpful tiny legs.
    c.save();c.translate(x+105,y+10);c.rotate(angle*.5);c.strokeStyle=INK;c.lineWidth=3;c.lineCap='round';const stride=Math.sin(t*15)*7;line(c,-2,27,-9+stride,42);line(c,8,26,17-stride,40);c.fillStyle='#a397d2';round(c,-12,8,27,22,8);c.fill();c.stroke();line(c,-10,15,-16,-4);c.fillStyle='#f5d5aa';c.beginPath();c.arc(2,-3,14,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=INK;c.beginPath();c.ellipse(0,-12,15,5,-.12,0,Math.PI*2);c.fill();eye(c,-3,-3,3,false,-1);eye(c,7,-3,3,false,-1);c.lineWidth=1.6;line(c,0,5,5,5);c.restore();
  }
  function pickupTarget(s){
    const g=s.guidance;if(!g||replay)return null;
    if(g.kind==='tutorial'&&Number.isFinite(g.targetX)&&g.direction!=='stop'&&g.direction!=='steady')return{x:g.targetX,label:s.tutorial?.step===2?'停稳练习区':s.tutorial?.step===3?'救货练习区':'先挪到这里',retry:false};
    if(!['pickup','brake'].includes(g.kind))return null;
    const falling=s.cargo.filter(b=>!b.caught).at(-1),next=s.nextDrop;if(!falling&&!next)return null;
    const x=g.targetX??falling?.landingX??next?.x;if(!Number.isFinite(x))return null;
    const type=falling?.type??next?.type,retry=falling?.retry||next?.retry;
    const waiting=g.kind==='brake'||g.direction==='stop';return{x,label:waiting?`已到位 · 等${NAMES[type]||'货物'}${!falling&&next?.inSeconds>0?` ${Math.ceil(next.inSeconds)}秒`:''}`:falling?`${retry?'补发·':''}接住${NAMES[type]||'它'}`:`${retry?'补发·':''}${NAMES[type]||'货物'} ${Math.ceil(next?.inSeconds||0)}秒`,retry:!!retry,waiting};
  }
  function drawDropGuides(c,s){
    const p=pickupTarget(s);if(!p)return;const x=Math.max(25,Math.min(395,p.x));c.save();c.strokeStyle=p.waiting?'#60805b':p.retry?'#a7773e':'#806196';c.lineWidth=2.4;c.setLineDash([7,8]);line(c,x,320,x,551);c.setLineDash([]);c.globalAlpha=.28;c.fillStyle=p.waiting?'#a7c6a5':p.retry?'#eec45f':'#baa3d4';c.beginPath();c.ellipse(x,568,35,8,0,0,Math.PI*2);c.fill();c.globalAlpha=.85;c.stroke();c.globalAlpha=1;c.fillStyle='#f7ef59';c.beginPath();c.moveTo(x-9,545);c.lineTo(x,558);c.lineTo(x+9,545);c.closePath();c.fill();c.stroke();c.restore();
  }
  function drawWind(c,s){if(!s.wind)return;const sign=Math.sign(s.wind);c.save();c.strokeStyle='#8e80a7';c.lineWidth=2;c.globalAlpha=Math.min(.6,Math.abs(s.wind)*.7);for(let i=0;i<5;i++){let y=325+i*43,x=sign>0?12:408,len=18+Math.sin(visualTime*8+i)*7;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+sign*len*.5,y-6,x+sign*len,y);c.stroke();line(c,x+sign*len,y,x+sign*(len-5),y-4);line(c,x+sign*len,y,x+sign*(len-5),y+4)}c.restore()}
  function drawParking(c,s){if(replay||s.guidance?.kind!=='tail'||!s.tail?.active)return;const x=s.tail.targetX;c.save();c.fillStyle='#b6cda8';c.globalAlpha=.55;round(c,x-94,638,188,37,5);c.fill();c.globalAlpha=1;c.strokeStyle='#56724f';c.lineWidth=3;c.setLineDash([8,7]);line(c,x-87,644,x+87,644);c.setLineDash([]);for(const sign of[-1,1]){line(c,x+sign*91,635,x+sign*91,675);line(c,x+sign*91,675,x+sign*70,675)}c.strokeStyle='#80986a';c.lineWidth=2;c.setLineDash([5,8]);line(c,x,328,x,553);c.setLineDash([]);c.fillStyle='#f7ef59';c.beginPath();c.moveTo(x-11,543);c.lineTo(x,559);c.lineTo(x+11,543);c.closePath();c.fill();c.strokeStyle=INK;c.stroke();const p=Math.max(0,Math.min(1,s.tail.progress||0));if(p>0){c.strokeStyle='#638a54';c.lineWidth=5;c.beginPath();c.arc(x,658,11,-Math.PI/2,-Math.PI/2+Math.PI*2*p);c.stroke()}c.restore()}
  function draw(dt,view=snap){visualTime+=dt;const active=['playing','paused','win','lose'].includes(view.status);ctx.save();const sx=shake*Math.sin(visualTime*88),sy=shake*Math.cos(visualTime*76)*.4;ctx.translate(sx,sy);drawBackground(ctx,visualTime,active&&!isPaused);let truck=active?view.truck:{x:190,y:586+Math.sin(visualTime*2)*1.5,angle:Math.sin(visualTime*1.5)*.025,vx:0};
    if(active){drawDropGuides(ctx,view);drawWind(ctx,view);drawParking(ctx,view);for(const b of view.cargo){cargo(ctx,b);if(!replay&&b.id===view.balance?.atRiskId&&b.risk>.58){ctx.save();ctx.strokeStyle='#d56d54';ctx.lineWidth=1.8;ctx.setLineDash([4,4]);ctx.beginPath();ctx.ellipse(b.x,b.y,Math.max(b.w/2,20)+8,b.h/2+9,b.angle,0,Math.PI*2);ctx.stroke();ctx.restore()}}}else{cargo(ctx,{type:'pot',x:171,y:554,angle:-.13+Math.sin(visualTime*1.4)*.05,r:28});cargo(ctx,{type:'monday',x:222,y:558,angle:.09,w:46,h:44});cargo(ctx,{type:'bread',x:191,y:512,angle:Math.sin(visualTime*1.2)*.035,w:94,h:34});cargo(ctx,{type:'fish',x:200,y:478,angle:.12,w:64,h:24})}
    if(wreck&&!replay){wreck.ttl-=dt;ctx.save();ctx.globalAlpha=Math.min(1,wreck.ttl*2.5);for(const b of wreck.cargo){b.x+=(b.vx||0)*40*dt;b.y+=90*dt;b.angle+=(b.id===wreck.cargoId?2:1)*dt;cargo(ctx,b)}ctx.restore();if(wreck.ttl<=0)wreck=null}
    drawTruck(ctx,truck,visualTime);
    if(active&&view.balance&&view.cargo.some(b=>b.caught)&&!replay){const bx=Math.max(truck.x-92,Math.min(truck.x+92,view.balance.centerX));ctx.save();ctx.strokeStyle=view.balance.risk>.65?'#c85f4e':'#6e8762';ctx.lineWidth=1.4;ctx.setLineDash([2,3]);line(ctx,bx,truck.y-22,bx,truck.y+12);ctx.setLineDash([]);ctx.fillStyle='#f7ef59';ctx.beginPath();ctx.arc(bx,truck.y+10,4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore()}
    if(replay){const failed=view.cargo.find(b=>b.id===replay.event.cargoId);if(failed){ctx.strokeStyle='#d65342';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(failed.x,failed.y,Math.max(failed.w,failed.h)/2+12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])}$('replayBanner').querySelector('span').textContent=`↶ 事故回看 · ${view.elapsed.toFixed(1)}s`}
    for(const p of particles){p.life-=dt;p.vy+=180*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;ctx.save();ctx.globalAlpha=Math.max(0,p.life);ctx.translate(p.x,p.y);ctx.rotate(visualTime*6);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.65);ctx.restore()}particles=particles.filter(p=>p.life>0);for(const f of texts){f.life-=dt;f.y-=25*dt;ctx.globalAlpha=Math.max(0,f.life);ctx.fillStyle=f.color;ctx.font='900 17px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y)}texts=texts.filter(f=>f.life>0);ctx.globalAlpha=1;if(flash>0){ctx.fillStyle=`rgba(247,239,89,${flash*1.8})`;ctx.fillRect(0,0,W,H)}ctx.restore();shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt);if(visualTime>messageUntil)$('gameMessage').classList.remove('show');
  }
  function hud(){
    chaosCooldown=snap.chaosCooldown||0;if(snap.status==='ready')return;
    const teaching=mode==='tutorial',t=snap.tutorial,playing=snap.status==='playing'&&!isPaused&&!replay,g=snap.guidance,tail=snap.tail,tailActive=!!tail&&(tail.active||tail.completed),stops=tail?.completed?2:Math.max(0,(tail?.step||1)-1);
    put('scoreLabel',teaching?'练习':'稳住分');put('score',teaching?`${t?.step||1}/3`:String(Math.floor(snap.score)).padStart(4,'0'));put('timer',teaching?'∞':Math.ceil(Math.max(0,snap.duration-snap.elapsed)));put('timerLabel',teaching?'不限时':snap.settling?'靠站中':'秒内收工');
    put('hearts',teaching?'练习不扣机会':Array.from({length:3},(_,i)=>i<snap.lives?'♥':'♡').join(' '));$('hearts').setAttribute('aria-label',teaching?'教学不扣机会':`剩余${snap.lives}次机会`);const road=!teaching&&playing?snap.warning:null;const stageText=teaching?'慢慢来，做完再继续':['第一段 · 轻货先练','第二段 · 扶稳再接','第三段 · 家就在前面'][Math.min(2,(snap.stage||1)-1)];put('stage',road?`${road.phase==='upcoming'?`${Math.max(1,Math.ceil(road.inSeconds||0))}秒后`:road.kind==='wind'?'≈':'⌁'} · ${road.text.split('，')[0]}`:stageText);$('stage').classList.toggle('road-alert',!!road);$('stage').dataset.roadPhase=road?.phase||'';$('progress').style.width=`${teaching?Math.min(100,((t?.step||1)-1+(t?.progress||0))/3*100):Math.min(100,snap.elapsed/snap.duration*100)}%`;
    const required=snap.requiredCatches||4,job=snap.job,minimumMet=snap.catches>=required,challenge=teaching?null:challengeState(snap);
    put('runGoal',teaching?['① 挪车接货','② 松手停稳','③ 主动救回'][(t?.step||1)-1]:challenge?`签收${Math.min(snap.catches,required)}/${required}${minimumMet?'+':''}`:(minimumMet?`最低${required}件已达 · 签收${snap.catches}`:`签收 ${snap.catches} / ${required} 件`));
    $('runGoal').classList.toggle('complete',!teaching&&minimumMet);put('streak',teaching?'可免费重试':challenge?challenge.text:`精准连签 ×${snap.streak||0}`);
    $('streak').dataset.challenge=challenge?.state||'';$('streak').dataset.urgent=String(!!challenge?.urgent);$('streak').setAttribute('aria-label',challenge?.detail||(teaching?'教学可免费重试':`精准连续签收${snap.streak||0}件`));
    const showJob=playing&&!teaching&&minimumMet&&!tailActive&&!!job;
    $('jobPanel').classList.toggle('hidden',!showJob);
    if(showJob){
      $('jobPanel').dataset.phase=job.phase;
      const closed=job.deliveriesClosed;
      const title=closed?(job.airborneUnsigned>0?'末件正在落下':'投递已结束'):job.retryCount>0?`还有${job.retryCount}件补发`:job.remainingDeliveries>0?`另有${job.remainingDeliveries}件待投`:job.airborneUnsigned>0?'新货正在落下':'货已投完';
      const expired=[job.unthrownCount>0?`${job.unthrownCount}件未投出`:'',job.retryExpiredCount>0?`${job.retryExpiredCount}件补发过窗`:''].filter(Boolean).join('，');
      const detail=closed?(job.airborneUnsigned>0?`还有真实接货机会，接稳再停站${expired?`；${expired}`:''}`:expired?`${expired}；先稳住旧货`:job.detail||'先稳住旧货，准备进入两站'):job.retryCount>0?`先接补发货${job.remainingDeliveries>0?`，另有${job.remainingDeliveries}件待投`:'，接住才算签收'}`:job.remainingDeliveries>0?'先看下一件，投完再进两站':job.airborneUnsigned>0?'接住这一件，再稳住旧货':job.detail||'先稳住旧货，随后进入两站';
      put('jobTitle',title);put('jobDetail',g?.rescueState==='edge'?(closed?'边界状况优先，停站暂缓':'边界状况优先，新货稍等'):g?.kind==='rescue'?(closed?'先救稳旧货，再准备两站':'先救稳旧货，后续投递会等待'):detail);
    }
    $('gameWindow').classList.toggle('tail-mode',!teaching&&tailActive&&playing);$('tailPanel').classList.toggle('hidden',!playing||teaching||!tailActive);put('tailTitle',tail?.completed?'两站完成，安全靠站':'尾段 · 两站收工');put('tailProgress',`${stops} / 2`);document.querySelectorAll('#tailDots i').forEach((dot,i)=>{dot.classList.toggle('done',i<stops);dot.classList.toggle('active',!tail?.completed&&i===stops)});
    $('settleBanner').classList.toggle('hidden',!playing||!snap.settling);$('actionGuide').classList.toggle('hidden',!playing||!g||snap.settling);$('tutorialPill').classList.toggle('hidden',!playing||!teaching);put('tutorialPill',`新手 ${t?.step||1} / 3`);
    const focusHint=practiceState(snap,playing,teaching);$('practiceHint').classList.toggle('hidden',!focusHint);$('practiceHint').classList.toggle('relevant',!!focusHint?.relevant);$('practiceHint').dataset.relevant=String(!!focusHint?.relevant);$('practiceHint').dataset.state=focusHint?.state||'neutral';if(focusHint)put('practiceHint',focusHint.text);
    $('gameWindow').style.setProperty('--guide-top',`${Math.max(145,$('hud').offsetTop+$('hud').offsetHeight+12)}px`);
    if(g){put('guideArrow',g.direction==='left'?'←':g.direction==='right'?'→':g.direction==='stop'?'Ⅱ':'✓');put('guideText',g.text||t?.title||'稳稳的');put('guideDetail',g.detail||(teaching?(g.direction==='stop'?(t?.step===2?'松开手指或方向键，停稳一小会。':t?.step===1?'对准后停住，等饼落到车上。':'先停稳，准备接回弹起的饼。'):t?.step===1?'轻挪到亮区，到位后松手。':t?.step===2?'带着饼到亮区，再松手刹车。':'挪到饼的下方，接回才算完成。'):g.kind==='tail'?'进入亮区后松手，停稳才算到站。':g.kind==='rescue'?(tailActive?'先接稳旧货，再按亮区停站。':'先救旧货，接稳后再来新货。'):g.kind==='pickup'?'用车中心接，到位后松手刹车。':g.kind==='recovery'?snap.recovery?.text||'漏接会补发，接住才签收。':g.kind==='brake'?'松手后，小车会平顺停下。' :!job?.deliveriesClosed&&job?.remainingDeliveries>0?'整单还没投完，先保持松手等预告。':'投递结束并稳住后，再完成两站。'));$('actionGuide').dataset.kind=g.kind;$('actionGuide').dataset.rescueState=g.rescueState||''}
    const target=playing?pickupTarget(snap):null;$('dropBadge').classList.toggle('hidden',!target);if(target){put('dropBadge',target.label);$('dropBadge').classList.toggle('retry',target.retry);$('dropBadge').classList.toggle('at-target',!!target.waiting);const drop=$('dropBadge'),ww=$('gameWindow').clientWidth,dh=drop.offsetWidth/2+10;drop.style.left=`${Math.max(dh,Math.min(ww-dh,target.x/W*ww))}px`;drop.style.top=`${Math.max($('gameWindow').clientHeight*.44,$('actionGuide').offsetTop+$('actionGuide').offsetHeight+12+drop.offsetHeight/2)}px`}
    const parking=playing&&!snap.settling&&g?.kind==='tail'&&tail?.active;$('parkingBadge').classList.toggle('hidden',!parking);if(parking){const fb=tail.feedback;put('parkingLabel',`收工站 ${Math.min(2,tail.step||1)} / 2`);const brief=fb?.phase==='approach'?'向亮区轻挪':fb?.phase==='release'?'到位了，请松手':fb?.phase==='braking'?'保持松手，等车停住':fb?.phase==='cargo_wait'?`等${NAMES[fb.blockingCargoType]||'货物'}稳住`:fb?.phase==='holding'?`停稳计站 ${Math.round((fb.progress||0)*100)}%`:fb?.phase==='recovery'?'等货物归位':fb?.phase==='complete'?'两站都完成了':'到位后松手停稳';put('tailStatus',brief);$('parkingBadge').dataset.phase=fb?.phase||'approach';$('tailHoldBar').style.width=`${Math.round((fb?.progress||0)*100)}%`;const badge=$('parkingBadge'),windowWidth=$('gameWindow').clientWidth,half=badge.offsetWidth/2+10;badge.style.left=`${Math.max(half,Math.min(windowWidth-half,tail.targetX/W*windowWidth))}px`;badge.style.top=`${Math.max($('gameWindow').clientHeight*.46,$('actionGuide').offsetTop+$('actionGuide').offsetHeight+12+badge.offsetHeight/2)}px`}
    const recoveryText=snap.recovery?.text||(visualTime<recoveryNoteUntil?lastRecoveryText:'');$('recoveryNote').classList.add('hidden');if(playing&&recoveryText&&g&&['pickup','brake','recovery','tail'].includes(g.kind))put('guideDetail',g.kind==='tail'&&snap.recovery?.assist?`已扶正${snap.recovery.restoredCount}件 · 扣25分，保持松手重新计站。`:recoveryText);
    $('warning').classList.add('hidden');$('touchGuide').classList.add('hidden');
    const balance=snap.balance,carrying=snap.cargo.some(b=>b.caught);$('balancePanel').classList.toggle('hidden',!balance||!carrying||!playing||teaching);
    if(balance){const risk=balance.risk||0;$('balanceMarker').style.left=`${50+Math.max(-1,Math.min(1,balance.offset||0))*45}%`;$('balancePanel').classList.toggle('danger',risk>.65);put('balanceText',risk>.65?'货物正在晃动':risk>.35?'留意晃动':'货物状态稳定');put('balanceValue','重心状态')}
    $('chaosBtn').disabled=!playing||teaching||snap.settling||chaosCooldown>0;put('chaosBtn',chaosCooldown>0?`风歇会儿 ${Math.ceil(chaosCooldown)}s`:'≈ 来阵妖风');
  }
  function frame(now){const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    if(snap.status==='playing'&&!isPaused&&!replay){const dir=(keys.has('ArrowRight')||keys.has('d')||keys.has('D')?1:0)-(keys.has('ArrowLeft')||keys.has('a')||keys.has('A')?1:0);if(dir&&!snap.settling)engine.setTarget(snap.truck.x+dir*(KEYBOARD_SPEED/9));engine.step(dt*(slowmo>0?.36:1));slowmo=Math.max(0,slowmo-dt)}
    snap=engine.snapshot();if(snap.status==='playing'&&!isPaused)recordFrame();const view=replay?replayFrame(dt):snap;draw(dt,view);hud();requestAnimationFrame(frame);
  }
  document.querySelectorAll('[data-cargo]').forEach(el=>{const c=el.getContext('2d');c.scale(.78,.78);cargo(c,{type:el.dataset.cargo,x:54,y:49,angle:el.dataset.cargo==='bread'?-.15:.1})});
  refreshMode();syncSound();requestAnimationFrame(frame);
})();
