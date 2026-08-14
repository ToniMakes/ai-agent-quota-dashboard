# v0.1.0-rc.3 Desktop Preview Candidate

This is an unsigned release candidate for AI Agent Quota Dashboard v0.1.0. It is published for tester validation of the tray mini panel timing copy after `v0.1.0-rc.2`.

This RC replaces `v0.1.0-rc.2` for tester installs.

## Download

Windows x64 installer asset:

```text
AI.Agent.Quota.Dashboard-0.1.0-win-x64.exe
```

Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.3

SHA256:

```text
1F8D300E6A30E54426A1751770EF77278C53D334C94BAB0F468B2A2F2C12BEAF
```

## Changes Since v0.1.0-rc.2

- Mini panel quota cards no longer show visible source labels such as `Official CLI` or `Local snapshot`.
- Mini panel quota cards now show reset timing when a real reset timestamp is available.
- Mini panel quota cards show expiry timing when a source only has a freshness expiry, such as Claude Desktop local usage history.
- Mini panel quota cards still show the last update time, but with simpler `updated` copy instead of `seen` / `observed` copy.

## Signature Status

This RC installer is unsigned. Windows SmartScreen may warn because the artifact has not yet been signed or built reputation.

Code signing policy: [docs/code-signing.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md)

## What To Test

- Install AIQD from the Windows installer.
- Open AIQD from the desktop or Start menu shortcut.
- Open the tray mini panel.
- Verify the mini panel card footer shows reset or expiry timing plus the update time.
- Verify source labels such as `Official CLI`, `Local snapshot`, or `seen` are not shown in the mini panel card footer.
- Recheck uninstall cleanup from `v0.1.0-rc.2`: `%APPDATA%\AI Agent Quota` should be removed after uninstall.
- Verify no AIQD-owned startup entry remains after uninstall.
- Verify Codex, Claude Desktop, and Claude Code provider-owned files are not deleted.

The full clean Windows trial protocol is in [docs/real-data-trial.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/real-data-trial.md).

## Privacy Boundary

AIQD reads only narrow local quota-related files from Codex CLI, Claude Code CLI, and Claude Desktop. It does not read browser cookies, simulate login, call hidden APIs, upload prompts, upload responses, upload source code, or switch accounts to avoid limits.
