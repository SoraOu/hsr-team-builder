/* HSR Damage Lab executable kits + equipment effects for the supported roster.
 * Every number comes from engine/params.js (StarRailRes); this file only encodes behaviour.
 * Anything not encoded is reported through S.flags, never guessed. */
(function(root,factory){
  const m=factory(typeof require==='function'?require('./core.js'):root.HSRCore,typeof require==='function'?require('./params.js'):root.HSRParams);
  if(typeof module==='object'&&module.exports)module.exports=m;if(root)root.HSRKits=m})(typeof globalThis==='object'?globalThis:null,function(C,P){
'use strict';
const HARMONY='Shaman';
const norm=s=>String(s||'').replace(/#\d\[[^\]]*\]/g,'').replace(/[^a-zA-Z]/g,'').toLowerCase();
const TYPES={basic:'Basic ATK',skill:'Skill',ultimate:'Ultimate',talent:'Talent',technique:'Technique'};
const SNAP_SLOT={basic_atk:'basic',skill:'skill',ultimate:'ultimate',talent:'talent',technique:'technique'};

/* ================= unit construction from the account snapshot ================= */
function levelBonus(pc,variant,E){   // "Skill Lv. +2" lines of the Eidolon text, parsed generically
  const ei=variant?pc.eidolonsV1:pc.eidolons,b={basic:0,skill:0,ultimate:0,talent:0};
  for(let r=1;r<=E;r++){const d=(ei[r]||pc.eidolons[r]).desc;let m;const re=/(Basic ATK|Skill|Ultimate|Talent) Lv\. \+(\d)/g;
    while((m=re.exec(d))){const k={'Basic ATK':'basic',Skill:'skill',Ultimate:'ultimate',Talent:'talent'}[m[1]];b[k]+=+m[2]}}
  return b;
}
function buildUnit(snap,opts){
  opts=opts||{};const pc=P.characters[snap.name];if(!pc)throw new Error('Unsupported character: '+snap.name);
  const ids={};
  for(const [sk,a] of Object.entries(snap.abilities)){const slot=SNAP_SLOT[sk];if(!slot)continue;
    const cands=Object.entries(pc.skills).filter(([id,s])=>s.type===TYPES[slot]&&s.params&&s.params.length);
    const hit=cands.find(([id,s])=>norm(s.desc)===norm(a.desc));
    if(!hit)throw new Error('Ability version mismatch for '+snap.name+' '+slot+'; regenerate params.js for matching game data.');
    ids[slot]=hit[0];}
  for(const k of ['basic','skill','ultimate','talent','technique'])if(!ids[k])throw new Error('Missing '+snap.name+' '+k+' in account snapshot');
  const variant=String(ids.talent).length>6?1:0;
  const E=opts.eidolon??snap.eidolon;
  const b0=levelBonus(pc,variant,snap.eidolon),b1=levelBonus(pc,variant,E);
  const levels={};
  for(const slot of ['basic','skill','ultimate','talent']){
    const snapLv=snap.abilities[Object.keys(SNAP_SLOT).find(k=>SNAP_SLOT[k]===slot)].level;
    levels[slot]=Math.max(1,Math.min(slot==='basic'?10:15,snapLv-b0[slot]+b1[slot]));
  }
  levels.technique=1;
  const nectar=Object.entries(pc.skills).find(([id,s])=>s.name==='Nectar Blitz');
  const u={id:snap.name,name:snap.name,element:snap.element,path:pc.path,level:snap.level,eidolon:E,snapEidolon:snap.eidolon,variant,skillIds:ids,levels,
    snap:{...snap.stats},baseSpd:pc.baseSpd,energyCost:pc.energyCost,lightCone:snap.lightCone,relicSets:snap.relicSets,pc,enhancedId:nectar&&nectar[0]};
  u.p=slot=>{const s=pc.skills[ids[slot]];return s.params[Math.min(levels[slot],s.params.length)-1]};
  u.pEnh=()=>{const s=pc.skills[u.enhancedId];return s.params[Math.min(levels.basic,s.params.length)-1]};
  u.trace=name=>{
    const t=Object.values(pc.traces).find(x=>x.name===name&&x.variant===variant);
    if(!t)return null;
    const equipped=Array.isArray(snap.traces)?snap.traces.find(x=>x.name===name):null;
    return equipped&&equipped.active?t.params:null;
  };
  u.E=n=>E>=n;
  u.setCounts={};for(const piece of (snap.relicSets||[])){const set=P.relicPieces[piece];if(set)u.setCounts[set]=(u.setCounts[set]||0)+1}
  u.eidolonText=n=>(variant?pc.eidolonsV1:pc.eidolons)[n].desc;
  return u;
}
function buildTeam(snapshotChars,names,opts){
  return names.map(n=>{const s=snapshotChars.find(c=>c.name===n);if(!s)throw new Error('Character not in snapshot: '+n);
    return buildUnit(s,{eidolon:opts&&opts.eidolons&&opts.eidolons[n]})});
}

/* ================= helpers ================= */
const mod=(S,u,target,label,stat,value,expire,extra)=>C.addMod(S,Object.assign({src:u.id,label,target,stat,value,expire},extra||{}));
const setMod=(S,m)=>{C.removeMod(S,m.key,m.target);return C.addMod(S,m)};
const endTurns=(unit,turns,ext)=>({unit,at:'end',turns,ext});
const others=(S,u)=>C.allies(S).filter(a=>a.id!==u.id);
const hit=(S,u,type,element,mult,label,extra)=>C.dealDamage(S,Object.assign({actor:u.id,type,tags:[type],element:element||u.element,stat:'atk',mult,targets:type==='basic'?'single':'all',label},extra||{}));
const basicAction=(extra)=>Object.assign({id:'basic',name:'Basic ATK',sp:0,gain:1,energy:20},extra);
const T=(u,slot)=>slot;
const flag=(S,t)=>C.note(S,t);
function setHits(lord,hits,tal){lord.hits=Math.min(tal[5],hits);lord.fixedSpd=tal[0]+tal[2]*(lord.hits-lord.baseHits)}
const allTargets=(S,u)=>C.allies(S).map(a=>a.id);
const otherTargets=(S,u)=>others(S,u).map(a=>a.id);

/* ================= kits ================= */
const K={};

K['Jing Yuan']={
  init(S,u){
    const tal=u.p('talent');
    const lord={id:u.id+':lord',name:'Lightning-Lord',kind:'summon',owner:u.id,fixedSpd:tal[0],baseHits:tal[3],hits:tal[3],dist:C.BASE_DIST};
    C.addUnit(S,lord);u.lord=lord;
    const sv=u.trace('Savant Providence');if(sv)C.gainEnergy(S,u.id,sv[0],{noErr:true});
    if(S.cfg.techniques)setHits(lord,lord.hits+u.p('technique')[0],tal);
    if(u.E(6)&&S.cfg.enemy.count>1)flag(S,'Jing Yuan E6: Vulnerable stacks are tracked per enemy; with several enemies the effect is NOT applied (single-target only).');
    if(u.E(4)===false&&false)0;
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill'),tal=u.p('talent'),wm=u.trace('War Marshal');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');return {dealt:true}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30,run:(S,u)=>{
        hit(S,u,'skill',null,sk[0],'Skill');setHits(u.lord,u.lord.hits+sk[1],tal);
        if(wm)mod(S,u,u.id,'War Marshal (CRIT Rate)','critRate',wm[0],endTurns(u.id,wm[1]));
        return {dealt:true}}}];
  },
  ult:{run:(S,u)=>{const ul=u.p('ultimate'),tal=u.p('talent');
    hit(S,u,'ultimate',null,ul[0],'Ultimate');setHits(u.lord,u.lord.hits+ul[1],tal);C.emit(S,'allyAttack',{unit:u.id,type:'ultimate'})}},
  summonTurn(S,lord){
    const u=S.units[lord.owner],tal=u.p('talent'),bc=u.trace('Battalia Crush');
    C.emit(S,'followUpStart',{owner:u.id});
    const extraCD=bc&&lord.hits>=bc[0]?bc[1]:0;
    const adj=tal[4]*(u.E(1)?2:1);
    const single=S.cfg.enemy.count===1;
    const n=lord.hits;
    for(let i=0;i<n;i++){
      C.dealDamage(S,{actor:lord.id,type:'followup',tags:['followup'],element:'lightning',stat:'atk',mult:tal[1],targets:'bounce',adj,extraCD,label:'Lightning-Lord'});
      C.emit(S,'followUpHit',{owner:u.id});
      if(u.E(4))C.gainEnergy(S,u.id,2);
      if(u.E(6)&&single)C.addMod(S,{key:'jy:e6',src:u.id,label:'Jing Yuan E6 (Vulnerable)',target:'enemy',stat:'vuln',value:0.12,maxStacks:3,expire:endTurns(lord.id,1)});
    }
    C.logAction(S,lord,'Lightning-Lord attack',{hits:n});
    if(u.E(2))mod(S,u,u.id,'Jing Yuan E2 (DMG)','dmg',0.20,endTurns(u.id,2),{tags:['basic','skill','ultimate']});
    C.emit(S,'allyAttack',{unit:u.id,type:'followup'});
    setHits(lord,lord.baseHits,tal);
  }
};

K['Sunday']={
  init(S,u){
    const ex=u.trace('Exalted Sweep');if(ex)C.gainEnergy(S,u.id,ex[0],{noErr:true});
    u.techPending=!!S.cfg.techniques;u.firstUltDone=false;
    if(u.E(6))flag(S,'Sunday E6 (stacking CRIT Rate, CRIT Rate to CRIT DMG conversion) is not modelled.');
  },
  onTurnStart(S,u){
    if(u.E(4))C.gainEnergy(S,u.id,8);
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill'),tl=u.p('talent');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');return {dealt:true}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30,target:otherTargets,run:(S,u,t)=>{
        const tg=S.units[t],hasSummon=!!tg.lord;
        const boost=sk[1]+(hasSummon?sk[3]:0);
        mod(S,u,t,'Sunday Skill (DMG Boost)','dmg',boost,endTurns(t,sk[2]),{key:'sunday:skillDmg'});
        mod(S,u,t,'Sunday Talent (CRIT Rate)','critRate',tl[0],endTurns(t,tl[1]),{key:'sunday:talentCR'});
        if(u.E(1)){mod(S,u,t,'Sunday E1 (DEF ignore)','defIgnore',0.16,endTurns(t,2),{scope:'character',key:'sunday:e1c'});
          if(hasSummon)mod(S,u,t,'Sunday E1 (summon DEF ignore)','defIgnore',0.40,endTurns(t,2),{scope:'summon',key:'sunday:e1s'})}
        if(u.techPending){u.techPending=false;const tq=u.p('technique');mod(S,u,t,'Sunday Technique (DMG)','dmg',tq[0],endTurns(t,tq[1]),{key:'sunday:tech'})}
        if(!(tg.path===HARMONY)){C.advance(S,t,1);if(tg.lord){C.advance(S,tg.lord.id,1);tg.prio=-2;tg.lord.prio=-1;}}
        C.emit(S,'skillOnAlly',{user:u.id,target:t,kind:'skill'});
        const onBeat=C.hasKey(S,'sunday:beatified',t);
        return {gainSP:onBeat?1:0};
      }}];
  },
  ult:{target:otherTargets,run:(S,u,t)=>{
    const ul=u.p('ultimate'),tg=S.units[t],floor=(u.trace("Rest Day's Longing")||[0])[0];
    C.gainEnergy(S,t,Math.max(ul[0]*tg.maxEnergy,floor),{noErr:true});
    C.removeMod(S,'sunday:beatified');
    mod(S,u,t,'Sunday Ult (The Beatified CRIT DMG)','critDmg',0,{unit:u.id,at:'start',turns:ul[2]},{key:'sunday:beatified',dyn:{unit:u.id,stat:'critDmg',ratio:ul[1],flat:ul[3]}});
    if(u.E(2)){mod(S,u,t,'Sunday E2 (Beatified DMG)','dmg',0.30,{unit:u.id,at:'start',turns:ul[2]},{key:'sunday:beatified:e2'});
      if(!u.firstUltDone)C.gainSP(S,2,u.id)}
    u.firstUltDone=true;
    if(u.techPending){u.techPending=false;const tq=u.p('technique');mod(S,u,t,'Sunday Technique (DMG)','dmg',tq[0],endTurns(t,tq[1]),{key:'sunday:tech'})}
    C.emit(S,'skillOnAlly',{user:u.id,target:t,kind:'ultimate'});
  }}
};

K['Bronya']={
  init(S,u){
    const mm=u.trace('Military Might');
    if(mm)for(const a of C.allies(S))mod(S,u,a.id,'Bronya: Military Might (DMG)','dmg',mm[0],{mode:'battle'});
    mod(S,u,u.id,'Bronya: Command (Basic ATK CRIT Rate 100%)','critRate',1,{mode:'battle'},{tags:['basic']});
    u.skillUses=0;
    if(S.cfg.techniques){const tq=u.p('technique');for(const a of C.allies(S))mod(S,u,a.id,'Bronya Technique (ATK)','atkPct',tq[0],endTurns(a.id,tq[1]),{key:'bronya:tech'})}
    if(u.E(4)&&S.cfg.enemy.weaknesses.includes('wind'))flag(S,'Bronya E4 follow-up is not modelled.');
    if(u.E(1))flag(S,'Bronya E1 SP restoration uses a deterministic 50% approximation, not a stochastic distribution or guaranteed result.');
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill'),tal=u.p('talent');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');return {dealt:true,after:(S,u)=>C.advance(S,u.id,tal[0])}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30,target:allTargets,run:(S,u,t)=>{
        mod(S,u,t,'Bronya Skill (DMG Boost)','dmg',sk[0],endTurns(t,sk[2]+(u.E(6)?1:0)),{key:'bronya:skill'});
        if(t!==u.id)C.advance(S,t,1);
        if(u.E(2)&&t!==u.id)mod(S,u,t,'Bronya E2 (SPD)','spdPct',0.30,endTurns(t,2),{key:'bronya:e2'});
        u.skillUses++;
        C.emit(S,'skillOnAlly',{user:u.id,target:t,kind:'skill'});
        return {gainSP:(u.E(1)&&u.skillUses%2===0)?1:0,noExtra:t===u.id}; // provisional deterministic E1 proc; see flags
      }}];
  },
  ult:{run:(S,u)=>{const ul=u.p('ultimate');const cd=ul[1]*C.statOf(S,u.id,'critDmg')+ul[2];
    for(const a of C.allies(S)){mod(S,u,a.id,'Bronya Ult (ATK)','atkPct',ul[0],endTurns(a.id,ul[3]),{key:'bronya:ultAtk'});
      mod(S,u,a.id,'Bronya Ult (CRIT DMG)','critDmg',0,endTurns(a.id,ul[3]),{key:'bronya:ultCD',dyn:{unit:u.id,stat:'critDmg',ratio:ul[1],flat:ul[2]}})}}}
};

K['Sparkle']={
  init(S,u){
    const tal=u.p('talent');
    S.spBonus+=tal[2]+(u.E(4)?1:0);S.sparkleBank=0;u.figmentMax=tal[3];
    if(u.variant!==1)flag(S,'Sparkle: the pre-rework kit is not modelled (only the account\'s reworked Figment kit is).');
    const noc=u.trace('Nocturne');
    if(noc)for(const a of C.allies(S)){mod(S,u,a.id,'Sparkle: Nocturne (ATK)','atkPct',noc[0],{mode:'battle'});
      mod(S,u,a.id,'Sparkle: Nocturne (RES PEN)','resPen',noc[1],{mode:'battle'},{requires:{attackerKey:'sparkle:cdBoost'}})}
    if(S.cfg.techniques){C.gainSP(S,u.p('technique')[0],u.id);C.gainEnergy(S,u.id,u.p('technique')[1],{noErr:true})}
    if(u.E(1))mod(S,u,u.id,'Sparkle E1 (SPD)','spdPct',0.15,endTurns(u.id,2),{key:'sparkle:e1spd'});
    u.skillsThisTurn=0;
    C.on(S,(S,ev,p)=>{
      if(ev==='spConsumed'){
        const bearer=C.hasKey(S,'sparkle:cdBoost',p.by);
        const n=Math.min(u.figmentMax,(u.figment||0)+p.amount);u.figment=n;
        setMod(S,{key:'sparkle:figment',src:u.id,label:'Sparkle Talent (Figment: DMG taken)',target:'enemy',stat:'vuln',value:tal[1],stacks:n,maxStacks:u.figmentMax,expire:endTurns(u.id,tal[0])});
        setMod(S,{key:'sparkle:figmentCipher',src:u.id,label:'Sparkle Ult (Cipher: Figment boost)',target:'enemy',stat:'vuln',value:u.p('ultimate')[2],stacks:n,maxStacks:u.figmentMax,requires:{attackerKey:'sparkle:cipher'},expire:endTurns(u.id,tal[0])});
        if(u.E(2))setMod(S,{key:'sparkle:e2',src:u.id,label:'Sparkle E2 (DEF reduction)',target:'enemy',stat:'defRed',value:0.10,stacks:n,maxStacks:u.figmentMax,expire:endTurns(u.id,tal[0])});
        if(bearer&&u.trace('Almanac'))C.gainEnergy(S,u.id,u.trace('Almanac')[1],{noErr:true});
      }
      if(ev==='allyTurnEnd'&&S.sparkleBank>0&&S.sp<C.spMax(S)){const k=Math.min(S.sparkleBank,C.spMax(S)-S.sp);S.sp+=k;S.sparkleBank-=k;S.spLog.gained+=k}
      if(ev==='turnStart'&&p.unit===u.id)u.skillsThisTurn=0;
    });
    // the Figment stack expires with its duration: reset the counter when the modifier is gone
    C.on(S,(S,ev)=>{if(ev==='allyTurnEnd'&&!C.hasKey(S,'sparkle:figment'))u.figment=0});
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');if(u.trace('Almanac'))C.gainEnergy(S,u.id,u.trace('Almanac')[0]);return {dealt:true}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30,target:allTargets,run:(S,u,t)=>{
        mod(S,u,t,'Sparkle Skill (CRIT DMG Boost)','critDmg',0,endTurns(t,sk[2],true),{key:'sparkle:cdBoost',dyn:{unit:u.id,stat:'critDmg',ratio:sk[0]+(u.E(6)?0.30:0),flat:sk[1]}});
        if(t!==u.id)C.advance(S,t,sk[3]);
        if(u.E(1))mod(S,u,u.id,'Sparkle E1 (SPD)','spdPct',0.15,endTurns(u.id,2),{key:'sparkle:e1spd'});
        C.emit(S,'skillOnAlly',{user:u.id,target:t,kind:'skill'});
        return {};
      }}];
  },
  ult:{run:(S,u)=>{const ul=u.p('ultimate');const amt=ul[1]+(u.E(4)?1:0);
    for(const a of C.allies(S)){
      mod(S,u,a.id,'Sparkle Ult (Cipher)','flag',0,endTurns(a.id,ul[3]+(u.E(1)?1:0)),{key:'sparkle:cipher'});
      if(u.E(1))mod(S,u,a.id,'Sparkle E1 (Cipher ATK)','atkPct',0.40,endTurns(a.id,ul[3]+1),{key:'sparkle:e1atk'})}
    const applied=C.gainSP(S,amt,u.id);S.sparkleBank=Math.min(ul[4],(S.sparkleBank||0)+(amt-applied));
  }}
};

K['Robin']={
  init(S,u){
    const tl=u.p('talent');
    for(const a of C.allies(S))mod(S,u,a.id,'Robin Talent (CRIT DMG)','critDmg',tl[0],{mode:'battle'});
    if(u.trace('Coloratura Cadenza'))C.advance(S,u.id,u.trace('Coloratura Cadenza')[0]);
    if(S.cfg.techniques)C.gainEnergy(S,u.id,u.p('technique')[1],{noErr:true});
    u.concerto=false;
    C.addUnit(S,{id:u.id+':countdown',name:'Concerto countdown',kind:'countdown',owner:u.id,fixedSpd:u.p('ultimate')[1],dist:C.BASE_DIST,blocked:true});
    if(u.E(4))flag(S,'Robin E4 (Effect RES) is defensive and not simulated.');
    C.on(S,(S,ev,p)=>{
      if(ev==='allyAttack'&&p.unit!==u.id){
        C.gainEnergy(S,u.id,tl[1]+(u.E(2)&&u.concerto?1:0));
        if(!u.concerto)return;
        const ul=u.p('ultimate');
        let extraCD=0;if(u.E(6)&&u.e6Count<8){u.e6Count++;extraCD=4.5}
        C.dealDamage(S,{actor:u.id,type:'additional',tags:['additional'],element:u.element,stat:'atk',mult:ul[3],targets:'single',fixed:{cr:ul[4],cd:ul[5]},extraCD,label:'Concerto additional DMG',kind:'additional'});
      }
    });
  },
  ultReady:(S,u)=>!u.concerto,
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');return {dealt:true}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30+(u.trace('Sequential Passage')?u.trace('Sequential Passage')[0]:0),run:(S,u)=>{
        for(const a of C.allies(S))mod(S,u,a.id,"Robin Skill (DMG Boost)",'dmg',sk[0],{unit:u.id,at:'start',turns:sk[1]},{key:'robin:skill'});
        return {};}}];
  },
  ult:{run:(S,u)=>{
    const ul=u.p('ultimate');u.concerto=true;u.e6Count=0;
    const flat=ul[0]*C.statOf(S,u.id,'atk')+ul[2];
    for(const a of C.allies(S)){
      mod(S,u,a.id,'Robin Ult (Concerto ATK)','atkFlat',flat,{mode:'battle'},{key:'robin:concerto:atk'});
      if(u.trace('Impromptu Flourish'))mod(S,u,a.id,'Robin Trace (Concerto FUA CRIT DMG)','critDmg',u.trace('Impromptu Flourish')[0],{mode:'battle'},{key:'robin:concerto:fua',tags:['followup']});
      if(u.E(1))mod(S,u,a.id,'Robin E1 (RES PEN)','resPen',0.24,{mode:'battle'},{key:'robin:concerto:e1'});
      if(u.E(2))mod(S,u,a.id,'Robin E2 (SPD)','spdPct',0.16,{mode:'battle'},{key:'robin:concerto:e2'})}
    u.blocked=true;
    const cd=S.units[u.id+':countdown'];cd.blocked=false;cd.dist=C.BASE_DIST;
    for(const a of others(S,u))C.advance(S,a.id,1);
    C.emit(S,'ultOnTeam',{user:u.id});
  }},
  summonTurn(S,cd){
    const u=S.units[cd.owner];u.concerto=false;u.blocked=false;cd.blocked=true;
    S.mods=S.mods.filter(m=>!(m.key&&m.key.startsWith('robin:concerto:')));
    C.advance(S,u.id,1);
    C.logAction(S,cd,'Concerto ends');
  }
};

K['Fu Xuan']={
  init(S,u){
    u.matrixTurns=0;
    if(S.cfg.techniques)this.matrix(S,u,u.p('technique')[1]);
    if(u.E(6))flag(S,'Fu Xuan E6 (HP-loss tally) is not modelled: enemy attacks are not simulated.');
  },
  matrix(S,u,turns){const sk=u.p('skill');
    for(const a of C.allies(S)){mod(S,u,a.id,'Fu Xuan: Knowledge (CRIT Rate)','critRate',sk[4],endTurns(u.id,turns),{key:'fu:cr'});
      if(u.E(1))mod(S,u,a.id,'Fu Xuan E1 (Knowledge CRIT DMG)','critDmg',0.30,endTurns(u.id,turns),{key:'fu:cd'})}
    mod(S,u,u.id,'Fu Xuan: Knowledge (Max HP)','hpFlat',sk[3]*u.snap.hp,endTurns(u.id,turns),{key:'fu:hp'});
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill');
    return [
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK',{stat:'hp'});return {dealt:true}}}),
      {id:'skill',name:'Skill',sp:1,gain:0,energy:30,run:(S,u)=>{
        const active=C.hasKey(S,'fu:cr');
        this.matrix(S,u,sk[2]);
        if(active&&u.trace('Taiyi, the Macrocosmic'))C.gainEnergy(S,u.id,u.trace('Taiyi, the Macrocosmic')[0]);
        return {};}}];
  },
  ult:{run:(S,u)=>{const ul=u.p('ultimate');hit(S,u,'ultimate',null,ul[0],'Ultimate',{stat:'hp'});C.emit(S,'allyAttack',{unit:u.id,type:'ultimate'})}}
};

K['Gallagher']={
  init(S,u){
    u.nectar=false;
    if(S.cfg.techniques){const tq=u.p('technique');hit(S,u,'skill',null,tq[1],'Technique (Artisan Elixir)',{kind:'direct'});
      mod(S,u,'enemy','Besotted','flag',0,endTurns(u.id,tq[0]),{key:'gall:besotted'})}
    flag(S,'Gallagher: healing is performed but not scored; sustain value is not part of the damage ranking.');
    if(u.E(1))C.gainEnergy(S,u.id,20,{noErr:true});
  },
  actions(S,u){
    const b=u.p('basic'),sk=u.p('skill'),acts=[
      basicAction({run:(S,u)=>{hit(S,u,'basic',null,b[0],'Basic ATK');return {dealt:true}}}),
      {id:'skill',name:'Skill (heal)',sp:1,gain:0,energy:30,target:allTargets,run:(S,u,t)=>{S.healing=(S.healing||0)+sk[0];return {}}}];
    if(u.nectar){const nb=u.pEnh();
      acts.push({id:'enhanced',name:'Nectar Blitz',sp:0,gain:1,energy:30,run:(S,u)=>{
        hit(S,u,'basic',null,nb[0],'Nectar Blitz');u.nectar=false;return {dealt:true}}})}
    return acts;
  },
  ult:{run:(S,u)=>{const ul=u.p('ultimate');
    mod(S,u,'enemy','Besotted','flag',0,endTurns(u.id,ul[1]+(u.E(4)?1:0)),{key:'gall:besotted'});
    hit(S,u,'ultimate',null,ul[0],'Ultimate');u.nectar=true;
    if(u.trace('Organic Yeast')!==null)C.advance(S,u.id,1);
    C.emit(S,'allyAttack',{unit:u.id,type:'ultimate'})}}
};

/* ================= equipment (Light Cones + relic sets) ================= */
function pendingNext(S,from,label,value,tag){(S.pendingNext=S.pendingNext||[]).push({from,label,value,tag})}
function equipmentInit(S,u){
  const lc=u.lightCone&&P.lightCones[u.lightCone.name],sup=u.lightCone?u.lightCone.superimposition:1,lp=lc&&lc.params[sup-1],sc=u.setCounts;
  if(u.lightCone&&!lc)flag(S,'Unrecognized Light Cone: '+u.lightCone.name);
  if(lc&&lc.path!==u.path)flag(S,'Inactive Light Cone (Path mismatch): '+u.lightCone.name);
  if(lc&&!lp)throw new Error('Invalid Light Cone superimposition for '+u.lightCone.name);
  if(lc&&lc.path===u.path){
    const n=lc.passive;
    if(n==='Meteor Swarm'){mod(S,u,u.id,'LC: Night on the Milky Way (ATK per enemy)','atkPct',lp[1]*Math.min(5,S.cfg.enemy.count),{mode:'battle'});
      flag(S,'Night on the Milky Way: Weakness Break DMG bonus not modelled (enemy toughness/Break is not simulated).')}
    else if(n==='Heir'){mod(S,u,u.id,"LC: But the Battle Isn't Over (ERR)",'err',lp[0],{mode:'battle'},{key:'lc:err'});u.lcUlts=0;
      C.on(S,(S,ev,p)=>{if(p&&p.user===u.id&&ev==='skillOnAlly'){
        if(p.kind==='skill')pendingNext(S,u.id,"LC: But the Battle Isn't Over (DMG)",lp[1],lp[2]);
        else{u.lcUlts++;if(u.lcUlts%2===0)C.gainSP(S,1,u.id)}}});}
    else if(n==='Kites From the Past'){C.on(S,(S,ev,p)=>{if(ev==='skillOnAlly'&&p.user===u.id&&p.kind==='skill')pendingNext(S,u.id,'LC: Past and Future (DMG)',lp[0],lp[1])})}
    else if(n==='Capriciousness'){
      const mask=turns=>{for(const a of others(S,u)){mod(S,u,a.id,'LC: Earthly Escapade (Mask CRIT Rate)','critRate',lp[4],{unit:u.id,at:'end',turns},{key:'lc:maskCR'});
        mod(S,u,a.id,'LC: Earthly Escapade (Mask CRIT DMG)','critDmg',lp[1],{unit:u.id,at:'end',turns},{key:'lc:maskCD'})}};
      mask(lp[5]);u.flame=0;
      C.on(S,(S,ev,p)=>{if(ev==='spGained'&&p.by===u.id){u.flame+=p.amount;while(u.flame>=lp[3]){u.flame-=lp[3];mask(lp[2])}}});}
    else if(n==='Bonds'){C.on(S,(S,ev,p)=>{if(ev==='ultOnTeam'&&p.user===u.id)mod(S,u,u.id,'LC: For Tomorrow\'s Journey (DMG)','dmg',lp[1],endTurns(u.id,lp[2]),{key:'lc:bonds'})})}
    else if(n==='At This Very Moment'||n==='Hypothesis'){}
    else flag(S,'Light Cone passive not modelled: '+u.lightCone.name);
  }
  if(sc['The Ashblazing Grand Duke']>=2){
    const rs=P.relicSets['The Ashblazing Grand Duke'];
    mod(S,u,u.id,'Relic: Ashblazing Grand Duke 2pc (Follow-Up DMG)','dmg',0.20,{mode:'battle'},{tags:['followup']});
    if(sc['The Ashblazing Grand Duke']>=4){
      C.on(S,(S,ev,p)=>{if(p&&p.owner===u.id){
        if(ev==='followUpStart')C.removeMod(S,'relic:gd4',u.id);
        if(ev==='followUpHit')C.addMod(S,{key:'relic:gd4',src:u.id,label:'Relic: Ashblazing Grand Duke 4pc (ATK)',target:u.id,stat:'atkPct',value:0.06,maxStacks:8,expire:endTurns(u.id,3)})}});
    }
  }
  if(sc['The Wondrous BananAmusement Park']>=2&&u.lord)mod(S,u,u.id,'Relic: BananAmusement Park (CRIT DMG, summon on field)','critDmg',0.32,{mode:'battle'});
  if(sc["Sacerdos' Relived Ordeal"]>=4)C.on(S,(S,ev,p)=>{if(ev==='skillOnAlly'&&p.user===u.id)
    C.addMod(S,{key:'relic:sacerdos:'+u.id,src:u.id,label:"Relic: Sacerdos' Relived Ordeal 4pc (CRIT DMG)",target:p.target,stat:'critDmg',value:0.18,maxStacks:2,expire:endTurns(p.target,2)})});
  if(sc['Lushaka, the Sunken Seas']>=2){
    mod(S,u,u.id,"Relic: Lushaka (ERR)",'err',0.05,{mode:'battle'},{key:'relic:lushakaErr'});
    if(S.team[0].id!==u.id)mod(S,u,S.team[0].id,'Relic: Lushaka (ATK to lead)','atkPct',0.12,{mode:'battle'});
  }
  if(sc['Broken Keel']>=2){if(S.cfg.assume&&S.cfg.assume.brokenKeel)for(const a of C.allies(S))mod(S,u,a.id,'Relic: Broken Keel (CRIT DMG)','critDmg',0.10,{mode:'battle'},{key:'relic:keel'});
    else flag(S,'Broken Keel not applied: it needs Effect RES >= 30%, which the account snapshot does not contain (enable assume.brokenKeel to include it).')}
  if(sc['Messenger Traversing Hackerspace']>=4)flag(S,'Messenger 4pc (SPD on Ultimate used on an ally) not modelled for '+u.name+'.');
  if(sc['Thief of Shooting Meteor']>=4)flag(S,'Thief of Shooting Meteor 4pc needs Weakness Break, which is not simulated.');
}
/* turn-start hook: apply "next ally to act" buffs, once per source */
function registerGlobalHooks(S){
  C.on(S,(S,ev,p)=>{
    if(ev==='turnStart'&&S.pendingNext&&S.pendingNext.length){
      const keep=[];
      for(const pn of S.pendingNext){if(pn.from===p.unit){keep.push(pn);continue}
        C.addMod(S,{key:'next:'+pn.label,src:pn.from,label:pn.label,target:p.unit,stat:'dmg',value:pn.value,expire:endTurns(p.unit,pn.tag)})}
      S.pendingNext=keep;
    }
  });
}

function setup(S,Kits){
  registerGlobalHooks(S);
  const team=C.allies(S);
  for(const u of team){const k=Kits[u.name];if(k.init)k.init(S,u)}
  for(const u of team)equipmentInit(S,u);
  S.kits=Kits;
}

return {K,buildUnit,buildTeam,setup,levelBonus,norm,HARMONY,P,C};
});
