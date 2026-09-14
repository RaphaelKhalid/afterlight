# Execution and monitoring

The current Kaggle notebook is private to the owner. Its reproducible source and discovery contract are public in this folder. Kaggle version 1 runs the discovery and development-screen phases only. LAUNCH.json is an explicitly dated launch/verification snapshot, not a live progress file.

To reproduce, install the official Kaggle CLI, authenticate to your own account, change the notebook identity in build-notebook.mjs, then build the notebook from the Afterlight repository root:

```text
node research/persona-discovery/build-notebook.mjs
kaggle kernels push -p research/persona-discovery/kaggle --accelerator NvidiaTeslaT4 --timeout 7200
```

Pushing starts execution. Use the existing version's output for inspection; do not push a new version just to view progress. The runner requires two GPUs and records their actual names and memory. Model and SAE files download to temporary storage, while outputs remain under /kaggle/working/persona-discovery.

```text
kaggle kernels status YOUR_ACCOUNT/YOUR_NOTEBOOK
kaggle kernels logs YOUR_ACCOUNT/YOUR_NOTEBOOK --follow
kaggle kernels output YOUR_ACCOUNT/YOUR_NOTEBOOK -p YOUR_OUTPUT_DIRECTORY
```

The owner-host relay reads Kaggle's authenticated log stream, deduplicates recorded events, reconnects after dropped read connections, and sends validated progress through Afterlight's owner-only status endpoint. It does not execute the experiment or call paid model APIs. The public study polls that endpoint; timestamps make stale data visible. The GPU job continues if the owner computer sleeps, but this relay cannot update while asleep.

Start relay-kaggle.py with --env-file pointing to the owner's ignored environment file, --output pointing to a private/local log directory, and --seconds giving a bounded observation period. Keep all credentials outside this repository and notebook. The server fixes public provenance links, validates counters and rejects stale events or unauthenticated writes. This relay currently follows the latest session of this notebook; do not launch an overlapping replacement version under the same notebook identity.

On completion, verify contractHash, actual response counts, finite activation diagnostics, all feature statistics, selection decisions, and the artifact hashes. Preserve failed or incomplete phase records. The full confirmation experiment is still pending candidate interpretation, development-only baseline tuning, frozen rubrics and an independently sized confirmation protocol, as described in PROTOCOL.md.
