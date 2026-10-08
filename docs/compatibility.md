# Supported Sources and Data Quality

AIQD reads a limited set of local usage fields from supported provider apps and CLIs. These formats can change without notice. A successful check means AIQD recognized a supported local record; it does not guarantee that the provider's account data is complete or current.

## Sources in the current preview

| Tool | Local data AIQD reads | Reset time |
| --- | --- | --- |
| Codex CLI | Supported structured local rate-limit events | Shown when Codex reports one |
| Codex fallback | A quota value the user can verify and record in a developer workflow | User-reported |
| Claude Code | Rate-limit data sent through the local statusline receiver | Shown when Claude Code reports one |
| Claude Desktop | Supported local plan-usage history | Not reported by this source |

Claude Code and Claude Desktop are alternative sources for the Claude card. Both do not need to be installed or configured. AIQD does not monitor browser-only use of services such as `claude.ai` or `chatgpt.com`.

## How AIQD handles readings

- Each percentage is labeled as remaining or used, and is associated with its usage window when that information is available.
- A reset time is displayed only when the source provides one. AIQD does not invent a reset time for Claude Desktop.
- The last time AIQD checked a source is separate from the time that source last recorded usage.
- Missing, malformed, unsupported, or old readings are shown as unavailable or needing an update. A successful check can finish without finding a newer reading.
- Ambiguous usage windows are omitted rather than guessed.
- Local scans are bounded by depth, file count, and file size.
- Provider data is read-only except when the user starts the Claude Code connection setup. AIQD may also write its own local configuration and explicitly requested fallback data.
- Exports omit account identifiers and raw local source paths.

If a value is missing, first open the tool that produces the selected data source, let it record usage, and refresh AIQD. The **Connections** view explains the next action for each source.

## Report a compatibility issue

Include the provider app or CLI version, AIQD version, source type, and a sanitized `doctor --json` report. Review the report before sharing it. Do not attach raw logs, credentials, prompts, responses, account details, or workspace paths. See [Diagnostics](diagnostics.md) for more.
