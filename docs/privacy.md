# Privacy

The AIQD desktop app reads supported quota-related data already stored on your device. It is designed to keep those readings on the same device.

## What AIQD reads

AIQD scans supported local app or CLI data sources for quota percentages, usage windows, reported reset times, and observation times. It does not read browser cookies or conversations. The app does not log in to provider accounts or call private or hidden provider APIs.

## What AIQD stores

The desktop app may save the following in its local database or configuration:

- Normalized quota readings, usage events, and reset timestamps
- Source and freshness labels, connection checks, and refresh history
- Local paths the user adds for source discovery
- Codex CLI rate-limit fields present in supported local structured events
- Sanitized Claude Code statusline quota fields after the user connects that source
- Claude Desktop usage percentages and observation times from its supported local usage-history file
- A manual Codex fallback value only when a developer explicitly records one

The app does not store raw prompts, responses, source code, browser cookies, passwords, private API responses, Claude Code transcript paths, Claude Code workspace paths, or Claude Desktop conversation content.

## Where data goes

- The local dashboard service binds to loopback, normally `127.0.0.1`.
- The desktop app stores quota readings and refresh history locally; it does not sync them to an AIQD cloud service.
- User-started Claude Code setup writes the local setting needed to enable the statusline data source. The setup action is shown in AIQD.
- The desktop app's feedback link opens an email draft; nothing is sent until the user chooses to send it.
- The public website is separate from the desktop app. If a visitor submits its feedback form, the feedback and email address they entered are sent to the feedback service. The website does not receive quota data from the desktop app.

## Reliability

Provider apps and CLIs control when local usage data is written. A new AIQD check may find the same reading as before. AIQD labels demo, manual, stale, and unavailable data so they are not mistaken for current provider readings.

For setup, signing, and vulnerability-reporting details, see [Distribution](distribution.md), [Code signing](code-signing.md), and [Security](../SECURITY.md).
