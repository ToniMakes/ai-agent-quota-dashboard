# Compatibility and Data-Quality Notes

AIQD is a local preview application. Provider desktop apps and CLIs can change
their local file formats without notice, so a successful scan means that AIQD
recognized a supported local shape at the time of the scan; it is not a
guarantee that the provider's account quota is complete or real-time.

## Supported preview sources

| Source | Local input | Reset timing | Confidence |
| --- | --- | --- | --- |
| Codex CLI | Structured local `rate_limits` events | Reported by Codex when present | Official CLI |
| Codex fallback | User-entered visible values | User-reported | Manual |
| Claude Code | Official statusline `rate_limits` payload | Reported by Claude Code | Official statusline |
| Claude Desktop | Local `plan-usage-history.json` | Inferred from sample time and window length | High, local snapshot |

AIQD currently displays the supported Codex 5-hour and weekly windows and the
Claude 5-hour and weekly windows when those records are present. Unsupported or
ambiguous buckets are omitted rather than guessed.

## Data-quality behavior

- Missing, malformed, stale, or unsupported data is shown as unavailable or
  needing refresh.
- Local file scans enforce depth, file-count, and file-size limits.
- Data is read-only with respect to provider logs, except for the explicitly
  user-requested Claude Code statusline connection setup and AIQD's own manual
  fallback/configuration files.
- Reset times reported by a provider are kept distinct from AIQD's local
  freshness deadline.
- Exported data is sanitized to omit account identifiers and raw source paths.

When reporting a provider compatibility issue, include the provider version,
AIQD version, source type, and a sanitized `doctor --json` report. Do not attach
raw logs, credentials, prompts, responses, or workspace paths.
