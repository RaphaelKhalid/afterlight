import fs from 'node:fs/promises';
const headers={Authorization:'Bot '+process.env.DISCORD_BOT_TOKEN,'Content-Type':'application/json'};
let r=await fetch('https://discord.com/api/v10/applications/@me',{headers,signal:AbortSignal.timeout(15000)});let app=await r.json();
if(r.status===404){r=await fetch('https://discord.com/api/v10/oauth2/applications/@me',{headers,signal:AbortSignal.timeout(15000)});app=await r.json();}
await fs.writeFile('.cache/discord-access.json',JSON.stringify({checkedAt:new Date().toISOString(),status:r.status,application:app},null,2));
if(!r.ok)throw new Error('Discord access failed HTTP '+r.status);
if(app.id!==process.env.DISCORD_APPLICATION_ID)throw new Error('Application ID does not match token');
if(app.verify_key!==process.env.DISCORD_PUBLIC_KEY)throw new Error('Public key does not match token');
const owner=app.owner?.id??app.team?.owner_user_id;
if(owner)await fs.appendFile('.env.local',`\nDISCORD_ALLOWED_USER_IDS=${owner}\n`);
console.log(JSON.stringify({ok:true,applicationId:app.id,name:app.name,ownerConfigured:!!owner,interactionEndpoint:app.interactions_endpoint_url,integrationTypes:app.integration_types_config}));
