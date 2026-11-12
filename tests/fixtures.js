/* Synthetic character panels, with kit parameter anchors transcribed from the
 * supplied continuation transcript. TEST ONLY: not for real damage rankings. */
'use strict';
const defs={
 'Jing Yuan': {id:'1204',element:'lightning',spd:99,max:130,base:[.5],skill:[1,2],ult:[2,3],tal:[60,.66,10,3,.25,10],tech:[3],traces:{'Savant Providence':[15],'War Marshal':[.1,2],'Battalia Crush':[6,.25]}},
 Sunday: {id:'1313',element:'imaginary',spd:96,max:130,base:[.5],skill:[1,.30,2,.5],ult:[.2,.3,3,.12],tal:[.2,3],tech:[.5,2],traces:{'Exalted Sweep':[25],"Rest Day's Longing":[40],'Haven in Palm':[1]}},
 Bronya: {id:'1101',element:'wind',spd:99,max:120,base:[.5],skill:[.66,0,1,1],ult:[.55,.16,.2,2],tal:[.3],tech:[.15,2],traces:{'Military Might':[.1],'Command':[],'Battlefield':[2,.2]}},
 Sparkle:{id:'11306',element:'quantum',spd:101,max:110,base:[.5],skill:[.24,.45,2,.5],ult:[2,6,.06,3,10],tal:[2,.04,2,3],tech:[3,20],traces:{'Nocturne':[.45,.1],'Artificial Flower':[3],'Almanac':[10,1]}},
 Robin: {id:'1309',element:'physical',spd:102,max:160,base:[.5],skill:[.5,3],ult:[.228,90,200,1.2,1,1.5],tal:[.20,2],tech:[15,5],traces:{'Coloratura Cadenza':[.25],'Impromptu Flourish':[.25],'Sequential Passage':[5]}},
 'Fu Xuan':{id:'1208',element:'quantum',spd:100,max:135,base:[.25],skill:[.65,0,3,.06,.12],ult:[1],tal:[.18,.5,.9],tech:[20,2],traces:{'Taiyi, the Macrocosmic':[20],'Dunjia, the Metamystic':[.05,133],'Liuren, the Sexagenary':[]}},
 Gallagher:{id:'1301',element:'fire',spd:98,max:110,base:[.5],skill:[1600],ult:[1.5,2],tal:[.12,640],tech:[2,.5],enh:[3.5,.19,2],traces:{'Organic Yeast':[],'Novel Concoction':[.5,.75],'Bottoms Up':[]}}
};
function build(){
 const p={schema:3,characters:{},lightCones:{},relicSets:{},relicPieces:{}};
 const snapshots=[];
 for(const [name,d] of Object.entries(defs)){
  const abilities={},skills={},order=['basic','skill','ult','tal','tech'];
  for(const [i,k] of order.entries()){
   const typename=['Basic ATK','Skill','Ultimate','Talent','Technique'][i];
   const skillid=d.id+'0'+[1,2,3,4,7][i];
   const text=name+' test ability '+k+' with verified numeric parameter anchors.';
   skills[skillid]={name:k,type:typename,desc:text,params:Array.from({length:k==='tech'?1:15},()=>d[k==='basic'?'base':k])};
   abilities[{'basic':'basic_atk','skill':'skill','ult':'ultimate','tal':'talent','tech':'technique'}[k]]={name:k,level:k==='tech'?1:10,desc:text};
  }
  if(d.enh)skills[d.id+'08']={name:'Nectar Blitz',type:'Basic ATK',desc:'Enhanced Gallagher test',params:Array.from({length:10},()=>d.enh)};
  const traces={};let ix=1;
  for(const [tr,nums] of Object.entries(d.traces))traces[d.id+'1'+ix++]={name:tr,desc:tr,params:nums,variant:0};
  // Sparkle's account snapshot describes the revised 7-digit kit.
  if(name==='Sparkle')for(const t of Object.values(traces))t.variant=1;
  p.characters[name]={id:d.id,name,path:['Bronya','Sunday','Sparkle','Robin'].includes(name)?'Shaman':'Mage',
   element:d.element,energyCost:d.max,baseSpd:d.spd,skills,eidolons:{},eidolonsV1:{},traces};
  snapshots.push({name,id:d.id,element:d.element,level:80,eidolon:0,
    abilities,traces:Object.keys(d.traces).map(name=>({name,active:true})),
    stats:{atk:2500,baseAtk:1100,critRate:.5,critDmg:1.2,spd:d.spd,hp:3500,baseHp:2000,elementBonus:.4},
    lightCone:null,relicSets:[]});
 }
 return {p,snapshots};
}
module.exports={build};
