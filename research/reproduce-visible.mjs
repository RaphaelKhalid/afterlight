/** Reproduce the frozen visible-explanation protocol with Node 24+, outside archived evidence.
 * Default mode verifies inputs and plans the run without making network calls.
 * Paid mode: node --env-file=.env.local research/reproduce-visible.mjs --execute --cap=2
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { executeScientificTrial } from '../artifacts/experiment/visible-adapter-v1.ts';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const contractPath = path.join(root, 'artifacts/experiment/visible-contract-v1.json');
const source = fs.readFileSync(contractPath, 'utf8').trim();
const contract = JSON.parse(source);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/experiment/visible-contract-v1-manifest.json'), 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
if (sha(source) !== manifest.hash) throw new Error('Frozen contract hash mismatch');
if (sha(fs.readFileSync(path.join(root, 'artifacts/experiment/visible-adapter-v1.ts'))) !== contract.adapterSha256) throw new Error('Frozen adapter bytes changed; inspect and create a documented version before paid reproduction');
const cap = Number(args.find(a=>a.startsWith('--cap='))?.slice(6) ?? contract.maxCapUsd);
if (!Number.isFinite(cap) || cap < contract.maxTrialCostUsd || cap > contract.maxCapUsd) throw new Error('Cap must be between one trial reserve and the frozen maximum');
const plan = { contractId: contract.id, contractHash: manifest.hash, model: contract.model, cases: contract.cases.length, trials: contract.totalTrials, maxCalls: contract.maxCalls, capUsd: cap, costStatus: 'estimated', observationSurface: contract.observationSurface, networkCalls: false };
if (!args.includes('--execute')) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY must be supplied privately in the environment');
const outputRoot = path.join(root, 'work/reproductions');
const outArg = args.find(a=>a.startsWith('--out='))?.slice(6);
const output = outArg ? path.resolve(outArg) : path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-'));
if (!output.startsWith(outputRoot + path.sep)) throw new Error('Output must be a new directory within work/reproductions; archived evidence is immutable');
if (fs.existsSync(output)) throw new Error('Output already exists. No automatic repeat or resume of an unresolved paid run. Inspect its journal first.');
fs.mkdirSync(output, { recursive: true });
const save = (name, value) => { const dest = path.join(output, name); const temp = dest + '.tmp'; fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n'); fs.renameSync(temp, dest); };
const append = value => fs.appendFileSync(path.join(output, 'journal.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
const calls = {};
// This minimal file-backed adapter accepts only the four fixed stage-journal queries.
// Every stage claim is durable before network dispatch, and every response is durable before the next call.
const DB = { prepare(sql) { let values; return { bind(...v) { values=v; return this; }, async first() { if (!sql.startsWith('SELECT * FROM scientific_calls WHERE id')) throw new Error('Unsupported read'); return calls[values[0]] ?? null; }, async run() {
  if (sql.startsWith('INSERT OR IGNORE INTO scientific_calls')) { const [id,run_id,trial_id,stage,request_hash,request_json,reserved_usd,started_at]=values; if(calls[id])return {meta:{changes:0}}; calls[id]={id,run_id,trial_id,stage,request_hash,request_json,status:'dispatching',reserved_usd,started_at}; }
  else if (sql.startsWith("UPDATE scientific_calls SET status='ambiguous'")) { const [completed_at,id]=values; Object.assign(calls[id],{status:'ambiguous',completed_at}); }
  else if (sql.startsWith('UPDATE scientific_calls SET status=?')) { const [status,response_json,http_status,cost_usd,cost_basis,completed_at,id]=values; Object.assign(calls[id],{status,response_json,http_status,cost_usd,cost_basis,completed_at}); }
  else throw new Error('Unsupported journal mutation');
  save('scientific-calls.json',Object.values(calls)); return {meta:{changes:1}};
} }; } };
const runId = 'reproduction-' + crypto.randomUUID();
const run = {id:runId,questionId:contract.questionId,contractId:contract.id,contractHash:manifest.hash,status:'running',createdAt:new Date().toISOString(),capUsd:cap,spentUsd:0,costStatus:'estimated',completedTrials:0,failedTrials:0,totalTrials:contract.totalTrials,conditions:contract.conditions,contract,events:[]};
const trials = [];
save('visible-contract-v1.json',contract); save('environment.json',{node:process.version,platform:process.platform,adapterSha256:contract.adapterSha256,protocolOriginalValidUntil:contract.validUntil,note:'A new manually authorized reproduction, not continuation of the original deployed authorization. Model availability and behavior can change; no bit-for-bit guarantee.'});
outer: for (const testCase of contract.cases) for (const condition of contract.conditions) {
  if(run.spentUsd + contract.maxTrialCostUsd > cap + 1e-9) {run.status='stopped';append({event:'budget_stop',spentUsd:run.spentUsd,nextReserveUsd:contract.maxTrialCostUsd});break outer;}
  const trial={id:'trial-'+crypto.randomUUID(),runId,run_id:runId,caseId:testCase.id,condition:condition.id,status:'running',input:{case:testCase,condition},input_json:JSON.stringify({case:testCase,condition}),createdAt:new Date().toISOString(),provider:contract.provider,model:contract.model};
  append({event:'trial_dispatch',trialId:trial.id,caseId:trial.caseId,condition:trial.condition,reservedUsd:contract.maxTrialCostUsd});
  trials.push(trial);save('visible-trials.json',{trials});save('visible-run.json',run);
  try { const result=await executeScientificTrial(trial,{DB,OPENAI_API_KEY:process.env.OPENAI_API_KEY});Object.assign(trial,{status:'completed',output:result.raw,answer:result.answer,score:result.score,monitorVerdict:result.monitorVerdict,usage:result.usage,costUsd:result.costUsd??contract.maxTrialCostUsd,costStatus:result.costStatus,completedAt:new Date().toISOString()});run.completedTrials++;run.spentUsd+=trial.costUsd;append({event:'trial_completed',trialId:trial.id,costUsd:trial.costUsd}); }
  catch (error) { const records=Object.values(calls).filter(c=>c.trial_id===trial.id);const conservativeCost=records.reduce((sum,c)=>sum+(typeof c.cost_usd==='number'?c.cost_usd:c.reserved_usd),0);Object.assign(trial,{status:'ambiguous',costUsd:conservativeCost,error:String(error),completedAt:new Date().toISOString()});run.spentUsd+=conservativeCost;run.status='paused';append({event:'reconciliation_required',trialId:trial.id,error:String(error),conservativeCostUsd:conservativeCost});save('visible-trials.json',{trials});save('visible-run.json',run);break outer; }
  save('visible-trials.json',{trials});save('visible-run.json',run);
}
if(run.completedTrials===run.totalTrials)run.status='completed';
run.completedAt=new Date().toISOString();save('visible-trials.json',{trials});save('visible-run.json',run);
console.log(JSON.stringify({output,status:run.status,completedTrials:run.completedTrials,spentUsd:run.spentUsd,costStatus:run.costStatus},null,2));

