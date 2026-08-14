# v0.1.0-rc.4 Desktop Preview Candidate

This is an unsigned release candidate for AI Agent Quota Dashboard v0.1.0. It replaces `v0.1.0-rc.3` for tray mini panel timing-copy validation.

## Download

Windows x64 installer asset:

```text
AI.Agent.Quota.Dashboard-0.1.0-win-x64.exe
```

Release page: https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.4

SHA256:

```text
4FEE3E936DAD393C885257A0F8E5AEB58116F125045047935BDB9439FF40C347
```

## Changes Since v0.1.0-rc.3

- Removed the visible `expires` / `过期` copy from tray mini panel quota card footers.
- Mini panel timing now says `reset` / `重置` only when the source provides a real reset timestamp.
- When a source only provides a local freshness deadline, the mini panel now says `refresh` / `刷新` instead.
- The merged Claude mini card now shows timing for both the 5h and weekly windows in the compact detail line.
- When Claude Desktop has fresher usage percentages but Claude Code has fresh reset timestamps for the same window, the merged Claude card reuses those reset timestamps for display.

## Signature Status

This RC installer is unsigned. Windows SmartScreen may warn because the artifact has not yet been signed or built reputation.

Code signing policy: [docs/code-signing.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md)

## What To Test

- Install AIQD from the Windows installer.
- Open AIQD from the desktop or Start menu shortcut.
- Open the tray mini panel.
- Verify the Claude card shows both 5h and weekly timing.
- Verify real reset timestamps display as `重置`.
- Verify local freshness deadlines display as `刷新`, not `过期`.
- Re-run the uninstall cleanup check from RC2 using this latest installer.
- Verify no AIQD-owned startup entry remains after uninstall.
- Verify Codex, Claude Desktop, and Claude Code provider-owned files are not deleted.

The full clean Windows trial protocol is in [docs/real-data-trial.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/real-data-trial.md).

## Privacy Boundary

AIQD reads only narrow local quota-related files from Codex CLI, Claude Code CLI, and Claude Desktop. It does not read browser cookies, simulate login, call hidden APIs, upload prompts, upload responses, upload source code, or switch accounts to avoid limits.
