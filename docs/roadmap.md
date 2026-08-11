# Roadmap

Last updated: 2026-08-11

## Current Milestone: v0.1 Desktop Preview

The v0.1 MVP is in real-data dogfooding. The goal is to make the local Codex and Claude Code quota experience trustworthy enough for early public testers, with an installer-first path for normal users and source mode retained for developers.

### Done

- Codex and Claude Code adapter boundaries
- Fixture-driven parser tests
- Claude Code official statusline `rate_limits` parser and local sink
- Claude Code setup helper, readiness checks, and first-data waiting states
- Codex structured quota parser and automatic local CLI `rate_limits` detection
- Manual Codex visible-status fallback with expiry at reported reset time
- SQLite snapshot, reset event, and refresh run storage
- Localhost Web Dashboard, Doctor, Settings, reset timeline, and refresh history
- Source confidence, stale state, low quota state, and reported-reset labels
- JSON and CSV export with private identifiers and raw source references excluded
- Strict real-data readiness shared by CLI, Settings, tray, and mini surfaces
- Electron desktop shell with tray mini panel and always-on-top widget
- Windows installer build through `electron-builder` / NSIS
- Packaged desktop smoke checks that run without requiring system Node.js
- Safe AIQD-only global shortcuts for mini panel, refresh, and widget
- One-time first-run desktop guide with deep links to exact setup or Doctor sections
- English-by-default Chinese/English language switching in the main dashboard and mini surfaces
- Collapsible first-run Settings details behind the Codex and Claude setup buttons
- Beginner Claude Code setup flow that separates `Install Claude Code CLI` from `Connect Claude data`
- Technical Claude statusline commands hidden behind advanced details in the normal setup flow
- CI on Windows and Ubuntu with Node 24

### Remaining Before First Public Preview

- Fresh-machine real-data trial from installer to Codex + Claude Code readiness
- Signing decision for the Windows installer, or explicit unsigned-preview warning in release notes
- Developer fallback trial from clone to Codex + Claude Code readiness
- Beginner onboarding copy pass for Windows, macOS, and Linux
- Refresh release screenshots or short GIFs when the setup-flow UI changes materially
- Create the GitHub Release and upload the installer artifact after final verification

### First Preview Work Plan

1. Hardening: keep smoke checks deterministic, verify `npm test`, `desktop:smoke`, `desktop:first-run-smoke`, and `git diff --check` locally.
2. Packaging: keep the Windows installer artifact reproducible and verify packaged smoke checks before each tag.
3. Real-data trial: run a fresh install from installer to Codex and Claude Code readiness, recording every point where setup copy is confusing.
4. Developer fallback: verify a clean clone still works for technical testers.
5. Onboarding pass: tighten Settings and README instructions around the next action, expected result, and recovery path for each platform.
6. Release assets: capture dashboard, tray mini panel, widget, and setup-flow screenshots or short GIFs.
7. Release finish: update `CHANGELOG.md`, complete `docs/release-checklist.md`, verify CI on `main`, tag the preview, and create the GitHub Release.

## v0.2

- Installer polish: signing decision, update-channel decision, and any missing platform packaging gaps
- Opt-in launch-at-login support: installer checkbox plus reversible Settings toggle, defaulting to off
- Settings-controlled automatic refresh interval presets: manual, 15 seconds, 30 seconds, 1 minute, 5 minutes, and 15 minutes; label this as local refresh cadence because actual quota observation depends on Codex or Claude Code producing new data
- System notification for low quota, stale data, and refresh warnings
- Simple historical usage trend from stored snapshots and refresh runs
- Reset rhythm statistics from observed reset events: recent reset times, intervals, average/median/min/max spacing, and replenishment deltas, always labeled as local observations rather than guaranteed provider schedules
- Optional forecast based on observed usage habits
- More polished setup wizard and troubleshooting copy
- Local API documentation for dashboard/CLI integration

## Later

- Gemini CLI, only if reliable local or official quota data is available
- Cursor local connector, only if privacy boundaries stay narrow
- VS Code sidebar
- macOS menu bar polish beyond the current Electron tray surface
- Multi-device sync, only after the local-first personal MVP is trusted

## Non-goals

- Browser cookie import
- Automatic login
- Hidden API scraping
- Multi-account limit avoidance
- Prompt, response, transcript, or source-code upload
- Team management in the personal MVP
