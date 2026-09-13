# Afterlight: system and reliability brief

Afterlight is an agent-powered lab for reproducible AI safety research. It connects a scoped research question to a frozen, budgeted experiment, inspectable observations, and evidence returned to a research atlas.

The deployed React application runs on Vercel. A Cloudflare Worker, one Workflow coordinator, and D1 persist contracts, trial records, provider responses, budget reservations, and participation. Public visitors can inspect the completed study; paid execution requires owner authorization. The reviewed experiment template fixes the cases, model, measurement, and cap. Ambiguous paid outcomes pause for reconciliation.

The multi-app path is real: Exa returned related-work sources; Telegram delivered an invitation and recorded the owner's button action; GitHub published the completed raw evidence and deduplicated an identical repeat. Discord also verified a real /afterlight command. The Telegram attempt was linked to the completed study by the operator.

The actual study completed 100 trials across 20 paired cases and five conditions, with 200 distinct provider responses. The primary contextual-cue result was inconclusive: +10 percentage points, 95% case-bootstrap interval -10 to +30. Direct requests produced a prespecified secondary +55 points, interval +35 to +75. The study observes one-sentence final rationales, not hidden computation. Main-run cost is estimated at $0.0236126.

All 30 backend tests passed, including 17 integration tests. Five concise human-reviewed reference judgments and four synthetic monitor controls passed. Production checks exercised authorization, budget stopping, scope guards, publication deduplication, and recovery from persisted responses without duplicate generations. Desktop and mobile review passed. Frozen inputs, raw outputs, source code, an offline analyzer, and the complete development record are public. These scoped checks do not establish general scientific accuracy.

[Application](https://afterlight-research.vercel.app) · [Repository and evidence](https://github.com/RaphaelKhalid/afterlight) · [Full reliability record](https://github.com/RaphaelKhalid/afterlight/blob/main/docs/system-reliability-brief.md)
