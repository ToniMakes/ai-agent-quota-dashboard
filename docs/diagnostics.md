# Troubleshooting and Diagnostic Reports

If a tool has no reading or its data looks old, open AIQD's **Connections** view first. It shows whether each selected local source is ready and what to do next. A refresh checks local sources; it cannot make a provider create a new usage record.

For example, open Codex and use it once before refreshing. For Claude Code, wait for a new statusline reading. For Claude Desktop, open the app so it records a recent usage sample. A Claude Desktop source may not report a reset time.

## Check from the command line

Developers can run the same local checks without opening the dashboard:

```bash
npm run build
node dist/index.js doctor
```

The plain-text report is intended for local troubleshooting and may include local file paths. Do not post it publicly without reviewing it.

## Prepare a report to share

```bash
npm run build
node dist/index.js doctor --json
```

The JSON report is designed for bug reports. It omits or redacts account identifiers, raw local file content, raw source references, and local filesystem paths. It includes freshness reasons for saved readings. Review it before sharing; do not attach raw logs, credentials, prompts, responses, or workspace paths.

The command exits with:

- `0` when the scan completes. Missing quota data can be a warning while a source is waiting for its first reading.
- `1` when a blocking issue prevents a valid scan, such as a source adapter failure or invalid configuration.

## What to include in an issue

Share the AIQD version, operating system, selected source type, steps to reproduce, and a reviewed `doctor --json` report. For parser or compatibility requests, share only sanitized example data shapes. Send security reports according to [SECURITY.md](../SECURITY.md), not in a public issue.
