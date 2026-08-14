# Release Checklist

Use this checklist before tagging a release.

## Per-Change Checklist (before merging any feature, not just before release)

Docs drift silently: `docs/status.md`, `README.md`, and `docs/data-sources.md` have previously described a source as "planned" for a full session after it shipped, because nothing prompted an update until the pre-release pass below. Do this check as part of the change itself, not the release:

- [ ] If this change adds/changes a data source, adapter, or readiness rule: `docs/data-sources.md` and `docs/architecture.md` describe the current behavior, not the pre-change one
- [ ] If this change is the thing a roadmap/status entry was waiting on: that entry is updated to reflect it shipped, in the same commit or PR
- [x] `CHANGELOG.md`'s `[Unreleased]` section has an entry

## Required

- [x] `docs/code-signing.md` is current and linked from the README/docs index
- [ ] For the formal Windows release: the installer is signed, or maintainers have explicitly approved an unsigned formal preview with prominent warnings
- [x] `npm test` passes locally
- [x] `npm run desktop:smoke` passes locally
- [x] `npm run desktop:first-run-smoke` passes locally and uses isolated provider data paths
- [x] `npm run package:win:dir` passes locally
- [x] Packaged exe smoke passes: `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke`
- [x] Packaged first-run smoke passes: `& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke-first-run-guide`
- [x] `npm run package:win` produces `release/AI Agent Quota Dashboard-0.1.0-win-x64.exe`
- [x] `npm run trial:preflight` gives source-specific next actions or reports ready
- [x] `npm run trial:ready` passes for a real-data dogfood build, or the release notes clearly say which source still needs setup
- [x] Packaged desktop installer or release artifact exists for the first public preview
- [ ] Installed app entry opens the main dashboard window
- [ ] Normal-user first run can reach Settings without typing `npm`, `node`, or PowerShell commands
- [x] Claude Desktop local plan usage adapter is implemented, tested, and clearly labeled for desktop-only users, as an alternative to Claude Code CLI
- [x] Claude setup offers an explicit install action when Claude Code CLI is missing and a separate connect action for local quota capture
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` has a release entry
- [x] README describes current capabilities accurately
- [x] README explains the installer path for normal users and labels source mode as a developer fallback
- [x] Release notes say whether the Windows installer is signed or unsigned
- [x] `docs/status.md` and `docs/roadmap.md` describe the current milestone accurately
- [x] Parser changes include sanitized fixtures, or no parser changes were made
- [x] `docs/data-sources.md` documents source and confidence mapping
- [x] UI copy labels estimates and reported reset times conservatively
- [ ] Bilingual UI copy still fits the main dashboard and mini surfaces
- [ ] Desktop tray, main window, and shortcut use the intended app icon
- [x] No unintended generated files, local databases, raw logs, prompts, responses, source code, or credentials are staged

## First Preview Work Plan

1. Prepare SignPath application materials: code signing policy, privacy link, public repository metadata, and a clearly labeled unsigned RC/download artifact if needed.
2. Verify deterministic validation: desktop smoke data paths are isolated and any first-run smoke assertion failure returns a non-zero process exit.
3. Verify the local test gate: `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, packaged smoke checks, and `git diff --check`.
4. Build the packaged desktop artifact and verify the installed entry opens the main dashboard.
5. Claude Desktop local plan usage history ingestion is implemented; verify it end-to-end on the installed packaged app for desktop-only users.
6. Run a fresh-machine real-data trial from installer through Codex, Claude Desktop, and Claude Code readiness.
7. Run a clean-clone developer fallback trial.
8. Tighten beginner onboarding copy for Windows, macOS, and Linux, especially the visible next action, expected result, and recovery path.
9. Capture release screenshots or short GIFs for Dashboard, tray mini panel, widget, and setup flow.
10. Confirm README and release notes describe the installer path first and source mode as a developer fallback.
11. If SignPath approval is available, run `.github/workflows/package-windows.yml` with signing enabled and verify the signed artifact.
12. Update release notes from `CHANGELOG.md`, complete this checklist, verify CI on `main`, tag the preview, and create the GitHub Release.

## SignPath Release Path

- [x] GitHub repository is public, MIT-licensed, documented, and has a visible download/release page
- [ ] GitHub account MFA is enabled for maintainers with repository or SignPath access
- [x] Code signing roles in `docs/code-signing.md` match the actual maintainers
- [x] A clearly labeled unsigned RC/pre-release exists if SignPath needs a downloadable release artifact before approval
- [x] SignPath Foundation OSS application submitted
- [ ] SignPath Foundation OSS application approved
- [ ] SignPath project, signing policy, and default artifact configuration are configured for the NSIS installer
- [ ] GitHub secret `SIGNPATH_API_TOKEN` is configured
- [ ] GitHub variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, and `SIGNPATH_SIGNING_POLICY_SLUG` are configured
- [x] `.github/workflows/package-windows.yml` produces the unsigned installer artifact
- [ ] `.github/workflows/package-windows.yml` submits the artifact to SignPath and downloads the signed installer
- [ ] `Get-AuthenticodeSignature` reports `Valid` for the final installer
- [ ] GitHub Release uploads the signed installer for the formal release, or explicitly documents an approved unsigned fallback

## Maintainer Installed-App Trial

- [x] Silent NSIS installer run exits `0`
- [x] Desktop shortcut points to the installed packaged executable
- [x] Start menu shortcut points to the installed packaged executable
- [x] Desktop shortcut launches the installed packaged app, not source mode
- [x] Installed backend serves on `127.0.0.1:4317`
- [x] Installed `/api/trial-readiness` reports Codex and Claude Code ready from real local data
- [x] Installed dashboard browser smoke shows Codex and Claude Code quota cards
- [x] Installed mini panel browser smoke shows compact secondary-window rows
- [x] True clean Windows user or VM trial protocol is documented in `docs/real-data-trial.md`
- [ ] True clean Windows user or VM trial without pre-existing AIQD, Codex, or Claude Code state

## Installer Releases

- [x] Installer startup option is explicit and defaults to off for the first packaged release
- [x] Settings includes a reversible `Launch at startup` toggle
- [ ] Settings includes automatic refresh interval presets and explains that actual observed times depend on provider data updates
- [ ] Settings includes a safe `Restore default settings` action for AIQD-owned preferences only
- [ ] Any destructive reset, local history deletion, or external Claude/Codex disconnect action is separate from restore defaults and requires explicit confirmation
- [x] Startup launches only the tray shell and local backend unless setup or recovery needs attention
- [x] Disabling startup removes AIQD's OS startup entry
- [x] Uninstall or app removal does not leave an orphaned startup entry
- [x] Startup behavior preserves the same local-first privacy boundary as manual launch

## Optional

- [ ] Browser smoke test of the local dashboard
- [ ] Fresh clone / fresh machine real-data trial
- [x] GitHub release notes drafted from `CHANGELOG.md`
- [x] Screenshots refreshed when the UI changes materially

## Tagging

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

For the signed release path, run the Windows package workflow from the tag or release commit after SignPath approval, then upload the verified signed installer artifact to the GitHub Release.
