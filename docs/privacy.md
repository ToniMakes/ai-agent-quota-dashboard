# Privacy

AI Agent Quota Dashboard is local-first by default.

It reads known local usage files, local quota snapshots, or official status outputs from tools the user already runs. It does not upload prompts, responses, source code, passwords, browser cookies, or chat content.

## Defaults

- The server binds to `127.0.0.1`.
- SQLite data is stored locally.
- Demo data is opt-in through `--demo` or `npm run dev`.
- User-configured scan roots are stored in the app's own local `config.json`.
- Network connectors must be explicit and opt-in.
- The Settings view does not modify Codex settings. The Codex fallback form writes only AIQD's own local snapshot file after an explicit save action.

## Stored Data

The app may store:

- Normalized quota snapshots
- Aggregated usage events
- Reset timestamps
- Source and confidence labels
- Doctor check results
- Refresh run timestamps, aggregate saved counts, and adapter error summaries
- User-provided local scan roots
- Codex CLI `rate_limits` fields extracted from local structured session events, when available
- Manual Codex fallback snapshots the user explicitly records from a visible status or Usage surface
- Sanitized Claude Code statusline `rate_limits` snapshots, when explicitly enabled

The app should not store:

- Raw prompts
- Raw responses
- Source code
- Browser session cookies
- Passwords
- Private hidden API responses
- Claude Code transcript paths
- Claude Code workspace paths

## Data Reliability

The dashboard must clearly label whether data is official, local, estimated, stale, manual, demo, or unavailable.
