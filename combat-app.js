/* HSR Damage Lab v0.5 exploratory Team Finder + basic-only reference simulator.
 * No numeric TEAM DPS rankings are made until all required mechanics are modeled.
 */
(()=>{
'use strict';
const engine=window.HSRCombatEngine, snapshot=window.HSR_COMBAT_SNAPSHOT;
if(!engine||!snapshot){document.getElementById('v05status').textContent='Combat module or roster data did not load.';return}
const chars=snapshot.characters;
const byName=new Map(chars.map(c=>[c.name,c]));
const $=id=>document.getElementById(id);
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const format=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:1});
const colors=['#8cabff','#f5b273','#6fd3be'];
let lists=[], selected=[], lastRuns=[];
let graphMode='cumulative';
const fields=['v05mode','v05enemy','v05res','v05def','v05vuln','v05cycles','v05broken','v05crit','v05ruanSkill','v05ruanUltimate','v05pelaUltimate','v05wolfUltimate'];
function flags(){return {ruanSkill:$('v05ruanSkill').checked,ruanUltimate:$('v05ruanUltimate').checked,pelaUltimate:$('v05pelaUltimate').checked,wolfUltimate:$('v05wolfUltimate').checked}}
function getEnemy(){return {level:Number($('v05enemy').value)||95,resistance:(Number($('v05res').value)||0)/100,defReduction:(Number($('v05def').value)||0)/100,vulnerability:(Number($('v05vuln').value)||0)/100,broken:$('v05broken').checked}}
function opts(){return {cycles:Math.max(1,Math.min(15,Number($('v05cycles').value)||5)),critMode:$('v05crit').value,activeEffects:flags()}}
function createCandidates(){
 lists=engine.candidates(chars,$('v05mode').value);
 const root=$('v05candidates');
 root.innerHTML=lists.length?lists.map((x,i)=>`<article class="v05-candidate"><h4>${html(x.name)}</h4><div class="v05-chips">${x.characters.map(c=>`<span class="v05-chip">${html(c.name)} · E${c.eidolon}</span>`).join('')}</div><p>${html(x.reason)}</p><button class="btn v05-use" data-idx="${i}">Use as comparison team</button></article>`).join(''):'<p>No complete template found for this category from the current roster. This does not mean no viable team exists.</p>';
 $('v05candidateCount').textContent=`${lists.length} roster-compatible templates. NOT a power ranking; absent combinations may be stronger.`;
 root.querySelectorAll('.v05-use').forEach(b=>b.addEventListener('click',()=>{
  const team=lists[Number(b.dataset.idx)].characters;
  const slot=selected.length<3?selected.length:0;
  selected[slot]=team;
  renderSelected();renderGraph();
  $('v05selected').scrollIntoView({behavior:'smooth',block:'center'});
 }));
}
function renderSelected(){
 const all=chars.map(c=>`<option value="${c.id}">${html(c.name)} · E${c.eidolon}</option>`).join('');
 $('v05selected').innerHTML=Array.from({length:3},(_,i)=>{
  const team=selected[i]||[];
  return `<div class="v05-line"><label><span class="dot" style="background:${colors[i]}"></span> Comparison ${i+1}</label>${Array.from({length:4},(_,j)=>{
   const value=team[j]?.id;
   return `<select aria-label="Comparison ${i+1} slot ${j+1}" class="v05-slot" data-team="${i}" data-slot="${j}">${all.replace(`value="${value}"`,`value="${value}" selected`)}</select>`;
  }).join('')}<small>Only the direct first-hit Basic ATK reference is plotted. No skill rotation or real team DPS.</small></div>`;
 }).join('');
 $('v05selected').querySelectorAll('.v05-slot').forEach(sel=>sel.addEventListener('change',()=>{
  const i=Number(sel.dataset.team),j=Number(sel.dataset.slot);selected[i][j]=chars.find(c=>String(c.id)===sel.value);renderGraph();
 }));
}
function chartSvg(runs){
 const W=940,H=325,l=73,r=18,t=22,b=43;const n=runs[0].byCycle.length;
 const vals=runs.flatMap(q=>graphMode==='cumulative'?q.cumulative:q.byCycle);
 const max=Math.max(1,...vals)*1.1;
 const x=i=>l+(W-l-r)*(n===1?.5:i/(n-1)),y=v=>H-b-(H-b-t)*v/max;
 let s='';for(let k=0;k<=4;k++){
  const v=k*max/4,yy=y(v);s+=`<line x1="${l}" x2="${W-r}" y1="${yy}" y2="${yy}" stroke="#304360"/><text x="${l-9}" y="${yy+4}" font-size="12" fill="#b3c2de" text-anchor="end">${html(format(v))}</text>`
 }
 for(let i=0;i<n;i++)s+=`<text x="${x(i)}" y="${H-13}" font-size="12" fill="#adbbd3" text-anchor="middle">${i+1}</text>`;
 runs.forEach((q,i)=>{
  const v=graphMode==='cumulative'?q.cumulative:q.byCycle;
  const d=v.map((z,j)=>(j?'L':'M')+x(j)+','+y(z)).join(' ');
  s+=`<path d="${d}" stroke="${colors[i]}" fill="none" stroke-width="3" stroke-linejoin="round"/>`;
  v.forEach((z,j)=>s+=`<circle cx="${x(j)}" cy="${y(z)}" r="4" fill="${colors[i]}"/>`);
 });
 s+=`<text x="${W/2}" y="${H-1}" fill="#b0c2df" font-size="11" text-anchor="middle">HSR cycle windows · AV-based basic-only reference</text>`;
 return s;
}
function renderGraph(){
 let err='';selected.forEach((arr,i)=>{
  if(!arr||arr.length!==4||new Set(arr.map(c=>c?.id)).size!==4)err+='Comparison '+(i+1)+' must contain 4 distinct characters. ';});
 if(err){$('v05status').textContent=err;$('v05chart').innerHTML='';$('v05events').innerHTML='';return}
 const enemy=getEnemy(),options=opts();
 const runs=selected.map(team=>engine.simulateBasics(team,enemy,options));lastRuns=runs;
 $('v05status').textContent=`Model ran: ${options.cycles} cycle(s), ${enemy.level}-level enemy. IMPORTANT: NOT full combat DPS; all conditional flags assume effects are active for each modeled hit.`;
 $('v05chart').innerHTML=chartSvg(runs);
 $('v05summary').innerHTML=runs.map((r,i)=>`<div class="v05-result"><small style="color:${colors[i]}">Comparison ${i+1} · Basic-only reference</small><strong>${format(r.total)}</strong><p>${r.events.length} modeled direct hits · ${r.coverage} first-hit definitions supported</p><p>Opening window: ${format(r.byCycle[0])} · Final cycle: ${format(r.byCycle.at(-1))}</p></div>`).join('');
 let all=[];runs.forEach((r,i)=>r.events.forEach((e,j)=>all.push({...e,team:i,idx:j})));
 all.sort((a,b)=>a.time-b.time||a.team-b.team);
 $('v05events').innerHTML=all.slice(0,100).map(ev=>`<tr class="v05-event" tabindex="0" data-team="${ev.team}" data-idx="${ev.idx}"><td>${ev.time.toFixed(1)}</td><td>${ev.cycle}</td><td style="color:${colors[ev.team]}">${ev.team+1}</td><td>${html(ev.character)}</td><td class="right">${format(ev.damage)}</td></tr>`).join('');
 $('v05events').querySelectorAll('.v05-event').forEach(el=>{
  const show=()=>showBreakdown(Number(el.dataset.team),Number(el.dataset.idx));
  el.addEventListener('click',show);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show()}})
 });
 $('v05caveats').textContent=[...new Set(runs.flatMap(q=>q.caveats))].join('  •  ');
 if(all.length)showBreakdown(all[0].team,all[0].idx);
 else $('v05breakdown').textContent='No supported basic direct hits in current teams.';
}
function showBreakdown(team,i){
 const ev=lastRuns[team]?.events[i];if(!ev)return;
 const f=ev.formula;
 $('v05breakdown').textContent=[
  `Comparison ${team+1} · ${ev.character} · Cycle ${ev.cycle} · ${ev.time.toFixed(2)} AV`,
  `Source: current equipped character snapshot; original Light Cone/Relic stats already included in final stats`,
  `Base: ${format(f.scalingValue)} ${f.scalingStat.toUpperCase()} × ${(f.multiplier*100).toFixed(1)}% = ${format(f.base)}`,
  `Crit expectation: ${f.crit.toFixed(6)} (CR ${format(f.critRate*100)}% / CD ${format(f.critDmg*100)}%)`,
  `Element + DMG%: ${f.bonus.toFixed(6)} · DEF: ${f.defMult.toFixed(6)} (${format(f.defReduction*100)}% shred/ignore)`,
  `RES: ${f.resMult.toFixed(6)} (${format(f.resistance*100)}% effective) · Vulnerability: ${f.vuln.toFixed(6)}`,
  `Toughness: ${f.toughness.toFixed(2)} · Other: ${f.other.toFixed(3)}`,
  `= ${format(ev.damage)} expected DIRECT-HIT ONLY`,'',
  ev.modifiers.length?'Activated buffs/debuffs (assumed active for this hit): '+ev.modifiers.join(' | '):'No supported team-buff state was activated for this hit.',
  ev.partial?'NOTE: Only first direct-hit component was modeled.':'',
  'Not included: unmodeled passives, conditional equipment effects, extra damage, DoT, FUA, Super Break, summons, True DMG, Elation, actual rotations.'
 ].filter(Boolean).join('\n');
}
function start(){
 $('jumpTeamFinder').addEventListener('click',()=>{$('teamExplorer').scrollIntoView({behavior:'smooth',block:'start'})});
 selected=[
  ['Acheron','Pela','Silver Wolf','Gallagher'],
  ['Firefly','Ruan Mei','Fugue','Lingsha'],
  ['The Herta','Herta','Robin','Huohuo']
 ].map(team=>team.map(name=>byName.get(name)));
 createCandidates();renderSelected();renderGraph();
 $('v05mode').addEventListener('change',createCandidates);
 for(const id of fields.filter(x=>x!=='v05mode'))$(id).addEventListener('change',renderGraph);
 $('v05chartCumulative').addEventListener('click',()=>{graphMode='cumulative';$('v05chartCumulative').classList.add('active');$('v05chartCycle').classList.remove('active');renderGraph()});
 $('v05chartCycle').addEventListener('click',()=>{graphMode='cycle';$('v05chartCycle').classList.add('active');$('v05chartCumulative').classList.remove('active');renderGraph()});
 $('v05export').addEventListener('click',()=>{
  const output={warning:'Basic-only direct-hit reference; NOT full combat simulation or accurate team ranking',source:snapshot.source,enemy:getEnemy(),scenario:opts(),teams:selected.map((t,i)=>({name:'Comparison '+(i+1),characters:t.map(c=>c.name),result:lastRuns[i]}))};
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='hsr-damage-lab-v05-reference.json';a.click();URL.revokeObjectURL(url)
 });
}
start();
})();
