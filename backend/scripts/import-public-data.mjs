import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appDir = path.resolve(backendDir, "..");
const publicDir = path.join(appDir, "public", "data");
const args = process.argv.slice(2);
const databaseIndex = args.indexOf("--database");
const database = databaseIndex >= 0 && args[databaseIndex + 1] ? args[databaseIndex + 1] : "afterlight-research";
const remote = args.includes("--remote");

function sqlString(value) { return `'${String(value ?? "").replaceAll("'", "''")}'`; }
function jsonValue(value) { return JSON.stringify(value ?? null); }
const corpusPath = path.join(publicDir, "corpus.json");
const demoPath = path.join(publicDir, "demo-run.json");
let corpus;
try { corpus = JSON.parse(await fs.readFile(corpusPath, "utf8")); }
catch { console.error(`Missing ${corpusPath}. Create the public corpus before importing.`); process.exit(1); }
let demo = null;
try { demo = JSON.parse(await fs.readFile(demoPath, "utf8")); } catch { /* optional until a run is complete */ }
const statements = [];
const now = new Date().toISOString();
for (const paper of Array.isArray(corpus.papers) ? corpus.papers : []) {
  statements.push(`INSERT INTO papers (id,title,authors_json,published,updated,url,version,source_type,abstract,topics_json,verification_status,featured,created_at) VALUES (${sqlString(paper.id)},${sqlString(paper.title)},${sqlString(jsonValue(paper.authors))},${sqlString(paper.published)},${sqlString(paper.updated)},${sqlString(paper.url)},${sqlString(paper.version)},${sqlString(paper.sourceType || "paper")},${sqlString(paper.abstract)},${sqlString(jsonValue(paper.topics))},${sqlString(paper.verificationStatus || "unverified")},${paper.featured ? 1 : 0},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,authors_json=excluded.authors_json,published=excluded.published,updated=excluded.updated,url=excluded.url,version=excluded.version,source_type=excluded.source_type,abstract=excluded.abstract,topics_json=excluded.topics_json,verification_status=excluded.verification_status,featured=excluded.featured;`);
}
for (const question of Array.isArray(corpus.questions) ? corpus.questions : []) {
  statements.push(`INSERT INTO questions (id,title,area,status,origin,summary,why_it_matters,source_json,closest_work_json,uncertainty,search_json,executable,estimated_cost_usd,estimated_minutes,access,position_json,created_at) VALUES (${sqlString(question.id)},${sqlString(question.title)},${sqlString(question.area)},${sqlString(question.status)},${sqlString(question.origin)},${sqlString(question.summary)},${sqlString(question.whyItMatters)},${sqlString(jsonValue(question.source))},${sqlString(jsonValue(question.closestWork))},${sqlString(question.uncertainty)},${sqlString(jsonValue(question.search))},${question.executable ? 1 : 0},${question.estimatedCostUsd ?? "NULL"},${question.estimatedMinutes ?? "NULL"},${sqlString(question.access)},${sqlString(jsonValue(question.position))},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,area=excluded.area,status=excluded.status,origin=excluded.origin,summary=excluded.summary,why_it_matters=excluded.why_it_matters,source_json=excluded.source_json,closest_work_json=excluded.closest_work_json,uncertainty=excluded.uncertainty,search_json=excluded.search_json,executable=excluded.executable,estimated_cost_usd=excluded.estimated_cost_usd,estimated_minutes=excluded.estimated_minutes,access=excluded.access,position_json=excluded.position_json;`);
}
for (const edge of Array.isArray(corpus.edges) ? corpus.edges : []) {
  statements.push(`INSERT INTO edges (id,source_id,target_id,type,explanation,evidence_url) VALUES (${sqlString(edge.id)},${sqlString(edge.source)},${sqlString(edge.target)},${sqlString(edge.type)},${sqlString(edge.explanation)},${sqlString(edge.evidenceUrl)}) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,target_id=excluded.target_id,type=excluded.type,explanation=excluded.explanation,evidence_url=excluded.evidence_url;`);
}
if (demo?.run?.id) console.log(`Demo artifact found for ${demo.run.id}; import its reviewed SQL after checking the artifact.`);
const output = path.join(backendDir, "work", "public-data-import.sql");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${statements.join("\n")}\n`, "utf8");
console.log(`Wrote ${statements.length} public data statements to ${output}`);
if (args.includes("--apply")) {
  const result = spawnSync("npx", ["wrangler", "d1", "execute", database, ...(remote ? ["--remote"] : ["--local"]), "--file", output], { stdio: "inherit", shell: true });
  process.exit(result.status ?? 1);
}
