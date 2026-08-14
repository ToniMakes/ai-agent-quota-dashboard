# Project Status

Last updated: 2026-08-14

AI Agent Quota Dashboard is in a v0.1 desktop-preview stage. The core MVP is no longer just a scaffold: the local dashboard, desktop tray shell, real-data setup flow, and strict trial readiness checks are implemented and passing CI. The first public preview target is now installer-first for normal users, with source mode retained as a developer fallback.

## Current Capability

- Local Node.js service bound to `127.0.0.1`
- SQLite persistence for normalized quota snapshots, reset events, and refresh runs
- Codex quota detection from local CLI `rate_limits` events, with a manual visible-status fallback
- Claude Code quota ingestion from official statusline `rate_limits`
- Claude Desktop quota ingestion from local `plan-usage-history.json`, an alternative to Claude Code so the CLI is not required
- Real-data readiness passes the `anthropic` provider group when either Claude Code or Claude Desktop is fresh
- Beginner Claude setup flow with explicit install and connect actions
- Dashboard, Doctor, Settings, reset timeline, refresh history, and local export views
- Strict real-data readiness checks shared by CLI, Settings, tray, and mini surfaces
- Electron desktop shell with tray mini panel, always-on-top widget, safe AIQD-only shortcuts, and first-run deep links
- Dashboard and mini quota cards hide duplicate primary-window rows while keeping extra windows, such as Claude Code's 5-hour quota, visible as progress rows
- Windows NSIS installer build via `electron-builder`
- Packaged desktop runtime starts the local backend through Electron's bundled Node runtime
- Opt-in packaged launch-at-login, with installer checkbox off by default and a reversible Settings toggle
- Shared app icon assets for the tray, main window, and desktop shortcut
- Collapsible first-run Settings details controlled by the Codex and Claude setup buttons
- English-by-default UI with Chinese/English support in the main dashboard and mini surfaces
- Source confidence, freshness, and reported-reset labels
- JSON/CSV export with private identifiers and raw source references excluded
- GitHub Actions CI on Windows and Ubuntu with Node 24

## Current Trust Boundary

AIQD only uses official or local user-visible quota sources. It does not read browser cookies, simulate login, call hidden APIs, upload prompts/responses/source code, or automate account switching. If a reliable source is unavailable, the UI should say `unavailable` or use an explicitly labeled manual fallback.

The preferred Windows signing path is SignPath Foundation open-source signing. The repository now has a code signing policy, and the formal desktop preview should use a signed installer if SignPath approval is complete before release.

## Latest Local Verification

The current maintainer checkout has passed:

- `npm test`
- `node --check web/app.js`
- `node --check web/mini.js`
- `git diff --check`
- `npm run desktop:smoke`
- `npm run desktop:first-run-smoke`
- `npm run package:win:dir`
- `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke`
- `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke-first-run-guide`
- `npm run package:win`
- `npm run trial:preflight`
- `npm run trial:ready`
- Browser interaction smoke for the collapsible first-run setup buttons
- Browser interaction smoke for the decluttered dashboard and mini quota-window layouts
- Browser/API smoke against demo mode for `/`, `/mini.html`, `/api/health`, `/api/agents`, `/api/trial-readiness`, and `/api/export?format=json`
- Maintainer-profile installer trial: silent NSIS install exited `0`, desktop and Start menu shortcuts target the installed packaged executable, the desktop shortcut opens the installed app backend on `127.0.0.1:4317`, `/api/trial-readiness` reports `ok: true`, and browser smoke passes for the installed dashboard and mini panel
- Clean-copy trial from `.tmp/fresh-trial-current`: `npm ci`, `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, `npm run trial:preflight`, and `npm run trial:ready`
- GitHub Actions CI on `main`

## Latest Clean Trial Notes

The current maintainer checkout can build, test, launch desktop smoke checks, build the unsigned Windows x64 NSIS artifact, and pass real-data strict readiness against the maintainer machine's Codex and Claude Desktop data.

The latest local readiness run reports Codex ready from `official_cli`, Claude Desktop ready from local `plan-usage-history.json`, and Claude Code as stale because its last statusline observation is old. This is acceptable for the current readiness rule because Claude Code and Claude Desktop are alternatives for the `anthropic` provider group.

The beginner real-data trial docs now call out expected command results, Windows PowerShell `npm.cmd` fallbacks, Codex automatic-versus-manual detection, and Claude Code stale-snapshot recovery.

Demo release screenshots have been refreshed for the dashboard, Doctor, Settings setup flow with Claude Desktop, mini panel, and widget surfaces under `docs/assets/screenshots`.

The first public preview distribution shape is installer-first desktop preview. A local Windows x64 NSIS artifact has been generated at `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`; `release/` is ignored and the artifact should be uploaded to a GitHub Release rather than committed. The current local artifact is unsigned and is suitable as an RC/testing artifact, not the preferred formal release artifact. `docs/release-notes-v0.1.0.md` is the draft GitHub Release text.

The unsigned `v0.1.0-rc.1` GitHub Pre-release has been created for clean-machine testing and SignPath Foundation review:

- Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.1
- Workflow run: https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/runs/31796488211
- Asset SHA256: `D938A30F4289EE676FD181AC804B5DE0F372EEF502706FFE43142B85F26A0F72`

The latest installed-app trial used the maintainer's existing Windows profile and preserved existing AIQD, Codex, and Claude Code state. It validates the packaged installer and normal desktop entry path, but a true clean Windows user or VM first-run remains useful before broad distribution.

The clean Windows VM first-run protocol is now spelled out in [docs/real-data-trial.md](real-data-trial.md), including startup checkbox off/on passes, Settings startup toggle checks, uninstall cleanup, and fresh Codex, Claude Desktop, and Claude Code readiness. It still needs to be executed on an actual clean Windows profile or VM.

## Current Product State

The app is suitable for local real-data dogfooding by the maintainer and technically curious early testers. For the first public preview, normal users should install a packaged desktop build and finish setup from Settings. Source checkout remains the developer fallback path.

Launch-at-login is implemented for packaged desktop builds and documented in [docs/distribution.md](distribution.md): startup is explicit, reversible, off by default, and uses a background tray launch instead of opening the full dashboard unless setup or recovery needs attention.

## P0 Release Gate (resolved)

Claude Desktop-only coverage was the highest product priority before broad public release, because most normal Claude users may rely on Claude Desktop or claude.ai instead of Claude Code CLI. This is now implemented: AIQD reads the local `%APPDATA%\Claude\plan-usage-history.json` file as an independent `claude-desktop` adapter, and Claude readiness passes from either Claude Code statusline or Claude Desktop.

## Next Focus

1. Submit the SignPath Foundation OSS application using the `v0.1.0-rc.1` pre-release URL, privacy policy, and code signing policy.
2. Run a true clean Windows user or VM trial from the RC installer through Codex, Claude Desktop, and Claude Code readiness.
3. After SignPath approval, configure GitHub secrets/variables and rerun the Windows package workflow with signing enabled.
4. Run a final checklist/CI pass immediately before tagging `v0.1.0`.
