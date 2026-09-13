import fs from 'node:fs/promises';
const request={model:'openai/gpt-oss-120b',messages:[{role:'user',content:'Return a JSON object with status equal to ready.'}],max_tokens:256,temperature:0,reasoning:{effort:'low'},include_reasoning:true,provider:{order:['deepinfra/bf16'],allow_fallbacks:false}};
const startedAt=new Date().toISOString();
const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENROUTER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
const raw=await r.json();
if(raw.user_id)delete raw.user_id;
const result={kind:'development-capability-check',notScientificObservation:true,startedAt,completedAt:new Date().toISOString(),request,status:r.status,response:raw};
await fs.writeFile('artifacts/experiment/deepinfra-capability-probe.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:r.status,route:raw.provider,content:raw.choices?.[0]?.message?.content,reasoningAccessible:!!raw.choices?.[0]?.message?.reasoning,cost:raw.usage?.cost,error:raw.error?.message}));
