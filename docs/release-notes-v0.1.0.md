# v0.1.0 Desktop Preview Release Notes

AI Agent Quota Dashboard v0.1.0 is the first desktop preview for local real-data dogfooding of Codex and Claude Code quota signals. The release target is installer-first for normal users, with source mode kept as a developer fallback.

## Distribution

Normal users should download the packaged desktop installer from this GitHub Release, run it, and open AIQD from the installed desktop or Start menu entry. The installed entry opens the main dashboard window.

Developer fallback from source:

```bash
git clone https://github.com/isToniLiu/ai-agent-quota-dashboard.git
cd ai-agent-quota-dashboard
npm install
npm test
npm run trial:preflight
npm run desktop:local
```

On Windows PowerShell, if `npm` is blocked by the local execution policy, use `npm.cmd` for the same commands.

Launch-at-login is not a hidden side effect. If startup support ships in this preview, it must be explicit and off by default. Otherwise, startup controls remain v0.2 work.

Code signing and update-channel decisions may remain later work if the release notes call that out clearly.

## Highlights

- Local Node.js dashboard bound to `127.0.0.1`
- SQLite storage for normalized quota snapshots, reset events, and refresh history
- Codex quota detection from supported local CLI `rate_limits` events
- Manual Codex visible-status fallback when automatic local data is unavailable
- Claude Code official statusline `rate_limits` ingestion through an opt-in local sink
- Beginner Claude Code setup with separate `Install Claude Code CLI` and `Connect Claude data` actions
- Internal Claude statusline commands hidden behind technical details during normal setup
- Dashboard, Doctor, Settings, reset timeline, refresh history, and JSON/CSV export
- Electron desktop shell with tray mini panel, always-on-top widget, and AIQD-only shortcuts
- Shared AIQD app icon assets for the desktop tray, main window, and shortcut
- Desktop-entry launch mode that opens the main dashboard window
- Strict real-data readiness shared by CLI, Settings, tray, and mini surfaces
- English-by-default UI with Chinese/English language switching for the main dashboard and mini surfaces
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

Claude Code support is configured from Settings:

1. If Claude Code CLI is missing, click `Install Claude Code CLI`.
2. Click `Connect Claude data` if AIQD still needs to write the local capture setting.
3. Open Claude Code once, finish Claude's own login/trust prompts, send one short message, and wait for the reply.
4. Return to AIQD and check again.

The ordinary setup flow should not require users to copy `node dist...` or internal statusline commands. Those remain under advanced details for troubleshooting and source-mode development.

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

- Installer preview may still be unsigned until the signing decision is made
- No system notification support yet
- No update channel yet
- App-managed launch-at-login may be absent until v0.2; if present, it must be explicit and off by default
- Claude Code may report setup warnings until it renders a fresh statusline payload
- Historical trends, reset rhythm statistics, and Settings refresh interval presets are planned for v0.2
- Additional providers are intentionally deferred until Codex and Claude Code are trustworthy

## Privacy Boundary

AIQD does not read browser cookies, collect passwords, simulate login, call hidden APIs, bypass rate limits, switch accounts, or upload prompts, responses, source code, chat content, credentials, or raw local logs.

Exports and public dashboard APIs exclude account identifiers and raw local source references. If reliable quota data is unavailable, the app should show `unavailable` or an explicitly labeled manual fallback.
