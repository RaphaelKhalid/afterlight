# Persona discovery phase report

Date: 2026-09-14 to 2026-09-15 UTC  
Study: `persona-discovery-v1`  
Contract hash: `71a3221c7f5e077b1af061635aaf4972aac320a6d04c46d97b839e4e9d070b43`

## Terminal state

The Kaggle version-1 job completed its registered discovery-and-development-screen phase on two Tesla T4 GPUs. It did not run a confirmation study and made no paid model API calls.

- Discovery responses: **1,024 / 1,024** unique cases.
- Development screen: **780 / 780** responses: 12 shared baselines plus positive and negative steering for 32 selected features across 12 prompts.
- Selected features: **32**. Selection used the frozen occurrence, coefficient-of-variation and decoder-cosine rules without trait labels.
- Empty responses: **0** in discovery and screening.
- Response truncation: 889/1,024 discovery responses and 660/780 screen responses reached the registered generation limit; this is retained as a quality field and is not silently discarded.
- Activation outliers excluded: **0**.
- Mean active SAE features per discovery case: **64.46**.
- Mean relative squared reconstruction error: **0.1325**.
- Mean sampled activation positions per discovery case: **45.15**.
- Recorded elapsed time: **6,527.62 seconds**.
- API spend: **$0**.

The downloaded output bundle contains 46 hashed artifacts; all hashes matched the emitted `artifact-hashes.json` manifest and no expected artifact was missing. The recorded environment was Python 3.12.13, PyTorch 2.10.0+cu128, Transformers 4.56.2, and two 15,636,037,632-byte Tesla T4 devices.

## What this shows

The pipeline completed its label-free feature selection and causal development screen under the registered contract. The selected feature IDs and all screening responses are reproducible outputs. The screen can now be inspected for behaviorally coherent effects.

This is **not** evidence that a new persona was discovered. No behavioral labels, candidate rubrics, prompt baselines, prompt-extracted persona vectors, quality exclusions, or confirmation comparisons have been frozen. Feature selection scores are statistical screening signals, not persona measures. High truncation rates also limit interpretation of the visible responses.

## Next gated step

Inspect activating examples and positive/negative contrasts. Reject topical, lexical, formatting, refusal-only and incoherence effects. Define observable candidate behaviors and counterexamples. On development-only data, tune fair direct-prompt and prompt-extracted-vector baselines and choose the quality rubric. Freeze candidates, prompts, vectors, steering strengths, exclusions, scenario families, multiplicity handling and a power analysis before any confirmation generation. If no feature survives, record that negative result and do not launch confirmation.

The full confirmation maximum remains 3 candidates × 600 scenarios × 6 conditions × 2 repeats = 21,600 responses. It has not started.
