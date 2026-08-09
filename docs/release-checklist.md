# Release Checklist

Use this checklist before tagging a release.

## Required

- [ ] `npm test` passes locally
- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` has a release entry
- [ ] README describes current capabilities accurately
- [ ] Parser changes include sanitized fixtures
- [ ] `docs/data-sources.md` documents source and confidence mapping
- [ ] UI copy labels estimates and reported reset times conservatively
- [ ] No generated files, local databases, raw logs, prompts, responses, source code, or credentials are staged

## Optional

- [ ] Browser smoke test of the local dashboard
- [ ] GitHub release notes drafted from `CHANGELOG.md`
- [ ] Screenshots refreshed when the UI changes materially

## Tagging

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```
