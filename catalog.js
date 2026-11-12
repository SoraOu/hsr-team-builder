/* HSR Damage Lab v0.4.1 — StarRailRes catalog adapter.
 * It imports reference DATA only; it does not execute descriptions as combat mechanics.
 */
(()=>{
'use strict';
const ROOT='https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/';
const TABLES=['paths','elements','properties','characters','character_ranks','character_skills','character_skill_trees','character_promotions','light_cones','light_cone_ranks','light_cone_promotions','relics','relic_sets','relic_main_affixes','relic_sub_affixes'];
const $=id=>document.getElementById(id);
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const OWNED=new Map((JSON.parse($('rosterData').textContent).characters||[]).map(c=>[String(c.id),c]));
let catalog=null,selected=null;
const status=$('catalogStatus'), syncButton=$('catalogSync'), selector=$('catalogKind'), search=$('catalogSearch'),list=$('catalogList'), detail=$('catalogDetail');
const info=$('catalogInfo'),counts=$('catalogCounts');
const cats={characters:'Characters',light_cones:'Light Cones',relic_sets:'Relic / Planar Sets',relics:'Individual Relics'};
function stamp(t){if(!t)return 'unknown';try{return new Date(t*1000).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}catch(e){return 'unknown'}}
function count(t){return Object.keys(catalog?.tables?.[t]||{}).length}
function setStatus(s,error=false){status.textContent=s;status.dataset.error=String(error)}
function sanity(data){
 if(!data||typeof data!=='object'||!data.tables||!data.info)throw Error('Invalid catalog bundle');
 for(const name of TABLES)if(!data.tables[name]||typeof data.tables[name]!=='object'||Array.isArray(data.tables[name]))throw Error('Missing required table: '+name);
 if(!Object.keys(data.tables.characters).length||!Object.keys(data.tables.character_skills).length||!Object.keys(data.tables.light_cones).length||!Object.keys(data.tables.relic_sets).length)throw Error('Catalog tables are empty');
}
function renderMeta(){
 info.textContent=`Source: StarRailRes · game-data version ${catalog.info.version||'unidentified'} · upstream ${stamp(catalog.info.timestamp)} · 15 English tables · reference data, not verified mechanics`;
 const vals=[['Characters',count('characters')],['Skills',count('character_skills')],['Eidolons',count('character_ranks')],['Light Cones',count('light_cones')],['Relic Sets',count('relic_sets')],['Relic Pieces',count('relics')]];
 counts.innerHTML=vals.map(([k,v])=>`<div class="catalog-metric"><b>${v.toLocaleString()}</b><small>${html(k)}</small></div>`).join('');
}
function selectCatalog(bundle,source){sanity(bundle);catalog=bundle;renderMeta();setStatus(`Ready — ${catalog.info.version||'unknown version'} (${source})`);renderList();}
function openDatabase(){return new Promise((res,rej)=>{if(!window.indexedDB)return rej(Error('IndexedDB unavailable'));const request=indexedDB.open('hsr-damage-lab-catalog',1);request.onupgradeneeded=()=>request.result.createObjectStore('store');request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error)})}
async function saveBundle(bundle){const db=await openDatabase();await new Promise((res,rej)=>{const t=db.transaction('store','readwrite');t.objectStore('store').put(bundle,'latest');t.oncomplete=res;t.onerror=()=>rej(t.error)});db.close()}
async function getBundle(){const db=await openDatabase();const result=await new Promise((res,rej)=>{const t=db.transaction('store','readonly'),r=t.objectStore('store').get('latest');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return result}
async function retrieveJSON(url){const result=await fetch(url,{cache:'no-store'});if(!result.ok)throw Error(`${result.status} fetching ${url.split('/').pop()}`);return result.json()}
async function synchronize(){
 syncButton.disabled=true;setStatus('Checking StarRailRes version…');
 try{
  const info=await retrieveJSON(ROOT+'info.json');
  const tables={};let n=0;
  // Small batches avoid overwhelming the static host and show real progress.
  for(let pos=0;pos<TABLES.length;pos+=3){
   const names=TABLES.slice(pos,pos+3);
   const responses=await Promise.all(names.map(n=>retrieveJSON(ROOT+'index_new/en/'+n+'.json')));
   names.forEach((name,i)=>{tables[name]=responses[i];n++});setStatus(`Downloading game-data tables… ${n}/${TABLES.length}`);
  }
  const confirm=await retrieveJSON(ROOT+'info.json');
  if(confirm.timestamp!==info.timestamp||confirm.version!==info.version)throw Error('Upstream version changed during sync. Please retry for a consistent snapshot.');
  const bundle={info,source:'Mar-7th/StarRailRes',syncedAt:new Date().toISOString(),tables};
  sanity(bundle);selectCatalog(bundle,'downloaded just now');
  try{await saveBundle(bundle);setStatus(`Ready — ${info.version} (saved in this browser)`)}catch(e){setStatus(`Ready — ${info.version}; offline browser storage unavailable. Use sync_catalog.ps1 for a permanent local copy.`)}
 }catch(e){setStatus('Sync failed: '+e.message,true)}finally{syncButton.disabled=false}
}
function fmtParams(text,values=[]){return String(text??'').replace(/#(\d+)\[(\w+)\](%?)/g,(whole,num,type,percent)=>{const value=values[Number(num)-1];if(value==null||!Number.isFinite(Number(value)))return whole;let v=Number(value)*(percent?100:1);return `${Number(v.toFixed(4)).toLocaleString('en-US',{maximumFractionDigits:4})}${percent}`})}
function tag(s){return `<span class="catalog-tag">${html(s)}</span>`}
function section(title,content){return `<section class="catalog-detail-section"><h4>${html(title)}</h4>${content}</section>`}
function entry(title,description,meta=''){return `<div class="catalog-entry"><div class="catalog-entry-title">${html(title)}</div>${meta?`<div class="catalog-entry-meta">${meta}</div>`:''}<p>${html(description)}</p></div>`}
function descWithValues(text,params,index){const v=params?.[index];return fmtParams(text,v||[])}
function detailCharacter(c){
 const t=catalog.tables;const owned=OWNED.get(String(c.id)),path=t.paths[c.path]?.name||c.path;
 let out=`<div class="catalog-detail-head"><div><h3>${html(c.name)}</h3><p>${tag(c.rarity+'★')}${tag(c.element)}${tag(path)}${owned?tag('Owned · E'+owned.eidolon+' · Lv.'+owned.lvl):tag('Not in imported roster')}</p></div></div>`;
 const prom=t.character_promotions[c.id]?.values||[],lv80=prom[6]||prom.at(-1)||{};
 if(Object.keys(lv80).length){out+=section('Base stat progression · last ascension',`<div class="catalog-inline-stats">${['hp','atk','def','spd','crit_rate','crit_dmg'].map(key=>{let p=lv80[key];if(!p)return '';return `<div><small>${html(key.toUpperCase())}</small><b>${html(p.base)}${p.step?' + '+html(p.step)+'/lv':''}</b></div>`}).join('')}</div><p class="catalog-note">Values above are StarRailRes promotion coefficients, not equipped or in-battle stats. Full ascension table is retained in the imported data.</p>`)}
 const skills=(c.skills||[]).map(id=>t.character_skills[id]).filter(Boolean);if(skills.length){
 out+=section(`Skills (${skills.length})`,skills.map(s=>{
   const max=(s.params||[]).length;
   const defaultLvl=Math.max(1,Math.min(max||1,s.type==='Normal'?6:10));
   const all=max?`<details><summary>All ${max} scaling levels</summary><div class="catalog-level-list">${s.params.map((p,i)=>`<div><b>Lv. ${i+1}</b> ${html(fmtParams(s.desc,p))}</div>`).join('')}</div></details>`:'';
   return `<div class="catalog-entry"><div class="catalog-entry-title">${html(s.name)} <span class="catalog-entry-type">${html(s.type_text||s.type||'Ability')}</span></div><p>${html(descWithValues(s.desc,s.params,defaultLvl-1))}</p><small>Showing catalog level ${defaultLvl}${max?' / '+max:''} (not necessarily your character's Trace level)</small>${all}</div>`
 }).join(''));
 }
 const trace=(c.skill_trees||[]).map(id=>t.character_skill_trees[id]).filter(Boolean).filter(s=>s.name||s.desc||s.params?.length);
 if(trace.length)out+=section(`Named Traces (${trace.length})`,trace.map(s=>entry(s.name||s.anchor||'Trace',descWithValues(s.desc,s.params,0),tag(s.anchor||''))).join(''));
 const ranks=(c.ranks||[]).map(id=>t.character_ranks[id]).filter(Boolean);
 if(ranks.length)out+=section('Eidolons E1–E6',ranks.map(e=>entry(`E${e.rank} · ${e.name}`,e.desc,owned&&owned.eidolon>=e.rank?tag('Unlocked in roster'):tag('Not unlocked in roster'))).join(''));
 return out
}
function detailCone(c){const t=catalog.tables,path=t.paths[c.path]?.name||c.path,r=t.light_cone_ranks[c.id],promo=t.light_cone_promotions[c.id]?.values||[];
 const equipped=window.DAMAGE_LAB_CONES||[];const holders=equipped.filter(x=>String(x.light_cone_id)===String(c.id)).map(x=>x.character+' · S'+x.superimposition);
 let out=`<div class="catalog-detail-head"><h3>${html(c.name)}</h3><p>${tag(c.rarity+'★')}${tag(path)}${holders.length?tag('Equipped: '+holders.join(', ')):''}</p></div>`;
 if(r){out+=section('Light Cone passive · Superimposition 1–5',Array.from({length:5},(_,i)=>entry(`S${i+1} · ${r.skill||'Passive'}`,descWithValues(r.desc,r.params,i),(r.properties?.[i]||[]).map(p=>tag(`${p.type}: ${p.value}`)).join(''))).join(''))}
 if(promo.length){const v=promo.at(-1);out+=section('Final promotion reference values',`<div class="catalog-inline-stats">${['hp','atk','def'].map(key=>`<div><small>${key.toUpperCase()}</small><b>${html(v[key]?.base??'?')} ${v[key]?.step?' + '+html(v[key]?.step)+'/lv':''}</b></div>`).join('')}</div><p class="catalog-note">Stored promotion coefficients; not yet applied in the damage model.</p>`)}
 return out
}
function detailSet(c){return `<div class="catalog-detail-head"><h3>${html(c.name)}</h3><p>${tag('Relic / Planar Ornament set')}</p></div>`+section('Set bonuses',((c.desc||[]).map((s,i)=>entry(c.desc.length===2?(i===0?'2-piece':'4-piece'):'Set effect '+(i+1),s,(c.properties?.[i]||[]).map(p=>tag(`${p.type}: ${p.value}`)).join(''))).join('')))+`<p class="catalog-note">Conditional triggers are reference descriptions; the benchmark calculator does not yet evaluate them.</p>`}
function detailRelic(c){const t=catalog.tables;const set=t.relic_sets[c.set_id];return `<div class="catalog-detail-head"><h3>${html(c.name)}</h3><p>${tag(c.rarity+'★')}${tag(c.type)}${tag(set?.name||'Unknown set')}</p></div>`+section('Slot information',entry('Relic',`Maximum level: ${c.max_level}; main-affix group ${c.main_affix_id}; sub-affix group ${c.sub_affix_id}.`))+(set?section('Set effects',set.desc.map((s,i)=>entry(set.desc.length===2?(i===0?'2-piece':'4-piece'):'Effect',s)).join('')):'')}
function categoryRows(){const key=selector.value;if(!catalog)return [];return Object.values(catalog.tables[key]||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))}
function renderList(){if(!catalog){list.innerHTML='<p class="catalog-note">Sync the official reference catalog to browse it here.</p>';detail.innerHTML='';return}
 const key=selector.value,query=search.value.trim().toLowerCase();const rows=categoryRows().filter(x=>!query||(`${x.name} ${x.id} ${x.element||''} ${x.type||''} ${catalog.tables.paths[x.path]?.name||''}`).toLowerCase().includes(query));
 $('catalogResultCount').textContent=`${rows.length} matching ${cats[key]?.toLowerCase()||'entries'}`;
 list.innerHTML=rows.slice(0,120).map(x=>`<button type="button" class="catalog-list-row ${selected===key+':'+x.id?'selected':''}" data-key="${html(x.id)}"><span>${html(x.name||x.id)}</span><small>${html(key==='characters'?((catalog.tables.paths[x.path]?.name||x.path)+' · '+x.element+' · '+x.rarity+'★'):key==='light_cones'?((catalog.tables.paths[x.path]?.name||x.path)+' · '+x.rarity+'★'):key==='relics'?x.type:'Set #'+x.id)}</small></button>`).join('')||'<p class="catalog-note">No matching records.</p>';
 if(rows.length>120)list.innerHTML+=`<p class="catalog-note">Showing 120 of ${rows.length}. Refine your search to see the rest.</p>`;
 list.querySelectorAll('button[data-key]').forEach(b=>b.addEventListener('click',()=>selectItem(key,b.dataset.key)));
 const wanted=selected?.startsWith(key+':')?selected.split(':').slice(1).join(':'):null;
 if(!wanted||!catalog.tables[key][wanted]){if(rows[0])selectItem(key,rows[0].id,false);else detail.innerHTML='';}
}
function selectItem(key,id,rerender=true){if(!catalog)return;const obj=catalog.tables[key]?.[id];if(!obj)return;selected=key+':'+id;
 detail.innerHTML=(key==='characters'?detailCharacter(obj):key==='light_cones'?detailCone(obj):key==='relic_sets'?detailSet(obj):detailRelic(obj));
 if(rerender)list.querySelectorAll('button[data-key]').forEach(b=>b.classList.toggle('selected',b.dataset.key===String(id)));
}
selector.addEventListener('change',()=>{selected=null;renderList()});search.addEventListener('input',renderList);syncButton.addEventListener('click',synchronize);
$('catalogClear').addEventListener('click',()=>{search.value='';renderList()});
// An offline bundle can be generated by sync_catalog.ps1 without any browser CORS/storage requirements.
if(window.HSR_GAME_DATA){try{selectCatalog(window.HSR_GAME_DATA,'local offline bundle')}catch(e){setStatus('Local data error: '+e.message,true)}}
else{setStatus('Not synced — click Download & sync game database.');getBundle().then(saved=>{if(saved&&!catalog)selectCatalog(saved,'browser cache')}).catch(()=>{})}
})();
