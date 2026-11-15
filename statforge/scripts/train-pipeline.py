"""Fetch ESPN history, engineer strictly lagged features, train and export browser models.
Run: python scripts/train-pipeline.py --cache work/cache
No current-season results are used to fit the deployed models or residual distribution.
"""
import argparse, concurrent.futures, datetime as dt, json, pathlib, urllib.request, time
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

ROOT=pathlib.Path(__file__).resolve().parents[1]
STATS=['points','rebounds','assists','threes','pra']
FEATURES=['minutes5','minutes10','minutesStd5','rate5','rate10','usage5','pace5','home','restDays','matchupRate','opponentAllowed','lastStarter','teammateAbsenceLag','usageMissing','paceMissing','curry','lebron','jokic']
NOW=dt.datetime.now(dt.timezone.utc)

def fetch(url,path):
 if path.exists() and not (path.name.endswith('-2027.json') and time.time()-path.stat().st_mtime>900):return json.loads(path.read_text())
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'StatForge/1.0'}),timeout=18) as response:d=json.load(response)
   path.write_text(json.dumps(d));return d
  except Exception:
   if attempt==2:raise
 return None

def parse_log(d,year):
 rows=[]
 for season in d.get('seasonTypes',[]):
  if season.get('displayName')!=f'{year-1}-{str(year)[-2:]} Regular Season':continue
  for cat in season.get('categories',[]):
   for item in cat.get('events',[]):
    e=d['events'][item['eventId']];s=dict(zip(d['names'],item['stats']))
    try:
     date=dt.datetime.fromisoformat(e['gameDate'].replace('Z','+00:00'))
     if date>NOW or float(s['minutes'])<=0:continue
     g=dict(id=e['id'],date=e['gameDate'],opponent=e['opponent']['abbreviation'],opponentName=e['opponent']['displayName'],venue='home' if e['atVs']=='vs' else 'away',points=float(s['points']),rebounds=float(s['totalRebounds']),assists=float(s['assists']),threes=float(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted'].split('-')[0]),minutes=float(s['minutes']),fga=float(s['fieldGoalsMade-fieldGoalsAttempted'].split('-')[1]),fta=float(s['freeThrowsMade-freeThrowsAttempted'].split('-')[1]),turnovers=float(s['turnovers']),result=e.get('gameResult'),score=e.get('score'),url=next((l['href'] for l in e['links'] if 'boxscore' in l.get('rel',[])),''),role='unknown',seasonId=year,teammates={})
     g['pra']=g['points']+g['rebounds']+g['assists'];rows.append(g)
    except (ValueError,KeyError):continue
 return rows

def number(value):
 try:return float(value)
 except (ValueError,TypeError):return None

def enrich(g,pid,summary):
 try:
  boxes=summary['boxscore'];teams=boxes['teams'];athlete=None;team_id=None;team_minutes=0
  for team in boxes['players']:
   for section in team['statistics']:
    candidate=next((a for a in section.get('athletes',[]) if a['athlete']['id']==pid),None)
    if candidate:
     athlete=candidate;team_id=team['team']['id'];labels=section['labels']
     for a in section['athletes']:
      if a.get('didNotPlay'):continue
      raw=dict(zip(labels,a.get('stats',[]))).get('MIN','0')
      try:team_minutes+=float(raw.split(':')[0])+(float(raw.split(':')[1])/60 if ':' in raw else 0)
      except ValueError:pass
     g['role']='starter' if candidate.get('starter') else 'bench'
     for a in section['athletes']:
      aid=a['athlete']['id'];g['appearances'][aid]=not a.get('didNotPlay',False) and number(dict(zip(labels,a.get('stats',[]))).get('MIN',0)) not in (None,0)
  if not team_id:return
  possessions=[];own=None;opp=None
  for team in teams:
   s={x['name']:x['displayValue'] for x in team['statistics']}
   fga=float(s['fieldGoalsMade-fieldGoalsAttempted'].split('-')[1]);fta=float(s['freeThrowsMade-freeThrowsAttempted'].split('-')[1]);oreb=float(s['offensiveRebounds']);to=float(s.get('totalTurnovers',s['turnovers']))
   possession=fga+.44*fta-oreb+to;possessions.append(possession)
   row={'denom':fga+.44*fta+to,'possessions':possession,'points':float(s['fieldGoalsMade-fieldGoalsAttempted'].split('-')[0])*2+float(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted'].split('-')[0])+float(s['freeThrowsMade-freeThrowsAttempted'].split('-')[0])}
   if team['team']['id']==team_id:own=row
   else:opp=row
  duration=team_minutes/5 if team_minutes>200 else 48
  if own and own['denom']>0:g['usage']=100*(g['fga']+.44*g['fta']+g['turnovers'])*duration/(g['minutes']*own['denom'])
  if len(possessions)==2:g['pace']=sum(possessions)/2*48/duration
  if own and opp:g['opponentAllowed']=100*own['points']/max(1,own['possessions'])
 except (KeyError,ValueError,TypeError,IndexError):pass

def avg(a,default=0):return float(np.mean(a)) if len(a) else default

def feature(history,g,stat,pid,opp_history):
 h=history[-10:];last5=h[-5:]
 def rate(rows):return sum(r[stat] for r in rows)/max(1,sum(r['minutes'] for r in rows))
 usage=[r['usage'] for r in last5 if r.get('usage') is not None];pace=[r['pace'] for r in last5 if r.get('pace') is not None]
 match=[r for r in history if r['opponent']==g['opponent']][-5:]
 rest=min(7,max(0,(dt.datetime.fromisoformat(g['date']).date()-dt.datetime.fromisoformat(history[-1]['date']).date()).days-1))
 absence=[1-float(np.mean(list(r['teammates'].values()))) for r in last5 if r.get('teammates')]
 opponent=[v for date,v in opp_history.get(g['opponent'],[]) if date<g['date']][-10:]
 return [avg([r['minutes'] for r in last5]),avg([r['minutes'] for r in h]),float(np.std([r['minutes'] for r in last5])),rate(last5),rate(h),avg(usage,25),avg(pace,100),float(g['venue']=='home'),rest,rate(match) if match else rate(h),avg(opponent,112),float(history[-1]['role']=='starter'),avg(absence),float(not usage),float(not pace),float(pid=='3975'),float(pid=='1966'),float(pid=='3112335')]

def train(rows):
 X=np.array([r['x'] for r in rows]);minutes=np.array([r['minutes'] for r in rows]);rates=np.array([r['rate'] for r in rows])
 scaler=StandardScaler().fit(X);Xm=scaler.transform(X);Xm[:,[3,4,9]]=0;ridge=Ridge(alpha=30).fit(Xm,minutes)
 forest=RandomForestRegressor(n_estimators=48,max_depth=6,min_samples_leaf=8,max_features=.85,random_state=2026,n_jobs=2).fit(X,rates,sample_weight=np.clip(minutes/36,.05,1.5))
 return scaler,ridge,forest

def predict(model,rows):
 X=np.array([r['x'] for r in rows]);s,r,f=model
 Xm=s.transform(X);Xm[:,[3,4,9]]=0
 return np.clip(r.predict(Xm),0,48),np.maximum(0,f.predict(X))

def export(model):
 scaler,ridge,forest=model
 trees=[]
 for estimator in forest.estimators_:
  t=estimator.tree_;trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'value':t.value[:,0,0].tolist()})
 return {'minutes':{'mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),'coef':ridge.coef_.tolist(),'intercept':float(ridge.intercept_)},'production':{'trees':trees}}

def simulate(pm,pr,residuals,line,seed=42,size=20000):
 rng=np.random.default_rng(seed);r=np.array(residuals);pairs=r[rng.integers(0,len(r),size=size)];minutes=np.clip(pm+pairs[:,0],0,48);rate=np.maximum(0,pr+pairs[:,1]);totals=np.floor(minutes*rate+.5)
 return {'over':float(np.mean(totals>line)),'under':float(np.mean(totals<line)),'push':float(np.mean(totals==line)),'low':float(np.quantile(totals,.1)),'high':float(np.quantile(totals,.9)),'mean':float(np.mean(totals))}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--cache',default=str(ROOT/'work'/'cache'));args=parser.parse_args();cache=pathlib.Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
 snapshot=json.loads((ROOT/'public/data.json').read_text());players=snapshot['players'];tasks=[(p,year) for p in players for year in (2025,2026,2027)]
 def get_log(task):
  p,y=task;d=fetch(f'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{p["id"]}/gamelog?season={y}',cache/f'log-{p["id"]}-{y}.json');return p['id'],parse_log(d,y)
 history={p['id']:[] for p in players}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for pid,rows in pool.map(get_log,tasks):history[pid].extend(rows)
 all_games={g['id'] for games in history.values() for g in games}
 print('Fetched logs:',{pid:len(g) for pid,g in history.items()},'box scores',len(all_games),flush=True)
 def get_summary(gid):
  try:return gid,fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+gid,cache/f'summary-{gid}.json')
  except Exception:return gid,{}
 summaries={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
  for index,(gid,d) in enumerate(pool.map(get_summary,sorted(all_games))):
   summaries[gid]=d
   if (index+1)%50==0:print('Box scores',index+1,'/',len(all_games),flush=True)
 opp_history={}
 for p in players:
  history[p['id']].sort(key=lambda g:g['date'])
  for g in history[p['id']]:
   g['appearances']={};g['usage']=None;g['pace']=None;enrich(g,p['id'],summaries.get(g['id'],{}))
   for t in p['teammates']:
    if t['id'] in g['appearances']:g['teammates'][t['name']]=g['appearances'][t['id']]
   if g.get('opponentAllowed') is not None:opp_history.setdefault(g['opponent'],[]).append((g['date'],g['opponentAllowed']))
 for values in opp_history.values():values.sort()
 records={stat:[] for stat in STATS}
 for p in players:
  past=[]
  for g in history[p['id']]:
   if len(past)>=5:
    for stat in STATS:records[stat].append({'date':g['date'],'pid':p['id'],'seasonId':g['seasonId'],'x':feature(past,g,stat,p['id'],opp_history),'minutes':g['minutes'],'rate':g[stat]/g['minutes'],'value':g[stat],'id':g['id']})
   past.append(g)
  p['history']=history[p['id']];p['games']=[g for g in p['history'] if g['seasonId']==2027]
 pipeline={'version':1,'trainedAt':NOW.isoformat(),'features':FEATURES,'trainingSeasons':['2024-25','2025-26'],'holdoutSeason':'2026-27','models':{},'coverage':{'injuries':'No verified historical injury timeline. Minutes limits and active probability are manual scenarios.','teammates':'Last known box-score appearances only; no historical pregame status feed.','opponentDefense':'Prior points allowed per estimated possession in the covered player-game sample, not full-league defensive rating.'}}
 for stat,rows in records.items():
  rows.sort(key=lambda r:r['date']);training=[r for r in rows if r['seasonId']<2027];holdout=[r for r in rows if r['seasonId']==2027];model=train(training)
  # Out-of-fold residuals: each calendar block is predicted only from earlier dates.
  dates=sorted({r['date'][:10] for r in training});cuts=np.linspace(max(30,len(dates)//3),len(dates),5,dtype=int);residuals=[]
  for left,right in zip(cuts[:-1],cuts[1:]):
   start=dates[left];end=dates[right] if right<len(dates) else '9999'
   fit=[r for r in training if r['date'][:10]<start];test=[r for r in training if start<=r['date'][:10]<end]
   if not test or len(fit)<40:continue
   pm,pr=predict(train(fit),test)
   residuals.extend([[float(r['minutes']-m),float(r['rate']-v)] for r,m,v in zip(test,pm,pr)])
  if len(residuals)<30:raise RuntimeError('Insufficient chronological residual calibration data')
  pm,pr=predict(model,holdout);validation={}
  for p in players:
   indices=[i for i,r in enumerate(holdout) if r['pid']==p['id']];actual=np.array([holdout[i]['value'] for i in indices]);pred=np.array([pm[i]*pr[i] for i in indices]);baseline=np.array([holdout[i]['x'][0]*holdout[i]['x'][3] for i in indices])
   # Evaluate probability skill at lines defined from prior observations, not future market lines.
   probs=[];outcomes=[];covered=[]
   for i in indices:
    row=holdout[i];line=float(np.floor(row['x'][0]*row['x'][3])+.5);sim=simulate(pm[i],pr[i],residuals,line,seed=i+123,size=4000);probs.append(sim['over']);outcomes.append(float(row['value']>line));covered.append(sim['low']<=row['value']<=sim['high'])
   validation[p['id']]={'games':len(indices),'mae':float(np.mean(np.abs(actual-pred))) if indices else None,'baselineMae':float(np.mean(np.abs(actual-baseline))) if indices else None,'minutesMae':float(np.mean([abs(holdout[i]['minutes']-pm[i]) for i in indices])) if indices else None,'brier':float(np.mean((np.array(probs)-outcomes)**2)) if indices else None,'intervalCoverage':avg(covered) if indices else None,'probabilityTest':'Synthetic pregame line = floor(prior-five minutes × prior-five production rate) + 0.5. Not sportsbook lines.'}
  out=export(model);out.update({'trainingRows':len(training),'residuals':residuals,'validation':validation,'calibrationRows':len(residuals)})
  pipeline['models'][stat]=out
  print(stat,'train',len(training),'holdout',len(holdout),'residuals',len(residuals),'Curry MAE',validation['3975']['mae'],flush=True)
 # Strict JSON; retain a compact historical dataset for browser-side lagged feature engineering.
 snapshot['fetchedAt']=NOW.isoformat();snapshot['pipelineCoverage']={'historicalGames':sum(len(h) for h in history.values()),'usageGames':sum(g.get('usage') is not None for h in history.values() for g in h),'paceGames':sum(g.get('pace') is not None for h in history.values() for g in h)}
 for p in players:
  for g in p['history']:g.pop('appearances',None)
 (ROOT/'public/data.json').write_text(json.dumps(snapshot,separators=(',',':'),allow_nan=False))
 (ROOT/'public/pipeline-models.json').write_text(json.dumps(pipeline,separators=(',',':'),allow_nan=False))
 print('Saved',snapshot['pipelineCoverage'],flush=True)

if __name__=='__main__':main()
