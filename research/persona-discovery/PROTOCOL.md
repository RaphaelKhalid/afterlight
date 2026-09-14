# Unsupervised persona discovery

Status: discovery protocol frozen before GPU execution. Confirmation protocol remains conditional on the discovery results. This is an extension experiment, not an exact replication or a claim of a previously unknown persona.

Question: Can label-free selection from a pretrained SAE identify a behavioral direction that generalizes across contexts and is harder to recover with prompt-based persona extraction?

H1: At least one discovered feature causes a reproducible, behaviorally coherent effect across held-out scenarios relative to normal generation and matched random steering.

H2: For that candidate, SAE steering produces a larger useful trait effect than both a strong direct-prompt baseline and a prompt-extracted persona vector at comparable response quality. Failure of a handful of prompts does not prove that a trait is unpromptable.

## Discovery, now executable on Kaggle

Reuse Qwen2.5-7B-Instruct and the authors' published layer-19 BatchTopK SAE (131,072 features, k=64). Freeze model, SAE and dataset revisions in discovery-contract.json. Do not train a new SAE. Its training mixture includes chat, pretraining and some emergent-misalignment data; discovery is therefore relative to this dictionary and sampling procedure, not free of all human influence.

Sample 1,024 unique first-user messages from a seeded, shuffled stream of UltraChat train_sft. Use neutral assistant instructions. No trait labels, persona vectors, behavior descriptions or judge scores enter feature selection. UltraChat is synthetic and is not a representative deployment sample. These contexts may reveal topics or writing styles rather than persona tendencies.

Generate up to 192 tokens per interaction. At layer 19, sample every fourth assistant-token activation, excluding positions within the first eight tokens of the sequence. Apply the checkpoint's learned threshold, matching the author's BatchTopK inference equation. Store prompt-level feature means, raw responses, token positions, coverage, reconstruction diagnostics and sample provenance. Exclude activation outliers above ten times each response's median norm and report their count. This response-local filter is an explicit adaptation of the training batch filter.

Among features active in 5% to 80% of interactions, rank by variance divided by squared mean (epsilon 1e-8). Greedily select at most 32, rejecting decoder directions with absolute cosine similarity above 0.8 to a previously selected direction. This is label-free statistical screening, not a claim that high variance implies a persona. Publish all feature statistics and selection decisions. Stop and report if no feature is eligible.

For each selected feature, generate positive and negative additive-steering responses on 12 disjoint development prompts, plus shared unsteered responses. The direction has unit norm and the intervention magnitude is 10% of the median unsteered residual norm from discovery. This single magnitude is an initial causal screen, not the final optimized treatment. Save every output, including incoherent behavior. Sampling seeds and generation configuration are recorded.

FP16 model and SAE inference on two T4 GPUs conserves memory. Record actual devices, versions, checkpoint hashes, mean active features and reconstruction error. Numerical precision is an explicit deviation from FP32 SAE weights. Stop on non-finite activations, invalid checkpoint shape, missing GPU, or insufficient GPU count. An incomplete resource-limited phase remains incomplete; it is never presented as the full experiment.

The job has a 6,600-second internal limit, checkpoints after every batch, and a 7,200-second Kaggle execution timeout. It makes no paid API calls and contains no provider credentials. Data downloads use temporary storage; only reproducible outputs are retained.

## Development and confirmation

After discovery, inspect activating examples and causal contrasts. Reject purely topical, lexical, formatting, refusal-only, or incoherence effects as evidence of a general persona. Record every rejection. Select at most three behavioral candidates. If none qualifies, that is an informative negative result.

Define each candidate in observable behavioral terms, with counterexamples. Use separate development contexts to choose steering strength, optimize direct prompts across multiple paraphrases, and implement the original paper's contrastive generation, scoring/filtering and response-activation averaging for its vector baseline. Apply the same model/layer and preserve each method's tuning budget. Freeze candidate definitions, prompts, vectors, strengths, scoring rubrics, quality criteria and all exclusions before generating confirmation outputs.

The planned confirmation maximum is 600 independent scenarios per candidate, six conditions and two sampling repeats: at most 21,600 responses. Six arms are unsteered, positive SAE, negative SAE, optimized direct prompt, prompt-extracted vector, and norm-matched random directions. Spread random-control seeds across at least 20 directions. Use genuinely distinct scenario families; paraphrases and repeats are not independent samples. Split development and confirmation by scenario family and include domains absent from development. Scenario construction, allocation and power simulation must be frozen before confirmation; 600 is a proposed allocation, not an asserted power guarantee.

Primary comparisons are paired scenario-level trait-expression differences, averaged over repeats. Estimate uncertainty by resampling scenarios (or source families when clustered), and adjust the preregistered candidate/comparison family for multiplicity. Report effect sizes and confidence intervals. A proposed practically meaningful advantage is 15 percentage points, to be fixed with the outcome definition before confirmation. Quality, repetition, response length and task completion are reported alongside trait expression; off-task or incoherent outputs do not count as useful successes. Use blinded grading with frozen rubrics, a second-judge audit and a separately reported human-reviewed subset. No confirmatory p-values are computed over selected development examples.

OpenAI can help draft materials or judge outputs later under a separately logged budget. Its API is not used for hidden activations or SAE interventions. A judge is not ground truth. No API spending is included in the current GPU job.

## Product flow and evidence

Afterlight question: https://afterlight-research.vercel.app/#/questions/q-unsupervised-persona

AutoLabs research: https://autolabs-ebon.vercel.app/research?view=%2Fquestions%2Fq-unsupervised-persona

AutoLabs study: https://autolabs-ebon.vercel.app/experiments/persona-discovery

Kaggle notebook: https://www.kaggle.com/code/raphaelkhalid0/unsupervisedsaes

The question is non-executable in Afterlight's existing API evaluator. Design in Auto Labs preserves its identity and source. The dedicated study page reports synchronized Kaggle status and must not imply a live telemetry connection when only a status snapshot is available. Completing discovery does not complete confirmation.

Sources: Persona Vectors v3, https://arxiv.org/abs/2507.21509v3; Appendix M and Section 8. Related work: RISE, https://arxiv.org/abs/2512.23988v1. SAE: https://huggingface.co/andyrdt/saes-qwen2.5-7b-instruct. Inference reference: https://github.com/andyrdt/dictionary_learning/blob/andyrdt/qwen/dictionary_learning/trainers/batch_top_k.py. Novelty remains unestablished by a systematic search.
