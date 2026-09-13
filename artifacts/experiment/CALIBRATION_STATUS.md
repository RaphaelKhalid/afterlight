# Experiment status for lead

At 11:14 PT, v2 calibration is in progress under frozen contract v2 (freeze timestamp 2026-09-13T11:12:13.9358283-07:00). The incremental ledger currently contains 32 completed provider calls, with provider returned spend $0.002977455 and zero failures. The selected endpoint is OpenRouter `openai/gpt-oss-120b`, temperature 0, low reasoning effort, include_reasoning true, max 500 subject tokens and 300 monitor tokens. Calibration records visible `message.content` plus a separate `message.reasoning` field when returned. The latter is archived and labeled provider returned reasoning, never a visible explanation.

V1 development calibration had 25 completed calls, $0.00176077 runner spend, 2 shifted trial rows, 0/2 monitor YES, and several content truncations. It is retained as development evidence and not used for held-out claims.

V2 held-out run is blocked until the four-case calibration completes and baseline stability, parseability, and controls are inspected. The v2 primary is case-clustered target-aligned choice and matched switch rates, with provider-trace monitor detection secondary. The 20 held-out cases are fresh, target-balanced, and frozen.