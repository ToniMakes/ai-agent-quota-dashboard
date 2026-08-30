# Diagnostics

Use the Doctor CLI when the dashboard has no quota data, shows stale data, or behaves differently from what an agent reports.

For Claude Code, Doctor and Settings report the same statusline readiness checks: Claude settings, the managed shim, the latest sanitized snapshot, and whether supported `rate_limits` windows have been received recently.

Before opening Claude Code, you can run `node dist/index.js claude-statusline-sink --self-test` to verify the local sink with temporary files and fake `rate_limits`. The self-test does not read real Claude Code data and does not write to the normal statusline snapshot path.

## Human-Readable Report

```bash
npm run build
node dist/index.js doctor
```

The plain text report is for local troubleshooting. It can include local filesystem paths such as the SQLite store, config file, and inspected data paths.

## Shareable JSON Report

```bash
npm run build
node dist/index.js doctor --json
```

The JSON report is intended for bug reports and data-source issues. It excludes or redacts account identifiers, raw source references, raw local file content, and local filesystem paths — see [Privacy](privacy.md) for the full data boundary. It also includes per-snapshot freshness reasons, such as whether a snapshot is fresh, source-marked stale, or expired.

Always review the output before posting it publicly.

## Exit Codes

- `0`: the scan completed. Missing quota data may still be reported as a warning when setup is incomplete or no supported source exists.
- `1`: the scan found a blocking issue such as an adapter failure or unreadable/invalid config.

## What To Share In Issues

For most bugs, share:

- App version or commit SHA
- Operating system
- Steps to reproduce
- `doctor --json` output after reviewing it

For parser or data-source requests, share only sanitized fixture shapes. Do not paste full raw logs.
