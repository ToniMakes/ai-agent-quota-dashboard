# v0.1.0-rc.2 Desktop Preview Candidate

This is an unsigned release candidate for AI Agent Quota Dashboard v0.1.0. It is published for clean Windows trial validation and SignPath Foundation open-source signing review.

This RC replaces `v0.1.0-rc.1` for tester installs.

## Download

Windows x64 installer asset:

```text
AI.Agent.Quota.Dashboard-0.1.0-win-x64.exe
```

Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.2

SHA256:

```text
3F0BC6183A7A435E3181A006CEEF9BC21DF35AF1D607F639496AD014527C545B
```

## Changes Since v0.1.0-rc.1

- Fixed uninstall cleanup for the Electron app data directory reported by clean Windows testing.
- Runtime app data now uses the full product name, `AI Agent Quota Dashboard`.
- The uninstaller removes the old RC1 Electron data directory, `%APPDATA%\AI Agent Quota`, as well as the normal Electron app data handled by NSIS.

## Signature Status

This RC installer is unsigned. Windows SmartScreen may warn because the artifact has not yet been signed or built reputation.

Code signing policy: [docs/code-signing.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md)

## What To Test

- Install AIQD from the Windows installer.
- Open AIQD from the desktop or Start menu shortcut.
- Verify Settings opens without `npm`, `node`, or PowerShell.
- Toggle Settings > Desktop Startup on and off.
- Uninstall AIQD.
- Verify `%APPDATA%\AI Agent Quota` is removed after uninstall.
- Verify no AIQD-owned startup entry remains after uninstall.
- Verify Codex, Claude Desktop, and Claude Code provider-owned files are not deleted.

The full clean Windows trial protocol is in [docs/real-data-trial.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/real-data-trial.md).

## Privacy Boundary

AIQD reads only narrow local quota-related files from Codex CLI, Claude Code CLI, and Claude Desktop. It does not read browser cookies, simulate login, call hidden APIs, upload prompts, upload responses, upload source code, or switch accounts to avoid limits.
