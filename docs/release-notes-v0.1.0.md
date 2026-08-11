# v0.1.0 Developer Preview Release Notes

AI Agent Quota Dashboard v0.1.0 is a source-only developer preview for technically comfortable early testers. It is meant for local real-data dogfooding of Codex and Claude Code quota signals before packaged installers and signed desktop releases exist.

## Distribution

This preview is source-only:

```bash
git clone https://github.com/isToniLiu/ai-agent-quota-dashboard.git
cd ai-agent-quota-dashboard
npm install
npm test
npm run trial:preflight
npm run desktop:local
```

On Windows PowerShell, if `npm` is blocked by the local execution policy, use `npm.cmd` for the same commands.

There is no installer, app-managed auto-start, signed binary, or packaged Electron build in this preview. Those are v0.2-or-later work items.

The startup plan is explicit: v0.2 should offer `Start AIQD when I sign in` in the installer and `Launch at startup` in Settings, with startup off by default for the first packaged release.

## Highlights

- Local Node.js dashboard bound to `127.0.0.1`
- SQLite storage for normalized quota snapshots, reset events, and refresh history
- Codex quota detection from supported local CLI `rate_limits` events
- Manual Codex visible-status fallback when automatic local data is unavailable
- Claude Code official statusline `rate_limits` ingestion through an opt-in local sink
- Dashboard, Doctor, Settings, reset timeline, refresh history, and JSON/CSV export
- Electron desktop shell with tray mini panel, always-on-top widget, and AIQD-only shortcuts
- Strict real-data readiness shared by CLI, Settings, tray, and mini surfaces
- Chinese/English language switching for the main dashboard and mini surfaces
- Source confidence, freshness, and reported-reset labels
- Privacy-safe public dashboard APIs and export output

## Real-data Trial

Run:

```bash
npm run trial:preflight
npm run trial:ready
```

`trial:preflight` gives the shortest next action for Codex, Claude Code, or blocking Doctor issues. `trial:ready` requires fresh non-demo quota data for every configured agent.

Codex support is automatic when supported local `rate_limits` events are available. Otherwise, use the Settings fallback form or:

```bash
node dist/index.js codex snapshot --remaining-percent 72 --reset-at 2026-08-16T03:00:00Z
```

Claude Code support requires installing the managed statusline sink:

```bash
npm run claude:self-test
npm run build
node dist/index.js setup claude-statusline
node dist/index.js setup claude-statusline --write
```

Then open Claude Code once so the statusline renders and sends supported `rate_limits` fields.

## Verification Before Tagging

The current release gate is:

```bash
npm test
npm run desktop:smoke
npm run desktop:first-run-smoke
npm run trial:preflight
npm run trial:ready
git diff --check
```

CI runs tests on Windows and Ubuntu with Node 24.

## Known Limits

- Source-only preview; no installer or signed desktop release yet
- No system notification support yet
- No packaged build, app-managed launch-at-login setting, or update channel yet
- Claude Code may report setup warnings until it renders a fresh statusline payload
- Historical trends and reset rhythm statistics are planned for v0.2
- Additional providers are intentionally deferred until Codex and Claude Code are trustworthy

## Privacy Boundary

AIQD does not read browser cookies, collect passwords, simulate login, call hidden APIs, bypass rate limits, switch accounts, or upload prompts, responses, source code, chat content, credentials, or raw local logs.

Exports and public dashboard APIs exclude account identifiers and raw local source references. If reliable quota data is unavailable, the app should show `unavailable` or an explicitly labeled manual fallback.
