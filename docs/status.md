# Project Status

Last updated: 2026-08-11

AI Agent Quota Dashboard is in a v0.1 developer-preview stage. The core MVP is no longer just a scaffold: the local dashboard, desktop tray shell, real-data setup flow, and strict trial readiness checks are implemented and passing CI.

## Current Capability

- Local Node.js service bound to `127.0.0.1`
- SQLite persistence for normalized quota snapshots, reset events, and refresh runs
- Codex quota detection from local CLI `rate_limits` events, with a manual visible-status fallback
- Claude Code quota ingestion from official statusline `rate_limits`
- Dashboard, Doctor, Settings, reset timeline, refresh history, and local export views
- Strict real-data readiness checks shared by CLI, Settings, tray, and mini surfaces
- Electron desktop shell with tray mini panel, always-on-top widget, safe AIQD-only shortcuts, and first-run deep links
- Chinese/English UI support in the main dashboard and mini surfaces
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
- `npm run trial:preflight`
- `npm run trial:ready`
- Browser/API smoke against demo mode for `/`, `/mini.html`, `/api/health`, `/api/agents`, `/api/trial-readiness`, and `/api/export?format=json`
- Clean-copy trial from `.tmp/fresh-trial-current`: `npm ci`, `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, `npm run trial:preflight`, and `npm run trial:ready`
- GitHub Actions CI on `main`

## Latest Clean Trial Notes

A clean source copy with the current worktree changes can install, build, test, launch desktop smoke checks, and pass real-data strict readiness against the maintainer machine's Codex and Claude Code setup.

Observed follow-up: Claude Code statusline data was accepted for strict readiness, but setup status still warns when the latest rate-limit snapshot is old. Before screenshots or release notes, open Claude Code once to refresh the statusline snapshot and confirm the warning clears.

The beginner real-data trial docs now call out expected command results, Windows PowerShell `npm.cmd` fallbacks, Codex automatic-versus-manual detection, and Claude Code stale-snapshot recovery.

Demo release screenshots have been generated for the dashboard, Doctor, Settings setup flow, mini panel, and widget surfaces under `docs/assets/screenshots`.

The first public preview distribution shape is now source-only developer preview. `docs/release-notes-v0.1.0.md` is the draft GitHub Release text.

## Current Product State

The app is suitable for local real-data dogfooding by the maintainer and technically curious early testers. The first public preview will be source-only: users clone the repo, install dependencies, and run the local dashboard or desktop shell from source. Packaged installers, zip artifacts, signed releases, and auto-start remain later-release work.

## Next Focus

1. Refresh Claude Code once so the statusline snapshot is current before any ready-state screenshots.
2. Capture any remaining native OS screenshots, especially the tray menu and actual floating widget.
3. Review and finalize `docs/release-notes-v0.1.0.md`.
4. Tag the first public source-only developer preview after the release checklist is complete.
