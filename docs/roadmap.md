# Roadmap

Last updated: 2026-08-11

## Current Milestone: v0.1 Developer Preview

The v0.1 MVP is in real-data dogfooding. The goal is to make the local Codex and Claude Code quota experience trustworthy enough for early public testers, without expanding the provider surface.

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
- Safe AIQD-only global shortcuts for mini panel, refresh, and widget
- One-time first-run desktop guide with deep links to exact setup or Doctor sections
- Chinese/English language switching in the main dashboard and mini surfaces
- CI on Windows and Ubuntu with Node 24

### Remaining Before First Public Developer Preview

- Fresh-machine real-data trial from clone to Codex + Claude Code readiness
- Beginner onboarding copy pass for Windows, macOS, and Linux
- Release screenshots or short GIFs for dashboard, mini panel, widget, and setup flow
- Publish as a source-only developer preview; defer zip artifacts, packaged Electron builds, signed releases, and app-managed auto-start
- Update release notes and tag the first preview after the release checklist passes

### First Preview Work Plan

1. Hardening: keep smoke checks deterministic, verify `npm test`, `desktop:smoke`, `desktop:first-run-smoke`, and `git diff --check` locally.
2. Real-data trial: run a clean clone from install to Codex and Claude Code readiness, recording every point where setup copy is confusing.
3. Onboarding pass: tighten Settings and README instructions around the next action, expected result, and recovery command for each platform.
4. Release assets: capture dashboard, tray mini panel, widget, and setup-flow screenshots or short GIFs.
5. Distribution decision: publish the first preview as source-only, and state clearly that zip artifacts, packaged Electron builds, signed releases, and app-managed auto-start are later work.
6. Release finish: update `CHANGELOG.md`, complete `docs/release-checklist.md`, verify CI on `main`, and tag the first preview.

## v0.2

- Packaged desktop build and installer story
- Opt-in launch-at-login support: installer checkbox plus reversible Settings toggle, defaulting to off for the first packaged release
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
