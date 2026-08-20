# Data Sources

The project should only parse data that is explicit, local or official, and narrow enough to avoid prompts, responses, source code, and chat content.

Every source below depends on a local file or CLI output written by a desktop app or CLI (Codex CLI, Claude Code CLI, Claude Desktop). None of them can see usage for an account that only uses a browser-based product (claude.ai or chatgpt.com in a plain web browser, with no desktop app or CLI installed) — there is no local file for AIQD to read in that case.

## Local Path Configuration

Users can add explicit scan roots with:

```bash
node dist/index.js config path add codex "C:\path\to\codex-data"
node dist/index.js config path add claude-code "C:\path\to\claude-data"
node dist/index.js config path add claude-desktop "C:\path\to\plan-usage-history.json"
node dist/index.js config path remove codex "C:\path\to\codex-data"
```

These paths are stored in:

```text
~/.ai-agent-quota-dashboard/config.json
```

Configured paths do not relax parser boundaries. Adapters still scan only narrow candidate filenames and parse only supported structured quota/statusline records.

## Claude Desktop Plan Usage History

Status: implemented. Claude Desktop users do not need to open Claude Code CLI to make AIQD useful; this source is an alternative to Claude Code statusline, not a fallback ranked below it.

On Windows, Claude Desktop maintains:

```text
%APPDATA%\Claude\plan-usage-history.json
```

The file shape is a versioned document with `samples`: `{ "version": 2, "samples": [{ "t": <epoch_ms>, "org": "<org-id>", "u": { "fh": <0-100>, "sd": <0-100> } }] }`. `u.fh` and `u.sd` correspond to five-hour and seven-day (weekly) used percentages shown in Claude's Usage settings. AIQD uses only the most recent sample.

Parser:

```text
src/adapters/claude-desktop/parse-plan-usage-history.ts
```

Fixtures:

```text
src/adapters/claude-desktop/__fixtures__/plan-usage-history-sample.json
src/adapters/claude-desktop/__fixtures__/plan-usage-history-empty.json
```

Mapping:

- `u.fh` -> `session_5h`, `u.sd` -> `weekly`
- `t` (epoch ms) -> `observedAt`
- source -> `local_quota_snapshot`, confidence -> `high`
- `expiresAt` -> `observedAt` plus a fixed max-age window (a local freshness deadline only; no reset time is available in the file)

Implementation boundary:

- Parse only usage percentages and observation timestamps.
- Convert used percentages into remaining percentages for AIQD cards.
- Label the source as local Claude Desktop plan usage history, not as an official API.
- Treat reset timing as unknown; this source never reports a reset time, and `expiresAt` must not be shown as quota reset timing.
- Do not scrape the desktop UI.
- Do not import cookies, session tokens, or browser storage.
- Do not call hidden Claude endpoints.
- Do not read prompts, responses, attachments, transcript paths, or source code.

## Claude Code

Claude Code statusline input is an official structured source. Anthropic documents a `rate_limits` object with `five_hour` and `seven_day` windows. Each window includes a used percentage and reset timestamp.

Claude Code statusline and Claude Desktop plan usage history are both implemented and are treated as alternatives: AIQD's real-data readiness check for the `anthropic` provider passes when either source has a fresh, non-demo snapshot, so Claude Code CLI is not required if Claude Desktop is available.

Source: https://docs.anthropic.com/en/docs/claude-code/statusline

Parser:

```text
src/adapters/claude-code/parse-statusline.ts
```

Fixtures:

```text
src/adapters/claude-code/__fixtures__/statusline-rate-limits.json
src/adapters/claude-code/__fixtures__/statusline-without-rate-limits.json
```

Mapping:

- `rate_limits.five_hour` -> `session_5h`
- `rate_limits.seven_day` -> `weekly`
- `used_percentage` -> `usedPercent`
- `resets_at` -> `resetAt`
- `expiresAt` -> the earlier of `resets_at` and five hours after `observedAt`
- source -> `official_statusline`
- confidence -> `official`

Setup helper:

```bash
node dist/index.js setup claude-statusline
node dist/index.js setup claude-statusline --write
```

The statusline sink stores sanitized records in:

```text
~/.ai-agent-quota-dashboard/claude-code/claude-code-statusline-latest.json
~/.ai-agent-quota-dashboard/claude-code/claude-code-statusline-history.jsonl
```

Only `rate_limits` fields are persisted. Session IDs, transcript paths, workspace paths, prompts, responses, and source code are not copied into these files.

The dashboard treats the latest statusline snapshot as fresh for real-time setup checks only when it was observed recently. Older snapshots are still useful diagnostics, but they are labeled as needing attention because the 5-hour Claude Code window may have moved on.

## Codex

OpenAI documents that remaining Codex limits can be checked during an active CLI session with `/status`, and that usage can be monitored through the dashboard/settings surfaces. Public docs do not define a stable machine-readable local schema for this dashboard yet.

Sources:

- https://developers.openai.com/codex/pricing
- https://help.openai.com/en/articles/20001106-codex-rate-card

Parser:

```text
src/adapters/codex/parse-quota-snapshot.ts
```

Fixtures:

```text
src/adapters/codex/__fixtures__/quota-snapshot.jsonl
src/adapters/codex/__fixtures__/session-rate-limits.jsonl
src/adapters/codex/__fixtures__/usage-limits-nested.json
```

Current boundary:

- Parse explicit `quota_snapshot`, `quotaSnapshot`, `usage_limits`, local Codex CLI `rate_limits`, and Codex app-server `rateLimits` / `rateLimitsByLimitId` structured records.
- AIQD scans recent local Codex `rollout-*.jsonl` session logs by tailing bounded bytes and extracting only supported `rate_limits` fields.
- The Codex adapter exposes only its supported visible windows, currently `session_5h` and `weekly`; unsupported monthly or billing-cycle buckets are hidden from agent summaries, exports, and reset timelines until a reliable user-visible Codex source confirms them.
- Users can write a structured manual fallback from a visible `/status` or Codex Settings > Usage value with `node dist/index.js codex snapshot --remaining-percent <0-100> --reset-at <iso-time>` or the Settings view form.
- The manual fallback snapshot is stored at `~/.ai-agent-quota-dashboard/codex/codex-quota-snapshot.json`.
- Manual fallback snapshots use source -> `manual`, confidence -> `unknown`, and expire at the reported reset time.
- The dashboard exposes fallback setup status at `GET /api/setup/codex-snapshot`.
- `POST /api/setup/codex-snapshot` accepts explicit visible quota fields and writes only this app-owned fallback path.
- Do not parse arbitrary Codex transcript text.
- Do not infer quota from prompts, responses, or unrelated session messages.
- Default source is `local_quota_snapshot` unless the record explicitly identifies a stronger source.

This keeps Codex support automatic where structured local data exists, and honest where it does not.

## Reset Event Detection

Reset events are created when a new `QuotaSnapshot` differs materially from the previous snapshot for the same provider, agent, and window.

Current rules:

- `reset_anchor_changed`: previous and new `resetAt` differ by more than five minutes.
- `quota_replenished`: remaining percentage jumps by at least 20 points and the new remaining percentage is at least 95%.
- `demo` and `unavailable` snapshots do not create reset events.

These events explain what changed. They are not predictions.
