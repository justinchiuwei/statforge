import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('the prop board renders both public providers and filters Polymarket prices correctly',()=>{
 const nodes=new Map();
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:selector==='#marketProvider'||selector==='#marketStat'?'all':'',get options(){return [...this.innerHTML.matchAll(/<option value="([^"]+)"/g)].map(match=>({value:match[1]}))}});return nodes.get(selector)};
 const now=new Date().toISOString(),base={playerName:'Stephen Curry',playerId:'3975',stat:'points',line:28.5,observedAt:now,eventDate:now.slice(0,10),game:{homeTeam:'Golden State Warriors',awayTeam:'Los Angeles Lakers',state:'pre'},priceFormat:'contract_dollars'};
 const rows=[{...base,id:'kalshi:1',provider:'kalshi',providerName:'Kalshi',overPrice:.4,underPrice:.65},{...base,id:'polymarket:2',provider:'polymarket',providerName:'Polymarket',overPrice:.555,overBid:.45,overAskSize:14,underPrice:null,underBid:.35,underAskSize:null}];
 const context=vm.createContext({$:node,$$:()=>[],labels:{points:'Points',rebounds:'Rebounds'},dateFormat:()=>'',rows});
 vm.runInContext(fs.readFileSync('public/markets.js','utf8'),context);
 vm.runInContext("marketRows=rows;providerStates=[{provider:'kalshi',name:'Kalshi',state:'connected',count:1},{provider:'polymarket',name:'Polymarket',state:'connected',count:1}];renderMarkets()",context);
 assert.match(node('#providerStatuses').innerHTML,/Polymarket/);assert(!node('#optionalProviderStatuses').innerHTML.includes('Polymarket'));
 assert.match(node('#marketTable').innerHTML,/Kalshi/);assert.match(node('#marketTable').innerHTML,/55.5¢/);assert.match(node('#marketTable').innerHTML,/14 contracts at ask/);assert.match(node('#marketTable').innerHTML,/No ask available/);
 node('#marketProvider').value='polymarket';vm.runInContext('renderMarkets()',context);assert(!node('#marketTable').innerHTML.includes('Kalshi'));assert.match(node('#marketCount').textContent,/1 lines/);
 node('#marketSearch').value='No such player';vm.runInContext('renderMarkets()',context);assert.match(node('#marketTable').innerHTML,/No matching props/);
});
