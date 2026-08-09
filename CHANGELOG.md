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

### Privacy

- Exports exclude account identifiers and raw local source references
- Local path configuration stores only user-provided scan roots

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
