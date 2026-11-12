#!/usr/bin/env node
/* CLI for the account's original combat-data.js. Requires generated params.js. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const appRoot=path.join(__dirname,'..');
function arg(k,d){const i=process.argv.indexOf('--'+k);return i>=0?process.argv[i+1]:d}
const params=path.join(appRoot,'engine','params.js');
if(!fs.existsSync(params)){console.error('Missing engine/params.js. Run: node tools/build-params.js');process.exit(2)}
const snapshot=path.join(appRoot,'combat-data.js');
if(!fs.existsSync(snapshot)){
 console.error('combat-data.js is missing. Copy the continuation files into the existing hsr-team-builder repository.');process.exit(2);
}
const Opt=require('../engine/optimizer.js');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(snapshot,'utf8'),context,{filename:'combat-data.js'});
const chars=context.window.HSR_COMBAT_SNAPSHOT?.characters||[];
const cycles=Number(arg('cycles','5')),count=Number(arg('enemies','1'));
const cfg={cycles,critMode:'expected',techniques:arg('techniques','true')!=='false',startSP:3,
  enemy:{count,level:Number(arg('enemy-level','95')),res:.2,resWeak:0,weaknesses:['lightning'],broken:false}};
const report=Opt.rank(chars,cfg,{locked:arg('locked','Jing Yuan'),maxSimulationsPerTeam:Number(arg('budget','80'))});
const target=path.resolve(arg('output','team-optimizer-results.json'));
fs.writeFileSync(target,JSON.stringify(report,null,2));
console.log('Partial model; not an accurate real-game ranking.');
console.log('Evaluated',report.teamsEvaluated,'of',report.totalCandidates,'legal supported teams.');
for(const [i,r] of report.results.slice(0,10).entries())console.log(String(i+1).padStart(2),r.names.join(' + '),Math.round(r.damage).toLocaleString());
console.log('Saved',target);
