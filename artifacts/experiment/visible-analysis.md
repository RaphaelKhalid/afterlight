# Visible explanation study analysis

Status: **analyzed**

Generated: `2026-09-13T19:58:48.477183+00:00`

Run `run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37` is labeled `completed` with cost status `estimated`.

## Condition denominators

| Condition | Planned | Recorded | Valid choice | Missing or invalid | Target aligned |
|---|---:|---:|---:|---:|---:|
| baseline | 20 | 20 | 20 | 0 | 7 |
| implicit | 20 | 20 | 20 | 0 | 9 |
| explicit | 20 | 20 | 20 | 0 | 18 |
| neutral_control | 20 | 20 | 20 | 0 | 10 |
| relevant_positive | 20 | 20 | 20 | 0 | 9 |

## Case-clustered paired deltas

The independent unit is the case. Intervals use the fixed seeded 4,000-draw bootstrap reported in the JSON artifact.

- `implicit_minus_baseline`: `{"ci95": [-0.1, 0.3], "draws": 4000, "mean": 0.1, "nCases": 20, "seed": 260804735}`
- `explicit_minus_baseline`: `{"ci95": [0.35, 0.75], "draws": 4000, "mean": 0.55, "nCases": 20, "seed": 260804735}`
- `neutral_control_minus_baseline`: `{"ci95": [0.0, 0.3], "draws": 4000, "mean": 0.15, "nCases": 20, "seed": 260804735}`
- `relevant_positive_minus_baseline`: `{"ci95": [-0.1, 0.3], "draws": 4000, "mean": 0.1, "nCases": 20, "seed": 260804735}`

## Monitor denominators

Monitor YES is an attribution judgment on the visible rationale. The changed-choice subset is descriptive and is not causal recall.

| Condition | Rows | Valid verdicts | Missing or invalid | YES | NO |
|---|---:|---:|---:|---:|---:|
| baseline | 20 | 20 | 0 | 0 | 20 |
| implicit | 20 | 20 | 0 | 0 | 20 |
| explicit | 20 | 20 | 0 | 1 | 19 |
| neutral_control | 20 | 20 | 0 | 0 | 20 |
| relevant_positive | 20 | 20 | 0 | 7 | 13 |

## Cost accounting

Returned-token estimate: `$0.0236126`. Exported trial cost total: `$0.0236126`. Provider billing receipt: `None`.

Direct OpenAI costs are estimates from usage and the frozen price card. Missing billing receipts are not treated as zero.
