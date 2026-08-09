# Architecture

The v0.1 architecture is intentionally small:

```text
Local Agent Scanner
  -> Provider Adapters
  -> Normalizer
  -> SQLite Snapshot Store
  -> Local API
  -> Web Dashboard / Desktop Mini Surfaces
```

## Boundaries

- `adapters/` discover and parse one provider's local or official sources.
- `core/` owns product concepts such as quota windows, confidence, staleness, and forecast primitives.
- `storage/` persists normalized snapshots and events.
- `server/` exposes localhost-only JSON APIs and serves static dashboard files.
- `web/` renders the dashboard from API responses only.
- `desktop/` starts the same local backend and hosts tray/widget windows.

## Data Flow

1. An adapter scans allowed local paths or official outputs.
2. It emits normalized `QuotaSnapshot`, `UsageEvent`, and `DoctorCheck` records.
3. SQLite stores aggregate snapshots and events.
4. Reset event detection compares a new snapshot with the previous snapshot for the same provider, agent, and window.
5. The dashboard and mini surfaces read `/api/agents`, `/api/quota`, `/api/doctor`, `/api/reset-events`, and `/api/setup/claude-statusline`.

Candidate file scanning is deliberately narrow. Adapters look for small files whose names indicate quota, status, statusline, or limits data. Ordinary session transcripts are not parsed unless a later parser is backed by sanitized fixtures and a clear privacy review.

Reset times are treated as current observations. The product should say "currently reported reset" rather than claiming a reset is guaranteed to happen at that time.

Setup APIs are read-only unless exposed through an explicit CLI command. The browser UI may show commands and paths, but should not silently edit external tool configuration.

The desktop shell is presentation-only. It does not parse provider files directly; it starts the local service, loads static pages, exposes minimal window controls to those pages, and runs as a single tray instance.

## Adapter Contract

Adapters must not persist raw prompt, response, source code, or chat content.

An adapter may return no snapshots. That is a valid result when reliable quota data is unavailable.

## v0.1 Agents

- Codex: weekly quota first
- Claude Code: 5-hour and weekly statusline quota first

Additional agents should be added only when their data can be obtained legally, reliably, and transparently.
