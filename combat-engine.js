/* HSR Damage Lab v0.5 | separately testable reference damage kernel.
 * Handles ONLY ordinary direct-hit damage with explicitly supplied combat state.
 * No estimates are substituted for missing kit rules, hit definitions, equipment passives,
 * SP/energy rotations, summon timing, Break, Elation, DoT, FUA or enemy AI.
 * Browser + Node.js compatible. No remote calls; safe to use offline.
 */
(function(root,factory){
  const mod=factory();
  if(typeof module==='object' && module.exports)module.exports=mod;
  if(root)root.HSRCombatEngine=mod;
})(typeof globalThis==='object'?globalThis:null,function(){
'use strict';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const pct=(v)=>Number(v)/100;
const ELEMENTS=['physical','fire','ice','lightning','wind','quantum','imaginary'];
const ENERGY_WARNING='Energy, Skill Point management, Ultimates and skill rotations are not simulated.';
const INSTABILITY_WARNING='Conditional Light Cone and Relic passives, unmodeled Traces/Eidolons and triggered damage are excluded; imported final stats are not re-applied.';
function parseBasic(description){
  const text=String(description||'').trim();
  let match=text.match(/\bDeals?\s+(Physical|Fire|Ice|Lightning|Wind|Quantum|Imaginary)\s+DMG\s+equal\s+to\s+([\d.]+)%\s+of\s+(.+?)'s\s+(ATK|DEF|Max HP)\s+to\s+(?:one|a)\s+(?:designated\s+)?(?:target\s+)?enemy\b/i);
  if(!match)match=text.match(/\bDeals?\s+([\d.]+)%\s+of\s+(.+?)'s\s+(ATK|DEF|Max HP)\s+as\s+(Physical|Fire|Ice|Lightning|Wind|Quantum|Imaginary)\s+DMG\s+to\s+(?:one|a)\s+(?:designated\s+)?(?:target\s+)?enemy\b/i);
  let scale,stat,element;
  if(match){
    if(/\bDMG\s+equal\s+to\b/i.test(match[0])){element=match[1].toLowerCase();scale=Number(match[2])/100;stat=match[4].toLowerCase()}
    else{scale=Number(match[1])/100;stat=match[3].toLowerCase();element=match[4].toLowerCase()}
  }else{
    // Alternate English grammar in a handful of older units. No regex is used to infer complex attacks.
    const m=text.match(/^([\w .•-]+)\s+deals\s+(Physical|Fire|Ice|Lightning|Wind|Quantum|Imaginary)\s+DMG\s+equal\s+to\s+([\d.]+)%\s+of\s+(?:his|her|their)\s+ATK\s+to\s+(?:one|a)\s+(?:designated\s+)?(?:target\s+)?enemy\b/i);
    if(!m)return {supported:false,reason:'Basic ATK text contains an unsupported or compound direct-hit definition. No multiplier is assumed.'};
    element=m[2].toLowerCase();scale=Number(m[3])/100;stat='atk';match=m;
  }
  if(!ELEMENTS.includes(element)||!Number.isFinite(scale)||scale<=0)return {supported:false,reason:'Could not validate direct-hit scale'};
  if(/\b(?:Elation|True DMG|Super Break|Blast|Bounce|bounce|adjacent|random targets|enhanced|separate instance)\b/i.test(match[0]))return {supported:false,reason:'Special damage or multiple-hit attack'};
  const remainder=text.slice((match.index||0)+match[0].length);
  const incomplete=/\b(?:and|also|gains|additional|adjacent|extra|then|charge|after|grant|energy|buff|action)\b/i.test(remainder);
  return {supported:true,scale,stat:stat==='max hp'?'hp':stat,element,
    description:text,partial:incomplete,
    note:incomplete?'Only the explicit first direct hit is evaluated. Further ability effects are excluded.':'Direct-hit text accepted; all separate passive/conditional effects remain outside the model.'};
}
function calculateHit(attacker,hit,enemy={},buffs={},critMode='expected'){
  if(!hit||!hit.supported)return {supported:false,reason:hit?.reason||'Unsupported hit definition'};
  const s=attacker.stats||attacker;
  const level=Number(attacker.level||attacker.lvl||80),enemyLevel=Number(enemy.level??95);
  if(!(level>0)||!(enemyLevel>0))return {supported:false,reason:'Invalid character/enemy level'};
  const atk=(Number(s.atk)||0)+(Number(s.baseAtk??s.atk)||0)*(Number(buffs.atkPct)||0)+(Number(buffs.flatAtk)||0);
  const hp=(Number(s.hp)||0)+(Number(s.baseHp??s.hp)||0)*(Number(buffs.hpPct)||0)+(Number(buffs.flatHp)||0);
  const def=(Number(s.def)||0)+(Number(s.baseDef??s.def)||0)*(Number(buffs.defPct)||0)+(Number(buffs.flatDef)||0);
  const sourceStat={atk,hp,def}[hit.stat];
  if(!(sourceStat>0))return {supported:false,reason:'Missing '+hit.stat.toUpperCase()+' for this attack'};
  const base=sourceStat*hit.scale;
  const cr=clamp((Number(s.critRate)||0)+(Number(buffs.critRate)||0),0,1),cd=Math.max(0,(Number(s.critDmg)||0)+(Number(buffs.critDmg)||0));
  const crit=critMode==='crit'?1+cd:critMode==='noncrit'?1:1+cr*cd;
  const bonus=Math.max(0,1+(Number(s.elementBonus)||0)+(Number(buffs.dmgBonus)||0));
  const shred=clamp((Number(enemy.defReduction)||0)+(Number(buffs.defShred)||0)+(Number(buffs.defIgnore)||0),0,1);
  const defMult=(level+20)/((level+20)+(enemyLevel+20)*(1-shred));
  const resistance=clamp((Number(enemy.resistance)||0)-(Number(buffs.resPen)||0),-1,.9);
  const resMult=1-resistance;
  const vuln=Math.max(0,1+(Number(enemy.vulnerability)||0)+(Number(buffs.vulnerability)||0));
  const toughness=enemy.broken?1:.9;
  const other=Math.max(0,Number(buffs.otherMultiplier??1));
  const result=base*crit*bonus*defMult*resMult*vuln*toughness*other;
  return {supported:true,damage:result,formula:{scalingStat:hit.stat,scalingValue:sourceStat,multiplier:hit.scale,base,crit,bonus,defMult,resMult,vuln,toughness,other,defReduction:shred,resistance,critRate:cr,critDmg:cd},caveats:[INSTABILITY_WARNING].concat(hit.partial?[hit.note]:[])};
}
// All explicitly modeled team effects below are based on snapshot text, treated as
// active combat states, NOT an engine that knows how to cause/refresh these effects.
// Users must request conditional states in the interface.
function getConditionalBuffs(team,attacker,flags={},enemy={}){
  let buff={atkPct:0,dmgBonus:0,defShred:0,defIgnore:0,resPen:0,vulnerability:0,otherMultiplier:1};
  const names=new Set(team.map(c=>c?.name));const notes=[];
  const find=n=>team.find(c=>c?.name===n);
  if(find('Bronya')?.traces?.some(t=>t.name==='Military Might'&&t.active)){buff.dmgBonus+=.10;notes.push('Bronya Military Might +10% ally DMG (unlocked major Trace)')}
  if(find('Asta')?.traces?.some(t=>t.name==='Ignite'&&t.active)&&attacker.element==='fire'){buff.dmgBonus+=.18;notes.push('Asta Ignite +18% Fire DMG (unlocked major Trace)')}
  const mei=find('Ruan Mei');
  if(mei&&mei.eidolon>=2&&enemy.broken){buff.atkPct+=.40;notes.push('Ruan Mei E2: +40% base-ATK scaling bonus against broken enemies')}
  if(mei&&flags.ruanSkill){
    // Extract base skill and trace from included actual user snapshot, not a global hardcode.
    const s=mei.abilities?.skill?.desc||'';
    const m=s.match(/all allies' DMG increases by\s+([\d.]+)%/i);
    const base=m?Number(m[1])/100:null;
    if(base!==null){
      const increment=mei.traces?.some(t=>t.name==='Candle Lights on Still Waters'&&t.active)?clamp(Math.floor((mei.stats.breakEffect*100-120+1e-8)/10),0,6)*.06:0;
      buff.dmgBonus+=base+increment;
      notes.push('Ruan Mei Skill active: '+((base+increment)*100).toFixed(1)+'% DMG (conditional Break Effect Trace included)');
    }else notes.push('Ruan Mei Skill multiplier missing; it was NOT applied');
  }
  if(mei&&flags.ruanUltimate){
    const u=mei.abilities?.ultimate?.desc||''; const m=u.match(/RES PEN increases by\s+([\d.]+)%/i);
    if(m){buff.resPen+=Number(m[1])/100;notes.push('Ruan Mei Ultimate active: '+m[1]+'% RES PEN')}
    if(mei.eidolon>=1){buff.defIgnore+=.20;notes.push('Ruan Mei E1: 20% DEF ignore within Ultimate Zone')}
  }
  const pela=find('Pela');
  if(pela&&flags.pelaUltimate){
    const desc=pela.abilities?.ultimate?.desc||'';const m=desc.match(/DEF is reduced by\s+([\d.]+)%/i);
    if(m){buff.defShred+=Number(m[1])/100;notes.push('Pela Ultimate Exposed active: '+m[1]+'% enemy DEF reduction')}
    else notes.push('Pela Ultimate effect not read; no shred applied');
  }
  const wolf=find('Silver Wolf');
  if(wolf&&flags.wolfUltimate){
    const m=(wolf.abilities?.ultimate?.desc||'').match(/reduce the DEF of all enemies by\s+([\d.]+)%/i);
    if(m){buff.defShred+=Number(m[1])/100;notes.push('Silver Wolf Ultimate active: '+m[1]+'% enemy DEF reduction')}
  }
  if(attacker.name==='Acheron'){
    const ni=team.filter(c=>['Pela','Silver Wolf','Black Swan','Kafka','Guinaifen','Sampo','Luka','Welt','Fugue','Hysilens','The Dahlia'].includes(c?.name)).length;
    if(ni&&attacker.traces?.some(t=>t.name==='The Abyss'&&t.active)){const f=ni>=2?1.60:1.15;buff.otherMultiplier*=f;notes.push('Acheron The Abyss: '+(100*f)+'% original damage with '+Math.min(2,ni)+' Nihility allies (Basic/Skill/Ultimate only)')}
  }
  return {buff,notes};
}
function simulateBasics(team,enemy={},options={}){
  const cycles=clamp(Number(options.cycles)||5,1,15);
  const until=150+100*(cycles-1);
  let events=[];let caveats=[ENERGY_WARNING,INSTABILITY_WARNING,'This is a BASIC-ATTACK-ONLY reference timeline, not a real rotation or team damage estimate.'];
  for(let slot=0;slot<team.length;slot++){
    const c=team[slot];if(!c)continue;
    const h=parseBasic(c.abilities?.basic_atk?.desc||'');
    if(!h.supported){caveats.push(c.name+': '+h.reason);continue}
    if(h.partial)caveats.push(c.name+': '+h.note);
    const spd=Number(c.stats?.spd)||0;if(!(spd>0))continue;
    const av=10000/spd;
    for(let time=av,k=0;time<=until+1e-7&&k<400;k++,time+=av){
      const {buff,notes}=getConditionalBuffs(team,c,options.activeEffects||{},enemy);
      const hit=calculateHit(c,h,enemy,buff,options.critMode||'expected');
      if(hit.supported){
        const cycle=time<=150?1:Math.min(cycles,1+Math.ceil((time-150-1e-8)/100));
        events.push({time,cycle,character:c.name,slot,damage:hit.damage,action:'Basic direct hit',formula:hit.formula,modifiers:notes,partial:h.partial});
      }
    }
  }
  events.sort((a,b)=>a.time-b.time||a.slot-b.slot);
  const byCycle=Array(cycles).fill(0);const contributions={};
  for(const event of events){byCycle[event.cycle-1]+=event.damage;contributions[event.character]=(contributions[event.character]||0)+event.damage}
  let rolling=0;
  return {label:'Direct-hit basic attack reference (INCOMPLETE)',events,byCycle,cumulative:byCycle.map(v=>rolling+=v),contributions,total:rolling,caveats:[...new Set(caveats)],coverage:team.filter(c=>c&&parseBasic(c.abilities?.basic_atk?.desc||'').supported).length+'/'+team.length};
}
const TEMPLATES=[
 {name:'Firefly Break core',mode:['break','sustained'],picks:[['Firefly'],['Ruan Mei'],['Fugue'],['Lingsha','Gallagher']],reason:'Break-oriented support and sustain; Super Break still requires a complete mechanics engine.'},
 {name:'Acheron debuff core',mode:['burst','sustained','single'],picks:[['Acheron'],['Pela'],['Silver Wolf','Black Swan','Guinaifen'],['Gallagher','Fu Xuan','Lingsha']],reason:'Two Nihility teammates support Acheron; debuff and Ultimate timing are not yet simulated.'},
 {name:'The Herta multi-target core',mode:['aoe','sustained'],picks:[['The Herta'],['Herta'],['Robin','Tribbie'],['Lingsha','Huohuo']],reason:'Erudition partner and AoE-focused supports; stack generation not yet modeled.'},
 {name:'Kafka DoT core',mode:['dot','sustained','aoe'],picks:[['Kafka'],['Black Swan'],['Ruan Mei','Robin'],['Huohuo','Gallagher']],reason:'DoT applicator/detonator synergy; damage and enemy-turn triggers not yet simulated.'},
 {name:'Castorice HP core',mode:['sustained','aoe'],picks:[['Castorice'],['Tribbie'],['Sunday','Robin'],['Huohuo','Lingsha']],reason:'HP-focused and summon support candidates; memosprite rules are not yet modeled.'},
 {name:'Follow-up attack core',mode:['fua','single','sustained'],picks:[['Dr. Ratio'],['Moze'],['Robin'],['Gallagher','Fu Xuan','Lingsha']],reason:'Follow-up teammates; debuff requirements and trigger rates are not yet modeled.'},
 {name:'Seele crit hypercarry',mode:['single','burst'],picks:[['Seele'],['Sparkle','Bronya'],['Robin','Tingyun'],['Fu Xuan','Huohuo','Gallagher']],reason:'Turn and crit-oriented supports; action advancement and resurgence are not simulated.'},
 {name:'Yunli counter core',mode:['sustained','fua'],picks:[['Yunli'],['Robin'],['Sunday','Tingyun'],['Huohuo','Lingsha']],reason:'Counter-oriented supports; enemy attack timing is not simulated.'},
 {name:'Archer burst core',mode:['burst','single'],picks:[['Archer'],['Sparkle'],['Sunday','Robin'],['Gallagher','Fu Xuan','Huohuo']],reason:'Skill Point and damage support; multi-skill sequence is not simulated.'},
 {name:'Argenti AoE core',mode:['aoe','burst'],picks:[['Argenti'],['Tingyun'],['Sunday','Bronya'],['Huohuo','Lingsha']],reason:'Energy support for AoE Ultimates; Energy and target counts not yet modeled.'}
];
function candidates(roster,mode='all'){
  const map=new Map(roster.map(c=>[c.name,c]));return TEMPLATES.filter(t=>mode==='all'||t.mode.includes(mode)).map(t=>{
    const used=new Set();const chars=[];
    for(const picks of t.picks){const found=picks.map(s=>map.get(s)).find(c=>c&&!used.has(c.name));if(!found)return null;chars.push(found);used.add(found.name)}
    return {...t,characters:chars}
  }).filter(Boolean);
}
return {parseBasic,calculateHit,getConditionalBuffs,simulateBasics,candidates,TEMPLATES};
});
