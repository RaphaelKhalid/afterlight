import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";
import { publicationPath, shouldStopBeforeDispatch, telegramCallbackKey } from "./policy";
import { discordInteractions, getDiscordAttempts } from "./discord";

type RunStatus = "draft" | "validated" | "queued" | "running" | "paused" | "completed" | "failed" | "stopped";
type TrialStatus = "pending" | "running" | "completed" | "failed" | "ambiguous" | "missing";

export interface AfterlightEnv extends Env {
  DB: D1Database;
  AFTERLIGHT_WORKFLOW: Workflow<WorkflowParams>;
  OWNER_ACCESS_TOKEN?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  EXA_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  GITHUB_PUBLICATION_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_ALLOWED_USER_IDS?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
}

export type WorkflowParams = { runId: string };

type Row = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const PUBLIC_CACHE_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30, stale-while-revalidate=120" };
const NOW = () => new Date().toISOString();

function json(data: unknown, init: ResponseInit = {}, publicCache = false): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { ...(publicCache ? PUBLIC_CACHE_HEADERS : JSON_HEADERS), ...(init.headers ?? {}) } });
}

function errorResponse(code: string, message: string, status: number, details?: unknown): Response {
  return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

function id(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toQuestion(row: Row): JsonObject {
  return {
    id: row.id, title: row.title, area: row.area, status: row.status, origin: row.origin,
    summary: row.summary, whyItMatters: row.why_it_matters, source: asJson(row.source_json, {}),
    closestWork: asJson(row.closest_work_json, []), uncertainty: row.uncertainty,
    search: asJson(row.search_json, {}), executable: Boolean(row.executable),
    estimatedCostUsd: row.estimated_cost_usd, estimatedMinutes: row.estimated_minutes,
    access: row.access, position: asJson(row.position_json, null), evidenceIds: []
  };
}

function toPaper(row: Row): JsonObject {
  return { id: row.id, title: row.title, authors: asJson(row.authors_json, []), published: row.published,
    updated: row.updated, url: row.url, version: row.version, sourceType: row.source_type,
    abstract: row.abstract, topics: asJson(row.topics_json, []), verificationStatus: row.verification_status,
    featured: Boolean(row.featured) };
}

function toEdge(row: Row): JsonObject {
  return { id: row.id, source: row.source_id, target: row.target_id, type: row.type,
    explanation: row.explanation, evidenceUrl: row.evidence_url };
}

function toContract(row: Row): JsonObject {
  const contract = asJson<JsonObject>(row.contract_json, {});
  return { ...contract, id: row.id, version: row.version, hash: row.hash, questionId: row.question_id,
    name: row.name, status: row.status, createdAt: row.created_at };
}

function toRun(row: Row): JsonObject {
  const summary = asJson(row.summary_json, undefined);
  return { id: row.id, questionId: row.question_id, contractId: row.contract_id,
    contractHash: row.contract_hash, status: row.status, createdAt: row.created_at,
    startedAt: row.started_at, completedAt: row.completed_at, capUsd: row.cap_usd,
    spentUsd: row.spent_usd, costStatus: row.cost_status, completedTrials: row.completed_trials,
    totalTrials: row.total_trials, failedTrials: row.failed_trials, conditions: asJson(row.conditions_json, []),
    summary, artifactUrl: row.artifact_url, events: [] };
}

function toTrial(row: Row): JsonObject {
  return { id: row.id, runId: row.run_id, caseId: row.case_id, condition: row.condition_id,
    status: row.status, input: asJson(row.input_json, {}), output: asJson(row.output_json, null),
    answer: row.answer, expectedAnswer: row.expected_answer, score: row.score,
    monitorVerdict: row.monitor_verdict, usage: asJson(row.usage_json, null), costUsd: row.cost_usd,
    createdAt: row.created_at, completedAt: row.completed_at, provider: row.provider, model: row.model,
    metadata: { errorCode: row.error_code, externalRequestId: row.external_request_id } };
}

function toAttempt(row: Row): JsonObject {
  return { id: row.id, questionId: row.question_id, participant: `participant-${String(row.id).slice(-6)}`,
    status: row.status, resultRunId: row.result_run_id,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

async function investigateQuestion(request: Request, env: AfterlightEnv, questionId: string): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to run a literature investigation.", 401);
  if (!env.EXA_API_KEY) return errorResponse("EXA_NOT_CONFIGURED", "Exa configuration is missing.", 503);
  const question = await first<Row>(env.DB, "SELECT * FROM questions WHERE id = ?", questionId);
  if (!question) return errorResponse("NOT_FOUND", "Question not found.", 404);
  const title = String(question.title);
  const query = `${title} AI safety related work evidence`; 
  const existing = await first<Row>(env.DB, "SELECT * FROM investigations WHERE question_id = ? AND query = ?", questionId, query);
  if (existing) return json({ investigation: { ...toInvestigation(existing), deduplicated: true } });
  const budget = Number(env.EXA_BUDGET_USD ?? 10);
  const held = await first<{ total: number }>(env.DB, "SELECT COALESCE(SUM(reserved_usd - spent_usd),0) AS total FROM budget_reservations WHERE provider = 'exa' AND status = 'held'");
  const historical = await first<{ total: number }>(env.DB, "SELECT COALESCE(SUM(spent_usd),0) AS total FROM budget_reservations WHERE provider = 'exa'");
  if (number(held?.total) + number(historical?.total) + 0.1 > budget) return errorResponse("EXA_BUDGET_RESERVED", "The bounded Exa allowance is exhausted.", 409);
  const investigationId = id("investigation");
  const reservationId = id("exa");
  const now = NOW();
  const reservationResults = await env.DB.batch([
    env.DB.prepare("INSERT INTO investigations (id, question_id, query, sources_json, cost_usd, status, created_at) VALUES (?, ?, ?, '[]', 0.1, 'requested', ?)").bind(investigationId, questionId, query, now),
    env.DB.prepare("INSERT INTO budget_reservations (id, run_id, provider, reserved_usd, status, created_at) SELECT ?, ?, 'exa', 0.1, 'held', ? WHERE 0.1 + COALESCE((SELECT SUM(spent_usd + CASE WHEN status = 'held' THEN reserved_usd - spent_usd ELSE 0 END) FROM budget_reservations WHERE provider = 'exa'), 0) <= ?").bind(reservationId, investigationId, now, budget)
  ]);
  if (number(reservationResults[1]?.meta?.changes) !== 1) {
    await env.DB.prepare("DELETE FROM investigations WHERE id = ?").bind(investigationId).run();
    return errorResponse("EXA_BUDGET_RESERVED", "That Exa allowance is not available after existing reservations.", 409);
  }
  let payload: unknown;
  try {
    const response = await fetch("https://api.exa.ai/search", { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", "x-api-key": env.EXA_API_KEY }, body: JSON.stringify({ query, numResults: 10, type: "auto", contents: { highlights: { maxCharacters: 1200 } } }) });
    payload = await response.json();
    if (!response.ok) throw new Error(`EXA_HTTP_${response.status}`);
  } catch (error) {
    await env.DB.prepare("UPDATE investigations SET status = 'ambiguous', response_json = ? WHERE id = ?").bind(JSON.stringify({ error: String(error), action: "reconcile Exa billing before retry" }), investigationId).run();
    await env.DB.prepare("UPDATE budget_reservations SET status = 'released', released_at = ? WHERE run_id = ?").bind(NOW(), investigationId).run();
    return errorResponse("EXA_OUTCOME_AMBIGUOUS", "Exa outcome is uncertain and was recorded without an automatic retry.", 502, { investigationId });
  }
  const object = payload && typeof payload === "object" ? payload as JsonObject : {};
  const sourceRows = Array.isArray(object.results) ? object.results : [];
  const sources = sourceRows.slice(0, 10).map((source) => {
    const item = source && typeof source === "object" ? source as JsonObject : {};
    return { title: item.title, url: item.url, publishedDate: item.publishedDate, highlights: item.highlights, sourceType: "Exa result", verificationStatus: "retrieved, not independently assessed" };
  });
  await env.DB.prepare("UPDATE investigations SET status = 'completed', sources_json = ?, response_json = ? WHERE id = ?").bind(JSON.stringify(sources), JSON.stringify({ query, resultCount: sources.length, provider: "exa", retrievedAt: NOW() }), investigationId).run();
  await env.DB.prepare("UPDATE budget_reservations SET spent_usd = 0.1, status = 'released', released_at = ? WHERE run_id = ?").bind(NOW(), investigationId).run();
  const search = asJson<JsonObject>(question.search_json, {});
  const updatedSearch = { ...search, lastInvestigation: { id: investigationId, query, date: NOW(), coverage: "Exa top 10 results", sources } };
  await env.DB.prepare("UPDATE questions SET search_json = ? WHERE id = ?").bind(JSON.stringify(updatedSearch), questionId).run();
  const row = await first<Row>(env.DB, "SELECT * FROM investigations WHERE id = ?", investigationId);
  return json({ investigation: row ? { ...toInvestigation(row), deduplicated: false } : { id: investigationId, questionId, query, sources, status: "completed", costUsd: 0.1 } }, { status: 201 });
}

function toInvestigation(row: Row): JsonObject {
  return { id: row.id, questionId: row.question_id, query: row.query,
    sources: asJson(row.sources_json, []), status: row.status, costUsd: row.cost_usd,
    createdAt: row.created_at };
}

async function first<T extends Row>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>();
}

async function all<T extends Row>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...args).all<T>();
  return result.results ?? [];
}

function ownerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-afterlight-owner-token");
}

async function safeEqual(left: string | undefined, right: string | null): Promise<boolean> {
  if (!left || !right) return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function isOwner(request: Request, env: AfterlightEnv): Promise<boolean> {
  return safeEqual(env.OWNER_ACCESS_TOKEN, ownerToken(request));
}

async function readJson(request: Request): Promise<JsonObject> {
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required");
  return value as JsonObject;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function providerBudget(env: AfterlightEnv, provider: string): number {
  const raw = provider === "openai" ? env.OPENAI_BUDGET_USD : provider === "openrouter" ? env.OPENROUTER_BUDGET_USD : env.OWNER_BUDGET_USD;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function insertEvent(db: D1Database, runId: string, type: string, detail: JsonObject): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO run_events (id, run_id, type, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id("evt"), runId, type, JSON.stringify(detail), NOW()).run();
}

async function requestWorkflow(env: AfterlightEnv, runId: string): Promise<string> {
  const instanceId = `${runId}:${crypto.randomUUID()}`;
  await env.AFTERLIGHT_WORKFLOW.create({ id: instanceId, params: { runId } });
  return instanceId;
}

async function createRun(request: Request, env: AfterlightEnv): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to start a paid run.", 401);
  let body: JsonObject;
  try { body = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Request body must be a JSON object.", 400); }
  const contractId = typeof body.contractId === "string" ? body.contractId : "";
  const contractHash = typeof body.contractHash === "string" ? body.contractHash : "";
  const capUsd = number(body.capUsd, -1);
  if (!contractId || !contractHash || capUsd < 0) return errorResponse("INVALID_RUN", "contractId, contractHash, and a non-negative capUsd are required.", 400);

  const contract = await first<Row>(env.DB, "SELECT * FROM contracts WHERE id = ? AND hash = ? AND status = 'validated' ORDER BY version DESC LIMIT 1", contractId, contractHash);
  if (!contract) return errorResponse("CONTRACT_NOT_VALIDATED", "Only the exact hash of a validated contract can be run.", 409);
  const definition = asJson<JsonObject>(contract.contract_json, {});
  const maxCap = number(definition.maxCapUsd, capUsd);
  const totalTrials = number(definition.totalTrials, 0);
  const provider = typeof definition.provider === "string" ? definition.provider : "openrouter";
  if (totalTrials <= 0 || totalTrials > 200) return errorResponse("INVALID_CONTRACT", "Contract must declare between 1 and 200 trials.", 422);
  if (capUsd > maxCap) return errorResponse("CAP_EXCEEDS_CONTRACT", "The requested cap exceeds the frozen contract limit.", 422);
  const available = providerBudget(env, provider);
  if (capUsd > available) return errorResponse("CAP_EXCEEDS_BUDGET", "The requested cap exceeds the configured provider budget.", 422);

  const questionId = String(contract.question_id);
  const runId = id("run");
  const now = NOW();
  const reservationId = id("res");
  const cases = Array.isArray(definition.cases) ? definition.cases : [];
  const conditions = Array.isArray(definition.conditions) ? definition.conditions : [];
  if (cases.length * conditions.length !== totalTrials) return errorResponse("INVALID_CONTRACT", "Contract trial count does not match cases multiplied by conditions.", 422);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO runs (id, question_id, contract_id, contract_version, contract_hash, status, cap_usd, total_trials, conditions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`)
      .bind(runId, questionId, contract.id, contract.version, contract.hash, capUsd, totalTrials, JSON.stringify(conditions), now, now),
    env.DB.prepare("INSERT INTO budget_reservations (id, run_id, provider, reserved_usd, status, created_at) SELECT ?, ?, ?, ?, 'held', ? WHERE ? + COALESCE((SELECT SUM(spent_usd + CASE WHEN status = 'held' THEN reserved_usd - spent_usd ELSE 0 END) FROM budget_reservations WHERE provider = ?), 0) <= ?")
      .bind(reservationId, runId, provider, capUsd, now, capUsd, provider, available)
  ];
  let trialOrdinal = 0;
  for (const condition of conditions) {
    if (!condition || typeof condition !== "object") continue;
    const conditionId = typeof condition.id === "string" ? condition.id : `condition-${trialOrdinal}`;
    for (const testCase of cases) {
      if (!testCase || typeof testCase !== "object") continue;
      const caseId = typeof testCase.id === "string" ? testCase.id : `case-${trialOrdinal}`;
      statements.push(env.DB.prepare("INSERT INTO trials (id, run_id, case_id, condition_id, ordinal, status, input_json, expected_answer, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)")
        .bind(id("trial"), runId, caseId, conditionId, trialOrdinal++, JSON.stringify({ case: testCase, condition }), typeof testCase.expectedAnswer === "string" ? testCase.expectedAnswer : null, now));
    }
  }
  try {
    const batchResults = await env.DB.batch(statements);
    if (number(batchResults[1]?.meta?.changes) !== 1) {
      await env.DB.prepare("DELETE FROM runs WHERE id = ?").bind(runId).run();
      return errorResponse("BUDGET_RESERVED", "That cap is not available after existing reservations.", 409);
    }
    const workflowInstanceId = await requestWorkflow(env, runId);
    await env.DB.prepare("UPDATE runs SET workflow_instance_id = ?, updated_at = ? WHERE id = ?").bind(workflowInstanceId, NOW(), runId).run();
    await insertEvent(env.DB, runId, "run_queued", { capUsd, provider, totalTrials });
    return json({ run: { id: runId, status: "queued", capUsd, totalTrials } }, { status: 202 });
  } catch (error) {
    await env.DB.prepare("UPDATE runs SET status = 'failed', updated_at = ? WHERE id = ?").bind(NOW(), runId).run().catch(() => undefined);
    await env.DB.prepare("UPDATE budget_reservations SET status = 'released', released_at = ? WHERE run_id = ?").bind(NOW(), runId).run().catch(() => undefined);
    return errorResponse("WORKFLOW_CREATE_FAILED", "The run could not be queued. No paid call was dispatched.", 503, { reason: String(error) });
  }
}

async function controlRun(request: Request, env: AfterlightEnv, runId: string): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to control a run.", 401);
  let body: JsonObject;
  try { body = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Request body must be a JSON object.", 400); }
  const action = body.action;
  if (action !== "pause" && action !== "resume" && action !== "stop") return errorResponse("INVALID_ACTION", "Action must be pause, resume, or stop.", 400);
  const run = await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", runId);
  if (!run) return errorResponse("NOT_FOUND", "Run not found.", 404);
  if (action === "pause") {
    if (!["queued", "running"].includes(String(run.status))) return errorResponse("INVALID_STATE", "Only queued or running runs can be paused.", 409);
    const paused = await env.DB.prepare("UPDATE runs SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('queued','running')").bind(NOW(), runId).run();
    if (number(paused.meta?.changes) !== 1) return errorResponse("INVALID_STATE", "The run changed state before it could be paused.", 409);
    await insertEvent(env.DB, runId, "run_paused", {});
  } else if (action === "stop") {
    if (["completed", "failed", "stopped"].includes(String(run.status))) return errorResponse("INVALID_STATE", "This run has already ended.", 409);
    const stopped = await env.DB.prepare("UPDATE runs SET status = 'stopped', completed_at = ?, updated_at = ? WHERE id = ? AND status NOT IN ('completed','failed','stopped')").bind(NOW(), NOW(), runId).run();
    if (number(stopped.meta?.changes) !== 1) return errorResponse("INVALID_STATE", "The run changed state before it could be stopped.", 409);
    await releaseReservation(env.DB, runId);
    await insertEvent(env.DB, runId, "run_stopped", {});
  } else {
    if (run.status !== "paused") return errorResponse("INVALID_STATE", "Only paused runs can resume.", 409);
    const resumed = await env.DB.prepare("UPDATE runs SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'paused'").bind(NOW(), runId).run();
    if (number(resumed.meta?.changes) !== 1) return errorResponse("INVALID_STATE", "The run changed state before it could be resumed.", 409);
    try {
      const workflowInstanceId = await requestWorkflow(env, runId);
      await env.DB.prepare("UPDATE runs SET workflow_instance_id = ?, updated_at = ? WHERE id = ?").bind(workflowInstanceId, NOW(), runId).run();
      await insertEvent(env.DB, runId, "run_resumed", { workflowInstanceId });
    } catch (error) {
      await env.DB.prepare("UPDATE runs SET status = 'paused', updated_at = ? WHERE id = ?").bind(NOW(), runId).run();
      return errorResponse("WORKFLOW_CREATE_FAILED", "The run remains paused because its coordinator could not be started.", 503, { reason: String(error) });
    }
  }
  return json({ run: toRun((await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", runId)) ?? run) });
}

async function reconcileRun(request: Request, env: AfterlightEnv, runId: string): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to reconcile an uncertain trial.", 401);
  let body: JsonObject;
  try { body = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Request body must be a JSON object.", 400); }
  const trialId = typeof body.trialId === "string" ? body.trialId : "";
  const outcome = body.outcome;
  if (!trialId || (outcome !== "failed" && outcome !== "missing")) return errorResponse("INVALID_RECONCILIATION", "Only a confirmed failed or missing outcome can be recorded without a new paid request.", 400);
  const run = await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", runId);
  const trial = await first<Row>(env.DB, "SELECT * FROM trials WHERE id = ? AND run_id = ? AND status = 'ambiguous'", trialId, runId);
  if (!run || !trial) return errorResponse("NOT_FOUND", "An ambiguous trial for this run was not found.", 404);
  const updated = await env.DB.prepare("UPDATE trials SET status = ?, error_code = 'RECONCILED_BY_OWNER', completed_at = ? WHERE id = ? AND status = 'ambiguous'").bind(outcome, NOW(), trialId).run();
  if (number(updated.meta?.changes) !== 1) return errorResponse("INVALID_STATE", "The trial changed state before reconciliation.", 409);
  await env.DB.prepare("UPDATE runs SET status = 'queued', cost_status = CASE WHEN cost_status = 'ambiguous' THEN 'estimated' ELSE cost_status END, updated_at = ? WHERE id = ? AND status = 'paused'").bind(NOW(), runId).run();
  await insertEvent(env.DB, runId, "trial_reconciled", { trialId, outcome, paidCallRetried: false });
  return json({ run: toRun((await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", runId)) ?? run), reconciled: { trialId, outcome } });
}

async function releaseReservation(db: D1Database, runId: string): Promise<void> {
  await db.prepare("UPDATE budget_reservations SET status = 'released', released_at = ? WHERE run_id = ? AND status = 'held'").bind(NOW(), runId).run();
}

async function questionRoutes(request: Request, env: AfterlightEnv, pathname: string): Promise<Response> {
  if (pathname === "/api/questions") {
    const [questions, papers, edges] = await Promise.all([
      all<Row>(env.DB, "SELECT * FROM questions ORDER BY created_at DESC"),
      all<Row>(env.DB, "SELECT * FROM papers ORDER BY featured DESC, published DESC"),
      all<Row>(env.DB, "SELECT * FROM edges ORDER BY id")
    ]);
    const featured = questions.filter((q) => Boolean(q.executable)).length;
    return json({ questions: questions.map(toQuestion), papers: papers.map(toPaper), edges: edges.map(toEdge), coverage: { questions: questions.length, papers: papers.length, executable: featured, label: "Curated collection coverage, not a global ranking." } }, {}, true);
  }
  const match = pathname.match(/^\/api\/questions\/([^/]+)$/);
  if (!match) return errorResponse("NOT_FOUND", "Question route not found.", 404);
  const question = await first<Row>(env.DB, "SELECT * FROM questions WHERE id = ?", decodeURIComponent(match[1]));
  if (!question) return errorResponse("NOT_FOUND", "Question not found.", 404);
  const [paperRows, edgeRows, contractRows, runRows] = await Promise.all([
    all<Row>(env.DB, "SELECT * FROM papers WHERE id IN (SELECT json_extract(source_json, '$.paperId') FROM questions WHERE id = ?)", question.id),
    all<Row>(env.DB, "SELECT * FROM edges WHERE source_id = ? OR target_id = ?", question.id, question.id),
    all<Row>(env.DB, "SELECT * FROM contracts WHERE question_id = ? ORDER BY version DESC", question.id),
    all<Row>(env.DB, "SELECT * FROM runs WHERE question_id = ? ORDER BY created_at DESC", question.id)
  ]);
  return json({ ...toQuestion(question), papers: paperRows.map(toPaper), edges: edgeRows.map(toEdge), contracts: contractRows.map(toContract), runs: runRows.map(toRun) }, {}, true);
}

async function contractRoutes(env: AfterlightEnv): Promise<Response> {
  const rows = await all<Row>(env.DB, "SELECT * FROM contracts WHERE status != 'retired' ORDER BY created_at DESC");
  return json({ contracts: rows.map(toContract) }, {}, true);
}

async function runRoutes(request: Request, env: AfterlightEnv, pathname: string): Promise<Response> {
  if (pathname === "/api/runs" && request.method === "GET") {
    const rows = await all<Row>(env.DB, "SELECT * FROM runs ORDER BY created_at DESC LIMIT 100");
    return json({ runs: rows.map(toRun) }, {}, true);
  }
  if (pathname === "/api/runs" && request.method === "POST") return createRun(request, env);
  const control = pathname.match(/^\/api\/runs\/([^/]+)\/control$/);
  if (control && request.method === "POST") return controlRun(request, env, decodeURIComponent(control[1]));
  const trialsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/trials$/);
  if (trialsMatch && request.method === "GET") {
    const rows = await all<Row>(env.DB, "SELECT * FROM trials WHERE run_id = ? ORDER BY ordinal", decodeURIComponent(trialsMatch[1]));
    return json({ trials: rows.map(toTrial) }, {}, true);
  }
  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (runMatch && request.method === "GET") {
    const run = await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", decodeURIComponent(runMatch[1]));
    if (!run) return errorResponse("NOT_FOUND", "Run not found.", 404);
    const events = await all<Row>(env.DB, "SELECT * FROM run_events WHERE run_id = ? ORDER BY created_at", run.id);
    return json({ ...toRun(run), events: events.map((event) => ({ id: event.id, type: event.type, detail: asJson(event.detail_json, {}), createdAt: event.created_at })) }, {}, true);
  }
  return errorResponse("NOT_FOUND", "Run route not found.", 404);
}

function allowedChatIds(env: AfterlightEnv): Set<string> {
  return new Set((env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((v) => v.trim()).filter(Boolean));
}

async function telegramInvite(request: Request, env: AfterlightEnv): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to invite a participant.", 401);
  if (!env.TELEGRAM_BOT_TOKEN) return errorResponse("TELEGRAM_NOT_CONFIGURED", "Telegram bot configuration is missing.", 503);
  let body: JsonObject;
  try { body = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Request body must be a JSON object.", 400); }
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  if (!questionId || !chatId || !allowedChatIds(env).has(chatId)) return errorResponse("CHAT_NOT_ALLOWED", "The requested Telegram chat is not configured for this bot.", 403);
  const question = await first<Row>(env.DB, "SELECT id, title FROM questions WHERE id = ?", questionId);
  if (!question) return errorResponse("NOT_FOUND", "Question not found.", 404);
  const callbackKey = `invite:${questionId}:${chatId}`;
  const existing = await first<Row>(env.DB, "SELECT * FROM telegram_events WHERE callback_key = ?", callbackKey);
  if (existing) return json({ invitation: { deduplicated: true, eventId: existing.update_id } });
  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const reserved = await env.DB.prepare("INSERT OR IGNORE INTO telegram_events (update_id, callback_key, chat_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(`outbound:${nonce}`, callbackKey, chatId, JSON.stringify({ status: "requested", questionId, chatId }), NOW()).run();
  if (number(reserved.meta?.changes) !== 1) return json({ invitation: { deduplicated: true, eventId: `outbound:${nonce}` } });
  let response: Response;
  let telegramResult: unknown;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `Afterlight research attempt: ${question.title}`, reply_markup: { inline_keyboard: [[{ text: "Start an attempt", callback_data: `start_attempt:${questionId}:${nonce}` }]] } })
    });
    telegramResult = await response.json();
  } catch (error) {
    await env.DB.prepare("UPDATE telegram_events SET payload_json = ? WHERE update_id = ?").bind(JSON.stringify({ status: "ambiguous", error: String(error), action: "reconcile Telegram before retry" }), `outbound:${nonce}`).run();
    return errorResponse("TELEGRAM_OUTCOME_AMBIGUOUS", "Telegram invitation outcome is uncertain and was recorded without an automatic retry.", 502, { eventId: `outbound:${nonce}` });
  }
  if (!response.ok) {
    await env.DB.prepare("UPDATE telegram_events SET payload_json = ? WHERE update_id = ?").bind(JSON.stringify({ status: "failed", response: telegramResult }), `outbound:${nonce}`).run();
    return errorResponse("TELEGRAM_SEND_FAILED", "Telegram did not accept the invitation.", 502, telegramResult);
  }
  await env.DB.prepare("UPDATE telegram_events SET payload_json = ? WHERE update_id = ?").bind(JSON.stringify({ status: "sent", response: telegramResult }), `outbound:${nonce}`).run();
  return json({ invitation: { deduplicated: false, questionId, chatId } }, { status: 202 });
}

async function telegramWebhook(request: Request, env: AfterlightEnv, ctx: ExecutionContext): Promise<Response> {
  if (!env.TELEGRAM_WEBHOOK_SECRET || !(await safeEqual(env.TELEGRAM_WEBHOOK_SECRET, request.headers.get("x-telegram-bot-api-secret-token")))) return errorResponse("UNAUTHORIZED", "Telegram webhook secret is invalid.", 401);
  let update: JsonObject;
  try { update = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Webhook body must be a JSON object.", 400); }
  const updateId = String(update.update_id ?? "");
  if (!updateId) return errorResponse("INVALID_UPDATE", "Telegram update_id is required.", 400);
  const callbackValue = update.callback_query;
  if (!callbackValue || typeof callbackValue !== "object" || Array.isArray(callbackValue)) return json({ ok: true, handled: false });
  const callback = callbackValue as JsonObject;
  const message = callback.message;
  const from = callback.from;
  const chat = message && typeof message === "object" ? (message as JsonObject).chat : null;
  const chatId = chat && typeof chat === "object" ? String((chat as JsonObject).id ?? "") : "";
  const userId = from && typeof from === "object" ? String((from as JsonObject).id ?? "") : "";
  if (!allowedChatIds(env).has(chatId)) return errorResponse("CHAT_NOT_ALLOWED", "This Telegram chat is not authorized for attempts.", 403);
  const callbackData = typeof callback.data === "string" ? callback.data : "";
  const callbackKey = telegramCallbackKey(callbackData, chatId, userId);
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO telegram_events (update_id, callback_key, chat_id, user_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(updateId, callbackKey, chatId, userId, JSON.stringify(update), NOW()).run();
  if (number(inserted.meta?.changes) === 0) return json({ ok: true, handled: true, deduplicated: true });
  const parts = callbackData.split(":");
  if (parts[0] !== "start_attempt" || !parts[1]) return json({ ok: true, handled: false });
  const questionId = parts[1];
  const question = await first<Row>(env.DB, "SELECT id FROM questions WHERE id = ?", questionId);
  if (!question) return json({ ok: true, handled: false });
  const now = NOW();
  const attemptId = id("attempt");
  await env.DB.prepare("INSERT OR IGNORE INTO attempts (id, question_id, telegram_chat_id, telegram_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'started', ?, ?)").bind(attemptId, questionId, chatId, userId, now, now).run();
  const attempt = await first<Row>(env.DB, "SELECT * FROM attempts WHERE question_id = ? AND telegram_chat_id = ? AND telegram_user_id = ?", questionId, chatId, userId);
  if (env.TELEGRAM_BOT_TOKEN && typeof callback.id === "string") {
    ctx.waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callback_query_id: callback.id, text: "Attempt recorded in Afterlight" }) }).catch(() => undefined));
  }
  return json({ ok: true, handled: true, attempt: attempt ? toAttempt(attempt) : { id: attemptId, questionId, chatId, userId, status: "started" } });
}

async function attemptsRoute(request: Request, env: AfterlightEnv): Promise<Response> {
  const questionId = new URL(request.url).searchParams.get("questionId");
  if (!questionId) return errorResponse("INVALID_QUERY", "questionId is required.", 400);
  const [rows, discord] = await Promise.all([
    all<Row>(env.DB, "SELECT * FROM attempts WHERE question_id = ? ORDER BY created_at DESC", questionId),
    getDiscordAttempts(env, questionId)
  ]);
  return json({ attempts: [...rows.map(toAttempt), ...discord] }, {}, true);
}

async function publicationRoute(request: Request, env: AfterlightEnv, runId: string): Promise<Response> {
  if (!(await isOwner(request, env))) return errorResponse("UNAUTHORIZED", "Owner authorization is required to publish an artifact.", 401);
  if (!env.GITHUB_PUBLICATION_TOKEN) return errorResponse("GITHUB_NOT_CONFIGURED", "GitHub publication configuration is missing.", 503);
  let body: JsonObject;
  try { body = await readJson(request); } catch { return errorResponse("INVALID_JSON", "Request body must be a JSON object.", 400); }
  const run = await first<Row>(env.DB, "SELECT * FROM runs WHERE id = ?", runId);
  if (!run) return errorResponse("NOT_FOUND", "Run not found.", 404);
  if (run.status !== "completed") return errorResponse("RUN_NOT_COMPLETED", "Only completed runs can be published.", 409);
  const exportPayload = await buildRunExport(env.DB, runId);
  if (!exportPayload) return errorResponse("NOT_FOUND", "Run evidence could not be assembled.", 404);
  const encodedExport = JSON.stringify(exportPayload, null, 2);
  const computedHash = await sha256(encodedExport);
  const suppliedHash = typeof body.artifactHash === "string" ? body.artifactHash : computedHash;
  if (suppliedHash !== computedHash) return errorResponse("ARTIFACT_HASH_MISMATCH", "artifactHash must match the immutable export.", 409, { computedHash });
  const repositoryUrl = "https://github.com/RaphaelKhalid/afterlight";
  const path = publicationPath(runId);
  const existing = await first<Row>(env.DB, "SELECT * FROM publications WHERE run_id = ? AND artifact_hash = ?", runId, computedHash);
  if (existing) return json({ publication: { ...existing, deduplicated: true } });
  const publicationId = id("pub");
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO publications (id, run_id, artifact_hash, repository_url, publication_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'requested', ?, ?)").bind(publicationId, runId, computedHash, repositoryUrl, NOW(), NOW()).run();
  if (number(inserted.meta?.changes) === 0) {
    const duplicate = await first<Row>(env.DB, "SELECT * FROM publications WHERE run_id = ? AND artifact_hash = ?", runId, computedHash);
    return json({ publication: duplicate ? { ...duplicate, deduplicated: true } : { id: publicationId, runId, artifactHash: computedHash, status: "requested", deduplicated: true } }, { status: 202 });
  }
  const apiUrl = `https://api.github.com/repos/RaphaelKhalid/afterlight/contents/${path}`;
  const headers = { accept: "application/vnd.github+json", "content-type": "application/json", authorization: `Bearer ${env.GITHUB_PUBLICATION_TOKEN}`, "user-agent": "Afterlight/1.0" };
  let existingFile: JsonObject | null = null;
  try {
    const response = await fetch(`${apiUrl}?ref=main`, { headers });
    if (response.ok) existingFile = await response.json<JsonObject>();
    else if (response.status !== 404) throw new Error(`GITHUB_GET_${response.status}`);
    if (existingFile) {
      const encoded = typeof existingFile.content === "string" ? existingFile.content.replaceAll("\n", "") : "";
      const remoteBytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const remoteHash = await sha256(new TextDecoder().decode(remoteBytes));
      if (remoteHash !== computedHash) {
        await env.DB.prepare("UPDATE publications SET status = 'failed', response_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ code: "IMMUTABLE_PATH_CONFLICT", remoteHash, computedHash }), NOW(), publicationId).run();
        return errorResponse("IMMUTABLE_PATH_CONFLICT", "The GitHub artifact path already contains different evidence.", 409);
      }
      const stableUrl = typeof existingFile.html_url === "string" ? existingFile.html_url : `https://github.com/RaphaelKhalid/afterlight/blob/main/${path}`;
      await env.DB.prepare("UPDATE publications SET status = 'published', publication_url = ?, response_json = ?, updated_at = ? WHERE id = ?").bind(stableUrl, JSON.stringify(existingFile), NOW(), publicationId).run();
      await env.DB.prepare("UPDATE runs SET artifact_url = ?, updated_at = ? WHERE id = ?").bind(stableUrl, NOW(), runId).run();
      return json({ publication: { id: publicationId, runId, artifactHash: computedHash, repositoryUrl, publicationUrl: stableUrl, status: "published", deduplicated: true } });
    }
    const put = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify({ message: `Publish Afterlight run ${runId}`, content: btoa(unescape(encodeURIComponent(encodedExport))), branch: "main" }) });
    const putPayload: unknown = await put.json();
    if (!put.ok) throw new Error(`GITHUB_PUT_${put.status}`);
    const putObject = putPayload && typeof putPayload === "object" ? putPayload as JsonObject : {};
    const content = putObject.content && typeof putObject.content === "object" ? putObject.content as JsonObject : {};
    const stableUrl = typeof content.html_url === "string" ? content.html_url : `https://github.com/RaphaelKhalid/afterlight/blob/main/${path}`;
    await env.DB.prepare("UPDATE publications SET status = 'published', publication_url = ?, response_json = ?, updated_at = ? WHERE id = ?").bind(stableUrl, JSON.stringify(putPayload), NOW(), publicationId).run();
    await env.DB.prepare("UPDATE runs SET artifact_url = ?, updated_at = ? WHERE id = ?").bind(stableUrl, NOW(), runId).run();
    return json({ publication: { id: publicationId, runId, artifactHash: computedHash, repositoryUrl, publicationUrl: stableUrl, status: "published", deduplicated: false } }, { status: 201 });
  } catch (error) {
    await env.DB.prepare("UPDATE publications SET status = 'failed', response_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ error: String(error), outcome: "ambiguous, reconcile path before retry" }), NOW(), publicationId).run();
    return errorResponse("GITHUB_OUTCOME_AMBIGUOUS", "GitHub publication outcome is uncertain and was recorded without an automatic retry.", 502, { publicationId, path });
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildRunExport(db: D1Database, runId: string): Promise<JsonObject | null> {
  const run = await first<Row>(db, "SELECT * FROM runs WHERE id = ?", runId);
  if (!run) return null;
  const contract = await first<Row>(db, "SELECT id,version,hash,question_id,name,contract_json FROM contracts WHERE id = ? AND version = ?", run.contract_id, run.contract_version);
  const trials = await all<Row>(db, "SELECT * FROM trials WHERE run_id = ? ORDER BY ordinal", runId);
  return { schemaVersion: "afterlight-evidence-v1", exportedAt: run.completed_at ?? run.updated_at ?? run.created_at, run: toRun(run), contract: contract ? toContract(contract) : null, trials: trials.map(toTrial), provenance: { rawOutputsIncluded: true, costStatus: run.cost_status, limitation: "Provider outputs and measurements are scoped to this run and do not establish a broad claim." } };
}

async function exportRoute(env: AfterlightEnv, runId: string): Promise<Response> {
  const payload = await buildRunExport(env.DB, runId);
  if (!payload) return errorResponse("NOT_FOUND", "Run not found.", 404);
  return json(payload, {}, true);
}

export default {
  async fetch(request: Request, env: AfterlightEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-afterlight-owner-token, x-telegram-bot-api-secret-token", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    try {
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, service: "afterlight-api", environment: env.ENVIRONMENT ?? "unknown", now: NOW() }, {}, true);
      if (url.pathname === "/api/discord/interactions") return discordInteractions(request, env);
      const investigate = url.pathname.match(/^\/api\/questions\/([^/]+)\/investigate$/);
      if (investigate && request.method === "POST") return investigateQuestion(request, env, decodeURIComponent(investigate[1]));
      if (url.pathname.startsWith("/api/questions")) return questionRoutes(request, env, url.pathname);
      if (url.pathname === "/api/contracts" && request.method === "GET") return contractRoutes(env);
      if (url.pathname.startsWith("/api/runs")) {
        const exportMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/export$/);
        if (exportMatch && request.method === "GET") return exportRoute(env, decodeURIComponent(exportMatch[1]));
        const publication = url.pathname.match(/^\/api\/runs\/([^/]+)\/publish$/);
        if (publication && request.method === "POST") return publicationRoute(request, env, decodeURIComponent(publication[1]));
        const reconcile = url.pathname.match(/^\/api\/runs\/([^/]+)\/reconcile$/);
        if (reconcile && request.method === "POST") return reconcileRun(request, env, decodeURIComponent(reconcile[1]));
        return runRoutes(request, env, url.pathname);
      }
      if (url.pathname === "/api/attempts" && request.method === "GET") return attemptsRoute(request, env);
      if (url.pathname === "/api/telegram/invite" && request.method === "POST") return telegramInvite(request, env);
      if (url.pathname === "/api/telegram/webhook" && request.method === "POST") return telegramWebhook(request, env, ctx);
      return errorResponse("NOT_FOUND", "Route not found.", 404);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", path: url.pathname, error: String(error) }));
      return errorResponse("INTERNAL_ERROR", "The request could not be completed.", 500);
    }
  }
};

type ContractDefinition = {
  provider: string;
  model: string;
  endpoint?: string;
  maxOutputTokens?: number;
  maxCapUsd: number;
  maxTrialCostUsd?: number;
  totalTrials: number;
  cases: Array<{ id: string; input: string; expectedAnswer?: string }>;
  conditions: Array<{ id: string; label: string; instruction?: string; monitorInstruction?: string }>;
};

type ProviderResult = { answer: string; raw: unknown; monitorVerdict?: string; usage?: JsonObject; costUsd?: number; requestId?: string };
type TrialStepResult = { ok: boolean; ambiguous?: boolean; error?: string; providerResult?: ProviderResult };

function reviewedDefinition(raw: unknown): ContractDefinition {
  if (!raw || typeof raw !== "object") throw new Error("Contract is not an object");
  const value = raw as JsonObject;
  const v2 = typeof value.schemaVersion === "string" && value.schemaVersion.includes("contract.v2");
  if (!v2 && value.executor !== "openai-compatible-chat") throw new Error("EXECUTOR_NOT_REVIEWED");
  if (!Array.isArray(value.cases) || !Array.isArray(value.conditions)) throw new Error("CONTRACT_CASES_MISSING");
  const cases = value.cases.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("CONTRACT_CASE_INVALID");
    const item = entry as JsonObject;
    if (typeof item.input !== "string") throw new Error("CONTRACT_CASE_INPUT_MISSING");
    return { id: typeof item.id === "string" ? item.id : `case-${index}`, input: item.input, expectedAnswer: typeof item.expectedAnswer === "string" ? item.expectedAnswer : undefined };
  });
  const conditions = value.conditions.map((entry, index) => {
    if (typeof entry === "string") return { id: entry, label: entry, instruction: undefined, monitorInstruction: undefined };
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("CONTRACT_CONDITION_INVALID");
    const item = entry as JsonObject;
    return { id: typeof item.id === "string" ? item.id : `condition-${index}`, label: typeof item.label === "string" ? item.label : `Condition ${index + 1}`, instruction: typeof item.instruction === "string" ? item.instruction : undefined, monitorInstruction: typeof item.monitorInstruction === "string" ? item.monitorInstruction : undefined };
  });
  const modelObject = value.model && typeof value.model === "object" && !Array.isArray(value.model) ? value.model as JsonObject : null;
  const provider = typeof value.provider === "string" ? value.provider : modelObject && typeof modelObject.provider === "string" ? modelObject.provider.toLowerCase() : "";
  const model = typeof value.model === "string" ? value.model : modelObject && typeof modelObject.model === "string" ? modelObject.model : "";
  const budget = value.budget && typeof value.budget === "object" && !Array.isArray(value.budget) ? value.budget as JsonObject : null;
  const maxCapUsd = typeof value.maxCapUsd === "number" ? value.maxCapUsd : budget && typeof budget.capUsd === "number" ? budget.capUsd : -1;
  const totalTrials = typeof value.totalTrials === "number" ? value.totalTrials : cases.length * conditions.length;
  if (!provider || !model || maxCapUsd < 0 || !Number.isFinite(totalTrials)) throw new Error("CONTRACT_FIELDS_MISSING");
  return { provider: provider.toLowerCase(), model, endpoint: typeof value.endpoint === "string" ? value.endpoint : undefined, maxOutputTokens: typeof value.maxOutputTokens === "number" ? value.maxOutputTokens : modelObject && modelObject.settings && typeof modelObject.settings === "object" && typeof (modelObject.settings as JsonObject).subjectMaxTokens === "number" ? (modelObject.settings as JsonObject).subjectMaxTokens as number : undefined, maxCapUsd, maxTrialCostUsd: typeof value.maxTrialCostUsd === "number" ? value.maxTrialCostUsd : undefined, totalTrials, cases, conditions };
}

async function executeReviewedTemplate(contract: ContractDefinition, trial: Row, env: AfterlightEnv): Promise<ProviderResult> {
  const input = asJson<JsonObject>(trial.input_json, {});
  const testCase = input.case as JsonObject;
  const condition = input.condition as JsonObject;
  const provider = contract.provider;
  const key = provider === "openai" ? env.OPENAI_API_KEY : provider === "openrouter" ? env.OPENROUTER_API_KEY : undefined;
  if (!key) throw new Error("PROVIDER_NOT_CONFIGURED");
  const endpoint = contract.endpoint ?? (provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
  const requestId = crypto.randomUUID();
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...(provider === "openrouter" ? { "HTTP-Referer": "https://afterlight-research.vercel.app", "X-Title": "Afterlight" } : {}) },
    body: JSON.stringify({ model: contract.model, temperature: 0, max_tokens: Math.min(1000, Math.max(1, contract.maxOutputTokens ?? 300)), messages: [{ role: "system", content: String(condition.instruction ?? "Answer the research task clearly and briefly.") }, { role: "user", content: String(testCase.input ?? "") }] })
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  const object = payload && typeof payload === "object" ? payload as JsonObject : {};
  const choices = Array.isArray(object.choices) ? object.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as JsonObject : {};
  const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message as JsonObject : {};
  const answer = typeof message.content === "string" ? message.content : "";
  if (!answer) throw new Error("PROVIDER_EMPTY_OUTPUT");
  const usage = object.usage && typeof object.usage === "object" ? object.usage as JsonObject : undefined;
  const costUsd = estimateCost(usage);
  return { answer, raw: payload, usage, costUsd, requestId };
}

function estimateCost(usage?: JsonObject): number | undefined {
  if (!usage) return undefined;
  return typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : undefined;
}

export class AfterlightWorkflow extends WorkflowEntrypoint<AfterlightEnv, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<JsonObject> {
    const { runId } = event.payload;
    const runJson = await step.do("load run", async () => {
      const row = await first<Row>(this.env.DB, "SELECT * FROM runs WHERE id = ?", runId);
      return row ? JSON.stringify(row) : null;
    });
    const run: Row | null = runJson ? JSON.parse(runJson) as Row : null;
    if (!run) return { runId, status: "missing" };
    const contractJson = await step.do("load reviewed contract", async () => {
      const row = await first<Row>(this.env.DB, "SELECT * FROM contracts WHERE id = ? AND version = ? AND hash = ? AND status = 'validated'", run.contract_id, run.contract_version, run.contract_hash);
      return row ? JSON.stringify(row) : null;
    });
    const contractRow: Row | null = contractJson ? JSON.parse(contractJson) as Row : null;
    if (!contractRow) {
      await this.env.DB.prepare("UPDATE runs SET status = 'failed', updated_at = ? WHERE id = ?").bind(NOW(), runId).run();
      return { runId, status: "failed", reason: "CONTRACT_NOT_VALIDATED" };
    }
    const contract = reviewedDefinition(asJson(contractRow.contract_json, {}));
    await this.env.DB.prepare("UPDATE runs SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status IN ('queued','running')").bind(NOW(), NOW(), runId).run();
    await insertEvent(this.env.DB, runId, "run_started", { workflow: "afterlight-experiment" });
    while (true) {
      const current = await this.env.DB.prepare("SELECT * FROM runs WHERE id = ?").bind(runId).first<Row>();
      if (!current || ["paused", "stopped", "failed", "completed"].includes(String(current.status))) return { runId, status: current?.status ?? "missing" };
      const inFlight = await this.env.DB.prepare("SELECT id FROM trials WHERE run_id = ? AND status = 'running' LIMIT 1").bind(runId).first<Row>();
      if (inFlight) {
        await this.env.DB.prepare("UPDATE trials SET status = 'ambiguous', error_code = 'WORKFLOW_RESTART_RECONCILE', completed_at = ? WHERE id = ? AND status = 'running'").bind(NOW(), inFlight.id).run();
        await this.env.DB.prepare("UPDATE runs SET status = 'paused', cost_status = 'ambiguous', updated_at = ? WHERE id = ?").bind(NOW(), runId).run();
        await insertEvent(this.env.DB, runId, "workflow_restart_reconcile", { trialId: inFlight.id, action: "reconcile before resume" });
        return { runId, status: "paused", reason: "workflow_restart_reconcile", trialId: inFlight.id };
      }
      const trial = await this.env.DB.prepare("SELECT * FROM trials WHERE run_id = ? AND status = 'pending' ORDER BY ordinal LIMIT 1").bind(runId).first<Row>();
      if (!trial) {
        await this.env.DB.prepare("UPDATE runs SET status = 'completed', completed_at = ?, updated_at = ?, cost_status = CASE WHEN cost_status IN ('ambiguous','estimated') THEN cost_status ELSE 'provider-returned' END WHERE id = ? AND status IN ('queued','running')").bind(NOW(), NOW(), runId).run();
        await releaseReservation(this.env.DB, runId);
        await insertEvent(this.env.DB, runId, "run_completed", {});
        return { runId, status: "completed" };
      }
      const claimed = await this.env.DB.prepare("UPDATE trials SET status = 'running', attempt_count = attempt_count + 1, external_request_id = ?, created_at = created_at WHERE id = ? AND status = 'pending'").bind(crypto.randomUUID(), trial.id).run();
      if (number(claimed.meta?.changes) !== 1) continue;
      const claimedTrial = await this.env.DB.prepare("SELECT * FROM trials WHERE id = ?").bind(trial.id).first<Row>();
      if (!claimedTrial) continue;
      const allowance = number(current.cap_usd) - number(current.spent_usd);
      const expectedCost = number(contract.maxTrialCostUsd, number(current.cap_usd) / Math.max(1, number(current.total_trials)));
      if (shouldStopBeforeDispatch(number(current.cap_usd), number(current.spent_usd), expectedCost)) {
        await this.env.DB.prepare("UPDATE trials SET status = 'missing', error_code = 'CAP_REACHED', completed_at = ? WHERE id = ? AND status = 'running'").bind(NOW(), claimedTrial.id).run();
        await this.env.DB.prepare("UPDATE runs SET status = 'stopped', completed_at = ?, updated_at = ? WHERE id = ?").bind(NOW(), NOW(), runId).run();
        await releaseReservation(this.env.DB, runId);
        await insertEvent(this.env.DB, runId, "cap_reached", { trialId: claimedTrial.id, allowance, expectedCost });
        return { runId, status: "stopped", reason: "cap_reached" };
      }
      const resultJson = await step.do(`execute trial ${String(claimedTrial.id)}`, { retries: { limit: 0, delay: "1 second" } }, async () => {
        try {
          const providerResult = await executeReviewedTemplate(contract, claimedTrial, this.env);
          return JSON.stringify({ ok: true, providerResult });
        } catch (error) {
          const errorText = String(error);
          const knownNoDispatch = ["PROVIDER_NOT_CONFIGURED", "EXECUTOR_NOT_REVIEWED", "CONTRACT_CASES_MISSING"].some((code) => errorText.includes(code));
          return JSON.stringify({ ok: false, ambiguous: !knownNoDispatch, error: errorText });
        }
      });
      const result: TrialStepResult = JSON.parse(resultJson) as TrialStepResult;
      if (!result.ok || !result.providerResult) {
        const errorCode = result.error ?? "EXECUTOR_NO_RESULT";
        if (result.ambiguous) {
          await this.env.DB.prepare("UPDATE trials SET status = 'ambiguous', error_code = ?, completed_at = ? WHERE id = ? AND status = 'running'").bind(errorCode, NOW(), claimedTrial.id).run();
          await this.env.DB.prepare("UPDATE runs SET status = 'paused', cost_status = 'ambiguous', updated_at = ? WHERE id = ?").bind(NOW(), runId).run();
          await insertEvent(this.env.DB, runId, "ambiguous_paid_call", { trialId: claimedTrial.id, error: errorCode, action: "reconcile before resume" });
          return { runId, status: "paused", reason: "ambiguous_paid_call", trialId: claimedTrial.id };
        }
        await this.env.DB.prepare("UPDATE trials SET status = 'failed', failed_trials = failed_trials, error_code = ?, completed_at = ? WHERE id = ? AND status = 'running'").bind(errorCode, NOW(), claimedTrial.id).run();
        await this.env.DB.prepare("UPDATE runs SET failed_trials = failed_trials + 1, updated_at = ? WHERE id = ?").bind(NOW(), runId).run();
        await insertEvent(this.env.DB, runId, "trial_failed", { trialId: claimedTrial.id, error: errorCode, paidCallDispatched: false });
        continue;
      }
      const providerResult = result.providerResult;
      const expected = claimedTrial.expected_answer;
      const score = expected && providerResult.answer ? (providerResult.answer.trim().toLowerCase() === String(expected).trim().toLowerCase() ? 1 : 0) : null;
      await this.env.DB.prepare("UPDATE trials SET status = 'completed', output_json = ?, answer = ?, score = ?, usage_json = ?, cost_usd = ?, provider = ?, model = ?, completed_at = ? WHERE id = ? AND status = 'running'")
        .bind(JSON.stringify({ subject: providerResult.raw, provenance: { requestId: providerResult.requestId, provider: contract.provider, model: contract.model } }), providerResult.answer, score, providerResult.usage ? JSON.stringify(providerResult.usage) : null, providerResult.costUsd ?? null, contract.provider, contract.model, NOW(), claimedTrial.id).run();
      const cost = providerResult.costUsd ?? expectedCost;
      await this.env.DB.prepare("UPDATE runs SET spent_usd = spent_usd + ?, completed_trials = completed_trials + 1, cost_status = CASE WHEN ? = 1 AND cost_status != 'ambiguous' THEN 'estimated' ELSE cost_status END, updated_at = ? WHERE id = ?").bind(cost, providerResult.costUsd === undefined ? 1 : 0, NOW(), runId).run();
      await this.env.DB.prepare("UPDATE budget_reservations SET spent_usd = spent_usd + ? WHERE run_id = ? AND status = 'held'").bind(cost, runId).run();
      await insertEvent(this.env.DB, runId, "trial_completed", { trialId: claimedTrial.id, costUsd: cost, costStatus: providerResult.costUsd === undefined ? "estimated" : "provider-returned" });
      if (number(current.spent_usd) + cost >= number(current.cap_usd)) {
        await this.env.DB.prepare("UPDATE runs SET status = 'stopped', completed_at = ?, updated_at = ? WHERE id = ?").bind(NOW(), NOW(), runId).run();
        await releaseReservation(this.env.DB, runId);
        await insertEvent(this.env.DB, runId, "cap_reached", { trialId: claimedTrial.id, spentUsd: number(current.spent_usd) + cost });
        return { runId, status: "stopped", reason: "cap_reached" };
      }
    }
  }
}
