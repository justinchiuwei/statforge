let evData=null,evPage=0,evLoading=false;
const evMoney=value=>`${value<0?'−':'+'}$${Math.abs(value).toFixed(2)}`;
const evPercent=value=>`${(value*100).toFixed(1)}%`;
function setupEV(){
 const panel=document.createElement('section');panel.id='evPanel';panel.className='panel ev-panel';
 panel.innerHTML=`<div class="market-heading"><div><div class="eyebrow">COMPARE PROBABILITY WITH THE PRICE</div><h2>Estimated +EV<span class="purple-dot">.</span></h2><p class="ev-intro">Current-season player hit rates versus Kalshi and Polymarket asks, after estimated entry fees.</p></div><div class="ev-actions"><button class="text-button" id="evMethod">How EV is calculated ↗</button><button class="button button-primary" id="refreshEV">Refresh EV estimates</button></div></div>
 <div class="ev-summary"><div><span>POSITIVE ESTIMATES</span><strong id="evPositiveCount">—</strong><small id="evEvaluated">Waiting for market data</small></div><div><span>HIGHEST ESTIMATED EV</span><strong id="evBest">—</strong><small>Normalized per 100 contracts</small></div><div><span>ESTIMATION METHOD</span><strong class="ev-method-name">Bayesian hit rate</strong><small>10–40 current-season appearances</small></div></div>
 <div class="ev-filters"><div class="market-search"><span data-icon="search"></span><input type="search" id="evSearch" placeholder="Find a player or team…" aria-label="Search EV estimates"></div><select id="evStat" aria-label="Filter EV by statistic"><option value="all">All stats</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><select id="evProvider" aria-label="Filter EV by exchange"><option value="all">Both exchanges</option><option value="kalshi">Kalshi</option><option value="polymarket">Polymarket</option></select><select id="evGroup" aria-label="Group EV rankings"><option value="player_stat">Best per player & stat</option><option value="player">Best per player</option><option value="stat">Best per stat</option><option value="all">All positive estimates</option></select></div>
 <p id="evStatus" class="market-message" role="status" aria-live="polite">Estimates will load with the public prop board.</p><div class="market-table-scroll ev-table-scroll"><table class="market-table ev-table"><thead><tr><th>PLAYER / PROP</th><th>EXCHANGE / ASK</th><th>EST. WIN RATE</th><th>EST. EV / 100</th><th>EST. ROI</th><th>DATA / UNCERTAINTY</th><th></th></tr></thead><tbody id="evTable"></tbody></table></div><div class="market-pagination"><span id="evCount">—</span><div><button id="evPrev" aria-label="Previous EV page">←</button><span id="evPageLabel">1 / 1</span><button id="evNext" aria-label="Next EV page">→</button></div></div><p class="market-footnote">EV = estimated winning payout − ask cost − entry fee. Conditional on participation and holding to settlement; no injury or lineup feed is applied. The probability is a smoothed historical hit rate, not a calibrated forecast. A positive estimate can have substantial uncertainty. Fees, quotes and provider rules can change.</p>`;
 $('#manualResearch').after(panel);
 const nav=document.createElement('button');nav.id='evNav';nav.className='nav-item';nav.innerHTML='<span data-icon="chart"></span>Estimated +EV<span class="nav-arrow">↗</span>';$('#researchNav').after(nav);nav.onclick=()=>panel.scrollIntoView({behavior:'smooth',block:'start'});
 $('#refreshEV').onclick=loadEV;$('#evMethod').onclick=showEVMethod;
 for(const selector of ['#evSearch','#evStat','#evProvider','#evGroup'])$(selector).oninput=()=>{evPage=0;renderEV()};
 $('#evPrev').onclick=()=>{evPage=Math.max(0,evPage-1);renderEV()};$('#evNext').onclick=()=>{evPage++;renderEV()};
 setInterval(()=>{if(evData)renderEV()},30000);renderEV();
}

async function loadEV(){
 if(evLoading||!$('#evTable'))return;
 evLoading=true;$('#refreshEV').disabled=true;$('#refreshEV').textContent='Calculating…';$('#evStatus').textContent='Checking current-season appearances, quotes and exchange fees. This may take a minute…';
 try{
  const response=await fetch('/api/ev',{signal:AbortSignal.timeout(175000)}),data=await response.json();
  if(!response.ok)throw Error(data.error||'EV estimates unavailable');
  evData=data;evPage=0;renderEV();
 }catch(error){$('#evStatus').textContent=evData?'Refresh failed. Older estimates remain visible only while their quotes are fresh.':error.message||'Could not load EV estimates. Try refreshing.';}
 finally{evLoading=false;$('#refreshEV').disabled=false;$('#refreshEV').textContent='Refresh EV estimates'}
}

function evVisibleRows(){
 if(!evData)return [];
 const query=searchKey($('#evSearch').value),stat=$('#evStat').value,provider=$('#evProvider').value,group=$('#evGroup').value;
 const now=Date.now(),seen=new Set();
 return evData.edges.filter(row=>row.evPer100>0&&new Date(row.market.game.startTime).getTime()>now&&now-new Date(row.observedAt).getTime()<=120000&&(stat==='all'||row.stat===stat)&&(provider==='all'||row.provider===provider)&&(!query||searchKey(row.playerName+' '+row.market.game.homeTeam+' '+row.market.game.awayTeam).includes(query))).sort((a,b)=>b.evPer100-a.evPer100||a.id.localeCompare(b.id)).filter(row=>{
  const key=group==='player_stat'?row.playerId+':'+row.stat:group==='player'?row.playerId:group==='stat'?row.stat:row.id;
  if(seen.has(key))return false;seen.add(key);return true;
 });
}

function renderEV(){
 if(!$('#evTable'))return;
 const rows=evVisibleRows(),pages=Math.max(1,Math.ceil(rows.length/10));evPage=Math.min(evPage,pages-1);
 $('#evPositiveCount').textContent=evData?String(rows.length):'—';$('#evBest').textContent=rows.length?evMoney(rows[0].evPer100):'—';
 if(evData){
  $('#evEvaluated').textContent=`${evData.coverage.evaluatedSides} sides evaluated · ${evData.coverage.players} listed players`;
  const skipped=Object.values(evData.coverage.skipped).reduce((sum,count)=>sum+count,0);
  $('#evStatus').textContent=`Updated ${dateFormat(evData.generatedAt,{hour:'numeric',minute:'2-digit'})} ET · ${skipped} markets/sides excluded by data, price, size, fee or settlement checks. Quotes expire after 2 minutes. `+(rows.length?'':'No fresh positive estimates match these filters. Refresh estimates or change a filter.');
 }
 $('#evTable').innerHTML=rows.slice(evPage*10,evPage*10+10).map(row=>`<tr><td><strong>${escapeHTML(row.playerName)}</strong><small>${row.side==='over'?'Over':'Under'} ${row.line} ${escapeHTML(labels[row.stat])}</small><small>${escapeHTML(row.market.game.awayTeam)} @ ${escapeHTML(row.market.game.homeTeam)}</small></td><td><span class="book-label ${row.provider}">${escapeHTML(row.providerName)}</span><strong>${(row.price*100).toLocaleString(undefined,{maximumFractionDigits:2})}¢</strong><small>Break-even ${evPercent(row.breakEven)} incl. fee</small></td><td><strong>${evPercent(row.probability)}</strong><small>Historical interval<br>${evPercent(row.probabilityLow)}–${evPercent(row.probabilityHigh)}</small></td><td class="ev-positive"><strong>${evMoney(row.evPer100)}</strong><small>Estimated profit / 100</small></td><td><strong>${evPercent(row.roi)}</strong><small>On cost + entry fee</small></td><td><span class="ev-uncertainty ${row.uncertain?'':'stronger'}">${row.uncertain?'Uncertain edge':'Positive historical interval'}</span><small>${row.sampleSize} appearances · ${escapeHTML(row.dataSource)}</small><small>Last game ${escapeHTML(dateFormat(row.latestGame))}</small></td><td><button class="analyze-prop" data-ev-analyze="${escapeHTML(row.id)}">Analyze ↗</button><button class="market-rules" data-ev-details="${escapeHTML(row.id)}">EV details</button></td></tr>`).join('')||`<tr><td colspan="7" class="market-empty">${evData?'No qualifying positive estimates. The prop board and manual player research are available below.':'Waiting for current market data and player histories…'}</td></tr>`;
 $('#evCount').textContent=`${rows.length} ranked estimates · highest estimated EV first`;$('#evPageLabel').textContent=`${evPage+1} / ${pages}`;$('#evPrev').disabled=evPage===0;$('#evNext').disabled=evPage===pages-1;
 $$('[data-ev-analyze]').forEach(button=>button.onclick=()=>{const row=evData.edges.find(row=>row.id===button.dataset.evAnalyze),p=nbaDirectory.find(p=>p.id===row.playerId);if(p)selectPlayer(p,{prop:row.market})});
 $$('[data-ev-details]').forEach(button=>button.onclick=()=>showEVDetails(evData.edges.find(row=>row.id===button.dataset.evDetails)));
}

function showEVMethod(){
 const skipped=evData?Object.entries(evData.coverage.skipped).map(([reason,count])=>`<p>${escapeHTML(reason)}: ${count}</p>`).join(''):'';
 dialog(`<h2 class="modal-title">How estimated EV works</h2><div class="help-copy"><p>For each player and line, StatForge counts over/under results in up to 40 current-season appearances. A Jeffreys Beta(0.5, 0.5) prior smooths the win rate: (wins + 0.5) / (appearances + 1). At least 10 appearances are required, with one in the last seven days.</p><p>For a binary contract paying $1 on a win: expected profit = quantity × estimated win probability − quantity × ask price − estimated entry fee. ROI divides that profit by ask cost plus fee. EV / 100 normalizes the estimate to 100 contracts; it is not a claim that 100 contracts are available.</p><p>Fee rounding uses an order of up to 100 whole contracts, limited to the visible ask size and exchange minimum order. Polymarket uses market fee metadata; Kalshi uses series fees and event overrides. Unsupported or missing fees, prices, size, team matches and start times are excluded.</p><p>The 95% Wilson interval measures uncertainty in the historical hit frequency. It does not account for future matchup shifts, injuries, roles or model error. “Uncertain edge” means that interval includes zero or negative EV. These estimates use a separate historical model from the Ridge × Random Forest projection engine.</p><p>Estimates assume participation and holding until normal game settlement. Inactivity, cancellation and other special settlements follow each exchange’s rules and are not modeled. No bets are placed. Player lookups are capped at 80 per refresh. Live ESPN logs are preferred; a dated snapshot is used only if less than 24 hours old.</p><p><a class="method-link" href="https://docs.polymarket.com/trading/fees" target="_blank" rel="noopener">Polymarket fees ↗</a> · <a class="method-link" href="https://kalshi.com/docs/kalshi-fee-schedule.pdf" target="_blank" rel="noopener">Kalshi fee schedule ↗</a></p><strong>Excluded in this refresh</strong>${skipped||'<p>No exclusion details yet.</p>'}</div>`);
}

function showEVDetails(row){
 dialog(`<h2 class="modal-title">${escapeHTML(row.playerName)} · ${row.side==='over'?'Over':'Under'} ${row.line}</h2><div class="help-copy"><p>${escapeHTML(row.providerName)} · ${escapeHTML(labels[row.stat])}<br>Estimated probability ${evPercent(row.probability)} · break-even ${evPercent(row.breakEven)}</p><p>Modeled order: ${row.quantity} contracts at ${(row.price*100).toLocaleString(undefined,{maximumFractionDigits:2})}¢<br>Entry fee: $${row.fee.toFixed(5)}<br>Total cost: $${row.cost.toFixed(4)}<br>Estimated profit for that order: ${evMoney(row.expectedProfit)}<br>Normalized EV / 100: ${evMoney(row.evPer100)}<br>Estimated ROI: ${evPercent(row.roi)}</p><p>Historical probability interval: ${evPercent(row.probabilityLow)}–${evPercent(row.probabilityHigh)}<br>Corresponding EV / 100: ${evMoney(row.evLowPer100)} to ${evMoney(row.evHighPer100)}<br>${row.sampleSize} appearances · ${row.overHits} overs / ${row.sampleSize-row.overHits} unders<br>${escapeHTML(row.dataSource)} · fetched ${escapeHTML(dateFormat(row.dataFetchedAt,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))} ET<br>Ask fetched ${escapeHTML(dateFormat(row.observedAt,{hour:'numeric',minute:'2-digit'}))} ET</p><p>Fees: ${escapeHTML(row.feeSource)}. Conditional on participation and normal settlement; no lineup adjustments. The probability interval describes historical hit-rate uncertainty, not forecast accuracy.</p><a class="method-link" href="${escapeHTML(row.market.url)}" target="_blank" rel="noopener">Provider market & settlement rules ↗</a></div>`);
}
