import { describe, it, expect, beforeAll } from 'vitest';
import { verifyDiscordSignature, discordInteractions } from '../src/discord';
let keys: CryptoKeyPair;
let publicKey: string;
const now = Date.now();
const timestamp = String(Math.floor(now / 1000));
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
async function request(body: string, ts = timestamp) {
  const signature = hex(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(ts + body)));
  return new Request('https://afterlight.test/api/discord/interactions', { method: 'POST', headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': ts }, body });
}
beforeAll(async () => { keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair; publicKey = hex(await crypto.subtle.exportKey('raw', keys.publicKey)); });
describe('Discord interaction boundary', () => {
  it('accepts a correctly signed body', async () => { const body='{"type":1}'; expect(await verifyDiscordSignature(await request(body), body, publicKey, now)).toBe(true); });
  it('rejects a tampered body', async () => { expect(await verifyDiscordSignature(await request('{"type":1}'), '{"type":3}', publicKey, now)).toBe(false); });
  it('rejects a valid but stale signature', async () => { const body='{"type":1}'; expect(await verifyDiscordSignature(await request(body, String(Math.floor(now/1000)-301)), body, publicKey, now)).toBe(false); });
  it('rejects absent signatures', async () => { expect(await verifyDiscordSignature(new Request('https://example.com'), '{}', publicKey, now)).toBe(false); });
  it('answers Discord verification ping without database access', async () => { const response=await discordInteractions(await request('{"type":1}'), {DB:null as any,DISCORD_PUBLIC_KEY:publicKey}); expect(response.status).toBe(200); expect(await response.json()).toEqual({type:1}); });
  it('does not access the database for an unapproved participant', async () => { const body=JSON.stringify({type:2,id:'1548759118087594094',application_id:'app',user:{id:'visitor'},data:{name:'afterlight'}}); const response=await discordInteractions(await request(body), {DB:null as any,DISCORD_PUBLIC_KEY:publicKey,DISCORD_APPLICATION_ID:'app',DISCORD_ALLOWED_USER_IDS:'owner'}); const result=await response.json() as any; expect(result.type).toBe(4);expect(result.data.flags).toBe(64);expect(result.data.content).toContain('configured for its owner'); });
});
