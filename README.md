# Afterlight

An agent-powered lab for reproducible AI safety research.

**Two-minute demo video:** recording pending. Add the public recording URL here after recording.

[Open Afterlight](https://afterlight-research.vercel.app) · [Research corpus and search provenance](artifacts/sources/corpus.json)

Explore a selected research neighborhood, inspect a sourced question, review a frozen experiment, and follow its observations into reproducible evidence.

## Build status

Active implementation on September 13, 2026. The first deployed corpus contains 20 papers and six scoped dossiers. The independent demonstration evaluation is being calibrated; development observations are not presented as a completed scientific finding.

## Meaningful external actions

- **Exa:** nine actual, bounded literature searches with returned sources, timestamps, request hashes, and provider-reported search costs in [search artifacts](artifacts/search).
- **Telegram:** an authorized private invitation and a persisted Start an attempt action, served by a verified webhook.
- **Discord:** the same participation path through a personal Discord app, with signed interactions and no server requirement.
- **GitHub:** public code and evidence, plus an owner-authorized publication action for completed run exports.

A participation action does not authorize spending. Public visitors can inspect evidence; the owner must explicitly authorize each experiment's frozen contract and cap.

## Architecture

React, Vite, Motion, and custom SVGs provide the atlas and laboratory. A Cloudflare Worker serves the API, one Cloudflare Workflow coordinates bounded execution, and D1 stores contracts, trials, events, attempts, and budget reservations. Vercel serves the frontend and forwards API requests to the Worker.

## Development

Requirements: Node.js 24, Python 3.12 or newer, and authenticated deployment accounts for publishing.

```sh
npm ci
npm run dev
```

The public corpus is available without credentials. For the backend, install dependencies in `backend`, apply its D1 migrations, and configure the server secrets described in the environment example. Never put provider keys in frontend variables.

```sh
cd backend
npm ci
npm run check
npm run test:integration
```

The Python experiment runners use the standard library. Versioned development artifacts record calibration decisions, failed outputs, and provider-returned usage. Final evaluation and reproduction instructions will be added with the completed run.

## Scientific scope

The main candidate is a bounded adaptation of Setting 1 in [Chain-of-Thought Monitoring Can Be Unreliable in Implicit-Influence Settings](https://arxiv.org/abs/2608.04735v1), not a reproduction of the full paper. Returned explanations and provider-returned reasoning are distinct observation surfaces. Neither is claimed to reveal all internal computation.

The [research protocol](docs/research-protocol.md) separates source support, scoped interpretation, proposal, and observed result. A selected corpus cannot establish that a question is globally open. Small, hand-authored task sets do not establish transfer to frontier systems.

## Attribution

Original application code is MIT licensed. The user supplied the fireworks photograph for this project; the code license does not grant separate rights to that photograph. Linked papers and repositories retain their own licenses. Corpus summaries are authored for Afterlight, and short source passages retain attribution to their original works.
