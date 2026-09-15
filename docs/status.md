# Project Status

Last updated: 2026-09-16

AI Agent Quota Dashboard is a v0.1.0 Windows desktop preview. The public path is installer-first for normal users, with source mode available for developers.

## Available in the preview

- Codex quota detection from supported local CLI rate-limit events
- Claude quota detection from Claude Code statusline or Claude Desktop local usage data
- Dashboard, Diagnostics, Settings, tray mini panel, and always-on-top widget
- Local SQLite history for quota snapshots, refresh runs, and reset events
- JSON and CSV export with private source references excluded
- Strict readiness checks, freshness labels, source confidence, and unavailable states
- Optional launch at login for packaged builds, disabled by default
- Windows x64 NSIS installer built with Electron's bundled runtime
- English and Chinese UI support, with English as the default

## Privacy and security posture

The application keeps monitoring data local and serves its dashboard through loopback. It does not read browser cookies, collect passwords, simulate login, call hidden provider APIs, or upload prompts, responses, source code, or chat content. See [Privacy](privacy.md) and [Security](../SECURITY.md).

The public website is a static product page. It does not receive data from the desktop application and contains no application credentials or provider tokens.

## Verification status

The repository has automated tests, desktop smoke checks, Windows packaging checks, and CI on Windows and Ubuntu. Release workflows validate the package version, build the installer, generate a SHA256 sidecar, and publish release assets from version tags.

The v0.1.0 Windows installer is intentionally unsigned while the open-source signing path is pending. The release page contains a prominent warning and the final SHA256. Users should verify the checksum before running an unsigned installer.

The public demo screenshots use sanitized data. They must be reviewed again whenever the dashboard or mini panel layout changes. Screenshots are illustrative and are not a substitute for the installed application's current behavior.

## Known limits

- Browser-only use of supported providers is not monitored.
- Claude Desktop data may not include a provider-reported reset time.
- Claude Code may need one fresh statusline observation before its local data is ready.
- The preview has no automatic update channel.
- Scheduled system reminders, historical trends, and additional providers remain future work.
- The published release asset can differ from newer commits on `main` until a new release is built.

For installation and startup behavior, see [Distribution and Startup](distribution.md). For source-mode local verification, see [Local data trial](real-data-trial.md).
