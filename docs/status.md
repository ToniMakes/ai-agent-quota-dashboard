# Project Status

Last updated: 2026-10-08

AI Agent Quota Dashboard is currently published as a v0.1.0 Windows x64 desktop preview. The installer is the recommended path for most users; developers can also run the project from source. The downloadable release may not include changes that have landed on the development branch.

## Available in the preview

- Codex quota readings from supported local CLI rate-limit events
- Claude readings from Claude Code statusline data or Claude Desktop local usage history
- A dashboard, Connections view, Settings, tray mini panel, and optional always-on-top widget
- Local refresh history and observed reset changes
- JSON and CSV exports that omit account identifiers and raw source references
- English and Simplified Chinese interface languages, with English selected by default
- A Windows x64 installer with an optional, off-by-default launch-at-sign-in setting

Displayed values depend on the local data available for each source. AIQD marks old or unavailable readings rather than presenting them as current. It does not monitor provider accounts used only in a web browser. See [compatibility and data-quality notes](compatibility.md) for details.

## Privacy and security

The desktop service binds to loopback and stores quota readings locally. It does not collect passwords or browser cookies, or upload prompts, responses, source code, or chat content. User-started Claude Code setup may write the local setting required for its statusline data source. See [Privacy](privacy.md) and [Security](../SECURITY.md).

The public website is separate from the desktop app and does not receive quota data. Its optional feedback form sends only the information a visitor chooses to submit.

## Verification

The repository includes automated tests, desktop smoke checks, Windows packaging checks, and CI on Windows and Ubuntu. Release workflows validate package versions, build the installer, generate a SHA256 file, and publish assets from version tags.

The v0.1.0 installer is unsigned. Check the release page for the SHA256 and signature status before running the installer. Public demo screenshots use sanitized data; they are illustrative and may not show the latest interface.

## Known limits

- Browser-only use of supported providers is not monitored.
- Claude Desktop usage history may not provide a reset time.
- Claude Code may need to produce a new statusline reading before its data appears or becomes current.
- Supported local file formats can change when provider apps or CLIs update.
- The preview has no automatic update channel.
- Additional providers and scheduled system reminders are not part of this preview.

For installation and startup behavior, see [Distribution and Startup](distribution.md). For a local data setup walkthrough, see [Local data trial](real-data-trial.md).
