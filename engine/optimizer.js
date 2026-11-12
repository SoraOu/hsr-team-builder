/* Exhaustive 4-slot enumeration over the supported pool; heuristic, bounded
 * policy search for skill targeting, SP reservation, and Ultimate timing.
 * No predetermined synergy values or team templates. */
(function(root,factory){
 const m=factory(typeof require==='function'?require('./core.js'):root.HSRCore,
   typeof require==='function'?require('./kits.js'):root.HSRKits);
 if(typeof module==='object'&&module.exports)module.exports=m;
 if(root)root.HSROptimizer=m;
})(typeof globalThis==='object'?globalThis:null,function(C,KT){
'use strict';
function* choose(array,k,start=0,acc=[]){
 if(!k){yield acc.slice();return}
 for(let i=start;i<=array.length-k;i++)yield* choose(array,k-1,i+1,[...acc,array[i]]);
}
function* teams(roster,locked){
 const unique=[...new Set(roster)],n=4;
 if(locked){if(!unique.includes(locked))throw new Error('Locked character is not in supported account roster');
  for(const rest of choose(unique.filter(x=>x!==locked),n-1))yield [locked,...rest];
 }else yield* choose(unique,n);
}
function countTeams(n,locked){const k=locked?3:4,N=locked?n-1:n;
 if(N<k)return 0;let x=1;for(let i=1;i<=k;i++)x=x*(N-i+1)/i;return Math.round(x);
}
function supported(snapshot){return [...new Set(snapshot.filter(x=>KT.P.characters[x.name]).map(x=>x.name))]}
function genomeKey(g){return JSON.stringify([g.skillGate,g.skillTarget,g.ultTarget,g.ultWait])}
function baseline(){return {skillGate:{},skillTarget:{},ultTarget:{},ultWait:{}}}
function evaluate(team,cfg,g){return C.runBattle(team,cfg,g,KT.K,KT.setup)}
function optimizeOne(team,cfg,opts={}){
 const budget=opts.maxSimulationsPerTeam||90;
 const memo=new Map();let searches=0;
 const first=baseline();
 function run(g){const key=genomeKey(g);if(memo.has(key))return memo.get(key);
  if(searches>=budget)return null;
  const res=evaluate(team,cfg,g);searches++;memo.set(key,res);return res;}
 let best=first,bestOut=run(first);
 // Multiple real-rotation entry policies; all comparisons use the same encounter.
 const starts=[...team.map(u=>({u:u.id,gate:8})),...team.map(u=>({u:u.id,gate:2}))];
 for(const v of starts){const g=baseline();g.skillGate[v.u]=v.gate;
  const out=run(g);if(out&&out.total>bestOut.total){best=g;bestOut=out}}
 let improved=true,passes=0;
 while(improved&&passes++<3&&searches<budget){
  improved=false;
  for(const unit of team){
   const uid=unit.id;
   for(const [gene,values] of [
    ['skillGate',[0,1,2,3,4,6,8]],
    ['skillTarget',[0,1,2,3]],
    ['ultTarget',[0,1,2,3]],
    ['ultWait',[0,1,2]],
   ]){
    if(searches>=budget)break;
    for(const value of values){
     if((best[gene][uid]||0)===value)continue;
     const g={skillGate:{...best.skillGate},skillTarget:{...best.skillTarget},ultTarget:{...best.ultTarget},ultWait:{...best.ultWait}};
     g[gene][uid]=value;
     const out=run(g);
     if(out&&out.total>bestOut.total+1e-7){best=g;bestOut=out;improved=true}
    }
   }
  }
 }
 return {result:bestOut,policy:best,simulations:searches};
}
function rank(snapshot,cfg,options={}){
 const pool=(options.pool||supported(snapshot)).filter(n=>KT.P.characters[n]&&snapshot.some(x=>x.name===n));
 const totalCandidates=countTeams(pool.length,!!options.locked);
 if(!totalCandidates)throw new Error('At least 4 supported characters (including locked DPS) are required');
 if((options.maxTeams??Infinity)<totalCandidates)throw new Error('Subset team search would not be exhaustive; increase maxTeams');
 const rows=[];
 for(const names of teams(pool,options.locked)){
  const team=KT.buildTeam(snapshot,names,options.buildOptions);
  const r=optimizeOne(team,cfg,options);
  rows.push({names,damage:r.result.total,burst:r.result.burst,byCycle:r.result.byCycle,contrib:r.result.contrib,
   flags:[...new Set([...r.result.flags,'Enemy attacks, damage taken, enemy HP, Break, DoT, survival, and random targeting are not simulated.'])],
   policy:r.policy,simulations:r.simulations,result:r.result,validation:'partial',optimality:'best found by bounded policy search; not a mathematical global optimum'});
  if(options.onProgress)options.onProgress(rows.length,totalCandidates);
 }
 rows.sort((a,b)=>b.damage-a.damage);
 return {teamsEvaluated:rows.length,totalCandidates,scenario:cfg,verifiedExhaustiveTeams:rows.length===totalCandidates,
  rotationOptimality:'heuristic',results:rows};
}
return {choose,teams,countTeams,supported,baseline,optimizeOne,rank};
});
