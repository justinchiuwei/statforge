import pathlib,json,urllib.request,datetime,concurrent.futures,time
root=pathlib.Path(__file__).resolve().parents[1]/'public';players=json.loads((root/'players.json').read_text())['players'];cache=root.parent/'work'/'cache';now=datetime.datetime.now(datetime.timezone.utc);errors=[]
cache.mkdir(parents=True,exist_ok=True)
def parse(d):
 rows=[]
 for season in d.get('seasonTypes',[]):
  if season.get('displayName')!='2026-27 Regular Season':continue
  for cat in season.get('categories',[]):
   for item in cat.get('events',[]):
    e=d['events'][item['eventId']];s=dict(zip(d['names'],item['stats']))
    try:
     if float(s['minutes'])<=0 or datetime.datetime.fromisoformat(e['gameDate'].replace('Z','+00:00'))>now:continue
     g={'id':e['id'],'date':e['gameDate'],'opponent':e['opponent']['abbreviation'],'opponentName':e['opponent']['displayName'],'venue':'home' if e['atVs']=='vs' else 'away','minutes':float(s['minutes']),'points':float(s['points']),'rebounds':float(s['totalRebounds']),'assists':float(s['assists']),'threes':float(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted'].split('-')[0]),'role':'unknown','usage':None,'pace':None,'teammates':{},'seasonId':2027,'url':next((l['href'] for l in e['links'] if 'boxscore' in l.get('rel',[])), '')}
     g['pra']=g['points']+g['rebounds']+g['assists'];rows.append(g)
    except (ValueError,KeyError):continue
 return sorted(rows,key=lambda g:g['date'])
def read(p):
 pid=p['id'];file=cache/('league-log-'+pid+'-2027.json')
 if file.exists():return pid,parse(json.loads(file.read_text()))
 for attempt in range(3):
  try:
   with urllib.request.urlopen('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/'+pid+'/gamelog?season=2027',timeout=14) as r:d=json.load(r)
   file.write_text(json.dumps(d));return pid,parse(d)
  except Exception as e:
   if attempt==2:errors.append({'id':pid,'name':p['name'],'error':str(e)});return pid,None
   if getattr(e,'code',None)==429:time.sleep(2)
result={}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for index,(pid,games) in enumerate(pool.map(read,players)):
  if games is not None:result[pid]=games
  if (index+1)%50==0:print('Current-season logs',index+1,'/',len(players),'failures',len(errors),flush=True)
# Retain richer original histories when they are already present in the model dataset.
original=json.loads((root/'data.json').read_text())
for p in original['players']:result[p['id']]=p['games']
output={'season':'2026-27','fetchedAt':now.isoformat(),'source':'ESPN regular-season game logs','gamesByPlayer':result,'unavailable':errors}
(root/'league-games.json').write_text(json.dumps(output,separators=(',',':')))
print('Saved',len(result),'player logs;',sum(map(len,result.values())),'game appearances;',len(errors),'unavailable',flush=True)
