import fs from 'node:fs/promises';
const key=process.env.OPENROUTER_API_KEY;
const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
const keyResponse=await fetch('https://openrouter.ai/api/v1/key',{headers,signal:AbortSignal.timeout(15000)});const keyData=await keyResponse.json();
await fs.writeFile('.cache/openrouter-current-key.json',JSON.stringify(keyData,null,2));
const body={model:'openai/gpt-oss-120b',messages:[{role:'user',content:'Return only the word OK.'}],max_tokens:16,provider:{allow_fallbacks:false},reasoning:{effort:'low'},temperature:0};
const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});const result=await r.json();
await fs.writeFile('.cache/rate-limit-diagnosis.json',JSON.stringify({checkedAt:new Date().toISOString(),request:body,status:r.status,response:result},null,2));
console.log(JSON.stringify({keyStatus:keyResponse.status,limit:keyData.data?.limit,remaining:keyData.data?.limit_remaining,usage:keyData.data?.usage,rateLimit:keyData.data?.rate_limit,callStatus:r.status,error:result.error,cost:result.usage?.cost,route:result.provider,retryAfter:r.headers.get('retry-after')}));
