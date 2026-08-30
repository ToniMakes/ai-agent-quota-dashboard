# Roadmap

Last updated: 2026-08-26

## Current Milestone: Signed Follow-Up Release

`v0.1.0` shipped 2026-08-25 as an installer-first desktop preview, unsigned while SignPath Foundation review is pending. The current milestone is closing the gaps that block the next, signed release: a true clean-machine trial and a signed installer.

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
- Opt-in packaged launch-at-login with installer checkbox, Settings toggle, background tray startup, and uninstall cleanup
- Safe AIQD-only global shortcuts for mini panel, refresh, and widget
- One-time first-run desktop guide with deep links to exact setup or Doctor sections
- English-by-default Chinese/English language switching in the main dashboard and mini surfaces
- Collapsible first-run Settings details behind the Codex and Claude setup buttons
- Dashboard and mini quota cards hide duplicate primary-window rows and use separate progress rows for extra windows such as Claude Code's 5-hour quota
- Demo release screenshots refreshed for the dashboard, Doctor, Settings setup flow with Claude Desktop, mini panel, and widget surfaces
- Beginner Claude Code setup flow that separates `Install Claude Code CLI` from `Connect Claude data`
- Technical Claude statusline commands hidden behind advanced details in the normal setup flow
- Claude Desktop local `plan-usage-history.json` adapter, an alternative Claude source that needs no CLI install
- Real-data readiness treats Claude Code and Claude Desktop as alternatives (any-of per provider) instead of both being mandatory
- CI on Windows and Ubuntu with Node 24
- Created the GitHub Release and uploaded the unsigned `v0.1.0` installer artifact

### Remaining Before a Signed Follow-Up Release

- True clean Windows user or VM real-data trial from installer to Codex, Claude Desktop, and Claude Code readiness
- SignPath Foundation approval, CI signing configuration, and final signed-installer verification
- Beginner onboarding copy pass for Windows, macOS, and Linux

See [Release Checklist](release-checklist.md) for the step-by-step work plan.

## v0.2

- Installer polish: update-channel decision and any missing platform packaging gaps
- Settings-controlled automatic refresh interval presets: manual, 15 seconds, 30 seconds, 1 minute, 5 minutes, and 15 minutes; label this as local refresh cadence because actual quota observation depends on Codex or Claude Code producing new data
- Settings safety reset: a `Restore default settings` action for AIQD-owned preferences only, such as language, refresh cadence, shortcut overrides, launch-at-login preference, and remembered window/widget positions
- Separate advanced actions for destructive or external changes, such as clearing local quota history or disconnecting Claude Code data capture; these must require explicit confirmation and must not be bundled into the normal defaults reset
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

- Team management in the personal MVP

See the [README Non-goals](../README.md#non-goals) for the project's privacy/data-access non-goals.
