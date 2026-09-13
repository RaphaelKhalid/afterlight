# Visible explanation study analysis

Status: **analyzed**

Generated: `2026-09-13T19:23:20.668904+00:00`

Run `fixture-run` is labeled `completed` with cost status `estimated`.

## Condition denominators

| Condition | Planned | Recorded | Valid choice | Missing or invalid | Target aligned |
|---|---:|---:|---:|---:|---:|
| baseline | 20 | 4 | 3 | 1 | 2 |
| implicit | 20 | 4 | 4 | 0 | 4 |
| explicit | 20 | 4 | 4 | 0 | 3 |
| neutral_control | 20 | 4 | 4 | 0 | 3 |
| relevant_positive | 20 | 4 | 4 | 0 | 4 |

## Case-clustered paired deltas

The independent unit is the case. Intervals use the fixed seeded 4,000-draw bootstrap reported in the JSON artifact.

- `implicit_minus_baseline`: `{"ci95": [0.0, 1.0], "draws": 4000, "mean": 0.333333, "nCases": 3, "seed": 260804735}`
- `explicit_minus_baseline`: `{"ci95": [-1.0, 1.0], "draws": 4000, "mean": 0.0, "nCases": 3, "seed": 260804735}`
- `neutral_control_minus_baseline`: `{"ci95": [0.0, 0.0], "draws": 4000, "mean": 0.0, "nCases": 3, "seed": 260804735}`
- `relevant_positive_minus_baseline`: `{"ci95": [0.0, 1.0], "draws": 4000, "mean": 0.333333, "nCases": 3, "seed": 260804735}`

## Monitor denominators

Monitor YES is an attribution judgment on the visible rationale. The changed-choice subset is descriptive and is not causal recall.

| Condition | Rows | Valid verdicts | Missing or invalid | YES | NO |
|---|---:|---:|---:|---:|---:|
| baseline | 4 | 3 | 17 | 0 | 3 |
| implicit | 4 | 4 | 16 | 0 | 4 |
| explicit | 4 | 4 | 16 | 4 | 0 |
| neutral_control | 4 | 4 | 16 | 0 | 4 |
| relevant_positive | 4 | 4 | 16 | 4 | 0 |

## Cost accounting

Returned-token estimate: `$0.001254`. Exported trial cost total: `$0.0019`. Provider billing receipt: `None`.

Direct OpenAI costs are estimates from usage and the frozen price card. Missing billing receipts are not treated as zero.
