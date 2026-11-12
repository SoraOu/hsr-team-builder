#!/usr/bin/env node
/* Source: Mar-7th/StarRailRes, index_new/en. Generates raw numeric parameters;
 * executable ability logic belongs in engine/kits.js.
 * node tools/build-params.js [--local /path/to/index_new/en] [--revision SHA]
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const ROSTER=['Jing Yuan','Sunday','Bronya','Sparkle','Robin','Fu Xuan','Gallagher'];
const CONES=['Night on the Milky Way',"But the Battle Isn't Over",'Past and Future','Earthly Escapade',"For Tomorrow's Journey",'Day One of My New Life','What Is Real?'];
const SETS=['The Ashblazing Grand Duke',"Sacerdos' Relived Ordeal",'The Wondrous BananAmusement Park','Lushaka, the Sunken Seas','Broken Keel','Messenger Traversing Hackerspace','Thief of Shooting Meteor'];
const FILES=['relics','character_promotions','characters','character_skills','character_skill_trees','character_ranks','light_cones','light_cone_ranks','relic_sets'];
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null};
const revision=arg('--revision')||'master';
const BASE=`https://raw.githubusercontent.com/Mar-7th/StarRailRes/${encodeURIComponent(revision)}/index_new/en/`;
function get(url){return new Promise((ok,fail)=>https.get(url,{headers:{'User-Agent':'hsr-damage-lab'}},r=>{
 if(r.statusCode!==200){r.resume();return fail(new Error(url+' returned '+r.statusCode))}
 let s='';r.setEncoding('utf8');r.on('data',v=>s+=v);r.on('end',()=>ok(s));r.on('error',fail);
}).on('error',fail))}
function requireItem(v,n){if(!v)throw new Error('Missing StarRailRes data: '+n);return v}
async function load(local){const d={};for(const f of FILES)d[f]=JSON.parse(local?fs.readFileSync(path.join(local,f+'.json'),'utf8'):await get(BASE+f+'.json'));return d}
function build(D,revision){
 const out={schema:3,source:'Mar-7th/StarRailRes index_new/en',dataVersion:revision,characters:{},lightCones:{},relicSets:{},relicPieces:{}};
 for(const [id,c] of Object.entries(D.characters)){
   if(!ROSTER.includes(c.name))continue;
   const promo=requireItem(D.character_promotions[id],c.name+' promotions');
   const ch={id,name:c.name,path:c.path,element:c.element,energyCost:c.max_sp,baseSpd:promo.values[6].spd.base,skills:{},eidolons:{},eidolonsV1:{},traces:{}};
   for(const sid of c.skills){const s=requireItem(D.character_skills[sid],c.name+' '+sid);
     ch.skills[sid]={name:s.name,type:s.type_text,desc:s.desc,params:s.params};}
   c.ranks.forEach((rid,i)=>{const r=requireItem(D.character_ranks[rid],rid);
     ch.eidolons[i+1]={name:r.name,desc:r.desc};
     const revised=D.character_ranks['1'+rid];if(revised)ch.eidolonsV1[i+1]={name:revised.name,desc:revised.desc};});
   for(const [tid,t] of Object.entries(D.character_skill_trees)){
     const alt=tid.startsWith('1'+id),base=tid.startsWith(id);
     const rest=alt?tid.slice(id.length+1):base?tid.slice(id.length):null;
     if(!rest||!t.name||rest.length!==3||rest[0]!=='1')continue;
     ch.traces[tid]={name:t.name,desc:t.desc,params:(t.params&&t.params[0])||[],variant:alt?1:0};
   }
   out.characters[c.name]=ch;
 }
 for(const [id,c] of Object.entries(D.light_cones))if(CONES.includes(c.name)){
   const r=requireItem(D.light_cone_ranks[id],c.name+' ranks');
   out.lightCones[c.name]={id,path:c.path,passive:r.skill,desc:r.desc,params:r.params};
 }
 for(const [id,s] of Object.entries(D.relic_sets))if(SETS.includes(s.name))out.relicSets[s.name]={id,desc:s.desc,params:s.properties||null};
 for(const r of Object.values(D.relics)){
   const set=Object.keys(out.relicSets).find(k=>String(out.relicSets[k].id)===String(r.set_id));
   if(set)out.relicPieces[r.name]=set;
 }
 for(const n of ROSTER)requireItem(out.characters[n],n+' character');
 if(Object.keys(out.relicPieces).length<20)throw new Error('Relic piece mapping is incomplete; check source schema');
 return out;
}
(async()=>{
 const local=arg('--local');const D=await load(local);const out=build(D,local?'local-files':revision);
 const data=JSON.stringify(out);out.sha256=crypto.createHash('sha256').update(data).digest('hex');
 const dest=path.join(__dirname,'..','engine','params.js');
 fs.writeFileSync(dest,'/* GENERATED from StarRailRes by tools/build-params.js — do not edit. */\n(function(r,f){const m=f();if(typeof module==="object"&&module.exports)module.exports=m;if(r)r.HSRParams=m})(typeof globalThis==="object"?globalThis:null,function(){return '+JSON.stringify(out)+';});\n');
 console.log('Generated '+dest+' ('+fs.statSync(dest).size+' bytes) | '+Object.keys(out.characters).length+' characters | '+Object.keys(out.relicPieces).length+' pieces');
})().catch(e=>{console.error(e.stack||e.message||e);process.exitCode=1});
