# Release Checklist

Use this checklist before tagging a release.

## Required

- [ ] `npm test` passes locally
- [ ] `npm run desktop:smoke` passes locally
- [ ] `npm run desktop:first-run-smoke` passes locally and uses isolated provider data paths
- [ ] `npm run package:win:dir` passes locally
- [ ] Packaged exe smoke passes: `.\release\win-unpacked\AI Agent Quota Dashboard.exe --smoke`
- [ ] Packaged first-run smoke passes: `.\release\win-unpacked\AI Agent Quota Dashboard.exe --smoke-first-run-guide`
- [ ] `npm run package:win` produces `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`
- [ ] `npm run trial:preflight` gives source-specific next actions or reports ready
- [ ] `npm run trial:ready` passes for a real-data dogfood build, or the release notes clearly say which source still needs setup
- [ ] Packaged desktop installer or release artifact exists for the first public preview
- [ ] Installed app entry opens the main dashboard window
- [ ] Normal-user first run can reach Settings without typing `npm`, `node`, or PowerShell commands
- [ ] Claude setup offers an explicit install action when Claude Code CLI is missing and a separate connect action for local quota capture
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` has a release entry
- [ ] README describes current capabilities accurately
- [ ] README explains the installer path for normal users and labels source mode as a developer fallback
- [ ] Release notes say whether the Windows installer is unsigned
- [ ] `docs/status.md` and `docs/roadmap.md` describe the current milestone accurately
- [ ] Parser changes include sanitized fixtures
- [ ] `docs/data-sources.md` documents source and confidence mapping
- [ ] UI copy labels estimates and reported reset times conservatively
- [ ] Bilingual UI copy still fits the main dashboard and mini surfaces
- [ ] Desktop tray, main window, and shortcut use the intended app icon
- [ ] No unintended generated files, local databases, raw logs, prompts, responses, source code, or credentials are staged

## First Preview Work Plan

1. Verify deterministic validation: desktop smoke data paths are isolated and any first-run smoke assertion failure returns a non-zero process exit.
2. Verify the local test gate: `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, packaged smoke checks, and `git diff --check`.
3. Build the packaged desktop artifact and verify the installed entry opens the main dashboard.
4. Run a fresh-machine real-data trial from installer through Codex and Claude Code readiness.
5. Run a clean-clone developer fallback trial.
6. Tighten beginner onboarding copy for Windows, macOS, and Linux, especially the visible next action, expected result, and recovery path.
7. Capture release screenshots or short GIFs for Dashboard, tray mini panel, widget, and setup flow.
8. Confirm README and release notes describe the installer path first and source mode as a developer fallback.
9. Update release notes from `CHANGELOG.md`, complete this checklist, verify CI on `main`, and tag the preview.

## Installer Releases

- [ ] Installer startup option is explicit and defaults to off for the first packaged release
- [ ] Settings includes a reversible `Launch at startup` toggle
- [ ] Settings includes automatic refresh interval presets and explains that actual observed times depend on provider data updates
- [ ] Settings includes a safe `Restore default settings` action for AIQD-owned preferences only
- [ ] Any destructive reset, local history deletion, or external Claude/Codex disconnect action is separate from restore defaults and requires explicit confirmation
- [ ] Startup launches only the tray shell and local backend unless setup or recovery needs attention
- [ ] Disabling startup removes AIQD's OS startup entry
- [ ] Uninstall or app removal does not leave an orphaned startup entry
- [ ] Startup behavior preserves the same local-first privacy boundary as manual launch

## Optional

- [ ] Browser smoke test of the local dashboard
- [ ] Fresh clone / fresh machine real-data trial
- [ ] GitHub release notes drafted from `CHANGELOG.md`
- [ ] Screenshots refreshed when the UI changes materially

## Tagging

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```
