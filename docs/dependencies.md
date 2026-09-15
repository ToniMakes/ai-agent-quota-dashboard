# Dependency and Supply-Chain Notes

AIQD keeps its runtime dependency surface intentionally small. The project
commits `package-lock.json`, installs with `npm ci` in CI, and uses the bundled
Electron runtime for packaged Windows builds.

## Maintenance policy

- CI runs `npm audit --audit-level=high --omit=dev` for production dependencies.
- CI publishes a short-lived CycloneDX SBOM for each supported test runner.
- GitHub Actions are pinned to full commit SHAs; the trailing version comment
  identifies the intended upstream release.
- Dependency updates must preserve the local-first privacy boundary and pass the
  normal build, test, and desktop smoke checks.

The development toolchain includes Electron, TypeScript, and test/build tools.
They are not imported by the local dashboard service at runtime, but they still
remain part of the build and release supply chain and are therefore covered by
the lockfile and CI checks.

## Local checks

```bash
npm ci
npm run audit:production
npm sbom --omit=dev --sbom-format cyclonedx > aiqd-sbom.json
npm test
```

Before merging a dependency update, review its license and whether it adds
network access, credential handling, telemetry, or a new native component.
Do not add a dependency that reads provider secrets or uploads user data unless
the privacy boundary and user consent model are explicitly redesigned.
