/* StatForge inference. Coefficients, forests and calibration residuals are trained offline. */
(() => {
'use strict';
const mean=(a,fallback=0)=>a.length?a.reduce((s,v)=>s+v,0)/a.length:fallback;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const rate=(rows,stat)=>rows.reduce((s,g)=>s+g[stat],0)/Math.max(1,rows.reduce((s,g)=>s+g.minutes,0));
function features(player,allPlayers,stat,scenario,now=new Date()) {
 const history=(player.history||player.games).filter(g=>new Date(g.date)<=now).slice().sort((a,b)=>a.date.localeCompare(b.date));
 if(history.length<5)throw new Error('At least five prior games are required.');
 const h=history.slice(-10),recent=h.slice(-5),usage=recent.filter(g=>g.usage!=null).map(g=>g.usage),pace=recent.filter(g=>g.pace!=null).map(g=>g.pace);
 const match=history.filter(g=>g.opponent===scenario.opponent).slice(-5);
 const defense=allPlayers.flatMap(p=>(p.history||p.games).filter(g=>g.opponent===scenario.opponent&&g.opponentAllowed!=null&&new Date(g.date)<=now)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-10).map(g=>g.opponentAllowed);
 const absence=recent.filter(g=>Object.keys(g.teammates||{}).length).map(g=>1-mean(Object.values(g.teammates).map(Number)));
 const avgMin=mean(recent.map(g=>g.minutes));
 let absenceLag=mean(absence);
 if(scenario.teammateStatus!=='known'&&scenario.teammate&&player.teammates.length){const known={...history.at(-1).teammates};known[scenario.teammate]=scenario.teammateStatus==='playing';absenceLag=1-mean(Object.values(known).map(Number));}
 const x=[avgMin,mean(h.map(g=>g.minutes)),Math.sqrt(mean(recent.map(g=>(g.minutes-avgMin)**2))),rate(recent,stat),rate(h,stat),mean(usage,25),mean(pace,100),scenario.venue==='home'?1:0,clamp(Number(scenario.restDays),0,7),match.length?rate(match,stat):rate(h,stat),mean(defense,112),scenario.starter==='starter'?1:scenario.starter==='bench'?0:Number(history.at(-1).role==='starter'),absenceLag,Number(!usage.length),Number(!pace.length),Number(player.id==='3975'),Number(player.id==='1966'),Number(player.id==='3112335')];
 return {x,historyCount:history.length,latest:history.at(-1).date,usageAvailable:!!usage.length,paceAvailable:!!pace.length,matchCount:match.length,defenseSample:defense.length,unknownRoles:recent.filter(g=>g.role==='unknown').length};
}
function infer(model,x){
 const ridge=model.minutes;let minutes=ridge.intercept;
 for(let i=0;i<x.length;i++)minutes+=ridge.coef[i]*((x[i]-ridge.mean[i])/ridge.scale[i]);
 let total=0;
 for(const tree of model.production.trees){let node=0;while(tree.left[node]!==-1)node=Math.fround(x[tree.feature[node]])<=tree.threshold[node]?tree.left[node]:tree.right[node];total+=tree.value[node];}
 return {minutes:clamp(minutes,0,48),rate:Math.max(0,total/model.production.trees.length)};
}
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function monteCarlo(prediction,residuals,scenario,line,{draws=20000,seed=2026}={}) {
 if(!residuals.length)throw new Error('Calibration residuals are required.');
 const random=rng(seed),samples=[],cap=clamp(Number(scenario.minutesCap),0,48),prob=clamp(Number(scenario.activeProbability)/100,0,1),pace=clamp(1+Number(scenario.paceAdjustment)/100,.5,1.5),usage=clamp(1+Number(scenario.usageAdjustment)/100,.5,1.5);
 let over=0,under=0,push=0;
 for(let i=0;i<draws;i++){
  const error=residuals[Math.floor(random()*residuals.length)];
  const minutes=clamp(prediction.minutes+error[0],0,cap),production=Math.max(0,prediction.rate+error[1])*pace*usage;
  const total=Math.floor(minutes*production+.5);samples.push(total);
  if(total>line)over++;else if(total<line)under++;else push++;
 }
 samples.sort((a,b)=>a-b);const quantile=q=>samples[Math.floor((samples.length-1)*q)];
 const width=Math.max(1,Math.ceil((quantile(.995)+1)/22)),bins=Array.from({length:Math.ceil((samples.at(-1)+1)/width)},(_,i)=>({from:i*width,to:(i+1)*width,count:0}));
 for(const total of samples)bins[Math.floor(total/width)].count++;
 return {over:over/draws,under:under/draws,push:push/draws,low:quantile(.1),high:quantile(.9),median:quantile(.5),mean:mean(samples),draws,bins,participationProbability:prob,void:1-prob,scope:'Conditional on participation; absence is treated as void, not an under.'};
}
function run(model,player,allPlayers,stat,scenario,line,options){const context=features(player,allPlayers,stat,scenario),prediction=infer(model,context.x);prediction.minutes=Math.min(prediction.minutes,Number(scenario.minutesCap));prediction.rate*=1+Number(scenario.paceAdjustment)/100;prediction.rate*=1+Number(scenario.usageAdjustment)/100;
 // Sample residuals on the unadjusted model scale, then apply scenario multipliers once.
 const base=infer(model,context.x),distribution=monteCarlo(base,model.residuals,scenario,line,options);
 return {context,prediction,projection:prediction.minutes*prediction.rate,distribution};}
const api={features,infer,monteCarlo,run};globalThis.StatForgeEngine=api;if(typeof module!=='undefined')module.exports=api;
})();
