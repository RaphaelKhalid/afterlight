# Visible study reproduction

This guide covers the frozen direct OpenAI visible-explanation adapter. It is separate from the deployed run export and from the earlier OpenRouter observations. The adapter is [visible-adapter-v1.ts](../artifacts/experiment/visible-adapter-v1.ts), and its bytes are checked against `adapterSha256` in [visible-contract-v1.json](../artifacts/experiment/visible-contract-v1.json).

## Offline analysis

The analyzer makes no network calls and does not require Node packages or provider credentials. From the repository root, run:

```sh
python research/analyze_visible.py
```

The default command reads `artifacts/experiment/visible-run.json` and `artifacts/experiment/visible-trials.json`, then writes `artifacts/experiment/visible-analysis.json` and `artifacts/experiment/visible-analysis.md`. If the exports are absent, it writes an `awaiting_input` report with no metrics. If the exports fail strict validation, it writes `input_error` and exits nonzero.

Strict validation checks the canonical contract hash against `visible-contract-v1-manifest.json`, the run contract ID and hash, unknown cases and conditions, duplicate `(case, condition)` rows, and the planned trial count. A synthetic parser fixture requires both `--synthetic` and explicit `synthetic: true` markers in its two input files. A hash mismatch cannot be silently mixed into production evidence.

After a reproduction stored under `work/reproductions/<run-directory>`, analyze it explicitly:

```sh
python research/analyze_visible.py --run work/reproductions/<run-directory>/visible-run.json --trials work/reproductions/<run-directory>/visible-trials.json --output-json work/reproductions/<run-directory>/visible-analysis.json --output-md work/reproductions/<run-directory>/visible-analysis.md
```

The report uses 20 independent cases, not trial-level confidence intervals. It computes target-aligned rates and paired condition-minus-baseline differences with the frozen 4,000-draw case bootstrap and seed recorded in [visible-analysis-plan-v1.json](../artifacts/experiment/visible-analysis-plan-v1.json). Monitor YES rates include missing and invalid denominators. The changed-choice subset is labeled descriptive attribution and is not causal recall.

## Node 24 protocol check

The local reproduction command defaults to a no-network plan. It verifies the frozen contract and adapter hashes, prints the case and trial counts, and does not read a provider key:

```sh
node --version
node research/reproduce-visible.mjs
```

Use Node 24 or newer. The expected plan names contract `visible-explanation-v1`, 20 cases, 100 subject trials, at most 200 provider stages, the direct OpenAI route, and estimated cost status. The command must report `networkCalls: false` in this mode.

The frontend and backend build checks are separate from the research adapter:

```sh
npm ci
npm run build
cd backend
npm ci
npm run check
npm run test:integration
npx vitest run
```

## Explicitly authorized paid execution

Paid execution is opt-in and must be started only after the owner has approved the frozen `$2` cap. It requires the server-side `OPENAI_API_KEY` in an ignored `.env.local`; never paste or print the key. The command creates a new directory under `work/reproductions`, writes the contract, environment, trial ledger, scientific-call journal, and run ledger, and pauses on an ambiguous provider outcome:

```sh
node --env-file=.env.local research/reproduce-visible.mjs --execute --cap=2
```

The command has no automatic retry or resume path for unresolved paid stages. Preserve the generated directory as evidence. Do not overwrite the deployed `visible-run.json` or `visible-trials.json` exports with local reproduction output. The local output cost is token-based and marked estimated; it is not a provider billing receipt.

The deployed production run uses the owner-authenticated API instead of this local command. The API request must use the exact contract ID and manifest hash and a cap no greater than `$2`:

```sh
node --input-type=module -e "const base=process.env.AFTERLIGHT_API_BASE; const token=process.env.AFTERLIGHT_OWNER_TOKEN; const body={questionId:'q-implicit-influence',contractId:'visible-explanation-v1',contractHash:'2768dcca1f11b86debc641429e9d1befb6c7d503903b98155c001b28d82020f5',capUsd:2}; const response=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)}); console.log(await response.text()); if(!response.ok) process.exitCode=1"
```

Set `AFTERLIGHT_API_BASE` and `AFTERLIGHT_OWNER_TOKEN` in the private environment before using that request. The token must not appear in shell history or logs. The API run and the local reproduction are separate evidence packages.

## Evidence and completion

Freeze the analysis plan before reading the main outcome. Keep the plan hash, contract hash, adapter hash, run ID, raw trial export, scientific-call journal, and analysis output together. A completed status does not remove failed, ambiguous, missing, or invalid rows from the report. A null estimate does not establish equivalence. The direct OpenAI study observes only the final visible rationale and does not expose internal reasoning content.


## Sharing a reproduction bundle

When copying evidence for review, include the frozen contract, manifest, adapter,
analysis plan and output, run and trial exports, environment record, analyzer,
and this guide. Exclude `.env.local`, `.dev.vars`, `local-access.json`,
private error files, and any generated `work/` directory. The default checks
make no provider calls and never read a provider key. Review copied files for
private identifiers and credential-shaped values before publishing them.
