import fs from 'node:fs/promises';
const access=JSON.parse(await fs.readFile('local-access.json','utf8'));
const chats=(access.getUpdates.result??[]).filter(x=>x.message?.text==='/start'&&x.message?.chat?.type==='private');
if(chats.length!==1)throw new Error('Expected one user-started private chat');
const chat=String(chats[0].message.chat.id);
let env=await fs.readFile('.env.local','utf8');if(!env.includes('TELEGRAM_ALLOWED_CHAT_IDS='))await fs.appendFile('.env.local',`\nTELEGRAM_ALLOWED_CHAT_IDS=${chat}\n`);
console.log('Authorized Telegram chat saved without publishing identity.');
const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(20000)});const b=await r.json();console.log(JSON.stringify({openaiHttpStatus:r.status,selectedModelAvailable:b.data?.some(m=>m.id==='gpt-5.6-luna'),relatedModels:b.data?.filter(m=>/gpt-5.6-luna/.test(m.id)).map(m=>m.id),error:r.ok?undefined:b.error?.code}));
