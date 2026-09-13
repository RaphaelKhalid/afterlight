import fs from 'node:fs/promises';
const url='https://afterlight-research.vercel.app/api/questions/q-implicit-influence/investigate';
const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.OWNER_ACCESS_TOKEN,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(40000)});const body=await r.json();
const report={checkedAt:new Date().toISOString(),httpStatus:r.status,response:body};await fs.writeFile('artifacts/integrations/live-exa-investigation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:r.status,keys:Object.keys(body),investigationId:body.investigation?.id,sourceCount:body.investigation?.sources?.length,cost:body.investigation?.costUsd,error:body.error?.code}));
