export interface DiscordEnv {
  DB: D1Database;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_ALLOWED_USER_IDS?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
}

type Obj = Record<string, any>;
const origin = 'https://afterlight-research.vercel.app';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const message = (content: string, components: unknown[] = []) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, components } });
const values = (s?: string) => new Set((s ?? '').split(',').map(x => x.trim()).filter(Boolean));
const fromHex = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(s.match(/.{2}/g) ?? [], x => parseInt(x, 16));

export async function verifyDiscordSignature(request: Request, body: string, publicKey?: string, now = Date.now()): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!publicKey || !/^[a-f0-9]{64}$/i.test(publicKey) || !signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', fromHex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, fromHex(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

export async function getDiscordAttempts(env: DiscordEnv, questionId: string): Promise<unknown[]> {
  const rows = await env.DB.prepare('SELECT id, question_id, status, result_run_id, created_at, updated_at FROM discord_attempts WHERE question_id = ? ORDER BY created_at DESC').bind(questionId).all<Obj>();
  return (rows.results ?? []).map(r => ({ id: r.id, questionId: r.question_id, platform: 'discord', participant: 'Discord participant', status: r.status, resultRunId: r.result_run_id, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function discordInteractions(request: Request, env: DiscordEnv): Promise<Response> {
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const body = await request.text();
  if (body.length > 100_000 || !await verifyDiscordSignature(request, body, env.DISCORD_PUBLIC_KEY)) return respond({ error: 'Invalid interaction signature' }, 401);
  let interaction: Obj;
  try { interaction = JSON.parse(body); } catch { return respond({ error: 'Invalid JSON' }, 400); }
  if (interaction.type === 1) return respond({ type: 1 });
  if (env.DISCORD_APPLICATION_ID && interaction.application_id !== env.DISCORD_APPLICATION_ID) return respond({ error: 'Wrong application' }, 403);
  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? '');
  const guildId = String(interaction.guild_id ?? 'personal');
  const authorized = values(env.DISCORD_ALLOWED_USER_IDS).has(userId) || (guildId !== 'personal' && values(env.DISCORD_ALLOWED_GUILD_IDS).has(guildId));
  if (!authorized) return respond(message('This Afterlight app is configured for its owner and explicitly participating researchers. The public laboratory is available at '+origin));
  const interactionId = String(interaction.id ?? '');
  if (!/^\d{10,30}$/.test(interactionId)) return respond({ error: 'Missing interaction identity' }, 400);
  const prior = await env.DB.prepare('SELECT response_json FROM discord_interactions WHERE interaction_id = ?').bind(interactionId).first<Obj>();
  if (prior?.response_json) return respond(JSON.parse(prior.response_json));
  const questionId = interaction.type === 3 && typeof interaction.data?.custom_id === 'string' ? interaction.data.custom_id.replace(/^attempt:/, '') : 'q-implicit-influence';
  if (!/^[a-z0-9-]{1,80}$/.test(questionId)) return respond(message('That research question is not available.'));
  const question = await env.DB.prepare('SELECT id, title, summary, status FROM questions WHERE id = ?').bind(questionId).first<Obj>();
  if (!question) return respond(message('This question is still being prepared. Open the atlas at '+origin));
  let response: Obj;
  if (interaction.type === 3 && interaction.data?.custom_id === `attempt:${questionId}`) {
    const now = new Date().toISOString();
    const attemptId = `attempt_discord_${crypto.randomUUID()}`;
    await env.DB.prepare("INSERT OR IGNORE INTO discord_attempts (id, question_id, user_id, guild_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'started', ?, ?)").bind(attemptId, questionId, userId, guildId, now, now).run();
    const attempt = await env.DB.prepare('SELECT id FROM discord_attempts WHERE question_id = ? AND user_id = ? AND guild_id = ?').bind(questionId, userId, guildId).first<Obj>();
    response = message(`Your attempt is recorded.\n\n**${question.title}**\nAttempt: ${attempt?.id}\n\nThis records participation only. It does not start a paid experiment.\n${origin}/#/questions/${questionId}`);
  } else if (interaction.type === 2 && interaction.data?.name === 'afterlight') {
    const latest = await env.DB.prepare("SELECT id, summary_json, artifact_url FROM runs WHERE question_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1").bind(questionId).first<Obj>();
    let result = '';
    if (latest) {
      let summary: Obj = {}; try { summary = JSON.parse(latest.summary_json ?? '{}'); } catch {}
      result = `\n\n**Completed evidence**\n${String(summary.headline ?? 'Inspect the completed bounded experiment').slice(0, 400)}\n${origin}/#/results/${latest.id}`;
    }
    response = message(`**Afterlight | Reproducible AI safety research**\n\n${question.title}\n${String(question.summary).slice(0, 500)}\n\nStatus: ${question.status}${result}\n\nStarting an attempt records your participation and does not spend API credits.`, [{ type: 1, components: [{ type: 2, style: 1, label: 'Start an attempt', custom_id: `attempt:${questionId}` }, { type: 2, style: 5, label: 'Open the question', url: `${origin}/#/questions/${questionId}` }] }]);
  } else response = message('Use /afterlight to open the current research question.');
  await env.DB.prepare('INSERT OR IGNORE INTO discord_interactions (interaction_id, user_id, question_id, response_json, created_at) VALUES (?, ?, ?, ?, ?)').bind(interactionId, userId, questionId, JSON.stringify(response), new Date().toISOString()).run();
  return respond(response);
}

