import fs from 'node:fs/promises';
import crypto from 'node:crypto';
async function main() {
const base='https://afterlight-api.raphaelbahadurkhan.workers.dev';
const id=(await fs.readFile('.cache/visible-run-id.txt','utf8')).trim();
const get=async path=>{const r=await fetch(base+path+'?export='+Date.now());if(!r.ok)throw new Error('Export HTTP '+r.status);return r.json()};
const run=await get('/api/runs/'+id);
if(run.status!=='completed') {console.log(JSON.stringify({status:run.status,completed:run.completedTrials,total:run.totalTrials,note:'No final evidence overwritten'}));process.exitCode=2;return;}
const [trials,evidence]=await Promise.all([get('/api/runs/'+id+'/trials'),get('/api/runs/'+id+'/export')]);
const manifest=JSON.parse(await fs.readFile('artifacts/experiment/visible-contract-v1-manifest.json','utf8'));
if(run.contractHash!==manifest.hash||run.contractId!==manifest.id)throw new Error('Wrong frozen contract');
const rawIds=trials.trials.flatMap(t=>[t.output?.subject?.id,t.output?.monitor?.id]).filter(Boolean);
const report={checkedAt:new Date().toISOString(),runId:id,contractHash:run.contractHash,runStatus:run.status,plannedTrials:run.totalTrials,completedTrials:run.completedTrials,failedTrials:run.failedTrials,trialRows:trials.trials.length,uniqueTrialIds:new Set(trials.trials.map(t=>t.id)).size,providerResponseIds:rawIds.length,uniqueProviderResponseIds:new Set(rawIds).size,scientificStageRecords:evidence.scientificCalls?.length,stageStatuses:evidence.scientificCalls?.reduce((a,c)=>(a[c.status]=(a[c.status]??0)+1,a),{}),spentUsd:run.spentUsd,costStatus:run.costStatus};
if(report.uniqueTrialIds!==report.trialRows||report.uniqueProviderResponseIds!==rawIds.length)throw new Error('Duplicate identifiers detected');
await fs.writeFile('artifacts/experiment/visible-run.json',JSON.stringify(run,null,2)+'\n');await fs.writeFile('artifacts/experiment/visible-trials.json',JSON.stringify(trials,null,2)+'\n');await fs.writeFile('artifacts/experiment/visible-execution-export.json',JSON.stringify(evidence,null,2)+'\n');
report.trialsFileSha256=crypto.createHash('sha256').update(await fs.readFile('artifacts/experiment/visible-trials.json')).digest('hex');
await fs.writeFile('artifacts/evaluation/completed-run-integrity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

}
await main();
