import fs from 'node:fs/promises';
import crypto from 'node:crypto';
await fs.mkdir('.cache/search',{recursive:true});
await fs.mkdir('artifacts/search',{recursive:true});
const queries=[
 {id:'monitorability-recent',query:'chain of thought monitorability reasoning faithfulness AI safety 2026',startPublishedDate:'2026-06-01T00:00:00Z',endPublishedDate:'2026-09-14T00:00:00Z'},
 {id:'implicit-followup',query:'"Chain-of-Thought Monitoring Can Be Unreliable" implicit influence Duzan follow up replication'},
 {id:'faithfulness-recent',query:'reasoning models hidden contextual influence biases faithfulness monitor 2026',startPublishedDate:'2026-06-01T00:00:00Z',endPublishedDate:'2026-09-14T00:00:00Z'},
 {id:'reward-recent',query:'chain of thought reward compatibility monitorability drift optimization 2026',startPublishedDate:'2026-06-01T00:00:00Z',endPublishedDate:'2026-09-14T00:00:00Z'},
 {id:'public-research',query:'AI safety chain of thought monitoring implicit influence oversight blind spots researcher blog 2026',excludeDomains:['arxiv.org'],startPublishedDate:'2026-06-01T00:00:00Z',endPublishedDate:'2026-09-14T00:00:00Z'},
 {id:'drift-followup',query:'"Aligned, Orthogonal or In-conflict" chain of thought monitorability follow up'}
];
let spent=0;
for(const q of queries){
 const cachePath=`.cache/search/${q.id}.json`;
 try{await fs.access(cachePath); console.log('cached '+q.id);continue;}catch{}
 if(spent+0.1>1)throw new Error('Search batch allowance exhausted');
 const {id,...query}=q;const request={...query,type:'auto',numResults:10,contents:{text:{maxCharacters:10000}}};
 const startedAt=new Date().toISOString();
 try {
  const response=await fetch('https://api.exa.ai/search',{method:'POST',headers:{'x-api-key':process.env.EXA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(45000)});
  const raw=await response.json();
  await fs.writeFile(cachePath,JSON.stringify({startedAt,request,status:response.status,response:raw},null,2));
  const cost=raw.costDollars?.total; spent+=cost??0.1;
  const record={id,startedAt,completedAt:new Date().toISOString(),request:{...request,contents:undefined},httpStatus:response.status,requestId:raw.requestId,costDollars:raw.costDollars??null,costStatus:cost==null?'upper-bound-reserved':'provider-returned',rawResponseSha256:crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex'),results:(raw.results??[]).map(({id,url,title,publishedDate,author})=>({id,url,title,publishedDate,author})),error:raw.error};
  await fs.writeFile(`artifacts/search/${id}.json`,JSON.stringify(record,null,2));
  console.log(JSON.stringify(record));
  if(!response.ok)break;
 }catch(error){await fs.writeFile(`artifacts/search/${id}-error.json`,JSON.stringify({startedAt,request,error:String(error),costStatus:'ambiguous-reserved',reservedUsd:0.1}));throw error;}
}
console.log(JSON.stringify({batchAccountedUsd:spent,allowanceUsd:1}));
