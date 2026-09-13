#!/usr/bin/env python3
"""Bounded operational continuation of v3 and v3.1, with no new subject conditions."""
from __future__ import annotations
import json, time, hashlib, urllib.request, urllib.error, os, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,str(Path(__file__).resolve().parent))
import runner_v3 as base
ROOT=Path(__file__).resolve().parents[1]; ART=ROOT/'artifacts'/'experiment'
OUT=ART/'v3.2-recovery-raw.jsonl'; JOURNAL=ART/'v3.2-dispatch-journal.jsonl'
MAX_CALLS=350; CAP=1.80; RESERVE=.005; INTERVAL=5.0
now=lambda:datetime.now(timezone.utc).isoformat()
def read(name):
 p=ART/name
 return [json.loads(s) for s in p.read_text(encoding='utf8').splitlines() if s.strip()] if p.exists() else []
def key(row): return (row['caseId'],row['condition'],int(row['seed']))
def append(path,row):
 with path.open('a',encoding='utf8') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n');f.flush();os.fsync(f.fileno())
def prior_state():
 original=read('v3-heldout-raw.jsonl'); recovery=read('v3.1-recovery-raw.jsonl')
 rejected=[r for r in original if r['status']=='failed' and '429' in r.get('error','')]
 subjects={key(r):r for r in original if r['status']=='completed'}
 previously_retried=set()
 for r in recovery:
  if r['kind']=='subject':
   index=int(r['sourceId'].split('-')[-1]); old=rejected[index]; previously_retried.add(key(old))
   if r['status']=='completed':subjects[key(old)]={**old,**r,'caseId':old['caseId'],'condition':old['condition'],'seed':old['seed']}
 successful_monitor_sources={r['sourceId'] for r in recovery if r['kind']=='monitor' and r['status']=='completed'}
 return original,recovery,rejected,subjects,previously_retried,successful_monitor_sources
calls=0; charged=0.0; unknown=0; consecutive=0; total429=0
class Halt(Exception): pass
def invoke(kind,origin,request,tag):
 global calls,charged,unknown,consecutive,total429
 if calls>=MAX_CALLS or charged+(unknown+1)*RESERVE>CAP:raise Halt('call or reserved cost ceiling')
 time.sleep(INTERVAL)
 dispatch={'dispatchId':tag,'kind':kind,'caseId':origin['caseId'],'condition':origin['condition'],'seed':origin['seed'],'startedAt':now(),'requestSha256':hashlib.sha256(json.dumps(request,sort_keys=True).encode()).hexdigest(),'request':request,'reservedUsd':RESERVE}
 append(JOURNAL,dispatch);calls+=1
 row={**dispatch,'recovery':'v3.2','sourceId':origin.get('providerRequestId'),'status':'failed'}
 req=urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',data=json.dumps(request).encode(),method='POST',headers={'Authorization':'Bearer '+os.environ['OPENROUTER_API_KEY'],'Content-Type':'application/json','HTTP-Referer':'https://afterlight-research.vercel.app','X-Title':'Afterlight operational recovery'})
 try:
  with urllib.request.urlopen(req,timeout=90) as response:raw=json.load(response)
  choice=(raw.get('choices')or[{}])[0];message=choice.get('message')or{};content=message.get('content')or''
  if raw.get('error'):raise Halt('provider returned an error in a successful HTTP response')
  cost=base.cost_of(raw)
  if cost is None:unknown+=1
  else:charged+=cost
  row.update(status='completed',httpStatus=200,providerRequestId=raw.get('id'),providerModel=raw.get('model'),providerRoute=raw.get('provider'),rawContent=content,providerReasoning=message.get('reasoning'),reasoningFieldAccessible=bool(message.get('reasoning')),finishReason=choice.get('finish_reason'),usage=raw.get('usage'),costUsd=cost,rawResponse=raw)
  if kind=='subject':row['choice'],row['rationale']=base.parse_subject(content)
  else:row['monitorVerdict'],row['monitorExplanation']=base.parse_monitor(content)
  consecutive=0
 except urllib.error.HTTPError as exc:
  error_text=exc.read().decode('utf8',errors='replace')
  row.update(httpStatus=exc.code,errorBody=error_text,error=f'HTTP {exc.code}',retryAfter=exc.headers.get('Retry-After'))
  # Rejected requests have no returned billing receipt. Preserve reserved uncertainty.
  unknown+=1;consecutive+=1
  if exc.code==429:total429+=1
 except Exception as exc:
  unknown+=1;consecutive+=1;row.update(status='ambiguous',error=type(exc).__name__+': '+str(exc))
 row['completedAt']=now();append(OUT,row)
 print(json.dumps({'kind':kind,'case':origin['caseId'],'status':row['status'],'http':row.get('httpStatus'),'calls':calls,'knownCost':round(charged,8),'unknownCosts':unknown}),flush=True)
 if row['status']=='ambiguous':raise Halt('ambiguous paid outcome; no automatic repeat')
 if row.get('httpStatus')==429:
  if total429>=10:raise Halt('ten rate-limit rejections')
  time.sleep(45)
 elif consecutive>=2:raise Halt('two consecutive non-rate-limit failures')
 return row

def main():
 base.load_env()
 if OUT.exists() or JOURNAL.exists():raise SystemExit('Existing v3.2 evidence found. Refusing to repeat; inspect ledger and create explicit continuation.')
 original,recovery,rejected,subjects,tried,monitored=prior_state()
 stop='all eligible work complete'
 try:
  for old in rejected:
   if key(old) in tried:continue
   row=invoke('subject',old,old['request'],'subject:'+':'.join(map(str,key(old))))
   if row['status']=='completed':subjects[key(old)]=row
  for k,subject in sorted(subjects.items()):
   if subject.get('choice') not in ['A','B'] or subject.get('providerRequestId') in monitored:continue
   c=next(c for c in base.CASES if c.id==k[0])
   request={'model':base.MODEL,'messages':[{'role':'user','content':base.monitor_prompt(c,k[1],subject['choice'],subject.get('rationale')or'',subject.get('providerReasoning')or'')}],'temperature':0,'seed':k[2],'max_tokens':base.MONITOR_MAX_TOKENS,'include_reasoning':True,'reasoning':{'effort':base.REASONING_EFFORT},'provider':{'allow_fallbacks':False}}
   row=invoke('monitor',subject,request,'monitor:'+':'.join(map(str,k)))
   if row.get('httpStatus')==429:
    # One explicitly rejected monitor request may be retried once after cooling down.
    invoke('monitor',subject,request,'monitor-retry:'+':'.join(map(str,k)))
 except Halt as exc:stop=str(exc)
 finally:
  summary={'schemaVersion':'afterlight.experiment.recovery.v3.2','completedAt':now(),'calls':calls,'knownCostUsd':charged,'unknownCostCalls':unknown,'reservedUnknownUsd':unknown*RESERVE,'callCeiling':MAX_CALLS,'capUsd':CAP,'stopReason':stop,'rawEvidence':OUT.name,'dispatchJournal':JOURNAL.name,'originalSubjectRowsNeverRepeated':168,'originalProtocolAndPrimaryAnalysisUnchanged':True}
  (ART/'v3.2-recovery-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8');print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
