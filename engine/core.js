/* HSR Damage Lab engine core: modifier store (with provenance), damage formula, action-value timeline,
 * Skill Point / Energy rules and the battle loop. Kit-specific behaviour lives in kits.js.
 * Deterministic expected-value simulator. Browser + Node (UMD). No network access. */
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;if(root)root.HSRCore=m})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const EPS=1e-9,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const BASE_DIST=10000;

/* ---------- cycle clock: cycle 1 = first 150 AV, every later cycle = 100 AV ---------- */
const cycleOf=av=>av<=150+EPS?1:2+Math.floor((av-150-EPS)/100);
const horizonForCycles=c=>150+100*(Math.max(1,c)-1);

/* ---------- state ---------- */
function newState(cfg,team){
  return {t:0,cfg,units:{},order:[],mods:[],sp:cfg.startSP??3,spBase:5,spBonus:0,events:[],actions:[],timeline:[],
    uptime:{},damageBy:{},damageByCycle:{},nextStamp:1,flags:[],spLog:{gained:0,spent:0,wasted:0},hooks:[],team,counters:{},rngSeed:(cfg.rngSeed??1)>>>0,
    horizon:horizonForCycles(cfg.cycles||5),cur:null};
}
const spMax=S=>S.spBase+S.spBonus;
function addUnit(S,u){u.dist=u.dist??BASE_DIST;u.prio=0;u.blocked=!!u.blocked;S.units[u.id]=u;S.order.push(u.id);return u}
const ownerOf=(S,id)=>{const u=S.units[id];return u&&u.owner?S.units[u.owner]:u};
const allies=S=>S.order.map(i=>S.units[i]).filter(u=>u.kind==='ally');

/* ---------- modifiers ----------
 * {key,label,src,target,stat,value,stacks,maxStacks,scope:'both'|'character'|'summon',tags:[ability tags it applies to],
 *  requires:{attackerKey},expire:{unit,at:'start'|'end',turns,ext}|{mode:'battle'}}
 * stats: atkPct atkFlat hpPct hpFlat critRate critDmg dmg defIgnore resPen vuln spdPct err */
function addMod(S,m){
  m.key=m.key||(m.src+':'+m.label+':'+m.stat);m.stacks=m.stacks??1;m.maxStacks=m.maxStacks??1;m.scope=m.scope||'both';
  m.expire=m.expire||{mode:'battle'};m.t0=S.t;
  const ex=S.mods.find(x=>x.key===m.key&&x.target===m.target);
  if(ex){ex.stacks=Math.min(ex.maxStacks,ex.stacks+(m.addStacks??1));ex.value=m.value;ex.expire={...m.expire};ex.t0=S.t;return ex}
  S.mods.push(m);return m;
}
const removeMod=(S,key,target)=>{S.mods=S.mods.filter(m=>!(m.key===key&&(target===undefined||m.target===target)))};
const hasKey=(S,key,target)=>S.mods.some(m=>m.key===key&&(target===undefined||m.target===target));
/* Dynamic effects read their source's *current* stat, not its stat when cast. */
function modVal(m,S,guard){
  let value=m.value||0;
  if(m.dyn){
    if(!S)throw new Error('Dynamic modifier requires battle state');
    const key=m.key;
    if(guard===key)throw new Error('Circular dynamic modifier: '+key);
    value=(m.dyn.flat||0)+(m.dyn.ratio||0)*statOf(S,m.dyn.unit,m.dyn.stat,undefined,key);
  }
  if(m.bonusIfKey&&S&&hasKey(S,m.bonusIfKey,m.target))value+=(m.bonusValue||0);
  return value*(m.stacks??1);
}
/* mods applying to an attacker (character or summon) for a given ability */
function modsFor(S,actorId,stat,tags,ctx){
  const a=S.units[actorId],isSummon=a.kind==='summon',oid=a.owner||a.id;
  return S.mods.filter(m=>m.stat===stat&&(m.target===oid||m.target===actorId)&&
    (m.scope==='both'||(m.scope==='summon'&&isSummon)||(m.scope==='character'&&!isSummon))&&
    (!m.tags||(tags&&m.tags.some(t=>tags.includes(t))))&&(!m.requires||!m.requires.attackerKey||hasKey(S,m.requires.attackerKey,oid)));
}
const sumMods=(S,actorId,stat,tags,excludeKey)=>modsFor(S,actorId,stat,tags).filter(m=>m.key!==excludeKey).reduce((s,m)=>s+modVal(m,S,excludeKey),0);
const enemyMods=(S,stat,attackerId)=>{const oid=ownerOf(S,attackerId).id;
  return S.mods.filter(m=>m.target==='enemy'&&m.stat===stat&&(!m.requires||!m.requires.attackerKey||hasKey(S,m.requires.attackerKey,oid)))};

/* current stats of a character (summons read their owner's panel) */
function statOf(S,uid,stat,tags,excludeKey){
  const o=ownerOf(S,uid),sn=o.snap;
  switch(stat){
    case 'atk':return sn.atk+sn.baseAtk*sumMods(S,uid,'atkPct',tags,excludeKey)+sumMods(S,uid,'atkFlat',tags,excludeKey);
    case 'hp':return sn.hp+sn.baseHp*sumMods(S,uid,'hpPct',tags,excludeKey)+sumMods(S,uid,'hpFlat',tags,excludeKey);
    case 'critRate':return sn.critRate+sumMods(S,uid,'critRate',tags,excludeKey);
    case 'critDmg':return sn.critDmg+sumMods(S,uid,'critDmg',tags,excludeKey);
    case 'spd':return sn.spd+(o.baseSpd||0)*sumMods(S,uid,'spdPct',tags,excludeKey)+sumMods(S,uid,'spdFlat',tags,excludeKey);
    case 'err':return 1+sumMods(S,uid,'err',tags,excludeKey);
  }
  throw new Error('statOf: '+stat);
}
const spdOf=(S,u)=>u.fixedSpd!==undefined?u.fixedSpd+(u.spdFlat||0):statOf(S,u.id,'spd');

/* ---------- damage ---------- */
const bounceFactor=(n,adj)=>1+adj*(n>1?2*(n-1)/n:0);   // expected total multiplier of a random-target hit that splashes `adj` to neighbours
function enemyRes(S,element){const e=S.cfg.enemy;return e.weaknesses.includes(element)?(e.resWeak??0):(e.res??0.2)}
/* a: {actor,type,tags,element,stat,mult,targets:'single'|'all'|'bounce',adj,fixed:{cr,cd},extraCD,extraDmg,label,kind} */
function dealDamage(S,a){
  const o=ownerOf(S,a.actor),cfg=S.cfg,e=cfg.enemy,tags=a.tags||[a.type];
  const scale=statOf(S,a.actor,a.stat||'atk',tags);
  const base=scale*a.mult;
  const atkMods=modsFor(S,a.actor,'dmg',tags);
  const dmgBonus=(o.snap.elementBonus||0)+atkMods.reduce((s,m)=>s+modVal(m,S),0)+(a.extraDmg||0);
  let cr=clamp(statOf(S,a.actor,'critRate',tags),0,1),cd=statOf(S,a.actor,'critDmg',tags)+(a.extraCD||0);
  if(a.fixed){cr=a.fixed.cr;cd=a.fixed.cd+(a.extraCD||0)+sumMods(S,a.actor,'critDmgFixed',tags)}
  const critMult=cfg.critMode==='crit'?1+cd:cfg.critMode==='noncrit'?1:1+cr*cd;
  const defShred=clamp(enemyMods(S,'defRed',a.actor).reduce((s,m)=>s+modVal(m,S),0)+sumMods(S,a.actor,'defIgnore',tags)+enemyMods(S,'defIgnore',a.actor).reduce((s,m)=>s+modVal(m,S),0),0,1);
  const L=o.level||80,defMult=(L+20)/((L+20)+(e.level+20)*(1-defShred));
  const resPen=sumMods(S,a.actor,'resPen',tags)+enemyMods(S,'resPen',a.actor).reduce((s,m)=>s+modVal(m,S),0);
  const res=clamp(enemyRes(S,a.element)-resPen,-1,0.9),resMult=1-res;
  const vulnMods=enemyMods(S,'vuln',a.actor),vuln=1+vulnMods.reduce((s,m)=>s+modVal(m,S),0);
  const tough=e.broken?1:0.9;
  const per=base*critMult*(1+dmgBonus)*defMult*resMult*vuln*tough;
  const n=e.count;
  const targetFactor=a.targets==='all'?n:a.targets==='bounce'?bounceFactor(n,a.adj||0):1;
  const dmg=per*targetFactor;
  const cyc=cycleOf(S.t);
  const rec={t:+S.t.toFixed(3),cycle:cyc,actor:a.actor,owner:o.id,source:a.label||a.type,type:a.type,kind:a.kind||'direct',damage:dmg,
    breakdown:{scalingStat:a.stat||'atk',scalingValue:scale,multiplier:a.mult,base,critMode:cfg.critMode,critRate:cr,critDmg:cd,critMult,
      dmgBonus,dmgSources:[o.snap.elementBonus?{label:'Element DMG (panel)',value:o.snap.elementBonus}:null,...atkMods.map(m=>({label:m.label,value:modVal(m,S)}))].filter(Boolean),
      defMult,defShred,resMult,res,resPen,vuln,vulnSources:vulnMods.map(m=>({label:m.label,value:modVal(m,S)})),toughness:tough,targetFactor}};
  S.events.push(rec);
  S.damageBy[o.id]=(S.damageBy[o.id]||0)+dmg;
  const k=o.id+'|'+(a.label||a.type);S.damageBy[k]=(S.damageBy[k]||0)+dmg;
  S.damageByCycle[cyc]=(S.damageByCycle[cyc]||0)+dmg;
  return rec;
}

/* ---------- resources ---------- */
function gainSP(S,n,who){if(n<0)throw new Error('Negative SP gain');const before=S.sp;S.sp=Math.min(spMax(S),S.sp+n);S.spLog.gained+=S.sp-before;S.spLog.wasted+=n-(S.sp-before);emit(S,'spGained',{by:who,amount:n,applied:S.sp-before});return S.sp-before}
function spendSP(S,n,who){if(n<0||n>S.sp+EPS)throw new Error('Illegal SP spend');S.sp-=n;S.spLog.spent+=n;if(S.sp<-EPS)throw new Error('SP underflow');emit(S,'spConsumed',{by:who,amount:n})}
function gainEnergy(S,uid,amount,opts){const u=S.units[uid];if(!u||u.maxEnergy===undefined)return;
  const f=opts&&opts.noErr?1:statOf(S,uid,'err');u.energy=Math.min(u.maxEnergy,u.energy+amount*f)}

/* ---------- timeline ---------- */
function advance(S,uid,pct){const u=S.units[uid];if(!u)return;const before=timeToAct(S,u);u.dist=Math.max(0,u.dist-BASE_DIST*pct);if(u.dist<=EPS){u.dist=0;u.prio=before+S.nextStamp++*1e-6}}
const delay=(S,uid,pct)=>{const u=S.units[uid];u.dist+=BASE_DIST*pct};
const timeToAct=(S,u)=>u.blocked?Infinity:u.dist/Math.max(1e-9,spdOf(S,u));
function nextActor(S){
  let best=null;
  for(const id of S.order){const u=S.units[id];if(u.blocked)continue;const dt=u.dist<=EPS?0:u.dist/spdOf(S,u);
    if(!best||dt<best.dt-EPS||(Math.abs(dt-best.dt)<=EPS&&(u.prio||0)<(best.unit.prio||0)))best={unit:u,dt}}
  return best;
}
function passTime(S,dt){
  if(dt<=0)return;
  // buff uptime on the lead character (for reporting)
  const lead=S.team[0].id;const seen=new Set();
  for(const m of S.mods){if((m.target===lead||m.target==='enemy')&&!seen.has(m.label)){seen.add(m.label);S.uptime[m.label]=(S.uptime[m.label]||0)+dt}}
  for(const id of S.order){const u=S.units[id];if(u.blocked)continue;u.dist=Math.max(0,u.dist-spdOf(S,u)*dt)}
  S.t+=dt;
}

/* ---------- expiry ---------- */
/* Each turn phase ticks exactly once. 'ext' means expire at the target's next START
 * after the final END tick (Sparkle). 'endOf' attaches a modifier to the END of a
 * named source unit, regardless of which target holds it. */
function tick(S,uid,at){
  const drop=[];
  for(const m of S.mods){
    const e=m.expire;if(!e||e.mode==='battle')continue;
    if(e.untilNext){if(e.unit===uid&&at==='start')drop.push(m);continue}
    if(e.mode==='endOf'){
      if(e.unit===uid&&at==='end'&&--e.turns<=0)drop.push(m);
      continue;
    }
    if(e.unit!==uid||e.at!==at)continue;
    if(--e.turns<=0){if(e.ext)m.expire={unit:uid,untilNext:true};else drop.push(m)}
  }
  if(drop.length)S.mods=S.mods.filter(m=>!drop.includes(m));
}
const tickStart=(S,uid)=>tick(S,uid,'start'),tickEnd=(S,uid)=>tick(S,uid,'end');

/* ---------- events / hooks ---------- */
function on(S,fn){S.hooks.push(fn)}
function emit(S,name,p){for(const h of S.hooks.slice())h(S,name,p)}
function note(S,flag){if(!S.flags.includes(flag))S.flags.push(flag)}

/* ---------- battle loop ---------- */
function logAction(S,u,what,extra){
  S.actions.push({t:+S.t.toFixed(2),cycle:cycleOf(S.t),unit:u.name||u.id,action:what,sp:S.sp,...(extra||{})});
  S.timeline.push({t:+S.t.toFixed(2),sp:S.sp,energy:Object.fromEntries(allies(S).map(a=>[a.id,+a.energy.toFixed(1)]))});
}
function ultPhase(S,g,K){
  for(let guard=0;guard<40;guard++){
    let did=false;
    for(const u of allies(S)){
      const kit=K[u.name];if(!kit||!kit.ult)continue;
      if(u.blocked&&!kit.ultWhileBlocked)continue;
      if(u.energy+1e-9<u.maxEnergy||(kit.ultReady&&!kit.ultReady(S,u)))continue;
      const wait=(g.ultWait&&g.ultWait[u.id])||0;
      if((u.ultSeen||0)<wait){u.ultSeen=(u.ultSeen||0)+1;continue}
      u.ultSeen=0;
      const tgt=kit.ult.target?pickTarget(S,u,kit.ult.target(S,u),g.ultTarget&&g.ultTarget[u.id]):undefined;
      u.energy-=u.maxEnergy;
      logAction(S,u,'Ultimate',{target:tgt});
      kit.ult.run(S,u,tgt);
      gainEnergy(S,u.id,5,{noErr:false});
      u.ultCount=(u.ultCount||0)+1;
      did=true;break;
    }
    if(!did)break;
  }
}
const pickTarget=(S,u,legal,idx)=>legal.length?legal[Math.max(0,Math.min(Number.isInteger(idx)?idx:0,legal.length-1))]:undefined;

function runTurn(S,u,g,K){
  S.cur=u;
  tickStart(S,u.id);
  if(u.kind==='summon'||u.kind==='countdown'){
    K[Cowner(S,u).name].summonTurn(S,u);
    tickEnd(S,u.id);u.dist=BASE_DIST;u.prio=0;return;
  }
  emit(S,'turnStart',{unit:u.id});
  const kit=K[u.name];
  if(kit.onTurnStart)kit.onTurnStart(S,u);
  ultPhase(S,g,K);
  const acts=kit.actions(S,u).filter(a=>a.sp<=S.sp+EPS);
  if(!acts.length)throw new Error('No legal actions for '+u.name);
  let choice=acts.find(a=>a.id==='basic')||acts[0];
  const skill=acts.find(a=>a.id==='skill');
  const reserve=(g.skillGate&&g.skillGate[u.id])??0;
  if(skill&&S.sp-skill.sp>=reserve-EPS)choice=skill;
  const enhanced=acts.find(a=>a.id==='enhanced');if(enhanced)choice=enhanced;
  const tgt=choice.target?pickTarget(S,u,choice.target(S,u),g.skillTarget&&g.skillTarget[u.id]):undefined;
  if(choice.sp>0)spendSP(S,choice.sp,u.id);
  logAction(S,u,choice.name,{target:tgt});
  const res=choice.run(S,u,tgt)||{};
  gainEnergy(S,u.id,choice.energy||0);
  if(choice.gain)gainSP(S,choice.gain,u.id);
  if(res.gainSP)gainSP(S,res.gainSP,u.id);
  if(res.dealt)emit(S,'allyAttack',{unit:u.id,type:choice.id});
  tickEnd(S,u.id);
  if(kit.onTurnEnd)kit.onTurnEnd(S,u);
  emit(S,'allyTurnEnd',{unit:u.id});
  u.dist=BASE_DIST;u.prio=0;
  if(res.after)res.after(S,u);
}
function Cowner(S,u){return ownerOf(S,u.id)}

function summarize(S){
  const cycles=S.cfg.cycles||5,byCycle=[];
  for(let c=1;c<=cycles;c++)byCycle.push(S.damageByCycle[c]||0);
  const total=byCycle.reduce((a,b)=>a+b,0);
  const burst=(S.damageByCycle[1]||0)+(S.damageByCycle[2]||0);
  let run=0;const cumulative=byCycle.map(v=>run+=v);
  const contrib={};for(const a of S.team)contrib[a.name]=S.damageBy[a.id]||0;
  const sources={};for(const [k,v] of Object.entries(S.damageBy))if(k.includes('|')){const [id,src]=k.split('|');(sources[id]=sources[id]||{})[src]=v}
  const upt={};for(const [k,v] of Object.entries(S.uptime))upt[k]=Math.min(1,v/S.horizon);
  const turns={};for(const a of S.actions){turns[a.unit]=(turns[a.unit]||0)+(a.action==='Ultimate'?0:1)}
  return {total,byCycle,cumulative,burst,contrib,sources,uptime:upt,turns,spLog:S.spLog,actions:S.actions,events:S.events,timeline:S.timeline,flags:S.flags,horizon:S.horizon,
    endSP:S.sp,endEnergy:Object.fromEntries(allies(S).map(a=>[a.name,+a.energy.toFixed(1)]))};
}

function runBattle(team,cfg,genome,Kits,setup){
  const S=newState(cfg,team);const g=genome||{};
  for(const t of team)addUnit(S,{...t,kind:'ally',energy:0,maxEnergy:t.energyCost,id:t.id});
  S.team=team.map(t=>S.units[t.id]);
  setup(S,Kits);                                        // kits + equipment register hooks / initial effects
  ultPhase(S,g,Kits);
  for(let i=0;i<5000;i++){
    if(i===4999)note(S,'Combat event hard limit reached; simulation may be truncated.');
    const nx=nextActor(S);if(!nx||S.t+nx.dt>S.horizon+EPS)break;
    passTime(S,nx.dt);
    runTurn(S,nx.unit,g,Kits);
    ultPhase(S,g,Kits);
  }
  const output=summarize(S);output.model='expected-direct-hit; unmodeled mechanics flagged';return output;
}

return {EPS,clamp,BASE_DIST,cycleOf,horizonForCycles,newState,addUnit,ownerOf,allies,addMod,removeMod,hasKey,modVal,modsFor,sumMods,enemyMods,statOf,spdOf,
  bounceFactor,enemyRes,dealDamage,gainSP,spendSP,spMax,gainEnergy,advance,delay,timeToAct,nextActor,passTime,tick,tickStart,tickEnd,on,emit,note,runBattle,ultPhase,pickTarget,summarize,logAction};
});
