'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('./combat-engine.js');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/combat-data.js','utf8'),context);
const chars=context.window.HSR_COMBAT_SNAPSHOT.characters;
const c=n=>chars.find(x=>x.name===n);
const near=(actual,expected,tol=1e-7)=>assert(Math.abs(actual-expected)<tol,`Expected ${expected} but received ${actual}`);
assert.equal(chars.length,67);
assert.equal(new Set(chars.map(c=>c.id)).size,67);
assert.equal(chars.filter(c=>E.parseBasic(c.abilities.basic_atk.desc).supported).length,66);
assert.equal(E.parseBasic(c('Aeon ★ Aha').abilities.basic_atk.desc).supported,false);
for(const [n,stat] of [['Castorice','hp'],['Pearl','def'],['Acheron','atk']])assert.equal(E.parseBasic(c(n).abilities.basic_atk.desc).stat,stat);
const atk={level:80,stats:{atk:1000,hp:2000,def:900,elementBonus:0,critRate:0.5,critDmg:1}};
const hit={supported:true,stat:'atk',scale:1,element:'ice'};
const e={level:80,resistance:0.2,broken:false};
const base=E.calculateHit(atk,hit,e,{},'noncrit');
near(base.damage,1000*.5*.8*.9); // same level, 50% defense, 20% RES, 10% toughness mitigation
near(E.calculateHit(atk,hit,e,{},'expected').damage,base.damage*1.5);
near(E.calculateHit(atk,hit,e,{},'crit').damage,base.damage*2);
near(E.calculateHit(atk,hit,{...e,broken:true},{},'noncrit').damage,1000*.5*.8);
near(E.calculateHit(atk,hit,e,{defShred:1},'noncrit').damage,1000*.8*.9);
near(E.calculateHit(atk,hit,e,{defShred:.7,defIgnore:.6},'noncrit').damage,1000*.8*.9); // capped at 100%
near(E.calculateHit(atk,hit,e,{atkPct:.5,dmgBonus:.2},'noncrit').damage,1500*1.2*.5*.8*.9);
const baseAtkTest={level:80,stats:{atk:2000,baseAtk:1000,elementBonus:0,critRate:0,critDmg:0}};
near(E.calculateHit(baseAtkTest,hit,e,{atkPct:.4},'noncrit').formula.scalingValue,2400); // 40% multiplies base ATK not final ATK
const hh=E.parseBasic(c('Castorice').abilities.basic_atk.desc);
near(E.calculateHit(c('Castorice'),hh,{level:95,resistance:0.2}).formula.base,c('Castorice').stats.hp*.35);
// Explicit test for source-character availability and unlocked trace gating.
const a=E.getConditionalBuffs([c('Firefly'),c('Ruan Mei'),c('Fugue'),c('Lingsha')],c('Firefly'),{ruanSkill:true,ruanUltimate:true});
near(a.buff.dmgBonus,.68);near(a.buff.resPen,.25);near(a.buff.defIgnore,.2); // E2 Ruan Mei has E1
const brokenBuff=E.getConditionalBuffs([c('Firefly'),c('Ruan Mei')],c('Firefly'),{},{broken:true});near(brokenBuff.buff.atkPct,.4); // Ruan Mei E2 applies only against broken enemy
const unbrokenBuff=E.getConditionalBuffs([c('Firefly'),c('Ruan Mei')],c('Firefly'),{},{broken:false});near(unbrokenBuff.buff.atkPct,0);
const noAsta=E.getConditionalBuffs([c('Firefly'),c('Asta')],c('Firefly'),{});
near(noAsta.buff.dmgBonus,0); // Asta's Ignite Trace is not unlocked in this account snapshot
const silver=E.getConditionalBuffs([c('Acheron'),c('Pela'),c('Silver Wolf'),c('Gallagher')],c('Acheron'),{pelaUltimate:true,wolfUltimate:true});
near(silver.buff.defShred,.42+.45);near(silver.buff.otherMultiplier,1.6);
const single=E.simulateBasics([c('Acheron'),c('Pela'),c('Silver Wolf'),c('Gallagher')],{level:95,resistance:.2},{cycles:5});
assert.equal(single.byCycle.length,5);assert(single.events.length>0);assert(single.total>0);
near(single.total,single.byCycle.reduce((a,b)=>a+b,0),1e-6);
assert(single.events.every(x=>x.cycle>=1&&x.cycle<=5&&x.damage>0));
assert(single.events.every((x,i,a)=>!i||x.time>=a[i-1].time));
assert(E.candidates(chars,'all').length>=8);
assert(E.candidates(chars,'break').some(x=>x.characters[0].name==='Firefly'));
assert(E.candidates(chars,'dot').some(x=>x.characters[0].name==='Kafka'));
assert(E.candidates(chars,'break').every(x=>new Set(x.characters.map(c=>c.id)).size===4));
assert(!E.candidates(chars,'break').some(x=>x.score)); // no unsupported DPS score
console.log('PASS: 67 roster entries, scaling extraction, HP/DEF/ATK direct-hit, expected CRIT, DEF/RES/toughness, Ruan E1+Trace, Pel/SW shred, trace activation guard, event timeline, roster-only candidate composition.');
