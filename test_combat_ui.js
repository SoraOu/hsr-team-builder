const assert=require('assert'),vm=require('vm'),fs=require('fs');
const engine=require('./combat-engine.js');const snapshot={window:{}};
vm.createContext(snapshot);vm.runInContext(fs.readFileSync(__dirname+'/combat-data.js','utf8'),snapshot);
const elements={};
function stub(id){return elements[id]||=(
 {id,value:'',checked:false,innerHTML:'',textContent:'',dataset:{},listeners:{},addEventListener(evt,cb){this.listeners[evt]=cb},scrollIntoView(){},classList:{add(){},remove(){}},querySelectorAll(sel){
  const html=this.innerHTML;const matches=sel==='.v05-use'?[...html.matchAll(/data-idx="(\d+)"/g)].map(m=>({dataset:{idx:m[1]}})):
    sel==='.v05-slot'?[...html.matchAll(/<select[^>]*data-team="(\d+)"[^>]*data-slot="(\d+)"/g)].map(m=>({dataset:{team:m[1],slot:m[2]},value:''})):
    sel==='.v05-event'?[...html.matchAll(/data-team="(\d+)"[^>]*data-idx="(\d+)"/g)].map(m=>({dataset:{team:m[1],idx:m[2]}})):[];
  return matches.map(m=>({...m,listeners:{},addEventListener(ev,cb){this.listeners[ev]=cb}}));
 }});
}
for(const [id,value] of Object.entries({v05mode:'all',v05enemy:'95',v05res:'20',v05def:'0',v05vuln:'0',v05cycles:'5',v05crit:'expected'}))stub(id).value=value;
const context={window:{HSRCombatEngine:engine,HSR_COMBAT_SNAPSHOT:snapshot.window.HSR_COMBAT_SNAPSHOT},document:{getElementById:stub},console,Math,Number,String,Array,Set,Map,Blob,URL};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/combat-app.js','utf8'),context);
assert(stub('v05candidates').innerHTML.includes('Firefly Break core'));
assert(stub('v05selected').innerHTML.includes('Acheron'));
assert(stub('v05chart').innerHTML.includes('<path'));
assert(stub('v05events').innerHTML.includes('<tr'));
assert(stub('v05breakdown').textContent.includes('DEF:'));
const before=stub('v05summary').innerHTML;
stub('v05pelaUltimate').checked=true;stub('v05pelaUltimate').listeners.change();
assert.notStrictEqual(stub('v05summary').innerHTML,before);
stub('v05mode').value='dot';stub('v05mode').listeners.change();
assert(stub('v05candidates').innerHTML.includes('Kafka DoT core'));
console.log('PASS: v0.5 interface boot, roster candidates, selectors, charts, click-to-explain formulas, reactive enemy buff input and mode filtering');
