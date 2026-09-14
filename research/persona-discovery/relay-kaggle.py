"""Relay Kaggle's real status and structured logs; credentials stay on the owner's machine."""
import argparse, json, os, queue, threading, time
from datetime import datetime
from pathlib import Path
import requests
from kaggle.api.kaggle_api_extended import KaggleApi

parser=argparse.ArgumentParser()
parser.add_argument('--env-file',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--seconds',type=int,default=7500)
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
config={}
for line in Path(args.env_file).read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1);config[k]=v.strip().strip('"').strip("'")
owner=config['OWNER_ACCESS_TOKEN']
api=KaggleApi();api.authenticate()
endpoint='https://afterlight-api.raphaelbahadurkhan.workers.dev/api/studies/persona-discovery/status'
notebook='raphaelkhalid0/unsupervisedsaes'
messages=queue.Queue()
stop=threading.Event()

def stream():
    delay=5
    while not stop.is_set():
        try:
            for item in api.kernels_logs_stream(notebook):
                if stop.is_set():break
                messages.put(item)
            if stop.is_set():break
        except Exception as e: messages.put({'relayError':str(e)})
        if stop.wait(delay):break
        delay=min(delay*2,30)

threading.Thread(target=stream,daemon=True).start()
latest=None;last_poll=0;started=time.monotonic();terminal=False
try:
    existing=requests.get(endpoint,timeout=15)
    if existing.ok and existing.json().get('telemetry')=='notebook-log': latest=existing.json()
except requests.RequestException: pass

def publish(payload):
    payload=dict(payload)
    payload['notebookUrl']='https://www.kaggle.com/code/'+notebook
    payload['artifactUrl']='https://github.com/RaphaelKhalid/afterlight/tree/main/research/persona-discovery'
    response=requests.post(endpoint,json=payload,headers={'Authorization':'Bearer '+owner},timeout=20)
    response.raise_for_status()
    (out/'latest-status.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    print(json.dumps(payload),flush=True)

def consume(item):
    global latest
    with (out/'kaggle-log.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(item)+'\n')
    if 'relayError' in item:print('Log stream unavailable; coarse Kaggle status remains available.',flush=True);return
    data=item.get('data','')
    if not isinstance(data,str):return
    for line in data.splitlines():
        try:value=json.loads(line)
        except (ValueError,TypeError):continue
        if not isinstance(value,dict) or 'contractHash' not in value or 'phase' not in value:continue
        if latest and latest.get('telemetry')=='notebook-log':
            if datetime.fromisoformat(value['updatedAt'].replace('Z','+00:00')) <= datetime.fromisoformat(latest['updatedAt'].replace('Z','+00:00')): continue
        value['telemetry']='notebook-log'
        latest={k:value[k] for k in ['status','phase','completed','total','updatedAt','message','telemetry']}
        publish(latest)

while time.monotonic()-started < args.seconds:
    try:consume(messages.get(timeout=1))
    except queue.Empty:pass
    except requests.RequestException as e:print('Progress publish failed; next notebook event will retry synchronization: '+str(e),flush=True)
    if time.monotonic()-last_poll>=30:
        last_poll=time.monotonic()
        try:
            result=api.kernels_status(notebook)
            state=result.status.name
            now=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
            with (out/'kaggle-status.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps({'state':state,'checkedAt':now,'failureMessage':result.failure_message})+'\n')
            if latest is None:
                mapped={'RUNNING':'running','QUEUED':'queued','COMPLETE':'completed','ERROR':'failed','CANCEL_REQUESTED':'incomplete','CANCEL_ACKNOWLEDGED':'incomplete'}.get(state,'preparing')
                publish(dict(status=mapped,phase='discovery',completed=0,total=1024,updatedAt=now,telemetry='kaggle-status',
                    message='Kaggle reports '+state.lower()+'. Per-response progress has not yet been received. '+(result.failure_message or '')))
            if state in ('COMPLETE','ERROR','CANCEL_ACKNOWLEDGED'):
                if state!='COMPLETE' and latest is not None and latest['status'] not in ('failed','incomplete'):
                    latest={**latest,'status':'failed' if state=='ERROR' else 'incomplete','updatedAt':now,'message':'Kaggle terminated the job. '+(result.failure_message or 'Retrieve logs for details.')}
                    publish(latest)
                terminal=True
        except Exception as e:print('Status synchronization error: '+str(e),flush=True)
    if terminal and messages.empty():break
stop.set()
print('Relay stopped: '+('Kaggle terminal state.' if terminal else 'bounded observation window ended.'),flush=True)
