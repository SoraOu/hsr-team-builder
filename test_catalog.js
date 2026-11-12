// Browser-free smoke tests for reference browser and download catalog handling.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const raw=fs.readFileSync(__dirname+'/catalog.js','utf8');
const names=['paths','elements','properties','characters','character_ranks','character_skills','character_skill_trees','character_promotions','light_cones','light_cone_ranks','light_cone_promotions','relics','relic_sets','relic_main_affixes','relic_sub_affixes'];
const tables=Object.fromEntries(names.map(n=>[n,{}]));
tables.paths.Rogue={name:'The Hunt'};
tables.characters['1001']={id:'1001',name:'March 7th',path:'Rogue',element:'Ice',rarity:4,skills:['100101'],ranks:['100101'],skill_trees:['1001101']};
tables.character_skills['100101']={id:'100101',name:'Frigid Cold Arrow',desc:'Deals #1[i]% of ATK.',type_text:'Basic ATK',params:[[.5],[.6]]};
tables.character_ranks['100101']={id:'100101',rank:1,name:'Memory of You',desc:'Regenerate 6 energy.'};
tables.character_skill_trees['1001101']={name:'Trace bonus',desc:'Gain 20%.',anchor:'Point06'};
tables.character_promotions['1001']={values:[{hp:{base:144,step:7.2},atk:{base:69.6,step:3.48}}]};
tables.light_cones['20000']={id:'20000',name:'Arrows',rarity:3,path:'Rogue'};
tables.light_cone_ranks['20000']={skill:'Crisis',desc:'CRIT Rate increases by #1[i]%.',params:[[.12],[.15],[.18],[.21],[.24]]};
tables.relic_sets['101']={id:'101',name:'Passerby of Wandering Cloud',desc:['Healing +10%.','Regain 1 SP at battle start.'],properties:[[],[]]};
tables.relics['31011']={id:'31011',name:'Test Piece',set_id:'101',rarity:5,type:'HEAD',max_level:15};
const bundle={info:{version:'4.7.0',timestamp:1794413023},tables};
function el(id){return {id,textContent:'',value:'',dataset:{},innerHTML:'',disabled:false,listeners:{},addEventListener(ev,f){this.listeners[ev]=f},querySelectorAll(sel){if(sel==='button[data-key]'){const keys=[...this.innerHTML.matchAll(/data-key="([^"]+)"/g)];return keys.map(k=>({dataset:{key:k[1]},classList:{toggle(){}} ,addEventListener(ev,fn){this.click=fn}}))}return []},classList:{toggle(){}}}}
let elements={};for(const id of ['rosterData','catalogStatus','catalogSync','catalogKind','catalogSearch','catalogList','catalogDetail','catalogInfo','catalogCounts','catalogResultCount','catalogClear'])elements[id]=el(id);
elements.rosterData.textContent=JSON.stringify({characters:[{id:1001,name:'March 7th',lvl:80,eidolon:2}]});
elements.catalogKind.value='characters';
let ctx={window:{HSR_GAME_DATA:bundle,DAMAGE_LAB_CONES:[]},document:{getElementById:id=>elements[id]},console,Date,Number,String,Array,Object,Promise,Map,Math};
vm.createContext(ctx);vm.runInContext(raw,ctx);
assert(elements.catalogStatus.textContent.includes('4.7.0'));
assert(elements.catalogCounts.innerHTML.includes('Characters'));
assert(elements.catalogList.innerHTML.includes('March 7th'));
assert(elements.catalogDetail.innerHTML.includes('Frigid Cold Arrow'));
assert(elements.catalogDetail.innerHTML.includes('50%'));
assert(elements.catalogDetail.innerHTML.includes('Memory of You'));
elements.catalogKind.value='light_cones';elements.catalogKind.listeners.change();
assert(elements.catalogList.innerHTML.includes('Arrows'));
assert(elements.catalogDetail.innerHTML.includes('12%'));
elements.catalogKind.value='relic_sets';elements.catalogKind.listeners.change();
assert(elements.catalogDetail.innerHTML.includes('Regain 1 SP'));
elements.catalogKind.value='relics';elements.catalogKind.listeners.change();
assert(elements.catalogDetail.innerHTML.includes('Test Piece'));
assert(!/actual team DPS ranking/.test(elements.catalogDetail.innerHTML));
console.log('PASS: catalog adapter, lists, skill multipliers, Eidolons, Light Cone S1–S5, Relic sets and pieces');

// Regression: the old two `...affixs.json` paths returned HTTP 404.
// Exercise the actual Sync button handler using a deterministic mock of the 15 upstream files.
const requests=[];
ctx.fetch=async url=>{
  requests.push(url);
  const file=url.slice(url.lastIndexOf('/')+1);
  if(file==='info.json')return {ok:true,json:async()=>bundle.info};
  const name=file.slice(0,-5);
  assert(names.includes(name),`Unexpected catalog download: ${file}`);
  return {ok:true,json:async()=>tables[name]};
};
elements.catalogKind.value='characters';
elements.catalogSync.listeners.click().then(()=>{
  assert(requests.some(u=>u.endsWith('/relic_main_affixes.json')));
  assert(requests.some(u=>u.endsWith('/relic_sub_affixes.json')));
  assert(!requests.some(u=>u.endsWith('/relic_main_affixs.json')||u.endsWith('/relic_sub_affixs.json')));
  assert.strictEqual(requests.length,17); // 15 tables + 2 metadata reads
  assert(elements.catalogStatus.textContent.includes('Ready'),elements.catalogStatus.textContent);
  assert.strictEqual(elements.catalogStatus.dataset.error,'false');
  assert(!elements.catalogSync.disabled);
  console.log('PASS: online sync fetches all 15 correct filenames and accepts valid catalog');
}).catch(e=>{console.error(e);process.exitCode=1});
