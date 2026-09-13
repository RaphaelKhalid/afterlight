import fs from 'node:fs/promises';
const origin='https://afterlight-research.vercel.app';
const manifest=JSON.parse(await fs.readFile('artifacts/experiment/live-contract-v3-manifest.json','utf8'));
const request={contractId:manifest.id,contractHash:manifest.hash,capUsd:0.5};
await fs.writeFile('.cache/live-run-dispatch.json',JSON.stringify({at:new Date().toISOString(),request,status:'dispatching'},null,2));
const r=await fetch(origin+'/api/runs',{method:'POST',headers:{Authorization:'Bearer '+process.env.OWNER_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});const body=await r.json();
const record={at:new Date().toISOString(),request,httpStatus:r.status,response:body};await fs.writeFile('artifacts/integrations/live-run-start.json',JSON.stringify(record,null,2));if(body.run?.id)await fs.writeFile('.cache/live-run-id.txt',body.run.id);console.log(JSON.stringify(record));
