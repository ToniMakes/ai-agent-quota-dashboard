# Release Checklist

Use this checklist before tagging a release.

## Required

- [ ] `npm test` passes locally
- [ ] `npm run desktop:smoke` passes locally
- [ ] `npm run desktop:first-run-smoke` passes locally and uses isolated provider data paths
- [ ] `npm run trial:preflight` gives source-specific next actions or reports ready
- [ ] `npm run trial:ready` passes for a real-data dogfood build, or the release notes clearly say which source still needs setup
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` has a release entry
- [ ] README describes current capabilities accurately
- [ ] README clearly says v0.1 is a source-only developer preview, not an installer, signed desktop release, or app-managed auto-start release
- [ ] `docs/status.md` and `docs/roadmap.md` describe the current milestone accurately
- [ ] Parser changes include sanitized fixtures
- [ ] `docs/data-sources.md` documents source and confidence mapping
- [ ] UI copy labels estimates and reported reset times conservatively
- [ ] Bilingual UI copy still fits the main dashboard and mini surfaces
- [ ] No generated files, local databases, raw logs, prompts, responses, source code, or credentials are staged

## First Preview Work Plan

1. Verify deterministic validation: desktop smoke data paths are isolated and any first-run smoke assertion failure returns a non-zero process exit.
2. Verify the local test gate: `npm test`, `npm run desktop:smoke`, `npm run desktop:first-run-smoke`, and `git diff --check`.
3. Run a fresh-machine or clean-clone real-data trial from install through Codex and Claude Code readiness.
4. Tighten beginner onboarding copy for Windows, macOS, and Linux, especially the exact command to run, expected result, and recovery path.
5. Capture release screenshots or short GIFs for Dashboard, tray mini panel, widget, and setup flow.
6. Confirm README and release notes say the first distribution shape is source-only developer preview; zip artifacts, packaged Electron builds, signed releases, and app-managed auto-start are later work.
7. Update release notes from `CHANGELOG.md`, complete this checklist, verify CI on `main`, and tag the preview.

## Installer Releases

- [ ] Installer startup option is explicit and defaults to off for the first packaged release
- [ ] Settings includes a reversible `Launch at startup` toggle
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
