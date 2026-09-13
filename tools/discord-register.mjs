import fs from 'node:fs/promises';
const headers={Authorization:'Bot '+process.env.DISCORD_BOT_TOKEN,'Content-Type':'application/json'};
const app=process.env.DISCORD_APPLICATION_ID;
const command={name:'afterlight',description:'Explore a research question, start an attempt, and inspect reproducible evidence.',type:1,integration_types:[0,1],contexts:[0,1,2]};
const current=await fetch(`https://discord.com/api/v10/applications/${app}/commands`,{headers,signal:AbortSignal.timeout(15000)});if(!current.ok)throw new Error('Cannot inspect current commands: '+current.status);
const existing=await current.json();
const r=await fetch(`https://discord.com/api/v10/applications/${app}/commands`,{method:'POST',headers,body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});const data=await r.json();
await fs.writeFile('.cache/discord-command.json',JSON.stringify({at:new Date().toISOString(),httpStatus:r.status,previousCommandNames:existing.map(x=>x.name),command:data},null,2));
console.log(JSON.stringify({ok:r.ok,httpStatus:r.status,commandId:data.id,name:data.name,installUrl:`https://discord.com/oauth2/authorize?client_id=${app}&scope=applications.commands&integration_type=1`}));
