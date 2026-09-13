import fs from 'node:fs/promises';
const origin='https://afterlight-research.vercel.app';
const headers={Authorization:'Bearer '+process.env.OWNER_ACCESS_TOKEN,'Content-Type':'application/json'};
const checks=[];
for(const path of ['/api/health','/api/questions','/api/contracts','/api/attempts?questionId=q-implicit-influence']){const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});const j=await r.json();checks.push({path,status:r.status,questionCount:j.questions?.length,contractCount:j.contracts?.length,attemptCount:j.attempts?.length});}
const invitation=await fetch(origin+'/api/telegram/invite',{method:'POST',headers,body:JSON.stringify({questionId:'q-implicit-influence',chatId:process.env.TELEGRAM_ALLOWED_CHAT_IDS}),signal:AbortSignal.timeout(20000)});
const raw=await invitation.json();await fs.writeFile('.cache/telegram-invitation.json',JSON.stringify(raw,null,2));
const report={checkedAt:new Date().toISOString(),checks,invitation:{status:invitation.status,deduplicated:raw.invitation?.deduplicated,error:raw.error?.code}};
await fs.writeFile('artifacts/integrations/production-invitation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
