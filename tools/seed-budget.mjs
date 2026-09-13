import fs from 'node:fs/promises';
const oldOpenRouter=0.00176077+0.00012265+0.00388541+0.00412489+0.0009827+0.00000491+0.000014438;
const now=new Date().toISOString();
const rows=[['development-exa','development-search','exa',0.063,0.063,'released'],['development-openai','development-semantic-review','openai',0.001,0.001,'released'],['development-openrouter','development-experiment-before-v32','openrouter',oldOpenRouter,oldOpenRouter,'released'],['development-openrouter-v32','development-recovery-v32','openrouter',1.8,0,'held']];
const q=x=>typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sql=rows.map(r=>'INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at,released_at) VALUES ('+r.map(q).join(',')+','+q(now)+','+(r[5]==='released'?q(now):'NULL')+') ON CONFLICT(id) DO NOTHING;').join('\n');
await fs.writeFile('backend/work/development-budget.sql',sql+'\n');
await fs.mkdir('artifacts/budget',{recursive:true});await fs.writeFile('artifacts/budget/development-reservations.json',JSON.stringify({recordedAt:now,openRouterKnownUsd:oldOpenRouter,exaProviderReturnedUsd:0.063,openAiTokenBasedEstimateUsd:0.0004542,openAiConservativeChargedAllowanceUsd:0.001,recoveryHeldUsd:1.8,note:'Historical development expenditure is included in the server cap. Unknown rejected-call costs remain separately tracked; recovery is held conservatively until settlement.'},null,2));console.log(JSON.stringify({openRouterKnownUsd:oldOpenRouter,rows:rows.length}));
