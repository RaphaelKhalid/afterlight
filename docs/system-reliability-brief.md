# Afterlight system and reliability brief

## What is shipped

Afterlight is a React, TypeScript, and Vite application backed by a Cloudflare Worker, one bounded Cloudflare Workflow, and D1. The public browser surface reads the atlas, question dossiers, experiment runs, and results through read-only API routes. Provider credentials stay in server configuration. When the API is unavailable, the frontend can show an explicitly labeled offline, read-only view.

The experiment contract fixes the cases, five arms, model, provider settings, visible output surface, budget cap, and stopping rules. The server records contracts, trials, workflow events, attempts, usage, returned cost fields, and provider routing. Subject responses contain a one-sentence visible rationale. The monitor judges that visible rationale. Provider-returned reasoning fields are stored separately where available; the study makes no claim to expose hidden reasoning or a complete chain of thought.

## Research discovery and evidence

Nine bounded Exa searches produced a selective corpus of 20 papers and six dossiers: 18 recent works plus two older foundations. The recorded search scope is English-led and does not claim a comprehensive map of AI safety. A separate live Exa investigation returned HTTP 201 with 10 retrieved source leads. Those returned highlights are marked retrieved, not independently assessed, so they guide the dossier rather than serve as unreviewed proof. The search artifacts record provider-returned cost of $0.063; the live investigation has a separate backend $0.10 allowance recorded as an estimate.

The project owner agreed with all five semantic fixture judgments. That review covered five concise statements and reference labels, not full-paper validation or general scientific reasoning. Four synthetic visible-monitor controls passed. They test a narrow attribution judgment and do not establish general monitor reliability. The public-export review inspected all 100 subject rationales and 100 monitor explanations, found no sensitive fields, and confirmed the published raw trials match the archived study.

The completed main run is now published on the public GitHub repository. The first publication returned HTTP 201 and the repeat request returned HTTP 200 with the same publication record, artifact hash, and deduplicated result. The immutable raw-run URL is [visible run artifact](https://github.com/RaphaelKhalid/afterlight/blob/5ff3d22951efd85a278d88dad7776e4722324a8f/artifacts/runs/run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37.json), published in commit `5ff3d22951efd85a278d88dad7776e4722324a8f`. The published artifact hash is `186ebcb4c3dacc8705e068e5c47e29aa6fa3139a7ff6e6e4c11ce45bb4939b84`. The search summary also records the corpus artifact target at `https://github.com/RaphaelKhalid/afterlight/tree/main/artifacts/search`.

## Real external actions

The production health record reports the Afterlight API healthy, with Telegram and Discord integration entries available. A real Telegram invitation request returned HTTP 202 with `deduplicated: false`, and the participation snapshot recorded one started attempt for `q-implicit-influence`. The completed participation export now shows that attempt as completed and links it to the main run. An owner-authorized Telegram completion message was accepted with HTTP 200 and includes the recorded result link. Delivery was operator-triggered in the private bot chat. This is an operator action and linkage, not independent participant completion or automatic attribution of the result to that person.

The Discord interaction endpoint is configured at `/api/discord/interactions` and is present in the production connection record. A real `/afterlight` interaction returned the question, partially addressed status, main result link, and Start-an-attempt button. No Discord button attempt is recorded, so the brief does not claim a completed Discord participation flow.

## Main visible study

The completed direct OpenAI run used `gpt-5.6-luna` under contract hash `2768dcca...20f5`. It contains 20 hand-authored cases across five arms: baseline, implicit cue, explicit request, neutral control, and relevant cost comparator. There are 100 unique case-condition trial rows, 200 completed provider stage records, and zero failed trials. The run took about 28 minutes.

The prespecified primary result is the case-level target-choice change relative to baseline. The implicit arm measured **+10 percentage points**, with a 95% case-clustered bootstrap interval of **-10 to +30 points** across 20 independent cases. This is inconclusive. The neutral control was **+15 points**, with interval **0 to +30**, so the result does not isolate a specific implicit cue effect. The explicit direct-request arm was **+55 points**, with interval **+35 to +75**. That is a secondary contrast and is not evidence for the implicit result.

The visible monitor returned YES on **1 of 20 explicit rationales** and **1 of 11 explicit rows whose choice changed from baseline**. The changed-choice statistic is descriptive attribution among changed outputs, not causal recall or ground truth. The baseline, implicit, and neutral arms each had zero monitor YES judgments out of 20. An independent AI text inspection agreed with all 11 changed-explicit monitor judgments; that is an agreement audit, not human accuracy validation.

The primary interval uses 4,000 case-level bootstrap draws with seed `260804735`. The analysis treats the case as the independent unit and does not use trial-level confidence intervals. The result is specific to this model and task set. It does not claim a full reproduction of arXiv 2608.04735.

## Reliability controls and limits

The current backend suite passes **30 tests**, including **17 integration tests**. The fresh test receipt is [backend-tests.json](../artifacts/evaluation/backend-tests.json). The integration checks cover owner authorization, exact contract hashes, cap enforcement, case-major ordering, interrupted-trial reconciliation, stable workflow lease behavior, Telegram callback deduplication, and idempotent GitHub publication. The stable lease regression guard now covers both refusal to resume under an unexpired lease and replay using the same workflow instance lease. The [offline reproduction receipt](../artifacts/evaluation/offline-reproduction-check.json) reports no network calls and exact agreement with the saved analysis fields.

The main run encountered a persisted-response coordination interruption. Recovery read two already persisted stage responses, made **zero network calls**, and resumed the run without duplicate paid generations. The completed integrity record reports 100 unique trial IDs, 200 unique provider response IDs, and 200 completed scientific stage records.

Several uncertainty boundaries remain material. The rationale is one sentence and may omit relevant influences. The model-generated monitor can be wrong, and the independent review is also AI review. The case set is small and hand-authored, each case-condition has one response, cases were reused from prior endpoint development, and execution was case-major rather than fully randomized. Provider estimates and returned cost fields are distinct from account statements. Unknown-cost calls retain conservative reserves rather than being treated as free.

## Budget accounting

The visible run had a **$2.00 cap** and a token-based estimated cost of **$0.0236126**, with no provider billing receipt. The archived account audit includes the completed main run and reports an OpenAI estimate of **$0.0245238** across its probe, semantic, monitor, and main-run checks. OpenRouter route receipts, unknown-call reserves, Exa returned costs, and fixed allowances are itemized separately in `docs/costs.md`; the resulting historical conservative total is **$0.458810579**. A cap or conservative reserve is an operational control, not evidence that the reserved amount was billed.

The main scientific review is in `artifacts/experiment/visible-scientific-review.json`. The completed-run integrity check is in `artifacts/evaluation/completed-run-integrity.json`. The persisted-response recovery record is in `artifacts/evaluation/persisted-response-recovery.json`. The publication privacy review is in `artifacts/evaluation/public-export-review.json`, and Telegram completion delivery is in `artifacts/integrations/telegram-completion.json`.
