# Diagnostics

Use the Doctor CLI when the dashboard has no quota data, shows stale data, or behaves differently from what an agent reports.

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

The JSON report is intended for bug reports and data-source issues. It excludes or redacts:

- Account identifiers
- Raw source references
- Raw local file content
- Local filesystem paths

Always review the output before posting it publicly. The report should not contain prompts, responses, source code, credentials, browser cookies, session IDs, transcript paths, workspace paths, or account identifiers.

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
