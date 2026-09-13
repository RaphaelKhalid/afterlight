# Reproduction package map

The completed visible-explanation study is the primary delivery. Earlier calibration and interrupted endpoint studies remain available for provenance and are not pooled with it.

| Material | Location |
|---|---|
| Frozen contract, task cases, caps, models, prompts and analysis definition | `artifacts/experiment/visible-contract-v1.json` |
| Contract identity and hash | `artifacts/experiment/visible-contract-v1-manifest.json` |
| Exact executable adapter bytes | `artifacts/experiment/visible-adapter-v1.ts` |
| Bootstrap implementation and recorded seed | `research/analyze_visible.py`, `artifacts/experiment/visible-analysis-plan-v1.json` |
| Final raw subject and monitor responses | `artifacts/experiment/visible-trials.json` |
| Public evidence export, including contract and stage provenance | `artifacts/runs/run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37.json` |
| Actual run state | `artifacts/experiment/visible-run.json` |
| Condition, monitor, cost and uncertainty calculations | `artifacts/experiment/visible-analysis.json` |
| Independent AI review and representative VPN example | `artifacts/experiment/visible-scientific-review.json` |
| Environment and frozen-file checksums | `artifacts/environment.json` |
| Network-free analysis and opt-in paid rerun instructions | `docs/reproduction.md` |
| Development choices and failed endpoints | `artifacts/experiment/README.md` |
| Executed checks | `artifacts/evaluation/summary.json` |

`visible-run.json` and `visible-execution-export.json` preserve the completed execution before its later human-readable result summary was attached. The commit-pinned GitHub export includes that derived summary. Trial observations and primary statistics are identical. The publication digest excludes the later publication URL itself to remain stable.

The frozen contract names a seeded bootstrap without literalizing its seed. The separate analysis plan records the literal seed and analyzer hash after launch but before outcome inspection; both timestamps remain available. Do not describe that separate file as frozen before run launch.

Default reproduction makes no provider requests. A new paid run requires an explicit execution flag, a fresh output directory and a cap. It is a stochastic replication, not a promise of identical outputs. No API keys, private bot chat identifiers, local authentication state, or private original error files are included in the reproduction package.
