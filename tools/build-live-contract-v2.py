import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path.cwd();art=root/'artifacts'/'experiment';old=json.loads((art/'live-contract.json').read_text());new={**old};new['id']='implicit-influence-live-v2';new['schemaVersion']='afterlight.experiment.contract.live.v2';new['name']='Context, choice, and attribution';new['frozenAt']=datetime.now(timezone.utc).isoformat();new['parentLiveContract']='implicit-influence-live-v1';new['route']='deepinfra/bf16';new['settings']={**old['settings'],'providerOrder':['deepinfra/bf16']};new['operationalChange']='Pin DeepInfra BF16 after observed AkashML shared-pool queue timeouts. Same model name and frozen prompts; this is a separately labeled endpoint version, not pooled with the original AkashML study.';new['adapterSha256']=hashlib.sha256((root/'backend/src/scientific.ts').read_bytes()).hexdigest();new['cases']=[]
for c in old['cases']:
 data=json.loads(c['input']);data['route']='deepinfra/bf16';new['cases'].append({**c,'input':json.dumps(data,ensure_ascii=False)})
text=json.dumps(new,ensure_ascii=False,sort_keys=True,separators=(',',':'));hash=hashlib.sha256(text.encode()).hexdigest();(art/'live-contract-v2.json').write_text(text+'\n',encoding='utf8');(art/'live-contract-v2-manifest.json').write_text(json.dumps({'id':new['id'],'hash':hash,'hashMethod':'SHA256 of compact, sorted-key JSON without trailing newline','frozenAt':new['frozenAt'],'totalTrials':20,'maxCalls':40},indent=2)+'\n',encoding='utf8')
q=lambda x:"'"+str(x).replace("'","''")+"'"
sql='INSERT INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES ('+','.join([q(new['id']),'1',q(hash),q(new['questionId']),q(new['name']),q('validated'),q(text),q(new['frozenAt'])])+') ON CONFLICT(id,version) DO NOTHING;\n'
(root/'backend/work/live-contract-v2-import.sql').write_text(sql,encoding='utf8');print(json.dumps({'id':new['id'],'hash':hash,'route':new['route']}))
