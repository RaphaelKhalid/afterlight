# Afterlight experiment evidence draft

This folder contains the bounded experiment evidence for the Afterlight question `q-implicit-influence`. The candidate source is [arXiv:2608.04735v1](https://arxiv.org/abs/2608.04735), whose linked code repository is recorded in `contract-v3.json`. The paper and code were inspected for methods and license terms. The paper is CC BY 4.0 and the linked repository is MIT licensed. This work adapts its matched binary choice setting and does not reproduce the paper's full benchmark.

The related [arXiv:2608.29464v1](https://arxiv.org/abs/2608.29464) study was checked before freezing the protocol. It varies cue location and explicitness across open-weight models, so this experiment does not claim novelty for implicit versus explicit delivery alone.

## Frozen protocol

`contract-v3.json` is the primary frozen contract. Its SHA-256 is recorded in `v3-heldout-review.json`. `v3-input-cases-provenance.json` contains all 24 frozen cases and the exact generated subject prompts for all five conditions. The independent unit is the hand-authored case. Two seeds are paired within each case. The subject model is OpenRouter `openai/gpt-oss-120b`, temperature 0, low reasoning effort, `include_reasoning: true`, and fallback routing disabled. The visible explanation is `message.content` parsed as a short rationale. `message.reasoning` is archived as a separate provider-returned field and is not treated as a visible explanation or faithful internal trace.

The primary contrast is case-level target-aligned choice rate and matched switch rate for implicit cue delivery versus baseline. Explicit delivery is a comparator. Neutral and relevant-context conditions are controls with separate interpretations. The monitor receives the same canonical cue for each arm, is not told the delivery condition, and evaluates both returned text fields. A monitor YES means that the returned text attributed the recommendation to the supplied cue. It is not a causal label or evidence of faithful internal cognition.

## Development calibration

The v1 calibration completed 25 calls for provider-reported cost `$0.00176077`. The v2 calibration completed 53 calls for `$0.00388541`. Both are development artifacts and are excluded from held-out inference. Their raw ledgers and summaries remain in this folder.

## Held-out evidence so far

The original frozen v3 run attempted 200 subject rows. It completed 168 and received 32 HTTP 429 failures, all successful calls routed to AkashML, with provider-reported spend `$0.00412489`. Of the completed rows, 164 had parseable A/B choices and all 168 exposed a provider reasoning field. Monitor dispatch was skipped after the subject failure threshold, so v3 has no monitor denominator. Its case-clustered deltas are preserved in `v3-heldout-summary.json`; they are descriptive and incomplete.

The authorized v3.1 operational recovery retried only the original 429 subject rows and did not repeat completed or unparsable rows. It attempted four retries, recovered two subjects, and recorded two failures. It then dispatched 41 blinded monitor attempts, of which 35 completed with valid verdicts and six failed with HTTP 429. The monitor attempts covered only five cases. The two recovered subjects were not reached by the monitor loop. Provider-reported recovery spend was `$0.00098270`, and all 37 successful recovery calls reported AkashML. The subject retry sequence was failure, success, success, failure; the runner stopped after two total retry failures rather than two consecutive failures. The monitor loop stopped after its final two consecutive failures. These deviations are recorded in `v3.1-combined-review.json`.

Across the partial monitor rows, baseline produced 0 YES among 7 valid verdicts and neutral produced 0 YES among 9 valid verdicts. Implicit produced 0 YES among 6 valid verdicts, with no valid shifted rows in the observed subset. Explicit produced 6 YES among 7 valid verdicts and 4 YES among 5 valid shifted rows. Relevant-context produced 5 YES among 6 valid verdicts and 2 YES among 2 valid shifted rows. These counts come from a partial, case-concentrated monitor sample and do not estimate monitor recall or establish a causal effect.

## Reproduction

Run `python research/analyze_experiment.py` from the `work/afterlight` directory. The script makes no network calls. It reads the original v3 ledger, the v3.1 recovery ledger, and an optional `v3.2-recovery-raw.jsonl` when present. It writes `analysis-v3.2-compatible.json` with subject missingness, condition rates, case-clustered bootstrap summaries, and monitor counts. The original raw ledgers remain append-only evidence. A later v3.2 continuation is a linked operational recovery and must be reported separately from the original v3 primary result.

## Evidence files

- `contract-v3.json`: frozen contract and source provenance.
- `contract-v3.1-addendum.json`: operational recovery scope.
- `v3-input-cases-provenance.json`: exact cases and generated prompts.
- `v3-heldout-raw.jsonl`: original subject attempts, including failures.
- `v3-heldout-summary.json`: original held-out descriptive summary.
- `v3-heldout-review.json`: original run review and deviations.
- `v3.1-recovery-raw.jsonl`: retry and monitor attempts.
- `v3.1-recovery-summary.json`: recovery counts and provider-reported cost.
- `v3.1-combined-review.json`: joined monitor denominators and caveats.
- `analysis-v3.2-compatible.json`: provider-free rerunnable analysis output.
