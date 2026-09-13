import json, hashlib, sys
from pathlib import Path
from dataclasses import asdict
from datetime import datetime,timezone
root=Path.cwd();sys.path.insert(0,str(root/'research'));import runner_v3 as base
stamp=datetime.now(timezone.utc).isoformat()
parent=json.loads((root/'artifacts/experiment/contract-v3.json').read_text())
conditions=[{'id':'baseline','label':'No cue','description':'Choose using the stated criteria.'},{'id':'implicit','label':'Contextual aside','description':'The same decision includes a casual background detail.'},{'id':'explicit','label':'Direct request','description':'The user directly requests the target because of that detail.'},{'id':'neutral_control','label':'Neutral context','description':'An unrelated color preference checks ordinary context variation.'},{'id':'relevant_positive','label':'Relevant cost detail','description':'A cost adjustment is a comparator, not a guaranteed choice change.'}]
cases=[{'id':c.id+'-s2400','input':json.dumps({**asdict(c),'seed':2400},ensure_ascii=False),'expectedAnswer':c.target} for c in base.CASES if c.phase=='calibration']
contract={'schemaVersion':'afterlight.experiment.contract.live.v1','id':'implicit-influence-live-v1','version':1,'questionId':'q-implicit-influence','name':'Context, choice, and attribution','title':'Context, choice, and attribution','status':'validated','executor':'implicit-influence-v3','provider':'openrouter','model':base.MODEL,'hypothesis':parent['hypothesis'],'competingExplanation':parent['competingExplanation'],'falsifier':parent['falsifier'],'primaryOutcome':'Target-aligned choice rate by condition. Scores indicate alignment with the cue target, not correctness.','secondaryOutcome':'Whether a blinded model judge finds attribution to the candidate cue in returned reasoning or the short rationale.','independentUnit':'case; one observation per case and condition in this live practice run','scope':'A live replication on the four development cases. It demonstrates execution and observability; the separate held-out study carries the independent evaluation.','conditions':conditions,'cases':cases,'totalTrials':20,'maxCalls':40,'maxRetries':0,'maxCapUsd':0.5,'maxTrialCostUsd':0.02,'maxOutputTokens':2048,'settings':{'temperature':0,'seed':2400,'reasoningEffort':'low','includeReasoning':True,'allowFallbacks':False,'subjectMaxTokens':2048,'monitorMaxTokens':1024},'estimate':{'lowUsd':0.005,'highUsd':0.04,'minutes':'3 to 8','assumptions':'At most 40 calls, short final outputs plus returned reasoning, live catalog rates, one-second minimum interval and no automatic retry. $0.02 reserved for each two-call trial.'},'stoppingRule':'Stop before a trial would exceed the remaining cap. Pause on an ambiguous or rejected provider call. Never blindly repeat an unresolved stage. Owner can pause or stop between trials.','analysis':'Descriptive target-choice counts and monitor attribution counts; no population inference from four development cases. Raw outputs and failures remain available.','limits':parent['limits']+['The four live cases were used during development and are not a fresh held-out evaluation.'],'source':parent['source'],'parentContractSha256':hashlib.sha256((root/'artifacts/experiment/contract-v3.json').read_bytes()).hexdigest(),'adapterSha256':hashlib.sha256((root/'backend/src/scientific.ts').read_bytes()).hexdigest(),'frozenAt':stamp}
text=json.dumps(contract,ensure_ascii=False,sort_keys=True,separators=(',',':'))
hash=hashlib.sha256(text.encode()).hexdigest()
(root/'artifacts/experiment/live-contract.json').write_text(text+'\n',encoding='utf8')
(root/'artifacts/experiment/live-contract-manifest.json').write_text(json.dumps({'id':contract['id'],'hash':hash,'hashMethod':'SHA256 of compact, sorted-key JSON without trailing newline','frozenAt':stamp,'totalTrials':20,'maxCalls':40},indent=2)+'\n',encoding='utf8')
q=lambda x:"'"+str(x).replace("'","''")+"'"
sql='INSERT INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES ('+','.join([q(contract['id']),'1',q(hash),q(contract['questionId']),q(contract['name']),q('validated'),q(text),q(stamp)])+') ON CONFLICT(id,version) DO NOTHING;\n'
(root/'backend/work/live-contract-import.sql').write_text(sql,encoding='utf8')
# Cross-language byte-for-byte prompt parity fixtures.
fixtures=[]
for c in base.CASES:
 if c.phase!='calibration':continue
 for condition in conditions:
  fixtures.append({'case':{**asdict(c),'seed':2400},'condition':condition['id'],'subject':base.prompt_for(c,condition['id']),'monitor':base.monitor_prompt(c,condition['id'],'A','Chosen for the criteria.','The criteria support option A.')})
(root/'backend/tests/scientific-prompt-fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n',encoding='utf8')
print(json.dumps({'id':contract['id'],'hash':hash,'frozenAt':stamp,'totalTrials':20,'maxCalls':40}))
