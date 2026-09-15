# Project Status

Last updated: 2026-09-16

AI Agent Quota Dashboard is in the v0.1.0 desktop-preview stage. The first public Windows x64 preview is published as an installer-first release for normal users, with source mode retained as a developer fallback.

## Current Capability

- Local Node.js service bound to `127.0.0.1`
- SQLite persistence for normalized quota snapshots, reset events, and refresh runs
- Codex quota detection from local CLI `rate_limits` events; the packaged Settings flow is automatic-only and directs users to use Codex once, then refresh
- Codex reset-credit detection from structured local app-server records and trusted Codex usage-limit tool results, with read-only dashboard details, mini-panel summary, and optional in-app expiry reminders
- Codex reset-credit reminders support both preset intervals and a custom 1–30 day interval
- Local HTTP responses include a restrictive Content Security Policy and standard browser hardening headers
- Concurrent refresh requests are coalesced, and unexpected HTTP errors return a generic production-safe message
- Local candidate discovery keeps memory bounded when provider files grow during a scan and handles global filename patterns safely
- Open-source maintenance now includes pinned GitHub Actions, production dependency auditing, and SBOM artifacts
- Versioned releases now use a tag-only Windows workflow that validates `package.json`, generates installer checksums, and publishes release assets
- Packaged desktop builds can show a real Windows notification through the Electron bridge, with a Settings test action; scheduled reminder delivery remains future work
- Subscription-tier labels in the main agent card header when local data exposes a reliable tier, including Codex `planType` and Claude local credentials `subscriptionType`
- Codex display/export surfaces hide unsupported monthly buckets and expose only the adapter-supported 5-hour and weekly windows
- Claude Code quota ingestion from official statusline `rate_limits`
- Claude Desktop quota ingestion from local `plan-usage-history.json`, an alternative to Claude Code so the CLI is not required
- Real-data readiness passes the `anthropic` provider group when either Claude Code or Claude Desktop is fresh
- Beginner Claude setup flow with explicit install and connect actions
- Dashboard, Diagnostics, Settings, reset timeline, refresh history, and local export views
- Strict real-data readiness checks shared by CLI, Settings, tray, and mini surfaces
- Electron desktop shell with tray mini panel, always-on-top widget, safe AIQD-only shortcuts, and first-run deep links
- Dashboard and mini quota cards hide duplicate primary-window rows while keeping extra windows, such as Claude Code's 5-hour quota, visible as progress rows
- Mini quota cards show reported reset timing instead of exposing source labels in the compact surface; local freshness deadlines are used for stale checks, not visible reset timing
- Windows NSIS installer build via `electron-builder`
- Packaged desktop runtime starts the local backend through Electron's bundled Node runtime
- Packaged desktop launches tolerate disconnected GUI stdout/stderr pipes instead of crashing with `EPIPE`
- Opt-in packaged launch-at-login, with installer checkbox off by default and a reversible Settings toggle
- Shared app icon assets for the tray, main window, and desktop shortcut
- Collapsible first-run Settings details controlled by the Codex and Claude setup buttons
- English-by-default UI with Chinese/English support in the main dashboard and mini surfaces
- Source confidence, freshness, and reported-reset labels
- JSON/CSV export with private identifiers and raw source references excluded
- GitHub Actions CI on Windows and Ubuntu with Node 24

## Current Trust Boundary

AIQD only uses official or local user-visible quota sources. It does not read browser cookies, simulate login, call hidden APIs, upload prompts/responses/source code, or automate account switching. If a reliable source is unavailable, the UI should say `unavailable` or use an explicitly labeled manual fallback.

The preferred Windows signing path remains SignPath Foundation open-source signing. SignPath review is still pending, so the maintainer explicitly approved publishing v0.1.0 as an unsigned desktop preview on 2026-09-16 with prominent warning copy and a SHA256 in the GitHub Release.

## Latest Local Verification

The current maintainer checkout has passed:

- `npm test`
- `node --check web/app.js`
- `node --check web/mini.js`
- `git diff --check`
- `npm run desktop:smoke`
- `npm run desktop:first-run-smoke`
- `npm run package:win:dir`
- `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke`
- `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke-first-run-guide`
- `npm run package:win`
- `npm run trial:preflight`
- `npm run trial:ready`
- Browser interaction smoke for the collapsible first-run setup buttons
- Browser interaction smoke for the decluttered dashboard and mini quota-window layouts
- Browser/API smoke against demo mode for `/`, `/mini.html`, `/api/health`, `/api/agents`, `/api/trial-readiness`, and `/api/export?format=json`
- Maintainer-profile installer trial: silent NSIS install exited `0`, desktop and Start menu shortcuts target the installed packaged executable, the desktop shortcut opens the installed app backend on `127.0.0.1:4317`, `/api/trial-readiness` reports `ok: true`, and browser smoke passes for the installed dashboard and mini panel
- Maintainer-profile desktop and Start menu entries were refreshed to the latest installed packaged executable after the v0.1.0 build
- Maintainer-profile desktop and Start menu entries were refreshed again on 2026-08-21 after the Codex monthly-window hiding and desktop `EPIPE` fix; a hidden-window installed-app smoke exited `0`
- Clean-copy trial from an isolated temporary checkout: `npm ci`, `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, `npm run trial:preflight`, `npm run trial:ready`, and browser/API smoke
- 2026-08-26 internal-quality pass (dashboard/mini-panel dedup into `web/shared.js`, Claude CLI environment and provider-manifest extraction): `npm run typecheck`, `npm test` (173 tests), and `npm run desktop:smoke`
- 2026-09-15 Codex dashboard and reminder UX pass: `npm test` (195 tests), `node --check web/app.js`, `node --check web/mini.js`, and `git diff --check`; dashboard and mini surfaces now prefer the supported 5-hour quota window and support custom reset-credit reminder intervals from 1 to 30 days
- 2026-09-16 release-hardening pass: enabled Electron ASAR packaging, added local HTTP security headers, coalesced concurrent refreshes, and sanitized unexpected HTTP 500 responses; `npm test`, desktop smoke, packaged smoke, `npm run package:win:dir`, and `npm run package:win` completed successfully.
- 2026-09-16 P1 product-quality pass: added bounded local-file scan coverage, provider compatibility/data-quality documentation, and edge-case tests for oversized files and global filename patterns.
- 2026-09-16 P1 open-source engineering pass: added action SHA pinning, dynamic packaging version resolution, CI production audit/SBOM generation, and dependency supply-chain documentation. Automated Dependabot and CODEOWNERS configuration was removed after causing excessive review notifications.
- 2026-09-16 desktop UX pass: removed manual Codex entry from packaged Settings, added realistic native notification test copy, and aligned desktop action rows using runtime measurement
- 2026-09-16 v0.1.0 unsigned Windows preview was published from tag `v0.1.0`; the release workflow passed tests, desktop smoke, installer packaging, packaged smoke, signature-state validation, and asset upload. The published installer SHA256 is `B50901B8AF4F9A07CAF9085143B229E3FC3FE76D63F3F600F1CDE6290DD5721C`.
- GitHub Actions CI on `main`
- Tag-driven Windows release automation now validates package version, creates
  installer SHA256 files, and publishes the installer plus checksum as release
  assets.

## Latest Clean Trial Notes

The current maintainer checkout can build, test, launch desktop smoke checks, build the unsigned Windows x64 NSIS artifact, and pass real-data strict readiness against the maintainer machine's Codex and Claude Desktop data.

The latest local readiness run reports Codex ready from `official_cli`, Claude Desktop ready from local `plan-usage-history.json`, and Claude Code as stale because its last statusline observation is old. This is acceptable for the current readiness rule because Claude Code and Claude Desktop are alternatives for the `anthropic` provider group.

The beginner real-data trial docs now call out expected command results, Windows PowerShell `npm.cmd` fallbacks, Codex automatic-versus-manual detection, and Claude Code stale-snapshot recovery.

Public demo screenshots were regenerated from the current dashboard, Diagnostics, Settings, mini panel, and widget surfaces under `docs/assets/screenshots`.

The first public preview distribution shape is installer-first desktop preview. The Windows x64 NSIS artifact is generated at `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`; `release/` is ignored and the artifact is published to the [v0.1.0 GitHub Release](https://github.com/ToniMakes/ai-agent-quota-dashboard/releases/tag/v0.1.0) rather than committed. The v0.1.0 artifact is intentionally unsigned while SignPath review is pending. `docs/release-notes-v0.1.0.md` is the release-notes source.

The latest installed-app trial used the maintainer's existing Windows profile and preserved existing AIQD, Codex, and Claude Code state. It validates the packaged installer and normal desktop entry path, but a true clean Windows user or VM first-run remains useful before broad distribution.

The clean Windows VM first-run protocol is now spelled out in [docs/real-data-trial.md](real-data-trial.md), including startup checkbox off/on passes, Settings startup toggle checks, uninstall cleanup, and fresh Codex, Claude Desktop, and Claude Code readiness. It still needs to be executed on an actual clean Windows profile or VM.

Clean Windows VM trial tracking issue: https://github.com/ToniMakes/ai-agent-quota-dashboard/issues/1

The published v0.1.0 installer artifact built on 2026-09-16 is unsigned while SignPath Foundation review is pending. Its SHA256 is `B50901B8AF4F9A07CAF9085143B229E3FC3FE76D63F3F600F1CDE6290DD5721C`.

## Current Product State

The app is suitable for local real-data use by early testers. Normal users should install the packaged desktop build and finish setup from Settings. Source checkout remains the developer fallback path.

Launch-at-login is implemented for packaged desktop builds and documented in [docs/distribution.md](distribution.md): startup is explicit, reversible, off by default, and uses a background tray launch instead of opening the full dashboard unless setup or recovery needs attention.

## P0 Release Gate (resolved)

Claude Desktop-only coverage was the highest product priority before broad public release, because most normal Claude users may rely on Claude Desktop or claude.ai instead of Claude Code CLI. This is now implemented: AIQD reads the local `%APPDATA%\Claude\plan-usage-history.json` file as an independent `claude-desktop` adapter, and Claude readiness passes from either Claude Code statusline or Claude Desktop.

## Next Focus

1. Optional post-release work: run the documented clean Windows profile or VM trial if broader distribution confidence is needed.
2. After SignPath approval, configure GitHub secrets/variables and publish a separate signed follow-up release; do not silently replace the unsigned v0.1.0 asset.
