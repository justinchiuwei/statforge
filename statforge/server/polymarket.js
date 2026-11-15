import {matchPlayer,dateET,teamCode} from './market-utils.js';

const STATS={points:'points',rebounds:'rebounds',assists:'assists',threes:'threes'};
const TITLES={points:/^points$/i,rebounds:/^rebounds$/i,assists:/^assists$/i,threes:/^(?:threes|3-pointers|three pointers|three-pointers)(?: made)?$/i};
function array(value){if(Array.isArray(value))return value;try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch{return []}}
function iso(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null}

// Read only full-game NBA player O/U markets with a future, verified start.
export function normalizePolymarket(events,players,{games=[],now=new Date().toISOString()}={}){
 const rows=[],seen=new Set();
 for(const event of events){
  const match=event.slug?.match(/^nba-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})$/);
  if(!match||event.closed||event.archived||event.live||event.ended)continue;
  const [,away,home,day]=match;
  const scheduled=games.find(g=>g.date===day&&teamCode(g.awayAbbr)===teamCode(away.toUpperCase())&&teamCode(g.homeAbbr)===teamCode(home.toUpperCase()));
  if(scheduled&&scheduled.state!=='pre')continue;
  const startTime=iso(scheduled?.startTime||event.startTime);
  if(!startTime||new Date(startTime)<=new Date(now))continue;
  const teams=event.teams||[],teamName=(code,ordering)=>players.find(p=>teamCode(p.abbr)===teamCode(code.toUpperCase()))?.team||teams.find(t=>t.ordering===ordering)?.name||code.toUpperCase();
  const game={startTime,homeTeam:scheduled?.homeTeam||teamName(home,'home'),awayTeam:scheduled?.awayTeam||teamName(away,'away'),state:'pre'};
  for(const market of event.markets||[]){
   const stat=STATS[market.sportsMarketType],parts=market.question?.match(/^(.+?):\s*(.+?)\s+O\/U\s+(\d+(?:\.\d+)?)$/);
   if(!stat||!parts||!TITLES[stat].test(parts[2])||market.active!==true||market.closed||market.archived||market.acceptingOrders!==true||seen.has(String(market.id)))continue;
   const line=Number(parts[3]);
   if(!Number.isFinite(line)||line<0||(market.line!=null&&Number(market.line)!==line))continue;
   const marketStart=iso(market.gameStartTime||startTime);
   if(!marketStart||new Date(marketStart)<=new Date(now))continue;
   const outcomes=array(market.outcomes).map(s=>String(s).toLowerCase());
   const over=outcomes.indexOf('yes')>=0?outcomes.indexOf('yes'):outcomes.indexOf('over');
   const under=outcomes.indexOf('no')>=0?outcomes.indexOf('no'):outcomes.indexOf('under');
   const tokens=array(market.version==='v2'?market.positionIds:market.clobTokenIds).map(String);
   if(outcomes.length!==2||over<0||under<0||tokens.length!==2||tokens.some(t=>!/^\d{1,100}$/.test(t))||tokens[0]===tokens[1]||!market.id)continue;
   seen.add(String(market.id));
   const player=matchPlayer(parts[1],players);
   rows.push({id:'polymarket:'+market.id,provider:'polymarket',providerName:'Polymarket',playerName:parts[1],playerId:player?.id||null,stat,line,contract:market.question,overPrice:null,underPrice:null,overBid:null,underBid:null,priceFormat:'contract_dollars',eventId:event.slug,eventDate:dateET(new Date(startTime)),game,observedAt:now,providerUpdatedAt:market.updatedAt||null,url:'https://polymarket.com/event/'+event.slug,rules:market.description||'',marketType:'over_under',source:'Polymarket public Gamma and CLOB APIs',minimumOrderSize:Number(market.orderMinSize)||1,fee:market.feesEnabled===false?{model:'quadratic',rate:0,source:'Polymarket market fee metadata'}:market.feesEnabled===true&&market.feeSchedule?.exponent===1&&typeof market.feeSchedule.rate==='number'?{model:'quadratic',rate:market.feeSchedule.rate,source:'Polymarket market fee metadata'}:null,outcomeIds:{over:tokens[over],under:tokens[under]}});
  }
 }
 return rows;
}

// Use executable order-book levels, never Gamma midpoint/last-trade prices.
export function applyPolymarketBooks(rows,books){
 const byId=new Map(books.map(book=>[String(book.asset_id),book]));
 const best=(levels,ask)=>{
  const valid=(levels||[]).map(level=>({price:Number(level.price),size:Number(level.size)})).filter(l=>Number.isFinite(l.price)&&l.price>0&&l.price<1&&Number.isFinite(l.size)&&l.size>0);
  return valid.sort((a,b)=>ask?a.price-b.price:b.price-a.price)[0];
 };
 return rows.map(({outcomeIds,...row})=>{
  let complete=true;
  for(const side of ['over','under']){
   const book=byId.get(outcomeIds[side]);
   if(!book){complete=false;continue}
   const ask=best(book.asks,true),bid=best(book.bids,false);
   row[side+'Price']=ask?.price??null;row[side+'Bid']=bid?.price??null;row[side+'AskSize']=ask?.size??null;
   row[side+'BookUpdatedAt']=iso(Number(book.timestamp));
  }
  row.quoteStatus=complete?'available':'unavailable';return row;
 });
}

export async function loadPolymarket(players,games,getJSON){
 const now=new Date().toISOString(),events=[];let truncated=false;
 // Bound discovery and book requests to stay within the function time budget.
 for(let page=0;page<2;page++){
  const url=new URL('https://gamma-api.polymarket.com/events');
  url.search=new URLSearchParams({tag_id:'745',active:'true',closed:'false',limit:'50',offset:String(page*50),order:'id',ascending:'false',end_date_min:now,end_date_max:new Date(Date.now()+72*3600000).toISOString()});
  const batch=await getJSON(url,{timeout:8000});
  if(!Array.isArray(batch))throw Error('Invalid Polymarket event response');
  events.push(...batch);if(batch.length<50)break;if(page===1)truncated=true;
 }
 const candidates=normalizePolymarket(events,players,{games,now});
 if(candidates.length>1000)truncated=true;
 const rows=candidates.slice(0,1000),ids=[...new Set(rows.flatMap(row=>Object.values(row.outcomeIds)))],requests=[];
 for(let i=0;i<ids.length;i+=500)requests.push(getJSON('https://clob.polymarket.com/books',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(ids.slice(i,i+500).map(token_id=>({token_id}))),timeout:8000}));
 const results=await Promise.allSettled(requests),books=results.flatMap(result=>result.status==='fulfilled'&&Array.isArray(result.value)?result.value:[]);
 const quoted=applyPolymarketBooks(rows,books),missing=quoted.some(row=>row.quoteStatus==='unavailable'),partial=truncated||missing;
 return {rows:quoted,status:{provider:'polymarket',name:'Polymarket',state:partial?'partial':'connected',count:quoted.length,observedAt:now,message:partial?'Public feed · coverage or order-book quotes are partial. Missing asks are shown as —.':'Public feed · upcoming full-game NBA player props. Prices are order-book asks in cents; settlement rules can differ from sportsbooks.'}};
}
