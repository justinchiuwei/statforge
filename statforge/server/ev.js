import {handleApi,parseLog} from './research.js';
import {readJson} from './data.js';
import {historicalProbability,contractEV} from './ev-math.js';

const cache=new Map();
async function cached(key,ttl,load){
 const hit=cache.get(key);if(hit?.expires>Date.now())return hit.promise;
 if(cache.size>200)for(const [key,value] of cache)if(value.expires<Date.now())cache.delete(key);
 const promise=Promise.resolve().then(load);cache.set(key,{promise,expires:Date.now()+ttl});
 try{return await promise}catch(error){cache.delete(key);throw error}
}
async function read(url){const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('Source unavailable');return r.json()}
async function historyFor(playerId){
 return cached('history:'+playerId,300000,async()=>{
  const now=new Date(),year=now.getUTCMonth()>=9?now.getUTCFullYear()+1:now.getUTCFullYear();
  try{
   const data=await read(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/gamelog?season=${year}`);
   if(!data.filters?.some(f=>f.name==='season'&&String(f.value)===String(year)))throw Error('Season mismatch');
   return {games:parseLog(data,year),source:'ESPN live',fetchedAt:new Date().toISOString()};
  }catch{
   const snapshot=readJson('league-games.json');
   if(snapshot.season!==`${year-1}-${String(year).slice(-2)}`||Date.now()-new Date(snapshot.fetchedAt).getTime()>86400000)throw Error('Current season data unavailable');
   const games=snapshot.gamesByPlayer?.[playerId];if(!games)throw Error('No player data');
   return {games,source:'ESPN dated snapshot',fetchedAt:snapshot.fetchedAt};
  }
 });
}

async function kalshiFee(row){
 return cached('fee:'+row.eventId,300000,async()=>{
  if(!/^KXNBA[A-Z0-9]+-[A-Z0-9]+$/.test(row.eventId))return null;
  const series=row.eventId.split('-')[0];
  const [s,e]=await Promise.all([cached('series:'+series,300000,()=>read('https://external-api.kalshi.com/trade-api/v2/series/'+series)),read('https://external-api.kalshi.com/trade-api/v2/events/'+row.eventId)]);
  if(!s.series||!e.event)return null;
  const type=e.event.fee_type_override??s.series.fee_type,multiplier=e.event.fee_multiplier_override??s.series.fee_multiplier;
  if(!['quadratic','quadratic_with_maker_fees','quadratic_with_combo_maker_fees'].includes(type)||!Number.isFinite(multiplier)||multiplier<0)return null;
  return {model:'quadratic',rate:.07*multiplier,source:'Kalshi series and event fee metadata'};
 });
}

async function pool(items,concurrency,fn){
 const results=new Map();let cursor=0;
 await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(cursor<items.length){const item=items[cursor++];try{results.set(item,await fn(item))}catch{results.set(item,null)}}}));
 return results;
}

export async function generateEV(request){
 const response=await handleApi(new Request(new URL('/api/props',request.url))),board=await response.json();
 if(!response.ok)throw Error('Prop board unavailable');
 const now=Date.now(),players=readJson('players.json').players||[],directory=new Map(players.map(p=>[p.id,p])),skipped={};
 const skip=reason=>{skipped[reason]=(skipped[reason]||0)+1};
 const markets=(board.rows||[]).filter(row=>{
  if(!['kalshi','polymarket'].includes(row.provider))return false;
  if(!row.playerId||!directory.has(row.playerId)){skip('Unmatched player');return false}
  if(row.game?.state!=='pre'||!Number.isFinite(new Date(row.game.startTime).getTime())||new Date(row.game.startTime).getTime()<=now){skip('Game start not verified or already started');return false}
  if(!Number.isFinite(row.line)||Math.abs(row.line%1-.5)>.00001){skip('Unsupported settlement line');return false}
  if(!Number.isFinite(new Date(row.observedAt).getTime())||now-new Date(row.observedAt).getTime()>120000){skip('Quote is older than 2 minutes');return false}
  const player=directory.get(row.playerId);
  if(![row.game.homeTeam,row.game.awayTeam].includes(player.team)){skip('Player and event teams do not match');return false}
  return true;
 });
 const ids=[...new Set(markets.map(row=>row.playerId))],selectedIds=ids.slice(0,80);
 if(ids.length>80)skipped['Player coverage limit']=ids.length-80;
 const histories=await pool(selectedIds,8,historyFor);
 const kalshiEvents=[...new Set(markets.filter(row=>row.provider==='kalshi'&&histories.get(row.playerId)).map(row=>row.eventId))].slice(0,40);
 const eventFees=await pool(kalshiEvents,8,event=>kalshiFee(markets.find(row=>row.eventId===event)));
 const edges=[];let evaluated=0;
 for(const row of markets){
  if(new Date(row.game.startTime).getTime()<=Date.now()||Date.now()-new Date(row.observedAt).getTime()>120000){skip('Quote expired during calculation');continue}
  const history=histories.get(row.playerId);
  if(!history){skip('Current season history unavailable');continue}
  const games=history.games.filter(g=>g.minutes>0&&Number.isFinite(g[row.stat])&&new Date(g.date).getTime()<Math.min(now,new Date(row.game.startTime).getTime())).sort((a,b)=>a.date.localeCompare(b.date)).slice(-40);
  const estimate=historicalProbability(games,row.stat,row.line);
  if(!estimate||estimate.n<10){skip('Fewer than 10 current-season appearances');continue}
  if(now-new Date(games.at(-1).date).getTime()>7*86400000){skip('No appearance in the past 7 days');continue}
  const fee=row.provider==='kalshi'?eventFees.get(row.eventId):row.fee;
  for(const side of ['over','under']){
   const price=row[side+'Price'],size=row[side+'AskSize'];
   if(!Number.isFinite(price)||price<=0||price>=1){skip('No available ask');continue}
   if(!Number.isFinite(size)||size<1){skip('No verified ask size');continue}
   const quantity=Math.min(100,Math.floor(size)),minimum=row.minimumOrderSize??1;
   if(quantity<minimum){skip('Insufficient size for minimum order');continue}
   const probability=estimate[side],low=side==='over'?estimate.overLow:1-estimate.overHigh,high=side==='over'?estimate.overHigh:1-estimate.overLow;
   const ev=contractEV({probability,low,high,price,quantity,provider:row.provider,fee});
   if(!ev){skip('Fee data unavailable or unsupported');continue}
   evaluated++;
   if(ev.expectedProfit<=0)continue;
   edges.push({...ev,id:row.id+':'+side,side,playerId:row.playerId,playerName:row.playerName,stat:row.stat,line:row.line,provider:row.provider,providerName:row.providerName,sampleSize:estimate.n,overHits:estimate.wins,latestGame:games.at(-1).date,dataSource:history.source,dataFetchedAt:history.fetchedAt,observedAt:row.observedAt,feeSource:fee.source,uncertain:ev.evLowPer100<=0,market:{id:row.id,providerName:row.providerName,stat:row.stat,line:row.line,game:row.game,url:row.url,observedAt:row.observedAt}});
  }
 }
 edges.sort((a,b)=>b.evPer100-a.evPer100||a.id.localeCompare(b.id));
 return {edges,generatedAt:new Date().toISOString(),providers:board.providers,coverage:{markets:markets.length,players:ids.length,evaluatedSides:evaluated,positiveSides:edges.length,skipped},method:{name:'Current-season Bayesian hit rate',prior:'Jeffreys Beta(0.5, 0.5)',minimumGames:10,maximumGames:40,probabilityInterval:'95% Wilson interval for historical hit frequency, not a calibrated forecast interval',scope:'Conditional on participation; full-game half-point binary contracts held to settlement. Actual fees and settlement may differ. No injury or lineup adjustments.'}};
}

export const evRoute={async fetch(request){
 if(request.method!=='GET')return Response.json({error:'GET required'},{status:405});
 try{return Response.json(await cached('board',60000,()=>generateEV(request)),{headers:{'cache-control':'private, max-age=30'}})}
 catch{return Response.json({error:'EV estimates are temporarily unavailable. Player research and the prop board still work.'},{status:502})}
}};
