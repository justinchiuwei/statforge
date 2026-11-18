import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {historicalProbability,entryFee,contractEV} from '../server/ev-math.js';
import {generateEV,evRoute} from '../server/ev.js';

test('historical probabilities smooth small samples and exclude non-participation',()=>{
 const games=Array.from({length:10},()=>({points:30,minutes:32}));games.push({points:0,minutes:0});
 const p=historicalProbability(games,'points',28.5);assert.equal(p.n,10);assert.equal(p.over,10.5/11);assert.equal(p.over+p.under,1);assert(p.overLow<p.over);assert(p.overHigh>=p.over);
});

test('EV subtracts entry fees and supports negative results and correct rounding',()=>{
 const fee={model:'quadratic',rate:.05};
 assert.equal(entryFee('polymarket',fee,.5,100),1.25);
 assert(Math.abs(entryFee('kalshi',{model:'quadratic',rate:.07},.33,1)-.0155)<1e-9);
 const value=contractEV({probability:.6,low:.4,high:.8,price:.5,quantity:100,provider:'polymarket',fee});assert.equal(value.expectedProfit,8.75);assert.equal(value.breakEven,.5125);assert.equal(value.evPer100,8.75);assert(value.evLowPer100<0);assert(Math.abs(value.roi-8.75/51.25)<1e-12);
 assert(contractEV({probability:.51,low:.4,high:.6,price:.5,quantity:100,provider:'polymarket',fee}).expectedProfit<0);
 assert.equal(entryFee('polymarket',null,.5,100),null);assert.equal(entryFee('kalshi',{model:'flat',rate:0},.5,100),null);assert.equal(entryFee('polymarket',{model:'quadratic',rate:null},.5,100),null);
});

test('EV ranks both exchanges using live histories, ask size, and event-level fee overrides',async()=>{
 const now=Date.now(),future=new Date(now+86400000).toISOString(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(future));
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'2-digit',month:'short',day:'2-digit'}).formatToParts(new Date(future)).map(p=>[p.type,p.value]));
 const ticker=`KXNBAPTS-${parts.year}${parts.month.toUpperCase()}${parts.day}LALGSW`,poly={id:'p1',question:'Stephen Curry: Points O/U 28.5',sportsMarketType:'points',line:28.5,active:true,closed:false,acceptingOrders:true,outcomes:'["Yes","No"]',clobTokenIds:'["111","222"]',gameStartTime:future,feesEnabled:true,feeSchedule:{rate:.05,exponent:1},orderMinSize:5};
 const events={},items=[];for(let i=0;i<10;i++){events[String(i)]={id:String(i),gameDate:new Date(now-(i+1)*86400000).toISOString(),opponent:{abbreviation:'LAL',displayName:'Los Angeles Lakers'},atVs:'vs'};items.push({eventId:String(i),stats:['32',i===9?'20':'30','5','7','4-9','11-20','4-5','2']})}
 const log={filters:[{name:'season',value:2027}],names:['minutes','points','totalRebounds','assists','threePointFieldGoalsMade-threePointFieldGoalsAttempted','fieldGoalsMade-fieldGoalsAttempted','freeThrowsMade-freeThrowsAttempted','turnovers'],events,seasonTypes:[{displayName:'2026-27 Regular Season',categories:[{events:items}]}]},original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url)=>{
  const u=new URL(url);calls.push(u.href);
  if(u.host==='gamma-api.polymarket.com')return Response.json([{slug:`nba-lal-gsw-${day}`,startTime:future,markets:[poly,{...poly,id:'missing-fee',feesEnabled:undefined},{...poly,id:'integer',line:28,question:'Stephen Curry: Points O/U 28'}]}]);
  if(u.host==='clob.polymarket.com')return Response.json([{asset_id:'111',timestamp:String(now),asks:[{price:'.4',size:'100'}],bids:[]},{asset_id:'222',timestamp:String(now),asks:[{price:'.7',size:'100'}],bids:[]}]);
  if(u.pathname.endsWith('/scoreboard'))return Response.json({events:u.searchParams.get('dates')===day.replaceAll('-','')?[{id:'game',date:future,status:{type:{state:'pre'}},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Golden State Warriors',abbreviation:'GS',id:'9'}},{homeAway:'away',team:{displayName:'Los Angeles Lakers',abbreviation:'LAL',id:'13'}}]}]}]:[]});
  if(u.pathname.endsWith('/gamelog'))return Response.json(log);
  if(u.pathname.includes('/series/'))return Response.json({series:{fee_type:'quadratic',fee_multiplier:1}});
  if(u.pathname.includes('/events/'))return Response.json({event:{fee_type_override:'quadratic',fee_multiplier_override:2}});
  if(u.pathname.endsWith('/markets'))return Response.json({markets:u.searchParams.get('series_ticker')==='KXNBAPTS'?[{title:'Stephen Curry: 30+ points',strike_type:'greater',floor_strike:29.5,status:'active',event_ticker:ticker,ticker:ticker+'-30',yes_ask_dollars:'.5',yes_ask_size_fp:'100',no_ask_dollars:'.6',yes_bid_dollars:'.4',yes_bid_size_fp:'100'}]:[],cursor:''});
  throw Error('Unexpected test source');
 };
 try{
  const result=await generateEV(new Request('https://statforge.test/api/ev'));
  assert.equal(result.edges.length,2);assert.equal(result.edges[0].provider,'polymarket');assert.equal(result.edges[0].sampleSize,10);assert(Math.abs(result.edges[0].expectedProfit-(100*9.5/11-41.2))<1e-9);
  const kalshi=result.edges.find(row=>row.provider==='kalshi');assert.equal(kalshi.fee,3.5);assert.equal(kalshi.quantity,100);
  assert(result.edges.every(row=>row.expectedProfit>0&&row.dataSource==='ESPN live'));assert(result.coverage.skipped['Fee data unavailable or unsupported']>0);assert(result.coverage.skipped['Unsupported settlement line']>0);assert(!calls.some(url=>url.includes('the-odds-api')));
  assert.equal((await evRoute.fetch(new Request('https://statforge.test/api/ev',{method:'POST'}))).status,405);
 }finally{globalThis.fetch=original}
});

test('EV grouping chooses the greatest EV, respects stat filters, and removes stale quotes',()=>{
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#evSearch'?'':selector==='#evGroup'?'player_stat':'all'});return nodes.get(selector)};
 const base={playerId:'1',playerName:'Player One',provider:'polymarket',stat:'points',observedAt:new Date().toISOString(),market:{game:{startTime:new Date(Date.now()+86400000).toISOString(),homeTeam:'Home',awayTeam:'Away'}}};
 const rows=[{...base,id:'best',evPer100:10},{...base,id:'worse',evPer100:5},{...base,id:'reb',stat:'rebounds',evPer100:7},{...base,id:'stale',evPer100:30,observedAt:new Date(Date.now()-180000).toISOString()}];
 const context=vm.createContext({$:node,rows,searchKey:s=>String(s).toLowerCase()});vm.runInContext(fs.readFileSync('public/ev-ui.js','utf8'),context);vm.runInContext('evData={edges:rows}',context);
 assert.equal(vm.runInContext('evVisibleRows().map(r=>r.id).join(",")',context),'best,reb');
 node('#evGroup').value='player';assert.equal(vm.runInContext('evVisibleRows()[0].id',context),'best');
 node('#evStat').value='rebounds';assert.equal(vm.runInContext('evVisibleRows()[0].id',context),'reb');
});

test('Over and Under views filter before best-per-player grouping and combine with other filters',()=>{
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#evSearch'?'':selector==='#evGroup'?'player_stat':'all'});return nodes.get(selector)};
 const base={playerId:'1',playerName:'Player One',provider:'polymarket',stat:'points',observedAt:new Date().toISOString(),market:{game:{startTime:new Date(Date.now()+86400000).toISOString(),homeTeam:'Home',awayTeam:'Away'}}};
 const rows=[{...base,id:'over-best',side:'over',evPer100:12},{...base,id:'under-best',side:'under',evPer100:6},{...base,id:'under-worse',side:'under',evPer100:3},{...base,id:'under-other',playerId:'2',playerName:'Player Two',provider:'kalshi',side:'under',evPer100:8}];
 const context=vm.createContext({$:node,rows,searchKey:s=>String(s).toLowerCase()});vm.runInContext(fs.readFileSync('public/ev-ui.js','utf8'),context);vm.runInContext('evData={edges:rows}',context);
 const ids=()=>vm.runInContext('evVisibleRows().map(row=>row.id).join(",")',context);
 assert.equal(ids(),'over-best,under-other');
 vm.runInContext("evSide='under'",context);assert.equal(ids(),'under-other,under-best');
 node('#evProvider').value='polymarket';assert.equal(ids(),'under-best');
 node('#evStat').value='assists';assert.equal(ids(),'');node('#evStat').value='all';
 node('#evGroup').value='all';assert.equal(ids(),'under-best,under-worse');
 vm.runInContext("evSide='over'",context);assert.equal(ids(),'over-best');
 node('#evSearch').value='Player Two';assert.equal(ids(),'');
});
