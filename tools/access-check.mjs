import fs from 'node:fs/promises';
const token=process.env.TELEGRAM_BOT_TOKEN;
const results={checkedAt:new Date().toISOString()};
for(const method of ['getMe','getWebhookInfo','getUpdates']){
 const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{signal:AbortSignal.timeout(15000)});
 const body=await r.json(); results[method]=body;
}
await fs.writeFile('local-access.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({telegramOk:results.getMe.ok,username:results.getMe.result?.username,webhookConfigured:!!results.getWebhookInfo.result?.url,updateCount:results.getUpdates.result?.length,privateChats:results.getUpdates.result?.filter(x=>x.message?.chat?.type==='private').map(x=>({chatId:x.message.chat.id,text:x.message.text}))}));
