# Public Release Checklist

This is a public overview of the release gates. Maintainers should keep provider accounts, signing credentials, private workflow details, and raw test evidence outside the public repository.

## Product and documentation

- [ ] README, release notes, privacy policy, compatibility notes, and screenshots describe the same version
- [ ] Public screenshots use demo data and contain no account names, local paths, prompts, logs, or credentials
- [ ] Known limitations and unsigned or signed status are clearly stated
- [ ] Installation and uninstall instructions match the current package
- [ ] Public documents contain no private deployment identifiers or internal planning notes

## Software quality

- [ ] `npm test` passes
- [ ] Desktop smoke checks pass
- [ ] Windows packaging completes for the intended architecture
- [ ] The packaged application starts from the installed desktop or Start menu entry
- [ ] The local service remains bound to loopback
- [ ] Export and diagnostics output exclude private source references and account identifiers
- [ ] Security-sensitive changes have a focused regression test

## Release artifact

- [ ] The package version matches the tag and release notes
- [ ] The installer is built by the intended GitHub Actions workflow
- [ ] The installer checksum is generated from the final artifact
- [ ] The release notes identify the exact installer filename and checksum
- [ ] The release is marked as a preview or stable release intentionally
- [ ] Signed status is verified before calling an artifact signed

## Post-release review

- [ ] Download links point to the intended release
- [ ] The installed release is checked once on a clean user profile when practical
- [ ] The public website and README point to the same current release
- [ ] Any follow-up fix is either included in a new artifact or clearly identified as unreleased
