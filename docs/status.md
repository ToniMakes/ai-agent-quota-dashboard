# Project Status

Last updated: 2026-08-11

AI Agent Quota Dashboard is in a v0.1 desktop-preview stage. The core MVP is no longer just a scaffold: the local dashboard, desktop tray shell, real-data setup flow, and strict trial readiness checks are implemented and passing CI. The first public preview target is now installer-first for normal users, with source mode retained as a developer fallback.

## Current Capability

- Local Node.js service bound to `127.0.0.1`
- SQLite persistence for normalized quota snapshots, reset events, and refresh runs
- Codex quota detection from local CLI `rate_limits` events, with a manual visible-status fallback
- Claude Code quota ingestion from official statusline `rate_limits`
- Beginner Claude setup flow with explicit install and connect actions
- Dashboard, Doctor, Settings, reset timeline, refresh history, and local export views
- Strict real-data readiness checks shared by CLI, Settings, tray, and mini surfaces
- Electron desktop shell with tray mini panel, always-on-top widget, safe AIQD-only shortcuts, and first-run deep links
- Dashboard and mini quota cards hide duplicate primary-window rows while keeping extra windows, such as Claude Code's 5-hour quota, visible as progress rows
- Windows NSIS installer build via `electron-builder`
- Packaged desktop runtime starts the local backend through Electron's bundled Node runtime
- Shared app icon assets for the tray, main window, and desktop shortcut
- Collapsible first-run Settings details controlled by the Codex and Claude setup buttons
- English-by-default UI with Chinese/English support in the main dashboard and mini surfaces
- Source confidence, freshness, and reported-reset labels
- JSON/CSV export with private identifiers and raw source references excluded
- GitHub Actions CI on Windows and Ubuntu with Node 24

## Current Trust Boundary

AIQD only uses official or local user-visible quota sources. It does not read browser cookies, simulate login, call hidden APIs, upload prompts/responses/source code, or automate account switching. If a reliable source is unavailable, the UI should say `unavailable` or use an explicitly labeled manual fallback.

## Latest Local Verification

The current maintainer checkout has passed:

- `npm test`
- `node --check web/app.js`
- `node --check web/mini.js`
- `git diff --check`
- `npm run desktop:smoke`
- `npm run desktop:first-run-smoke`
- `npm run package:win:dir`
- `.\release\win-unpacked\AI Agent Quota Dashboard.exe --smoke`
- `.\release\win-unpacked\AI Agent Quota Dashboard.exe --smoke-first-run-guide`
- `npm run package:win`
- `npm run trial:preflight`
- `npm run trial:ready`
- Browser interaction smoke for the collapsible first-run setup buttons
- Browser interaction smoke for the decluttered dashboard and mini quota-window layouts
- Browser/API smoke against demo mode for `/`, `/mini.html`, `/api/health`, `/api/agents`, `/api/trial-readiness`, and `/api/export?format=json`
- Clean-copy trial from `.tmp/fresh-trial-current`: `npm ci`, `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, `npm run trial:preflight`, and `npm run trial:ready`
- GitHub Actions CI on `main`

## Latest Clean Trial Notes

A clean source copy with the current worktree changes can install, build, test, launch desktop smoke checks, and pass real-data strict readiness against the maintainer machine's Codex and Claude Code setup.

Claude Code statusline data was refreshed during the release gate, and strict readiness accepted fresh `session_5h` and weekly windows from `official_statusline`.

The beginner real-data trial docs now call out expected command results, Windows PowerShell `npm.cmd` fallbacks, Codex automatic-versus-manual detection, and Claude Code stale-snapshot recovery.

Demo release screenshots have been generated for the dashboard, Doctor, Settings setup flow, mini panel, and widget surfaces under `docs/assets/screenshots`.

The first public preview distribution shape is installer-first desktop preview. A local Windows x64 NSIS artifact has been generated at `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`; `release/` is ignored and the artifact should be uploaded to a GitHub Release rather than committed. `docs/release-notes-v0.1.0.md` is the draft GitHub Release text.

## Current Product State

The app is suitable for local real-data dogfooding by the maintainer and technically curious early testers. For the first public preview, normal users should install a packaged desktop build and finish setup from Settings. Source checkout remains the developer fallback path.

The launch-at-login plan is documented in [docs/distribution.md](distribution.md): startup must be explicit, reversible, and off by default. If v0.1 ships without that toggle, it should not create a startup entry.

## Next Focus

1. Run a fresh normal-user trial from the installer through Codex and Claude Code readiness.
2. Refresh release screenshots if the collapsible setup flow should be visible in release assets.
3. Create the GitHub Release and upload the unsigned Windows installer artifact after final checklist review.
