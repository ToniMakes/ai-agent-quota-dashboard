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
- GitHub Actions CI on `main`

## Current Product State

The app is suitable for local real-data dogfooding by the maintainer and technically curious early testers. It is not yet ready for broad public promotion because packaging, installer flow, screenshots, and beginner-facing release docs still need polish.

## Next Focus

1. Finish beginner onboarding copy for real-data setup across Windows, macOS, and Linux.
2. Add release-quality screenshots or short GIFs for dashboard, tray panel, widget, and setup flow.
3. Decide the first distributable shape: source-only developer preview, zip artifact, or packaged Electron build.
4. Run one clean fresh-machine trial from clone to real Codex/Claude data.
5. Tag the first public developer-preview release after the release checklist is complete.
