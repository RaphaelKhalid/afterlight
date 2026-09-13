import fs from 'node:fs/promises';
const manifest=JSON.parse(await fs.readFile('artifacts/experiment/visible-contract-v1-manifest.json','utf8'));
const request={contractId:manifest.id,contractHash:manifest.hash,capUsd:2};
const journal='.cache/visible-run-dispatch.json';
try {await fs.stat(journal);throw new Error('A dispatch journal already exists. Inspect the remote run; never blindly create another.');}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.writeFile(journal,JSON.stringify({at:new Date().toISOString(),request,status:'dispatching'},null,2),{flag:'wx'});
const response=await fetch('https://afterlight-research.vercel.app/api/runs',{method:'POST',headers:{Authorization:'Bearer '+process.env.OWNER_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
const body=await response.json();const record={at:new Date().toISOString(),request,httpStatus:response.status,response:body};
await fs.writeFile('artifacts/integrations/visible-run-start.json',JSON.stringify(record,null,2));
if(body.run?.id)await fs.writeFile('.cache/visible-run-id.txt',body.run.id);
console.log(JSON.stringify(record));
