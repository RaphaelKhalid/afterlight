import { env, SELF, introspectWorkflowInstance } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY,title TEXT NOT NULL,area TEXT NOT NULL,status TEXT NOT NULL,origin TEXT NOT NULL,summary TEXT NOT NULL,why_it_matters TEXT NOT NULL,source_json TEXT NOT NULL,closest_work_json TEXT NOT NULL,uncertainty TEXT NOT NULL,search_json TEXT NOT NULL,executable INTEGER NOT NULL DEFAULT 0,estimated_cost_usd REAL,estimated_minutes INTEGER,access TEXT NOT NULL,position_json TEXT,created_at TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY,title TEXT NOT NULL,authors_json TEXT NOT NULL,published TEXT NOT NULL,updated TEXT,url TEXT NOT NULL,version TEXT,source_type TEXT NOT NULL,abstract TEXT NOT NULL,topics_json TEXT NOT NULL,verification_status TEXT NOT NULL,featured INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,type TEXT NOT NULL,explanation TEXT NOT NULL,evidence_url TEXT)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS contracts (id TEXT NOT NULL,version INTEGER NOT NULL,hash TEXT NOT NULL,question_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,contract_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,version),UNIQUE(id,hash))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS telegram_events (update_id TEXT PRIMARY KEY,callback_key TEXT UNIQUE,chat_id TEXT,user_id TEXT,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY,question_id TEXT NOT NULL,telegram_chat_id TEXT NOT NULL,telegram_user_id TEXT NOT NULL,status TEXT NOT NULL,result_run_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(question_id,telegram_chat_id,telegram_user_id))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY,question_id TEXT NOT NULL,contract_id TEXT NOT NULL,contract_version INTEGER NOT NULL,contract_hash TEXT NOT NULL,status TEXT NOT NULL,cap_usd REAL NOT NULL,spent_usd REAL NOT NULL DEFAULT 0,cost_status TEXT NOT NULL DEFAULT 'estimated',total_trials INTEGER NOT NULL,completed_trials INTEGER NOT NULL DEFAULT 0,failed_trials INTEGER NOT NULL DEFAULT 0,conditions_json TEXT NOT NULL DEFAULT '[]',started_at TEXT,completed_at TEXT,workflow_instance_id TEXT,summary_json TEXT,artifact_url TEXT,lease_owner TEXT,lease_expires_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS trials (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,case_id TEXT NOT NULL,condition_id TEXT NOT NULL,ordinal INTEGER NOT NULL,status TEXT NOT NULL,input_json TEXT NOT NULL,output_json TEXT,answer TEXT,expected_answer TEXT,score REAL,monitor_verdict TEXT,provider TEXT,model TEXT,usage_json TEXT,cost_usd REAL,cost_status TEXT,error_code TEXT,external_request_id TEXT,attempt_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,completed_at TEXT,UNIQUE(run_id,case_id,condition_id))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS run_events (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,type TEXT NOT NULL,detail_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS budget_reservations (id TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,provider TEXT NOT NULL,reserved_usd REAL NOT NULL,spent_usd REAL NOT NULL DEFAULT 0,status TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,artifact_hash TEXT NOT NULL,repository_url TEXT NOT NULL,publication_url TEXT NOT NULL,status TEXT NOT NULL,response_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(run_id,artifact_hash))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS scientific_calls (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,trial_id TEXT NOT NULL,stage TEXT NOT NULL,request_hash TEXT NOT NULL,request_json TEXT NOT NULL,response_json TEXT,status TEXT NOT NULL,http_status INTEGER,cost_usd REAL,cost_basis TEXT NOT NULL DEFAULT 'unavailable',reserved_usd REAL NOT NULL DEFAULT 0.01,started_at TEXT NOT NULL,completed_at TEXT,UNIQUE(trial_id,stage))");
  await env.DB.prepare(`
    CREATE TRIGGER IF NOT EXISTS sync_run_accounting_after_trial_update
    AFTER UPDATE OF status, cost_usd, cost_status ON trials
    WHEN NEW.status IN ('completed','failed','ambiguous','missing') OR OLD.status IN ('completed','failed','ambiguous','missing')
    BEGIN
      UPDATE runs SET
        spent_usd = COALESCE((SELECT SUM(cost_usd) FROM trials WHERE run_id = NEW.run_id AND status IN ('completed','failed','ambiguous','missing')), 0),
        completed_trials = (SELECT COUNT(*) FROM trials WHERE run_id = NEW.run_id AND status = 'completed'),
        failed_trials = (SELECT COUNT(*) FROM trials WHERE run_id = NEW.run_id AND status = 'failed'),
        cost_status = CASE
          WHEN EXISTS (SELECT 1 FROM trials WHERE run_id = NEW.run_id AND status = 'ambiguous') THEN 'ambiguous'
          WHEN EXISTS (SELECT 1 FROM trials WHERE run_id = NEW.run_id AND status IN ('completed','failed','missing') AND cost_status = 'estimated') THEN 'estimated'
          WHEN EXISTS (SELECT 1 FROM trials WHERE run_id = NEW.run_id AND status IN ('completed','failed','missing') AND cost_usd IS NOT NULL) THEN 'provider-returned'
          ELSE cost_status
        END
      WHERE id = NEW.run_id;
      UPDATE budget_reservations SET spent_usd = COALESCE((SELECT SUM(cost_usd) FROM trials WHERE run_id = NEW.run_id AND status IN ('completed','failed','ambiguous','missing')), 0) WHERE run_id = NEW.run_id;
    END
  `).run();
  await env.DB.prepare(`
    CREATE TRIGGER IF NOT EXISTS sync_terminal_trial_cost_after_scientific_call_update
    AFTER UPDATE OF status, cost_usd, cost_basis, reserved_usd ON scientific_calls
    WHEN EXISTS (SELECT 1 FROM trials WHERE id = NEW.trial_id AND status IN ('completed','failed','ambiguous','missing'))
    BEGIN
      UPDATE trials SET
        cost_usd = COALESCE((SELECT SUM(CASE WHEN cost_usd IS NOT NULL THEN cost_usd ELSE reserved_usd END) FROM scientific_calls WHERE trial_id = NEW.trial_id), 0),
        cost_status = CASE WHEN EXISTS (SELECT 1 FROM scientific_calls WHERE trial_id = NEW.trial_id AND (cost_usd IS NULL OR cost_basis != 'provider-returned')) THEN 'estimated' ELSE 'provider-returned' END
      WHERE id = NEW.trial_id;
    END
  `).run();
  await env.DB.prepare("INSERT OR IGNORE INTO questions (id,title,area,status,origin,summary,why_it_matters,source_json,closest_work_json,uncertainty,search_json,executable,estimated_cost_usd,estimated_minutes,access,position_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("integration-question", "Integration question", "Testing", "Unassessed", "fixture", "A test question", "A test reason", "{}", "[]", "fixture uncertainty", "{}", 0, 0, 1, "owner only", "{}", "2026-09-13T00:00:00.000Z")
    .run();
  await env.DB.prepare("INSERT OR IGNORE INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind("integration-contract", 1, "contract-hash", "integration-question", "Integration contract", "validated", JSON.stringify({ executor: "openai-compatible-chat", provider: "openrouter", model: "integration-model", maxCapUsd: 0.5, maxTrialCostUsd: 0.5, totalTrials: 1, cases: [{ id: "case-1", input: "Choose A", expectedAnswer: "A" }], conditions: [{ id: "condition-1", label: "control", instruction: "Return A" }] }), "2026-09-13T00:00:00.000Z")
    .run();
  await env.DB.prepare("INSERT OR IGNORE INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at) VALUES (?,?,?,?,?,'released',?)")
    .bind("historical-reservation", "historical-run", "openrouter", 5.9, 5.9, "2026-09-13T00:00:00.000Z")
    .run();
  await env.DB.prepare("INSERT OR IGNORE INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,'completed',?,?,'[]',?,?,?)")
    .bind("published-run", "integration-question", "integration-contract", 1, "contract-hash", 0.25, 1, "2026-09-13T00:00:00.000Z", "2026-09-13T00:00:00.000Z", "2026-09-13T00:00:00.000Z")
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

  it("rejects primary-measurement changes without touching the frozen contract or accounting", async () => {
    const beforeContract = await env.DB.prepare("SELECT contract_json FROM contracts WHERE id = ? AND version = 1").bind("integration-contract").first<{ contract_json: string }>();
    const beforeRuns = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ?").bind("integration-contract").first<{ count: number }>();
    const beforeReservations = await env.DB.prepare("SELECT COUNT(*) AS count FROM budget_reservations WHERE provider = ?").bind("openrouter").first<{ count: number }>();
    const response = await SELF.fetch("https://afterlight.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer integration-owner" },
      body: JSON.stringify({ contractId: "integration-contract", contractHash: "contract-hash", capUsd: 0, primaryOutcome: "replace after seeing results" })
    });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("SCOPE_CHANGE_REQUIRES_NEW_CONTRACT");
    const afterContract = await env.DB.prepare("SELECT contract_json FROM contracts WHERE id = ? AND version = 1").bind("integration-contract").first<{ contract_json: string }>();
    const afterRuns = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ?").bind("integration-contract").first<{ count: number }>();
    const afterReservations = await env.DB.prepare("SELECT COUNT(*) AS count FROM budget_reservations WHERE provider = ?").bind("openrouter").first<{ count: number }>();
    expect(afterContract?.contract_json).toBe(beforeContract?.contract_json);
    expect(afterRuns?.count).toBe(beforeRuns?.count);
    expect(afterReservations?.count).toBe(beforeReservations?.count);
  });

  it("rejects a question identity that does not match the validated contract", async () => {
    const beforeRuns = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ?").bind("integration-contract").first<{ count: number }>();
    const beforeReservations = await env.DB.prepare("SELECT COUNT(*) AS count FROM budget_reservations WHERE provider = ?").bind("openrouter").first<{ count: number }>();
    const response = await SELF.fetch("https://afterlight.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer integration-owner" },
      body: JSON.stringify({ contractId: "integration-contract", contractHash: "contract-hash", capUsd: 0, questionId: "different-question" })
    });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("QUESTION_CONTRACT_MISMATCH");
    const afterRuns = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ?").bind("integration-contract").first<{ count: number }>();
    const afterReservations = await env.DB.prepare("SELECT COUNT(*) AS count FROM budget_reservations WHERE provider = ?").bind("openrouter").first<{ count: number }>();
    expect(afterRuns?.count).toBe(beforeRuns?.count);
    expect(afterReservations?.count).toBe(beforeReservations?.count);
  });

  it("rejects a cap when historical provider spend exhausts the configured allowance", async () => {
    const response = await SELF.fetch("https://afterlight.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer integration-owner" },
      body: JSON.stringify({ contractId: "integration-contract", contractHash: "contract-hash", capUsd: 0.25 })
    });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("BUDGET_RESERVED");
    const runs = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ? AND id != 'published-run'").bind("integration-contract").first<{ count: number }>();
    expect(runs?.count).toBe(0);
  });

  it("allows only one concurrent reservation when the provider allowance has one cap-sized slot", async () => {
    const response = await env.DB.prepare("INSERT OR IGNORE INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at) VALUES (?,?,?,?,?,'released',?)")
      .bind("parallel-history", "parallel-history", "openrouter", 0.04, 0.04, "2026-09-13T00:00:00.000Z").run();
    expect(Number(response.meta?.changes ?? 0)).toBe(1);
    const init = (cap: number) => ({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ contractId: "integration-contract", contractHash: "contract-hash", capUsd: cap }) });
    const results = await Promise.all([SELF.fetch("https://afterlight.test/api/runs", init(0.04)), SELF.fetch("https://afterlight.test/api/runs", init(0.04))]);
    expect(results.map((item) => item.status).sort()).toEqual([202, 409]);
    const runs = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ? AND id != 'published-run'").bind("integration-contract").first<{ count: number }>();
    expect(runs?.count).toBe(1);
  });

  it("enforces contract expiry and creates case-major trial order", async () => {
    const now = "2026-09-13T00:00:00.000Z";
    const base = { executor: "implicit-influence-v3", provider: "openrouter", model: "integration-model", maxCapUsd: 0.5, maxTrialCostUsd: 0.01, totalTrials: 4, cases: [{ id: "case-a", input: "{}" }, { id: "case-b", input: "{}" }], conditions: [{ id: "baseline" }, { id: "implicit" }] };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES (?,?,?,?,?,'validated',?,?)").bind("expired-contract", 1, "expired-hash", "integration-question", "Expired contract", JSON.stringify({ ...base, validUntil: "2000-01-01T00:00:00.000Z" }), now),
      env.DB.prepare("INSERT INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES (?,?,?,?,?,'validated',?,?)").bind("case-major-contract", 1, "case-major-hash", "integration-question", "Case-major contract", JSON.stringify({ ...base, executionOrder: "case-major", validUntil: "2099-01-01T00:00:00.000Z" }), now),
      env.DB.prepare("INSERT INTO contracts (id,version,hash,question_id,name,status,contract_json,created_at) VALUES (?,?,?,?,?,'validated',?,?)").bind("criterionless-contract", 1, "criterionless-hash", "integration-question", "Criterionless contract", JSON.stringify({ executor: "openai-compatible-chat", provider: "openrouter", model: "integration-model", maxCapUsd: 0.1, totalTrials: 1, cases: [{ id: "case-no-criterion", input: "Choose one" }], conditions: [{ id: "baseline" }] }), now)
    ]);
    const init = (contractId: string, contractHash: string) => ({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ contractId, contractHash, capUsd: 0 }) });
    const criterionless = await SELF.fetch("https://afterlight.test/api/runs", init("criterionless-contract", "criterionless-hash"));
    expect(criterionless.status).toBe(422);
    expect((await criterionless.json() as { error: { details: { reason: string } } }).error.details.reason).toContain("EXECUTABLE_CRITERION_REQUIRED");
    const rejectedRows = await env.DB.prepare("SELECT COUNT(*) AS count FROM runs WHERE contract_id = ?").bind("criterionless-contract").first<{ count: number }>();
    expect(rejectedRows?.count).toBe(0);

    const expired = await SELF.fetch("https://afterlight.test/api/runs", init("expired-contract", "expired-hash"));
    expect(expired.status).toBe(409);
    expect((await expired.json() as { error: { code: string } }).error.code).toBe("CONTRACT_EXPIRED");

    const created = await SELF.fetch("https://afterlight.test/api/runs", init("case-major-contract", "case-major-hash"));
    expect(created.status).toBe(202);
    const runId = String((await created.json() as { run: { id: string } }).run.id);
    const trials = await env.DB.prepare("SELECT case_id,condition_id FROM trials WHERE run_id = ? ORDER BY ordinal").bind(runId).all<{ case_id: string; condition_id: string }>();
    expect(trials.results).toEqual([
      { case_id: "case-a", condition_id: "baseline" },
      { case_id: "case-a", condition_id: "implicit" },
      { case_id: "case-b", condition_id: "baseline" },
      { case_id: "case-b", condition_id: "implicit" }
    ]);
  });

  it("stops a queued workflow before dispatch when the run cap is already spent", async () => {
    const runId = "stop-before-dispatch";
    const trialId = "stop-before-dispatch-trial";
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,spent_usd,total_trials,completed_trials,conditions_json,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,?,?,'[]',?,?)").bind(runId, "integration-question", "integration-contract", 1, "contract-hash", 0.01, 0.01, 2, 1, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,cost_usd,cost_status,created_at,completed_at) VALUES (?,?,?,?,?,'completed',?,?,'provider-returned',?,?)").bind("already-billed-trial", runId, "case-0", "condition-1", 0, "{}", 0.01, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,expected_answer,created_at) VALUES (?,?,?,?,?,'pending',?,?,?)").bind(trialId, runId, "case-1", "condition-1", 1, JSON.stringify({ case: { id: "case-1", input: "Choose A" }, condition: { id: "condition-1" } }), "A", now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,status,created_at) VALUES (?,?,?,?,'held',?)").bind("stop-reservation", runId, "openrouter", 0.01, now)
    ]);
    const instanceId = "stop-" + crypto.randomUUID();
    await env.AFTERLIGHT_WORKFLOW.create({ id: instanceId, params: { runId } });
    const instance = await introspectWorkflowInstance(env.AFTERLIGHT_WORKFLOW, instanceId);
    await instance.waitForStatus("complete");
    const trial = await env.DB.prepare("SELECT status,error_code FROM trials WHERE id = ?").bind(trialId).first<{ status: string; error_code: string }>();
    const run = await env.DB.prepare("SELECT status,spent_usd FROM runs WHERE id = ?").bind(runId).first<{ status: string; spent_usd: number }>();
    expect(trial).toMatchObject({ status: "missing", error_code: "CAP_REACHED" });
    expect(run).toMatchObject({ status: "stopped", spent_usd: 0.01 });
  });

  it("reconciles an interrupted trial and resumes without double-counting completed work", async () => {
    const runId = "resume-after-interruption";
    const trialId = "interrupted-trial";
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,spent_usd,total_trials,completed_trials,conditions_json,created_at,updated_at) VALUES (?,?,?,?,?,'running',?,?,?,?,'[]',?,?)").bind(runId, "integration-question", "integration-contract", 1, "contract-hash", 0.5, 0.01, 2, 1, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,expected_answer,answer,score,cost_usd,created_at,completed_at) VALUES (?,?,?,?,?,'completed',?,?,?,?,?,?,?)").bind("completed-trial", runId, "case-1", "condition-1", 0, "{}", "A", "A", 1, 0.01, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,expected_answer,created_at) VALUES (?,?,?,?,?,'running',?,?,?)").bind(trialId, runId, "case-2", "condition-1", 1, "{}", "A", now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at) VALUES (?,?,?,? ,?,'held',?)").bind("resume-reservation", runId, "openrouter", 0.5, 0.01, now),
      env.DB.prepare("INSERT INTO scientific_calls (id,run_id,trial_id,stage,request_hash,request_json,response_json,status,http_status,cost_usd,reserved_usd,started_at,completed_at) VALUES (?,?,?,?,?,?,?,'completed',200,?,?,?,?)").bind("interrupted-subject", runId, trialId, "subject", "subject-hash", "{}", "{}", 0.004, 0.01, now, now),
      env.DB.prepare("INSERT INTO scientific_calls (id,run_id,trial_id,stage,request_hash,request_json,status,reserved_usd,started_at) VALUES (?,?,?,?,?,?,'dispatching',?,?)").bind("interrupted-monitor", runId, trialId, "monitor", "monitor-hash", "{}", 0.01, now)
    ]);
    const interruptedInstance = "interrupt-" + crypto.randomUUID();
    await env.AFTERLIGHT_WORKFLOW.create({ id: interruptedInstance, params: { runId } });
    const firstInstance = await introspectWorkflowInstance(env.AFTERLIGHT_WORKFLOW, interruptedInstance);
    await firstInstance.waitForStatus("complete");
    const pausedTrial = await env.DB.prepare("SELECT status,error_code FROM trials WHERE id = ?").bind(trialId).first<{ status: string; error_code: string }>();
    expect(pausedTrial).toMatchObject({ status: "ambiguous", error_code: "WORKFLOW_RESTART_RECONCILE" });
    const reconcile = await SELF.fetch("https://afterlight.test/api/runs/" + runId + "/reconcile", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ trialId, outcome: "missing" }) });

    expect(reconcile.status).toBe(200);
    const resume = await SELF.fetch("https://afterlight.test/api/runs/" + runId + "/control", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ action: "resume" }) });
    expect(resume.status).toBe(200);
    const resumed = await resume.json() as { run: { workflowInstanceId?: string } };
    const runAfterResume = await env.DB.prepare("SELECT workflow_instance_id FROM runs WHERE id = ?").bind(runId).first<{ workflow_instance_id: string }>();
    const resumedInstanceId = runAfterResume?.workflow_instance_id ?? resumed.run.workflowInstanceId;
    expect(resumedInstanceId).toBeTruthy();
    const secondInstance = await introspectWorkflowInstance(env.AFTERLIGHT_WORKFLOW, String(resumedInstanceId));
    await secondInstance.waitForStatus("complete");
    const finalRun = await env.DB.prepare("SELECT status,completed_trials,failed_trials,spent_usd FROM runs WHERE id = ?").bind(runId).first<{ status: string; completed_trials: number; failed_trials: number; spent_usd: number }>();
    const reconciledTrial = await env.DB.prepare("SELECT cost_usd FROM trials WHERE id = ?").bind(trialId).first<{ cost_usd: number }>();
    expect(finalRun).toMatchObject({ status: "completed", completed_trials: 1, failed_trials: 0, spent_usd: 0.024 });
    expect(reconciledTrial?.cost_usd).toBe(0.014);
  });

  it("accounts a stopped in-flight scientific trial once and updates a released reservation", async () => {
    const runId = "stopped-in-flight";
    const trialId = "stopped-in-flight-trial";
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,'stopped',?,?,'[]',?,?,?)").bind(runId, "integration-question", "integration-contract", 1, "contract-hash", 0.5, 1, now, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,created_at) VALUES (?,?,?,?,?,'running',?,?)").bind(trialId, runId, "case-stop", "implicit", 0, "{}", now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,status,created_at,released_at) VALUES (?,?,?,?,'released',?,?)").bind("stopped-reservation", runId, "openrouter", 0.5, now, now),
      env.DB.prepare("INSERT INTO scientific_calls (id,run_id,trial_id,stage,request_hash,request_json,response_json,status,http_status,cost_usd,cost_basis,reserved_usd,started_at,completed_at) VALUES (?,?,?,?,?,?,?,'completed',200,?,'provider-returned',?,?,?)").bind("stopped-subject", runId, trialId, "subject", "subject-hash", "{}", "{}", 0.004, 0.01, now, now),
      env.DB.prepare("INSERT INTO scientific_calls (id,run_id,trial_id,stage,request_hash,request_json,status,cost_basis,reserved_usd,started_at) VALUES (?,?,?,?,?,?,'dispatching','unavailable',?,?)").bind("stopped-monitor", runId, trialId, "monitor", "monitor-hash", "{}", 0.01, now)
    ]);

    const instanceId = "stopped-" + crypto.randomUUID();
    await env.AFTERLIGHT_WORKFLOW.create({ id: instanceId, params: { runId } });
    await (await introspectWorkflowInstance(env.AFTERLIGHT_WORKFLOW, instanceId)).waitForStatus("complete");

    const beforeReconcile = await env.DB.prepare("SELECT status,spent_usd,cost_status FROM runs WHERE id = ?").bind(runId).first<{ status: string; spent_usd: number; cost_status: string }>();
    expect(beforeReconcile).toMatchObject({ status: "stopped", spent_usd: 0.014, cost_status: "ambiguous" });

    const request = () => SELF.fetch("https://afterlight.test/api/runs/" + runId + "/reconcile", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ trialId, outcome: "failed" }) });
    const first = await request();
    const replay = await request();
    expect(first.status).toBe(200);
    expect(replay.status).toBe(404);

    let aggregate = await env.DB.prepare("SELECT status,failed_trials,spent_usd,cost_status FROM runs WHERE id = ?").bind(runId).first<{ status: string; failed_trials: number; spent_usd: number; cost_status: string }>();
    let reservation = await env.DB.prepare("SELECT status,spent_usd FROM budget_reservations WHERE run_id = ?").bind(runId).first<{ status: string; spent_usd: number }>();
    expect(aggregate).toMatchObject({ status: "stopped", failed_trials: 1, spent_usd: 0.014, cost_status: "estimated" });
    expect(reservation).toMatchObject({ status: "released", spent_usd: 0.014 });

    await env.DB.prepare("UPDATE scientific_calls SET status = 'completed', cost_usd = 0.006, cost_basis = 'estimated', completed_at = ? WHERE id = ?").bind(now, "stopped-monitor").run();
    aggregate = await env.DB.prepare("SELECT status,failed_trials,spent_usd,cost_status FROM runs WHERE id = ?").bind(runId).first<{ status: string; failed_trials: number; spent_usd: number; cost_status: string }>();
    reservation = await env.DB.prepare("SELECT status,spent_usd FROM budget_reservations WHERE run_id = ?").bind(runId).first<{ status: string; spent_usd: number }>();
    expect(aggregate).toMatchObject({ status: "stopped", failed_trials: 1, spent_usd: 0.01, cost_status: "estimated" });
    expect(reservation).toMatchObject({ status: "released", spent_usd: 0.01 });
  });

  it("does not resume while an unexpired workflow lease is active", async () => {
    const runId = "resume-active-lease";
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,lease_owner,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'paused',?,?,'[]',?,?,?,?)")
      .bind(runId, "integration-question", "integration-contract", 1, "contract-hash", 0.5, 1, "workflow:existing", "2099-01-01T00:00:00.000Z", now, now).run();
    const response = await SELF.fetch("https://afterlight.test/api/runs/" + runId + "/control", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ action: "resume" }) });
    expect(response.status).toBe(409);
    const run = await env.DB.prepare("SELECT status,workflow_instance_id FROM runs WHERE id = ?").bind(runId).first<{ status: string; workflow_instance_id: string | null }>();
    expect(run).toMatchObject({ status: "paused", workflow_instance_id: null });
  });

  it("reuses its stable workflow instance lease on replay and reconciles an in-flight trial", async () => {
    const runId = "stable-replay-lease";
    const trialId = "stable-replay-lease-trial";
    const instanceId = "stable-replay-" + crypto.randomUUID();
    const leaseOwner = "workflow:" + instanceId;
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,workflow_instance_id,lease_owner,lease_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,'running',?,?,'[]',?,?,?,?,?)")
        .bind(runId, "integration-question", "integration-contract", 1, "contract-hash", 0.5, 1, instanceId, leaseOwner, "2099-01-01T00:00:00.000Z", now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,expected_answer,attempt_count,created_at) VALUES (?,?,?,?,?,'running',?,?,?,?)")
        .bind(trialId, runId, "case-replay", "baseline", 0, "{}", "A", 1, now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,status,created_at) VALUES (?,?,?,?,'held',?)")
        .bind("stable-replay-reservation", runId, "openrouter", 0.5, now)
    ]);

    await env.AFTERLIGHT_WORKFLOW.create({ id: instanceId, params: { runId } });
    await (await introspectWorkflowInstance(env.AFTERLIGHT_WORKFLOW, instanceId)).waitForStatus("complete");

    const run = await env.DB.prepare("SELECT status,lease_owner,lease_expires_at FROM runs WHERE id = ?").bind(runId)
      .first<{ status: string; lease_owner: string | null; lease_expires_at: string | null }>();
    const trial = await env.DB.prepare("SELECT status,error_code FROM trials WHERE id = ?").bind(trialId)
      .first<{ status: string; error_code: string }>();
    const reservation = await env.DB.prepare("SELECT status FROM budget_reservations WHERE run_id = ?").bind(runId)
      .first<{ status: string }>();
    const event = await env.DB.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ? AND type = 'workflow_restart_reconcile'").bind(runId)
      .first<{ count: number }>();

    expect(run).toMatchObject({ status: "paused", lease_owner: null, lease_expires_at: null });
    expect(trial).toMatchObject({ status: "ambiguous", error_code: "WORKFLOW_RESTART_RECONCILE" });
    expect(reservation?.status).toBe("held");
    expect(event?.count).toBe(1);
  });

  it("releases a stopped settled run reservation and retains one with an ambiguous trial", async () => {
    const now = "2026-09-13T00:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,created_at,updated_at) VALUES (?,?,?,?,?,'paused',?,?,'[]',?,?)")
        .bind("stop-settled", "integration-question", "integration-contract", 1, "contract-hash", 0.5, 2, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,cost_usd,cost_status,created_at,completed_at) VALUES (?,?,?,?,?,'completed',?,?,'provider-returned',?,?)")
        .bind("stop-settled-complete", "stop-settled", "case-complete", "baseline", 0, "{}", 0.01, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,created_at) VALUES (?,?,?,?,?,'pending',?,?)")
        .bind("stop-settled-pending", "stop-settled", "case-pending", "baseline", 1, "{}", now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at) VALUES (?,?,?,?,?,'held',?)")
        .bind("stop-settled-reservation", "stop-settled", "openrouter", 0.5, 0.01, now),
      env.DB.prepare("INSERT INTO runs (id,question_id,contract_id,contract_version,contract_hash,status,cap_usd,total_trials,conditions_json,created_at,updated_at) VALUES (?,?,?,?,?,'paused',?,?,'[]',?,?)")
        .bind("stop-unsettled", "integration-question", "integration-contract", 1, "contract-hash", 0.5, 1, now, now),
      env.DB.prepare("INSERT INTO trials (id,run_id,case_id,condition_id,ordinal,status,input_json,cost_usd,cost_status,created_at) VALUES (?,?,?,?,?,'ambiguous',?,?,'estimated',?)")
        .bind("stop-unsettled-trial", "stop-unsettled", "case-ambiguous", "baseline", 0, "{}", 0.01, now),
      env.DB.prepare("INSERT INTO budget_reservations (id,run_id,provider,reserved_usd,spent_usd,status,created_at) VALUES (?,?,?,?,?,'held',?)")
        .bind("stop-unsettled-reservation", "stop-unsettled", "openrouter", 0.5, 0.01, now)
    ]);

    const stop = (runId: string) => SELF.fetch("https://afterlight.test/api/runs/" + runId + "/control", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer integration-owner" },
      body: JSON.stringify({ action: "stop" })
    });
    expect((await stop("stop-settled")).status).toBe(200);
    expect((await stop("stop-unsettled")).status).toBe(200);

    const reservations = await env.DB.prepare("SELECT run_id,status FROM budget_reservations WHERE run_id IN ('stop-settled','stop-unsettled') ORDER BY run_id").all<{ run_id: string; status: string }>();
    expect(reservations.results).toEqual([
      { run_id: "stop-settled", status: "released" },
      { run_id: "stop-unsettled", status: "held" }
    ]);
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

  it("returns an existing GitHub publication without repeating the side effect", async () => {
    const exported = await SELF.fetch("https://afterlight.test/api/runs/published-run/export");
    const exportPayload = await exported.json();
    const encoded = JSON.stringify(exportPayload, null, 2);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT OR IGNORE INTO publications (id,run_id,artifact_hash,repository_url,publication_url,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)")
      .bind("existing-publication", "published-run", hash, "https://github.com/RaphaelKhalid/afterlight", "https://github.com/RaphaelKhalid/afterlight/blob/main/artifacts/runs/published-run.json", "2026-09-13T00:00:00.000Z", "2026-09-13T00:00:00.000Z")
      .run();
    const response = await SELF.fetch("https://afterlight.test/api/runs/published-run/publish", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-owner" }, body: JSON.stringify({ artifactHash: hash }) });
    expect(response.status).toBe(200);
    expect((await response.json() as { publication: { deduplicated: boolean } }).publication.deduplicated).toBe(true);
  });
});
