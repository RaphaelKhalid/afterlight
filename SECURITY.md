# Security and deployment boundary

Afterlight keeps provider credentials and owner controls on the server. The
browser receives public questions, completed evidence, and read-only run state.
It never receives provider keys, owner tokens, bot tokens, publication tokens,
or private authentication state.

The names in `.env.example` are placeholders only. Put real values in an
ignored local `.env.local`, Cloudflare Worker secrets, or the deployment
platform's secret store. Never commit `.env.local`, `.dev.vars`, a copied
`local-access.json`, or generated `work/` output. Vite variables prefixed with
`VITE_` are bundled for the browser, so secrets must not use that prefix.

Public routes and the static fallback are read-only. Starting, controlling,
searching, and publishing require server-side owner authorization. A Telegram
or Discord participant can record participation, but cannot spend owner
credits. The reviewed scientific adapter does not execute arbitrary uploaded
code.

If a credential is pasted into a prompt, shell history, issue, log, browser
storage, or public artifact, revoke or rotate it before opening a private report.
Do not include the credential in that report.

