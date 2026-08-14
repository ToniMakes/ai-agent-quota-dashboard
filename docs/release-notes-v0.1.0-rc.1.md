# v0.1.0-rc.1 Desktop Preview Candidate

This is an unsigned release candidate for AI Agent Quota Dashboard v0.1.0. It is published for maintainer testing, clean Windows trial validation, and SignPath Foundation open-source signing review.

This is not the preferred formal public installer. The formal `v0.1.0` release should use a signed Windows installer if SignPath approval is complete.

## Download

Windows x64 installer asset:

```text
AI Agent Quota Dashboard-0.1.0-win-x64.exe
```

## Signature Status

This RC installer is unsigned. Windows SmartScreen may warn because the artifact has not yet been signed or built reputation.

Code signing policy: [docs/code-signing.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md)

## What To Test

- Install AIQD from the Windows installer.
- Leave `Start AIQD when I sign in` unchecked for the first pass.
- Open AIQD from the desktop or Start menu shortcut.
- Finish Codex and Claude setup from Settings.
- Verify Codex plus either Claude Desktop or Claude Code readiness.
- Toggle Settings > Desktop Startup on and off.
- Uninstall and verify AIQD-owned startup entries are removed.

The full clean Windows trial protocol is in [docs/real-data-trial.md](https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/real-data-trial.md).

## Privacy Boundary

AIQD reads only narrow local quota-related files from Codex CLI, Claude Code CLI, and Claude Desktop. It does not read browser cookies, simulate login, call hidden APIs, upload prompts, upload responses, upload source code, or switch accounts to avoid limits.
