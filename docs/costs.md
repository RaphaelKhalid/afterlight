# Provider cost audit

Audited from raw archived call ledgers and one redacted capability receipt on September 13, 2026. Derived summaries and duplicate incremental files were excluded. The direct OpenAI visible main run is complete and included as a token-based estimate; it has no provider billing receipt.

## Account totals

| Account or service | Returned cost | Token or budget estimate | Unknown-call reserve | Conservative total |
|---|---:|---:|---:|---:|
| OpenRouter account | $0.011286779 | $0 | $0.260000 | $0.271286779 |
| OpenAI | $0 | $0.024523800 | $0 | $0.024523800 |
| Exa | $0.063000 | $0.100000 | $0 | $0.163000 |
| **Total** | **$0.074286779** | **$0.124523800** | **$0.260000** | **$0.458810579** |

DeepInfra is an upstream route reached through the OpenRouter API key, so its calls are included in the OpenRouter account total. The route subtotal is retained below. Returned cost means a cost field was present in an archived provider response. It is evidence of the response cost field, not an independent account statement. OpenAI values are estimates from returned token counts and the frozen price card. The live Exa investigation uses the backend fixed $0.10 allowance and is a conservative estimate, not an Exa billing receipt.

Unknown reserves use $0.005 per ordinary OpenRouter account call without a billing field and $0.01 for the one rejected call whose upstream route was DeepInfra. They are not claims that a provider billed those amounts or that a failed call cost zero.

## OpenRouter route accounting

| Upstream route grouping | Returned cost | Unknown-call reserve | Conservative subtotal |
|---|---:|---:|---:|
| Non-DeepInfra or route unspecified | $0.011213545 | $0.250000 | $0.261213545 |
| DeepInfra upstream route | $0.000073234 | $0.010000 | $0.010073234 |
| **OpenRouter account** | **$0.011286779** | **$0.260000** | **$0.271286779** |

The OpenRouter account known-cost subtotal includes two manual checks ($0.000122650), v1 calibration (25 attempts, $0.001760765), v2 calibration (53, $0.003885410), original v3 heldout (200, $0.004124890), v3.1 recovery (45, $0.000982700), v3.2 recovery (25, $0.000332220), and the archived rate-limit capability probe ($0.000004910). The v3, v3.1, and v3.2 ledgers contain 50 failed or rejected calls without billing fields, with a $0.25 reserve.

The DeepInfra route subtotal includes one capability probe ($0.000014438) and two completed stages from the interrupted live development ledger ($0.000058796). One rejected stage has no billing field and carries the $0.01 route reserve. The archived before and after snapshots describe the same stages and were counted once. The safe public receipt for the $0.00000491 probe is artifacts/budget/rate-limit-capability-receipt.json; it records HTTP 200, model openai/gpt-oss-120b, upstream route AkashML, and omits identifiers, credentials, and raw headers.

## Other sources

OpenAI includes one direct capability probe estimated at $0.000152000, one semantic fixture review request estimated at $0.000454200, four visible monitor-control calls estimated at $0.000305000, and the completed visible main run estimated at $0.023612600 from 200 returned stage token usages. The main run is included as an estimate, not a provider billing receipt.

Exa includes nine search artifacts at $0.007 each, totaling $0.063. The separate live investigation is recorded at the backend $0.10 allowance.

## Exclusions and reconciliation

Calibration, run, and recovery summaries were used only as cross-checks. Incremental JSONL copies were excluded. The visible monitor raw file was not added to the monitor estimate because it is the same four-control set. Deployed budget and authorization checks created no provider stages. Run-start records created no provider stages.

The historical development-reservations.json rollup is retained as a cross-check, not used as the authoritative source. It predates final v3.2 reconciliation, but its placement of DeepInfra in the OpenRouter rollup is correct. It includes the traced $0.00000491 probe and separately holds a $0.001 OpenAI reservation to cover token-based estimates. The audit source rows above use archived raw receipts plus the redacted capability receipt.

The visible main run is included from its completed export: run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37, 100 trial rows, 0 failed trials, estimated cost $0.023612600. Historical source rows remain unchanged. Re-run the audit if a later billing receipt becomes available.

## Project limits and remaining headroom

These are self-imposed project limits, not verified account balances. Headroom subtracts the conservative totals above, including unknown-call reserves.

| Provider | Project cap | Conservative amount accounted | Project headroom |
|---|---:|---:|---:|
| Exa | $10.00 | $0.163000 | $9.837000 |
| OpenAI | $25.00 | $0.0245238 | $24.9754762 |
| OpenRouter | $6.00 | $0.271286779 | $5.728713221 |

The completed main run's $2 reservation was released. Its accounted amount remains $0.0236126. OpenAI and Exa account balances were not independently available through these checks. Separate private account-quota checks are not treated as project-spend receipts.
