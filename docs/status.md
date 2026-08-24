# Project Status

Last updated: 2026-08-25

AI Agent Quota Dashboard is in a v0.1 desktop-preview stage. The core MVP is no longer just a scaffold: the local dashboard, desktop tray shell, real-data setup flow, and strict trial readiness checks are implemented and passing CI. The first public preview target is now installer-first for normal users, with source mode retained as a developer fallback.

## Current Capability

- Local Node.js service bound to `127.0.0.1`
- SQLite persistence for normalized quota snapshots, reset events, and refresh runs
- Codex quota detection from local CLI `rate_limits` events, with a manual visible-status fallback
- Codex display/export surfaces hide unsupported monthly buckets and expose only the adapter-supported 5-hour and weekly windows
- Claude Code quota ingestion from official statusline `rate_limits`
- Claude Desktop quota ingestion from local `plan-usage-history.json`, an alternative to Claude Code so the CLI is not required
- Real-data readiness passes the `anthropic` provider group when either Claude Code or Claude Desktop is fresh
- Beginner Claude setup flow with explicit install and connect actions
- Dashboard, Doctor, Settings, reset timeline, refresh history, and local export views
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

The preferred Windows signing path remains SignPath Foundation open-source signing. SignPath review is still pending, so the maintainer explicitly approved publishing v0.1.0 as an unsigned desktop preview on 2026-08-25 with prominent warning copy and a SHA256 in the GitHub Release.

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
- Maintainer-profile desktop and Start menu entries were refreshed to the latest installed packaged executable after the `v0.1.0-rc.3` build
- Maintainer-profile desktop and Start menu entries were refreshed again on 2026-08-21 after the Codex monthly-window hiding and desktop `EPIPE` fix; a hidden-window installed-app smoke exited `0`
- Clean-copy trial from `.tmp/fresh-trial-v0.1.0-rc.1`: `npm ci`, `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, `npm run trial:preflight`, `npm run trial:ready`, and browser/API smoke
- GitHub Actions CI on `main`

## Latest Clean Trial Notes

The current maintainer checkout can build, test, launch desktop smoke checks, build the unsigned Windows x64 NSIS artifact, and pass real-data strict readiness against the maintainer machine's Codex and Claude Desktop data.

The latest local readiness run reports Codex ready from `official_cli`, Claude Desktop ready from local `plan-usage-history.json`, and Claude Code as stale because its last statusline observation is old. This is acceptable for the current readiness rule because Claude Code and Claude Desktop are alternatives for the `anthropic` provider group.

The beginner real-data trial docs now call out expected command results, Windows PowerShell `npm.cmd` fallbacks, Codex automatic-versus-manual detection, and Claude Code stale-snapshot recovery.

Demo release screenshots have been refreshed for the dashboard, Doctor, Settings setup flow with Claude Desktop, mini panel, and widget surfaces under `docs/assets/screenshots`.

The first public preview distribution shape is installer-first desktop preview. The Windows x64 NSIS artifact is generated at `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`; `release/` is ignored and the artifact should be uploaded to a GitHub Release rather than committed. The v0.1.0 artifact is intentionally unsigned while SignPath review is pending. `docs/release-notes-v0.1.0.md` is the GitHub Release text.

The unsigned `v0.1.0-rc.1` GitHub Pre-release has been created for clean-machine testing and SignPath Foundation review. A copy-paste application draft is available in [docs/signpath-application.md](signpath-application.md).

- Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.1
- Workflow run: https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/runs/31796488211
- Asset SHA256: `D938A30F4289EE676FD181AC804B5DE0F372EEF502706FFE43142B85F26A0F72`
- SignPath Foundation OSS application: submitted, awaiting review

The latest installed-app trial used the maintainer's existing Windows profile and preserved existing AIQD, Codex, and Claude Code state. It validates the packaged installer and normal desktop entry path, but a true clean Windows user or VM first-run remains useful before broad distribution.

The clean Windows VM first-run protocol is now spelled out in [docs/real-data-trial.md](real-data-trial.md), including startup checkbox off/on passes, Settings startup toggle checks, uninstall cleanup, and fresh Codex, Claude Desktop, and Claude Code readiness. It still needs to be executed on an actual clean Windows profile or VM.

Clean Windows VM trial tracking issue: https://github.com/isToniLiu/ai-agent-quota-dashboard/issues/1

Friend clean-Windows testing of `v0.1.0-rc.1` found leftover Electron app data at `%APPDATA%\AI Agent Quota` after uninstall. `v0.1.0-rc.2` was published to retest that uninstall cleanup:

- Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.2
- Workflow run: https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/runs/31805252401
- Asset SHA256: `3F0BC6183A7A435E3181A006CEEF9BC21DF35AF1D607F639496AD014527C545B`

The fix uses the full product name for Electron app data, enables NSIS app-data cleanup, and explicitly removes the old RC1 short-name app data directory during uninstall. This still needs a clean Windows uninstall retest against `v0.1.0-rc.2`.

`v0.1.0-rc.3` was prepared to retest the tray mini panel timing copy after tester feedback that source labels were less useful in the compact surface:

- Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.3
- Asset SHA256: `1F8D300E6A30E54426A1751770EF77278C53D334C94BAB0F468B2A2F2C12BEAF`

`v0.1.0-rc.4` replaces `v0.1.0-rc.3` for mini timing retest after feedback that the `expires` / `过期` wording was unclear and that Claude should expose both 5h and weekly timing:

- Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.4
- Asset SHA256: `4FEE3E936DAD393C885257A0F8E5AEB58116F125045047935BDB9439FF40C347`

The mini panel now shows `reset` / `重置` only for real reset timestamps, uses `refresh` / `刷新` for local freshness deadlines, and shows both 5h and weekly timing on the merged Claude card. The clean Windows uninstall retest remains relevant and should now use the latest RC installer.

`v0.1.0` is approved for an unsigned desktop preview because SignPath Foundation review is still pending after the application submitted on 2026-08-14. The final local installer artifact built on 2026-08-25 is unsigned (`Get-AuthenticodeSignature` reports `NotSigned`) and has SHA256 `7DDE28E8FE424268C752480889DBBEABFD5578D9D20D5EE77DAE117ADE867F6D`.

## Current Product State

The app is suitable for local real-data dogfooding by the maintainer and technically curious early testers. For the first public preview, normal users should install a packaged desktop build and finish setup from Settings. Source checkout remains the developer fallback path.

Launch-at-login is implemented for packaged desktop builds and documented in [docs/distribution.md](distribution.md): startup is explicit, reversible, off by default, and uses a background tray launch instead of opening the full dashboard unless setup or recovery needs attention.

## P0 Release Gate (resolved)

Claude Desktop-only coverage was the highest product priority before broad public release, because most normal Claude users may rely on Claude Desktop or claude.ai instead of Claude Code CLI. This is now implemented: AIQD reads the local `%APPDATA%\Claude\plan-usage-history.json` file as an independent `claude-desktop` adapter, and Claude readiness passes from either Claude Code statusline or Claude Desktop.

## Next Focus

1. Run final local release checks, package the unsigned v0.1.0 installer, compute SHA256, and publish the GitHub Release.
2. After SignPath approval, configure GitHub secrets/variables and rerun the Windows package workflow with signing enabled for a follow-up signed release.
