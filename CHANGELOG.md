# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning loosely while it is pre-1.0: minor versions may still change internal APIs, but privacy and data-source boundaries should remain conservative.

## [Unreleased]

### Added

- Normalized JSON and CSV export endpoints for dashboard quota data
- Settings view export buttons for local JSON/CSV downloads
- Local `config.json` support for user-configured agent data paths
- CLI commands to list, add, and remove local agent data paths
- Settings view status for configured local data paths
- Doctor view grouping by agent
- CLI `doctor` command for one-shot local diagnostics
- Machine-readable `doctor --json` output with private fields excluded or redacted
- CLI export command for normalized JSON/CSV quota data
- Refresh run history API and Doctor view panel
- Claude Code statusline readiness checks for real-data onboarding
- Claude Code real-data setup flow with a local statusline sink self-test
- Dashboard empty-state guidance when an agent has no quota snapshots
- Dashboard reset display with relative and absolute reported reset times
- Dashboard data freshness display with observed timestamps per agent
- Shared freshness reasons for agent API snapshots and `doctor --json`
- Claude Code empty-state guidance for installed statusline setups waiting for first real data
- Clearer Claude Code setup next actions after statusline installation
- Copy buttons for setup commands, local path commands, and command-backed empty states, with selection fallback when clipboard access is unavailable
- Diagnostics guide and issue template prompts for privacy-safe bug reports

### Privacy

- Exports exclude account identifiers and raw local source references
- Dashboard quota APIs exclude account identifiers and raw local source references
- Local real-data mode hides persisted demo snapshots unless demo mode is explicitly enabled
- Local path configuration stores only user-provided scan roots
- Refresh history stores aggregate counts, timestamps, and adapter error summaries
- Public bug-report guidance prefers reviewed `doctor --json` output over local-path-bearing text logs
- CLI exports reuse the same account/source-reference exclusions as dashboard exports

## [0.1.0] - 2026-08-09

Initial public scaffold.

### Added

- Local Node.js dashboard bound to `127.0.0.1`
- SQLite storage using Node's built-in `node:sqlite`
- Dashboard, Doctor, Settings, reported reset, and recent changes views
- Core `QuotaSnapshot`, `UsageEvent`, and `ResetEvent` models
- Claude Code statusline parser for official `rate_limits`
- Claude Code statusline sink and opt-in setup helper
- Conservative Codex parser for explicit structured quota snapshots
- Reset event detection for changed reset anchors and sharp replenishment
- Source confidence labels and stale/low quota state logic
- Sanitized parser fixtures and node:test coverage
- GitHub CI for Windows and Ubuntu on Node 24
- Privacy, data-source, security, contribution, and roadmap documentation

### Privacy

- Does not read browser cookies
- Does not collect passwords
- Does not simulate login
- Does not call hidden/private APIs
- Does not upload prompts, responses, source code, or chat content
