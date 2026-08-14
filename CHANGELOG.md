# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning loosely while it is pre-1.0: minor versions may still change internal APIs, but privacy and data-source boundaries should remain conservative.

## [Unreleased]

### Added

- SignPath Foundation code signing policy and a manual Windows package workflow that can upload unsigned RC artifacts or submit approved release artifacts for signing
- Claude Desktop local `plan-usage-history.json` adapter, an alternative Claude quota source that needs no CLI install
- Claude readiness now passes from either Claude Code statusline or Claude Desktop; the Claude Code CLI is no longer required
- Settings, Doctor, and the first-run setup wizard show Claude Desktop status alongside Claude Code CLI as alternative sources
- Installer-first v0.1.0 desktop-preview distribution target and release notes draft
- Windows NSIS installer build through `electron-builder`
- Packaged desktop runtime starts the local backend through Electron's bundled Node runtime, so users do not need Node.js
- Opt-in launch-at-login for packaged desktop builds, with a default-off installer checkbox, Settings toggle, background tray startup, and uninstall cleanup
- Collapsible first-run setup details controlled by the Codex and Claude setup buttons
- Mini panel now hides duplicate primary quota rows and uses compact secondary-window bars, with Claude Code's 5-hour quota highlighted in yellow
- Main dashboard quota windows were decluttered by moving primary-window used/reset details below the main meter and keeping extra windows, such as Claude Code's 5-hour quota, as separate progress rows
- Beginner Claude setup flow with separate `Install Claude Code CLI` and `Connect Claude data` actions
- Claude setup result copy that distinguishes complete setup from action-needed states
- Collapsed technical details for internal Claude statusline commands and paths during normal setup
- Shared app icon assets for the desktop tray, main window, and Windows shortcut
- Desktop-entry launch mode that opens the main dashboard window instead of only the tray mini panel
- Distribution and startup plan documenting v0.2 opt-in launch-at-login behavior for installer and Settings
- v0.2 roadmap note for Settings-controlled refresh interval presets, distinct from provider-produced observation timestamps
- v0.2 roadmap note for safe Settings reset controls that restore AIQD-owned defaults without deleting quota history or changing external agent configuration
- P0 release-gate documentation for a Claude Desktop local plan usage history adapter, so desktop-only Claude users are covered before broad public release
- English default language for first-run dashboard and mini surfaces, while preserving saved user language choices
- Demo release screenshots for the dashboard, Doctor, Settings setup flow, mini panel, and widget surfaces
- Beginner onboarding copy for real-data trials now includes expected outcomes, PowerShell fallback commands, and Claude Code refresh troubleshooting
- v0.2 roadmap note for Reset Rhythm statistics based on observed reset events
- First public developer-preview work plan in the release documentation
- Project status document summarizing current v0.1 developer-preview progress and next release focus
- Mini dashboard language toggle shared with the main dashboard language preference
- Chinese/English language switching for tray mini panel and always-on-top widget surfaces
- Normalized JSON and CSV export endpoints for dashboard quota data
- Settings view export buttons for local JSON/CSV downloads
- Manual Codex snapshot CLI for visible `/status` or Usage values
- Settings view form to save visible Codex manual snapshots and refresh dashboard data
- Settings view status and copyable commands for Codex manual snapshots
- Settings real-data overview for first-run Codex and Claude Code setup
- Real-data desktop trial guide for Codex and Claude Code setup
- Doctor first-run checklist for real-data readiness
- Setup refresh feedback for Codex saves, Claude Code waiting state, and manual refreshes
- Settings view strict real-data trial readiness from the same checks as `trial:ready`
- Environment overrides for Claude Code setup paths
- Development desktop shell with a tray mini panel and optional always-on-top widget
- One-time desktop first-run guide that uses strict trial readiness to open the exact setup or Doctor section
- Desktop smoke coverage for the first-run guide deep-link and local state write
- Desktop startup diagnostics with recovery guidance for backend failures
- Desktop global shortcuts for AIQD mini panel, refresh, and widget actions
- Local trial scripts for desktop launch, Doctor, and Claude statusline self-test
- Real-data trial preflight command with source-specific next actions
- Strict real-data readiness check before desktop trials
- Settings view status for desktop shortcut bindings and overrides
- Tray tooltip/menu quota summaries for the desktop shell
- Tray tooltip/menu strict readiness status before daily quota summaries
- Tray menu actions for manual refresh, Doctor, Settings, and Dashboard
- Mini footer summary for the latest refresh result and warnings
- Mini strict readiness progress text for first-run Codex and Claude Code onboarding
- Clickable mini footer actions for refresh warnings and setup guidance
- Mini and tray first-run actions that open Settings or Doctor directly
- Mini first-run actions deep-link to the exact Settings or Doctor section
- Compact mini-surface quota rows with manual refresh and reset/observed summaries
- Single-instance desktop shell behavior that focuses the existing mini panel on repeat launch
- Tray status refreshes when the first Claude Code statusline snapshot arrives
- Remembered desktop widget position and `Esc` hiding for mini surfaces
- Desktop smoke command for backend startup checks
- Desktop helper tests for tray summaries and widget bounds
- Mini quota panel page for compact daily use
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
- Dashboard watches for the first Claude Code statusline snapshot while waiting for real data
- Copy buttons for setup commands, local path commands, and command-backed empty states, with selection fallback when clipboard access is unavailable
- Diagnostics guide and issue template prompts for privacy-safe bug reports

### Fixed

- Claude Code statusline reset times now also expire quota snapshots, so old 5-hour windows stop looking fresh after their reported reset
- Claude Code statusline labels are clearer in dashboard and mini surfaces to avoid implying Claude desktop app usage-limit support
- Dashboard and mini surfaces no longer show stale primary quota percentages as current remaining quota
- Expired quota cards now explain that AIQD needs a fresh local snapshot instead of implying the quota is used up
- Desktop shortcut launches now open the main dashboard even when AIQD is already running in the tray
- Background startup launches no longer open the mini panel when no setup or recovery guidance is needed
- SQLite refreshes now wait briefly for an existing writer instead of failing immediately on a short-lived database lock
- Desktop first-run smoke now isolates provider data paths and exits non-zero when its deep-link assertion fails
- Dashboard quota cards now clarify remaining quota versus official pages that display used quota
- Codex manual snapshot files saved by the Settings form now refresh into the Dashboard
- Claude Code setup status tolerates UTF-8 BOM in settings and latest snapshot JSON

### Privacy

- Exports exclude account identifiers and raw local source references
- Dashboard quota APIs exclude account identifiers and raw local source references
- Desktop mini surfaces reuse the same local-only sanitized dashboard APIs
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
