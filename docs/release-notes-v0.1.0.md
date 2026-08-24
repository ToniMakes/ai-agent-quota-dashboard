# v0.1.0 Desktop Preview Release Notes

AI Agent Quota Dashboard v0.1.0 is the first desktop preview for local real-data dogfooding of Codex, Claude Code, and Claude Desktop quota signals. The release target is installer-first for normal users, with source mode kept as a developer fallback.

## Distribution

Normal users should download the packaged desktop installer from this GitHub Release, run it, and open AIQD from the installed desktop or Start menu entry. The installed entry opens the main dashboard window.

Windows x64 installer asset:

```text
AI Agent Quota Dashboard-0.1.0-win-x64.exe
```

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

Launch-at-login is not a hidden side effect. The installer checkbox is off by default, and the same startup entry can be enabled or disabled later from Settings > Desktop Preferences.

Signature status: **unsigned Windows installer**. SignPath Foundation open-source signing is still pending as of 2026-08-25, and the maintainer has explicitly approved publishing v0.1.0 as an unsigned desktop preview instead of blocking the release. Windows may show an unknown-publisher or SmartScreen warning.

SHA256:

```text
7DDE28E8FE424268C752480889DBBEABFD5578D9D20D5EE77DAE117ADE867F6D
```

Code signing policy: [docs/code-signing.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md).

## Highlights

- Local Node.js dashboard bound to `127.0.0.1`
- SQLite storage for normalized quota snapshots, reset events, and refresh history
- Codex quota detection from supported local CLI `rate_limits` events
- Manual Codex visible-status fallback when automatic local data is unavailable
- Claude Code official statusline `rate_limits` ingestion through an opt-in local sink
- Claude Desktop local `plan-usage-history.json` ingestion, an alternative Claude source that needs no CLI install and is treated as equal to Claude Code statusline
- First-launch onboarding modal asks which agents the user uses, then asks Claude users to choose Desktop or Claude Code CLI
- Beginner Claude Code setup with separate `Install Claude Code CLI` and `Connect Claude data` actions
- Internal Claude statusline commands hidden behind technical details during normal setup
- Dashboard, Doctor, Settings, reset timeline, refresh history, and JSON/CSV export
- Dashboard quota cards keep the primary quota in the hero meter and show only extra windows as separate progress rows
- Codex monthly rows are hidden unless the Codex adapter explicitly supports them, so the UI follows the official visible usage windows rather than third-party monthly guesses
- Electron desktop shell with tray mini panel, always-on-top widget, and AIQD-only shortcuts
- Mini panel hides duplicate primary quota rows and shows compact secondary-window bars, including a yellow Claude Code 5-hour bar
- Windows NSIS installer generated with `electron-builder`
- SignPath Foundation code signing policy and GitHub Actions packaging path for signed release artifacts
- Packaged app launches its local backend through Electron's bundled Node runtime, so users do not need Node.js or npm
- Opt-in launch-at-login for packaged desktop builds, using a background tray startup and a reversible Settings toggle
- Shared AIQD app icon assets for the desktop tray, main window, and shortcut
- Desktop-entry launch mode that opens the main dashboard window
- Strict real-data readiness shared by CLI, Settings, tray, and mini surfaces
- English-by-default UI with Chinese/English language switching for the main dashboard and mini surfaces
- Source confidence, freshness, and reported-reset labels
- Packaged Windows launches tolerate disconnected GUI log pipes instead of surfacing a JavaScript `EPIPE` main-process error
- Privacy-safe public dashboard APIs and export output

## Real-data Trial

Run:

```bash
npm run trial:preflight
npm run trial:ready
```

`trial:preflight` gives the shortest next action for Codex, Claude Code, Claude Desktop, or blocking Doctor issues. `trial:ready` requires fresh non-demo quota data for Codex, plus at least one fresh non-demo Claude source (Claude Code or Claude Desktop) — it does not require both Claude sources.

Codex support is automatic when supported local `rate_limits` events are available. Otherwise, use the Settings fallback form or:

```bash
node dist/index.js codex snapshot --remaining-percent 72 --reset-at 2026-08-16T03:00:00Z
```

Claude Desktop support needs no setup: if `%APPDATA%\Claude\plan-usage-history.json` exists with a recent sample, AIQD reads it automatically after the user chooses Claude Desktop in the first-launch guide.

Claude Code CLI support is optional:

1. Choose Claude Code CLI in the first-launch guide.
2. AIQD writes the local statusline receiver when it can do so safely.
3. Open Claude Code once, finish Claude's own login/trust prompts, send one short message, and wait for the reply.
4. Return to AIQD and check again.

The ordinary setup flow should not require users to copy `node dist...` or internal statusline commands. Those remain under advanced details for troubleshooting and source-mode development.

## Verification Before Tagging

The current release gate is:

```bash
npm test
npm run desktop:smoke
npm run desktop:first-run-smoke
npm run package:win:dir
& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke
& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke-first-run-guide
npm run package:win
npm run trial:preflight
npm run trial:ready
git diff --check
```

CI runs tests on Windows and Ubuntu with Node 24.

## Known Limits

- The v0.1.0 Windows installer is unsigned while SignPath Foundation review is pending; users should verify the SHA256 before running it
- No system notification support yet
- No update channel yet
- Launch-at-login is Windows-first for this preview; macOS/Linux distribution polish remains later work
- Claude Code may report setup warnings until it renders a fresh statusline payload; this no longer blocks Claude readiness when Claude Desktop is available
- Claude Desktop reports no reset time; only remaining percentage and observed time are shown for this source
- Restore default settings, historical trends, reset rhythm statistics, and Settings refresh interval presets are planned for v0.2
- Additional providers are intentionally deferred until Codex and Claude sources are trustworthy

## Privacy Boundary

AIQD does not read browser cookies, collect passwords, simulate login, call hidden APIs, bypass rate limits, switch accounts, or upload prompts, responses, source code, chat content, credentials, or raw local logs.

Exports and public dashboard APIs exclude account identifiers and raw local source references. If reliable quota data is unavailable, the app should show `unavailable` or an explicitly labeled manual fallback.
