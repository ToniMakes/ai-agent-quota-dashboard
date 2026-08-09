# AI Agent Quota Dashboard

[![CI](https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A local-first, quota-first dashboard for AI coding agents.

Open the dashboard and see, within a few seconds, how much quota is left for Codex and Claude Code, when it resets, and how reliable the source is.

Unlike general token or cost trackers, this project is quota-first. It focuses on remaining limits, reported reset times, and source confidence for local AI coding agents.

## Status

This repository is at the v0.1 scaffold stage. The current app includes:

- Local Node.js service bound to `127.0.0.1`
- SQLite storage using Node's built-in `node:sqlite`
- Codex and Claude Code adapter boundaries
- Fixture-driven parsers for Claude Code statusline rate limits
- A conservative Codex parser for explicit structured quota snapshots
- Claude Code statusline setup helper with explicit opt-in
- Reset event timeline for changed reset anchors and sharp replenishment
- Dashboard reset display with relative and absolute reported reset times
- Dashboard data freshness display with observed timestamps per agent
- Dashboard and Doctor views
- Dashboard guidance for missing quota data
- CLI `doctor` command for one-shot local diagnostics
- CLI export command for normalized JSON/CSV output
- Refresh history with saved counts and adapter error summaries
- Settings view for Claude Code statusline onboarding
- Copy buttons for setup and local path commands, with selection fallback when clipboard access is unavailable
- Local `config.json` for user-configured agent data paths
- Normalized JSON/CSV export from the Settings view
- Explicit source and confidence labels
- Demo data mode for UI development

If reliable quota data cannot be obtained from official or local user-visible sources, the app should show `unavailable`.

## Non-goals

This project does not:

- Read browser cookies
- Collect passwords
- Simulate logins
- Call private or hidden APIs
- Bypass rate limits
- Switch accounts to avoid limits
- Upload prompts, responses, source code, or chat content

## Quick Start

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:4317
```

`npm run dev` enables demo data. To scan local paths without demo snapshots:

```bash
npm run dev:local
```

## Scripts

```bash
npm run dev        # local server with demo quota snapshots
npm run dev:local  # local server without demo quota snapshots
npm run build      # compile TypeScript
npm test           # typecheck and run node:test tests
```

## Doctor CLI

Run one local scan and print the same diagnostic signal without opening the dashboard:

```bash
node dist/index.js doctor
node dist/index.js doctor --demo
node dist/index.js doctor --json
```

The command prints refresh counts, each agent's quota or empty-state guidance, and the underlying Doctor checks. It exits with code `1` only for blocking failures such as adapter errors or invalid config. Missing quota sources are warnings because a freshly installed app may simply need setup.

`--json` prints a machine-readable report that excludes account identifiers, raw source references, and raw content, and redacts local paths. The plain text report is meant for local troubleshooting and can include local filesystem paths.

See [docs/diagnostics.md](docs/diagnostics.md) for what to share in public issues.

## CLI Export

Export normalized quota data without opening the dashboard:

```bash
node dist/index.js export
node dist/index.js export --csv
node dist/index.js export --json --no-refresh
```

The export command refreshes local sources by default. Use `--no-refresh` to export only the latest data already stored in SQLite. JSON output includes snapshots and reset events; CSV output includes latest quota snapshots. Both formats exclude account identifiers and raw local source references.

## Local Data Paths

The app scans conservative default paths for supported agents. You can add explicit local scan roots without editing JSON by hand:

```bash
node dist/index.js config path list
node dist/index.js config path add codex "C:\path\to\codex-data"
node dist/index.js config path add claude-code "C:\path\to\claude-data"
node dist/index.js config path remove codex "C:\path\to\codex-data"
```

These commands write only the dashboard's own config file:

```text
~/.ai-agent-quota-dashboard/config.json
```

The Settings view shows the same config path, whether configured scan roots are readable, and copy buttons for the related commands. If the browser blocks clipboard access, the command is selected so it can be copied manually.

## Claude Code Statusline

Claude Code can send official `rate_limits` data to a local statusline command. This project provides a sink that stores only sanitized rate limit fields.

Build the local CLI first:

```bash
npm run build
```

Preview the setup without changing Claude settings:

```bash
node dist/index.js setup claude-statusline
```

Install the generated statusline command into `~/.claude/settings.json`:

```bash
node dist/index.js setup claude-statusline --write
```

If a `statusLine` already exists, the command refuses to replace it unless you add `--force`.

The Settings view shows the same setup state and copyable commands. It is read-only: it does not modify Claude Code configuration from the browser.

## Architecture

```text
src/
  adapters/   provider-specific discovery and parsing
  core/       quota models, confidence, state, forecast primitives
  storage/    SQLite persistence
  server/     localhost API and static file serving
web/          dashboard UI
docs/         architecture, privacy, roadmap
```

The UI never reads local files directly. Adapters read allowed local sources, normalize them into `QuotaSnapshot` and `UsageEvent`, and the API serves only normalized data.

See [docs/data-sources.md](docs/data-sources.md) for the current parser trust boundaries.

## Source Confidence

Source priority:

```text
official_api / official_cli
> official_statusline
> local_quota_snapshot
> local_usage_log
> estimated
> manual
> unavailable
```

The product should be conservative: estimated data must be labeled as estimated, stale data must be labeled as stale, observed timestamps must be visible, and unknown data must not be presented as precise.

## Reset Events

Some agents, especially Codex, can change their reported reset anchor because of banked resets, shared agentic usage pools, credits, promotions, or backend limit updates. The dashboard treats `resetAt` as an observed value, not a prediction, and shows both relative and absolute reported reset times.

When a reset time changes or remaining quota jumps back near full, the app records a reset event and shows it in the Recent Changes panel.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) before adding an adapter or parser. Parser changes must include sanitized fixtures and tests.

Security and privacy-sensitive reports should follow [SECURITY.md](SECURITY.md). Do not paste prompts, responses, source code, credentials, cookies, session IDs, transcript paths, workspace paths, or full raw logs into public issues.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
