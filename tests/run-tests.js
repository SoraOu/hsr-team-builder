'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../engine/core.js');
const {p,snapshots}=require('./fixtures').build();
const root={HSRCore:C,HSRParams:p};
const ctx=vm.createContext({globalThis:root});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../engine/kits.js'),'utf8'),ctx,{filename:'engine/kits.js'});
const KT=root.HSRKits;
const ctx2=vm.createContext({globalThis:{HSRCore:C,HSRKits:KT}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../engine/optimizer.js'),'utf8'),ctx2,{filename:'engine/optimizer.js'});
const Opt=ctx2.globalThis.HSROptimizer;
const cfg=(x={})=>({cycles:2,critMode:'expected',startSP:3,techniques:false,
 enemy:{count:1,level:95,res:0.2,resWeak:0,weaknesses:['lightning'],broken:false},...x});
let n=0;function test(name,fn){try{fn();n++;console.log('✓',name)}catch(e){console.error('✗',name);throw e}}
function solo(acts,startSP=3){
 const c={id:'Tester',name:'Tester',level:80,energyCost:100,baseSpd:100,
  snap:{atk:1000,baseAtk:1000,critRate:.5,critDmg:1,spd:100,elementBonus:0}};
 const k={Tester:{actions:()=>acts,init(){}}};
 return C.runBattle([c],cfg({cycles:1,startSP}),{},k,()=>{});
}
test('Basic ATK awards one SP and 20 energy',()=>{
 const r=solo([{id:'basic',name:'Basic ATK',sp:0,gain:1,energy:20,run:()=>({})}]);
 assert.equal(r.endSP,4);assert.equal(r.spLog.gained,1);assert.equal(r.endEnergy.Tester,20);
});
test('Skills spend SP; explicit refunds apply after execution',()=>{
 const r=solo([{id:'skill',name:'Skill',sp:1,gain:0,energy:30,run:()=>({gainSP:1})}]);
 assert.equal(r.endSP,3);assert.equal(r.spLog.spent,1);assert.equal(r.spLog.gained,1);
});
test('Illegal SP spending throws without going negative',()=>{
 const s=C.newState(cfg(),[]);s.sp=0;assert.throws(()=>C.spendSP(s,1,'X'),/Illegal SP/);
});
test('100% action advance schedules the ally immediately',()=>{
 const s=C.newState(cfg(),[]),a={id:'A',kind:'ally',snap:{spd:100},baseSpd:100},b={id:'B',kind:'ally',snap:{spd:110},baseSpd:110};
 C.addUnit(s,a);C.addUnit(s,b);C.advance(s,'A',1);assert.equal(C.nextActor(s).unit.id,'A');assert.equal(C.nextActor(s).dt,0);
});
test('Dynamic CRIT DMG on Sunday buff changes with source stats',()=>{
 const s=C.newState(cfg(),[]);
 for(const id of ['Sunday','Jing Yuan'])C.addUnit(s,{id,name:id,kind:'ally',snap:{atk:1000,baseAtk:1000,hp:1000,baseHp:1000,critRate:.5,critDmg:1,spd:100},baseSpd:100});
 C.addMod(s,{key:'beatified',label:'Beatified',src:'Sunday',target:'Jing Yuan',stat:'critDmg',value:0,dyn:{unit:'Sunday',stat:'critDmg',ratio:.3,flat:.12}});
 assert.ok(Math.abs(C.statOf(s,'Jing Yuan','critDmg')-1.42)<1e-9);
 C.addMod(s,{key:'other',label:'Source CRIT',src:'x',target:'Sunday',stat:'critDmg',value:.5});
 assert.ok(Math.abs(C.statOf(s,'Jing Yuan','critDmg')-1.57)<1e-9);
});
test('endOf expiry ticks only at the specified source turn end',()=>{
 const s=C.newState(cfg(),[]);C.addMod(s,{key:'x',src:'X',target:'Y',stat:'dmg',value:.2,expire:{mode:'endOf',unit:'X',turns:1}});
 C.tickEnd(s,'Y');assert.ok(C.hasKey(s,'x'));C.tickEnd(s,'X');assert.equal(C.hasKey(s,'x'),false);
});
test('Extended buff expires on next target turn start',()=>{
 const s=C.newState(cfg(),[]);C.addMod(s,{key:'x',src:'X',target:'Y',stat:'dmg',value:.2,expire:{unit:'Y',at:'end',turns:1,ext:true}});
 C.tickEnd(s,'Y');assert.ok(C.hasKey(s,'x'));C.tickStart(s,'Y');assert.equal(C.hasKey(s,'x'),false);
});
test('Damage source includes the active modifier provenance',()=>{
 const a=KT.buildTeam(snapshots,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const r=C.runBattle(a,cfg(),{},KT.K,KT.setup);
 assert.ok(r.total>0);assert.ok(r.events.some(x=>x.source==='Lightning-Lord'));
 assert.ok(r.events.some(x=>x.breakdown.dmgSources.some(y=>y.label.includes('Sunday'))));
 assert.ok(r.actions.some(x=>x.action==='Skill'));assert.ok(r.spLog.gained>0);
});
test('Sunday can advance Lightning-Lord summon along with Jing Yuan',()=>{
 const team=KT.buildTeam(snapshots,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const r=C.runBattle(team,cfg({cycles:2}),{skillTarget:{Sunday:0}},KT.K,KT.setup);
 const s=r.actions.find(a=>a.unit==='Sunday'&&a.action==='Skill');
 assert.ok(s);const lord=r.actions.find(a=>a.unit==='Lightning-Lord'&&a.action==='Lightning-Lord attack');
 assert.ok(lord);assert.ok(lord.t < 167,'Lightning-Lord should be advanced from its base 60-SPD turn');
});
test('Sunday advances the character before Lightning-Lord',()=>{
 const team=KT.buildTeam(snapshots,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const r=C.runBattle(team,cfg({cycles:2}),{skillTarget:{Sunday:0}},KT.K,KT.setup);
 const firstSunday=r.actions.find(x=>x.unit==='Sunday'&&x.action==='Skill');assert.ok(firstSunday);
 const immediate=r.actions.filter(x=>Math.abs(x.t-firstSunday.t)<0.02);
 const characterIndex=immediate.findIndex(x=>x.unit==='Jing Yuan'&&x.action!=='Ultimate');
 const lordIndex=immediate.findIndex(x=>x.unit==='Lightning-Lord'&&x.action==='Lightning-Lord attack');
 assert.ok(characterIndex>=0&&lordIndex>characterIndex,
  'Jing Yuan must act before the 100%-advanced summon on Sunday Skill');
});
test('Unactivated Traces are not silently granted to account characters',()=>{
 const br=JSON.parse(JSON.stringify(snapshots.find(x=>x.name==='Bronya')));
 br.traces.find(x=>x.name==='Military Might').active=false;
 const unit=KT.buildUnit(br);assert.equal(unit.trace('Military Might'),null);
 const chars=[...snapshots.filter(x=>x.name!=='Bronya'),br],team=KT.buildTeam(chars,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const r=C.runBattle(team,cfg(),{},KT.K,KT.setup);
 assert.ok(r.events.every(e=>e.breakdown.dmgSources.every(s=>!s.label.includes('Military Might'))));
});
test('Jing Yuan without Battalia Crush still executes Lightning-Lord attacks',()=>{
 const chars=JSON.parse(JSON.stringify(snapshots));
 const jy=chars.find(x=>x.name==='Jing Yuan');
 jy.traces.find(x=>x.name==='Battalia Crush').active=false;
 const team=KT.buildTeam(chars,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const r=C.runBattle(team,cfg({cycles:2}),{},KT.K,KT.setup);
 assert.ok(r.events.some(x=>x.source==='Lightning-Lord'&&x.damage>0));
});
test('Ability version mismatch fails closed rather than using wrong kit values',()=>{
 const jing=JSON.parse(JSON.stringify(snapshots.find(x=>x.name==='Jing Yuan')));
 jing.abilities.skill.desc='A newer revised skill with different mechanics';
 assert.throws(()=>KT.buildUnit(jing),/Ability version mismatch/);
});
test('Sunday Skill refunds one SP when the target is Beatified',()=>{
 const team=KT.buildTeam(snapshots,['Jing Yuan','Sunday','Bronya','Gallagher']);
 const S=C.newState(cfg(),team);
 for(const t of team)C.addUnit(S,{...t,kind:'ally',energy:0,maxEnergy:t.energyCost,id:t.id});
 S.team=team.map(t=>S.units[t.id]);KT.setup(S,KT.K);
 const sunday=S.units.Sunday;
 KT.K.Sunday.ult.run(S,sunday,'Jing Yuan');
 const act=KT.K.Sunday.actions(S,sunday).find(a=>a.id==='skill');
 const r=act.run(S,sunday,'Jing Yuan');assert.equal(r.gainSP,1);
});
test('Sampled direct-hit damage respects expected crit, DEF, and resistance',()=>{
 const S=C.newState(cfg({enemy:{count:1,level:80,res:.2,resWeak:.2,weaknesses:[],broken:false}}),[]);
 C.addUnit(S,{id:'Dealer',kind:'ally',name:'Dealer',level:80,baseSpd:100,
   snap:{atk:1000,baseAtk:1000,critRate:.5,critDmg:1,spd:100,elementBonus:0}});
 const ev=C.dealDamage(S,{actor:'Dealer',element:'fire',stat:'atk',mult:1,targets:'single',type:'basic'});
 const expected=1000*(1+.5*1)*(.5)*(.8)*(.9);
 assert.ok(Math.abs(ev.damage-expected)<1e-9);
});
test('All 20 legal Jing Yuan centered teams from 7 characters are generated',()=>{
 const pool=Opt.supported(snapshots),all=Array.from(Opt.teams(pool,'Jing Yuan'));
 assert.equal(Opt.countTeams(7,true),20);assert.equal(all.length,20);
 assert.equal(new Set(all.map(x=>x.join('|'))).size,20);
 assert.ok(all.every(x=>x.length===4&&x.includes('Jing Yuan')));
});
test('Bounded policy optimization uses calculated simulated results',()=>{
 const out=Opt.rank(snapshots,cfg({cycles:1}),{locked:'Jing Yuan',maxSimulationsPerTeam:7});
 assert.equal(out.teamsEvaluated,20);assert.equal(out.totalCandidates,20);
 assert.ok(out.verifiedExhaustiveTeams);assert.equal(out.rotationOptimality,'heuristic');
 assert.ok(out.results.every(x=>Number.isFinite(x.damage)&&x.result.events.length>0));
 assert.ok(out.results.every((x,i)=>!i||x.damage<=out.results[i-1].damage));
});
console.log(`\n${n} tests passed — test panels are synthetic; not in-game validation.`);
