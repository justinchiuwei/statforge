import test from 'node:test';
import assert from 'node:assert/strict';
import props from '../api/props.js';
import {normalizePolymarket,applyPolymarketBooks,loadPolymarket} from '../server/polymarket.js';

const now='2026-11-15T12:00:00Z',start='2026-11-16T00:00:00Z';
const players=[{id:'3975',name:'Stephen Curry',abbr:'GSW',team:'Golden State Warriors'},{id:'1966',name:'LeBron James',abbr:'LAL',team:'Los Angeles Lakers'}];
const market={id:'123',question:'Stephen Curry: Points O/U 28.5',sportsMarketType:'points',line:28.5,active:true,closed:false,acceptingOrders:true,outcomes:'["Yes","No"]',clobTokenIds:'["111","222"]',gameStartTime:start,description:'Yes if more than 28.5 points. Inactive player resolves No.',outcomePrices:'["0.7","0.3"]',bestAsk:.8,bestBid:.6};
const event={slug:'nba-lal-gsw-2026-11-15',startTime:start,active:true,closed:false,markets:[market]};
const books=[{asset_id:'111',timestamp:'1794787200000',asks:[{price:'.9',size:'2'},{price:'.55',size:'14'},{price:'.01',size:'0'}],bids:[{price:'.2',size:'5'},{price:'.45',size:'8'}]},{asset_id:'222',timestamp:'1794787200000',asks:[{price:'.65',size:'9'}],bids:[{price:'.35',size:'2'}]}];
const normalize=events=>normalizePolymarket(events,players,{now});

test('Polymarket props preserve player, line, rules and outcome mapping without using midpoint prices',()=>{
 const [row]=normalize([event,event]);assert.equal(row.playerId,'3975');assert.equal(row.line,28.5);assert.equal(row.stat,'points');assert.equal(row.overPrice,null);assert.equal(row.underPrice,null);assert.equal(row.game.homeTeam,'Golden State Warriors');assert.match(row.rules,/Inactive/);assert.equal(normalize([event,event]).length,1);
 const reversed={...market,outcomes:'["No","Yes"]',clobTokenIds:'["222","111"]'};
 assert.deepEqual(normalize([{...event,markets:[reversed]}])[0].outcomeIds,{over:'111',under:'222'});
 const v2={...market,version:'v2',positionIds:['333','444']};assert.deepEqual(normalize([{...event,markets:[v2]}])[0].outcomeIds,{over:'333',under:'444'});
});

test('started, finished, unverified and unsupported Polymarket markets are excluded',()=>{
 for(const change of [{live:true},{ended:true},{closed:true},{startTime:'2026-11-15T11:00:00Z'},{startTime:null},{slug:event.slug+'-first-half'}])assert.equal(normalize([{...event,...change}]).length,0);
 for(const change of [{closed:true},{acceptingOrders:false},{active:false},{sportsMarketType:'totals'},{question:'Stephen Curry: First Half Points O/U 28.5'},{line:29.5},{outcomes:'invalid'},{clobTokenIds:'["111","111"]'},{gameStartTime:'2026-11-15T11:00:00Z'}])assert.equal(normalize([{...event,markets:[{...market,...change}]}]).length,0);
 const games=[{date:'2026-11-15',awayAbbr:'LAL',homeAbbr:'GS',state:'in',startTime:start}];assert.equal(normalizePolymarket([event],players,{now,games}).length,0);
});

test('the four supported stat labels map correctly, including 3-Pointers Made',()=>{
 for(const [stat,title] of Object.entries({points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3-Pointers Made'})){
  const rows=normalize([{...event,markets:[{...market,sportsMarketType:stat,question:`Stephen Curry: ${title} O/U 28.5`}]}]);
  assert.equal(rows[0].stat,stat);
 }
});

test('order-book asks, bids and size come from valid best levels; missing sides stay empty',()=>{
 const [row]=applyPolymarketBooks(normalize([event]),books);
 assert.equal(row.overPrice,.55);assert.equal(row.overBid,.45);assert.equal(row.overAskSize,14);assert.equal(row.underPrice,.65);assert.equal(row.quoteStatus,'available');assert(!('outcomeIds' in row));
 const [partial]=applyPolymarketBooks(normalize([event]),books.slice(0,1));assert.equal(partial.underPrice,null);assert.equal(partial.quoteStatus,'unavailable');
 const [empty]=applyPolymarketBooks(normalize([event]),books.map(b=>({...b,asks:[]})));assert.equal(empty.overPrice,null);assert.equal(empty.quoteStatus,'available');
});

test('public loader requests both outcome books without a key and reports quote failures as partial',async()=>{
 const future=new Date(Date.now()+86400000).toISOString(),fixture={...event,startTime:future,markets:[{...market,gameStartTime:future}]};let calls=[];
 const read=async(url,options)=>{calls.push({url:String(url),options});if(String(url).includes('gamma-api'))return [fixture];assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),[{token_id:'111'},{token_id:'222'}]);return books;};
 let result=await loadPolymarket(players,[],read);assert.equal(result.rows[0].overPrice,.55);assert.equal(result.status.state,'connected');assert.equal(calls.length,2);assert(calls.every(c=>!c.url.includes('apiKey')));
 result=await loadPolymarket(players,[],async url=>{if(String(url).includes('gamma-api'))return [fixture];throw Error('Book unavailable')});assert.equal(result.status.state,'partial');assert.equal(result.rows[0].overPrice,null);
});

test('Polymarket stays available when Kalshi fails and no optional sportsbook feed is called',async()=>{
 const originalFetch=globalThis.fetch,future=new Date(Date.now()+86400000).toISOString(),calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push(String(url));if(String(url).includes('gamma-api'))return Response.json([{...event,startTime:future,markets:[{...market,gameStartTime:future}]}]);if(String(url).includes('clob.polymarket.com')){assert.equal(options.method,'POST');return Response.json(books)}return new Response('',{status:503});};
 try{const response=await props.fetch(new Request('https://statforge.test/api/props')),data=await response.json();assert.equal(response.status,200);assert.equal(data.rows[0].provider,'polymarket');assert.equal(data.providers.find(p=>p.provider==='kalshi').state,'unavailable');assert.equal(data.providers.find(p=>p.provider==='polymarket').state,'connected');assert(calls.every(url=>!url.includes('the-odds-api')))}finally{globalThis.fetch=originalFetch}
});
