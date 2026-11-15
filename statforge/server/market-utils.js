const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z]/g,'');
export function matchPlayer(name,players){
 const key=normalize(name),aliases={nicolasclaxton:'nicclaxton',carltoncarrington:'bubcarrington',ronaldholland:'ronholland'};
 const candidates=players.filter(p=>normalize(p.name)===(aliases[key]||key));
 return candidates.length===1?candidates[0]:null;
}
export function dateET(value=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;
}
export const teamCode=code=>({GS:'GSW',SA:'SAS',NO:'NOP',NY:'NYK',UTAH:'UTA',WSH:'WAS'}[code]||code);
