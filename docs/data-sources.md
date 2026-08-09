# Data Sources

The project should only parse data that is explicit, local or official, and narrow enough to avoid prompts, responses, source code, and chat content.

## Claude Code

Claude Code statusline input is an official structured source. Anthropic documents a `rate_limits` object with `five_hour` and `seven_day` windows. Each window includes a used percentage and reset timestamp.

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
src/adapters/codex/__fixtures__/usage-limits-nested.json
```

Current boundary:

- Parse only explicit `quota_snapshot`, `quotaSnapshot`, `usage_limits`, or equivalent structured records.
- Do not parse arbitrary Codex transcript text.
- Do not infer quota from prompts, responses, or unrelated session messages.
- Default source is `local_quota_snapshot` unless the record explicitly identifies a stronger source.

This keeps Codex support honest until a stable official or local visible schema is confirmed.

## Reset Event Detection

Reset events are created when a new `QuotaSnapshot` differs materially from the previous snapshot for the same provider, agent, and window.

Current rules:

- `reset_anchor_changed`: previous and new `resetAt` differ by more than five minutes.
- `quota_replenished`: remaining percentage jumps by at least 20 points and the new remaining percentage is at least 95%.
- `demo` and `unavailable` snapshots do not create reset events.

These events explain what changed. They are not predictions.
