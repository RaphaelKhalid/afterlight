import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY,title TEXT NOT NULL,area TEXT NOT NULL,status TEXT NOT NULL,origin TEXT NOT NULL,summary TEXT NOT NULL,why_it_matters TEXT NOT NULL,source_json TEXT NOT NULL,closest_work_json TEXT NOT NULL,uncertainty TEXT NOT NULL,search_json TEXT NOT NULL,executable INTEGER NOT NULL DEFAULT 0,estimated_cost_usd REAL,estimated_minutes INTEGER,access TEXT NOT NULL,position_json TEXT,created_at TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY,title TEXT NOT NULL,authors_json TEXT NOT NULL,published TEXT NOT NULL,updated TEXT,url TEXT NOT NULL,version TEXT,source_type TEXT NOT NULL,abstract TEXT NOT NULL,topics_json TEXT NOT NULL,verification_status TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,type TEXT NOT NULL,explanation TEXT NOT NULL,evidence_url TEXT)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS contracts (id TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,question_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,contract_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,version),UNIQUE(id,hash))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS telegram_events (update_id TEXT PRIMARY KEY,callback_key TEXT UNIQUE,chat_id TEXT,user_id TEXT,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY,question_id TEXT NOT NULL,telegram_chat_id TEXT NOT NULL,telegram_user_id TEXT NOT NULL,status TEXT NOT NULL,result_run_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(question_id,telegram_chat_id,telegram_user_id))");
  await env.DB.prepare("INSERT OR IGNORE INTO questions (id,title,area,status,origin,summary,why_it_matters,source_json,closest_work_json,uncertainty,search_json,executable,estimated_cost_usd,estimated_minutes,access,position_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("integration-question", "Integration question", "Testing", "Unassessed", "fixture", "A test question", "A test reason", "{}", "[]", "fixture uncertainty", "{}", 0, 0, 1, "owner only", "{}", "2026-09-13T00:00:00.000Z")
    .run();
  await env.DB.prepare("INSERT OR IGNORE INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind("integration-contract", 1, "contract-hash", "integration-question", "Integration contract", "validated", JSON.stringify({ executor: "openai-compatible-chat", provider: "openrouter", model: "integration-model", maxCapUsd: 0.5, maxTrialCostUsd: 0.5, totalTrials: 1, cases: [{ id: "case-1", input: "Choose A", expectedAnswer: "A" }], conditions: [{ id: "condition-1", label: "control", instruction: "Return A" }] }), "2026-09-13T00:00:00.000Z")
    .run();
});

describe("Afterlight Worker handler boundaries", () => {
  it("serves health and public question routes through the actual Worker", async () => {
    const health = await SELF.fetch("https://afterlight.test/api/health");
    expect(health.status).toBe(200);
    expect((await health.json() as { ok: boolean }).ok).toBe(true);
    const questions = await SELF.fetch("https://afterlight.test/api/questions");
    expect(questions.status).toBe(200);
    const body = await questions.json() as { questions: Array<{ id: string }> };
    expect(body.questions.some((question) => question.id === "integration-question")).toBe(true);
  });

  it("rejects an attempted paid run before touching the database when owner auth is absent", async () => {
    const response = await SELF.fetch("https://afterlight.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractId: "integration-contract", contractHash: "changed", capUsd: 1 })
    });
    expect(response.status).toBe(401);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid Telegram secret without persisting a callback", async () => {
    const response = await SELF.fetch("https://afterlight.test/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong" },
      body: JSON.stringify({ update_id: 1 })
    });
    expect(response.status).toBe(401);
  });

  it("rejects a changed contract hash before queuing owner spend", async () => {
    const response = await SELF.fetch("https://afterlight.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer integration-owner" },
      body: JSON.stringify({ contractId: "integration-contract", contractHash: "changed", capUsd: 0.25 })
    });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("CONTRACT_NOT_VALIDATED");
  });

  it("deduplicates a repeated Telegram callback in D1", async () => {
    const update = { update_id: 91001, callback_query: { id: "callback-1", data: "start_attempt:integration-question:0011223344556677", from: { id: 42 }, message: { chat: { id: "chat1" } } } };
    const init = { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "integration-telegram" }, body: JSON.stringify(update) };
    const first = await SELF.fetch("https://afterlight.test/api/telegram/webhook", init);
    expect(first.status).toBe(200);
    expect((await first.json() as { deduplicated?: boolean }).deduplicated).toBeUndefined();
    const second = await SELF.fetch("https://afterlight.test/api/telegram/webhook", init);
    expect(second.status).toBe(200);
    expect((await second.json() as { deduplicated?: boolean }).deduplicated).toBe(true);
    const attempts = await env.DB.prepare("SELECT COUNT(*) AS count FROM attempts WHERE question_id = ?").bind("integration-question").first<{ count: number }>();
    expect(attempts?.count).toBe(1);
  });
});
