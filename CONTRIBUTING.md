# Contributing

Thanks for helping make AI Agent Quota Dashboard more reliable.

This project is deliberately conservative. It is better to show `unavailable` than to present an unreliable or non-compliant estimate as truth.

## Development

```bash
npm install
npm test
npm run dev
```

The dashboard runs at:

```text
http://127.0.0.1:4317
```

## Parser Rules

Parser changes must include:

- A minimal sanitized fixture
- A parser test
- A documented source and confidence mapping
- A clear privacy note when the source may contain sensitive fields

Fixtures must not include:

- Prompts
- Responses
- Source code
- Credentials
- Browser cookies
- Session IDs
- Transcript paths
- Workspace paths
- Account identifiers

## Data Source Rules

Allowed sources include:

- Official APIs
- Official CLI/status outputs
- Official statusline inputs
- Explicit local quota snapshots
- Local usage logs, only when parsed without storing raw sensitive content
- Manual user input

Out of scope:

- Browser cookie import
- Simulated login
- Hidden/private APIs
- Rate-limit bypassing
- Automatic account switching
- Uploading prompts, responses, source code, or chat content

## Product Language

Be precise. Use words like "reported", "observed", "estimated", and "stale" when they apply.

Do not say a reset "will happen" unless the source guarantees that. Prefer "currently reports reset at...".
