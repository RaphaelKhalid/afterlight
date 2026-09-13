import fs from 'node:fs/promises';
const ids=['2608.04928','2609.07162','2609.05797','2608.24232','2609.00264','2608.03745','2606.03969','2608.20670','2603.28590','2606.05625'];
await fs.mkdir('.cache/papers',{recursive:true}); await fs.mkdir('artifacts/sources',{recursive:true});
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
for(const id of ids){
 const url=`https://arxiv.org/abs/${id}`; const cached=`.cache/papers/${id}.html`;
 let html; try{html=await fs.readFile(cached,'utf8')}catch{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});html=await r.text();await fs.writeFile(cached,html);if(!r.ok){console.log(id+' HTTP '+r.status);continue}await new Promise(r=>setTimeout(r,3100));}
 const meta=name=>{const m=html.match(new RegExp('<meta\\s+name="'+name+'"\\s+content="([^"]*)"'));return m?clean(m[1]):null};
 const title=meta('citation_title');if(!title){console.log(id+' metadata unavailable');continue}
 const record={id,title,authors:[...html.matchAll(/<meta\s+name="citation_author"\s+content="([^"]*)"/g)].map(m=>clean(m[1])),published:meta('citation_date'),onlineDate:meta('citation_online_date'),url,arxivId:meta('citation_arxiv_id'),version:html.match(/\[Submitted on[^\]]+\]/)?.[0]??null,abstract:clean(html.match(/<blockquote class="abstract[^>]*>([\s\S]*?)<\/blockquote>/)?.[1]??''),checkedAt:new Date().toISOString(),license:html.match(/<a href="([^"]+)"[^>]*>[^<]*License/)?.[1]??null};
 await fs.writeFile(`.cache/papers/${id}.json`,JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}

