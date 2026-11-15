// Binary-contract EV held to settlement, conditional on participation.
export function historicalProbability(games,stat,line){
 const sample=games.filter(g=>Number.isFinite(g[stat])&&g.minutes>0),n=sample.length;
 if(!n)return null;
 const wins=sample.filter(g=>g[stat]>line).length;
 // Jeffreys Beta(1/2,1/2) prior avoids 0%/100% estimates in small samples.
 const probability=(wins+.5)/(n+1),z=1.96,denominator=1+z*z/n;
 const center=(wins/n+z*z/(2*n))/denominator;
 const margin=z*Math.sqrt((wins/n)*(1-wins/n)/n+z*z/(4*n*n))/denominator;
 return {over:probability,under:1-probability,overLow:Math.max(0,center-margin),overHigh:Math.min(1,center+margin),n,wins};
}

export function entryFee(provider,fee,price,quantity){
 if(!fee||!Number.isFinite(price)||price<=0||price>=1||!Number.isInteger(quantity)||quantity<1)return null;
 const rate=fee.rate;
 if(fee.model!=='quadratic'||!Number.isFinite(rate)||rate<0||rate>1)return null;
 const raw=quantity*rate*price*(1-price);
 if(provider==='polymarket')return Math.round(raw*100000)/100000;
 if(provider==='kalshi'){
  // Published schedule rounds fee + position cost upward to a centicent.
  const cost=quantity*price;
  return Math.ceil((cost+raw)*10000-1e-8)/10000-cost;
 }
 return null;
}

export function contractEV({probability,low,high,price,quantity,provider,fee}){
 if(![probability,low,high].every(p=>Number.isFinite(p)&&p>=0&&p<=1))return null;
 const fees=entryFee(provider,fee,price,quantity);if(fees===null)return null;
 const cost=quantity*price+fees,expectedProfit=quantity*probability-cost;
 return {probability,probabilityLow:low,probabilityHigh:high,price,quantity,fee:fees,cost,breakEven:cost/quantity,expectedProfit,evPer100:expectedProfit/quantity*100,roi:expectedProfit/cost,evLowPer100:(quantity*low-cost)/quantity*100,evHighPer100:(quantity*high-cost)/quantity*100};
}
