# Release Checklist

Use this checklist before tagging a release.

## Required

- [ ] `npm test` passes locally
- [ ] `npm run desktop:smoke` passes locally
- [ ] `npm run trial:preflight` gives source-specific next actions or reports ready
- [ ] `npm run trial:ready` passes for a real-data dogfood build, or the release notes clearly say which source still needs setup
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` has a release entry
- [ ] README describes current capabilities accurately
- [ ] `docs/status.md` and `docs/roadmap.md` describe the current milestone accurately
- [ ] Parser changes include sanitized fixtures
- [ ] `docs/data-sources.md` documents source and confidence mapping
- [ ] UI copy labels estimates and reported reset times conservatively
- [ ] Bilingual UI copy still fits the main dashboard and mini surfaces
- [ ] No generated files, local databases, raw logs, prompts, responses, source code, or credentials are staged

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
