# Local Data Trial

This guide is for developers and early testers who want to verify AIQD with their own local quota data. It contains no account-specific setup values. Do not paste prompts, responses, credentials, cookies, or raw logs into public issues or pull requests.

## Before you start

Use the packaged Windows preview for the normal user path, or run the source checkout for development. AIQD does not log in to providers and cannot monitor browser-only usage.

For a source checkout:

```bash
npm install
npm test
npm run trial:preflight
```

On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm`.

## Verify Codex

1. Use Codex once so a supported local rate-limit event can be produced.
2. Refresh AIQD.
3. Check the Codex card and Diagnostics view.

If automatic local data is not available, AIQD may offer an explicitly labeled manual fallback. Manual values are local observations and expire at their reported reset time.

## Verify Claude Desktop

1. Select Claude Desktop in the first-run setup when that is your source.
2. Open Claude Desktop once so it can record a recent local usage sample.
3. Refresh AIQD and check the Claude card.

AIQD reads only the supported local plan usage history source. It does not read browser cookies or Claude conversation content. Claude Desktop and Claude Code are alternative sources, so both are not required.

## Verify Claude Code

1. Select Claude Code CLI in the first-run setup.
2. Use the setup action to connect the local statusline receiver when offered.
3. Open Claude Code, complete its own setup, and produce one fresh statusline observation.
4. Refresh AIQD and check Diagnostics.

If the data is stale, use the recovery guidance shown by AIQD and refresh after a new observation is available.

## Readiness commands

```bash
npm run trial:preflight
npm run trial:ready
```

`trial:preflight` reports the shortest next action. `trial:ready` requires fresh, non-demo Codex data and at least one fresh Claude source. It is intended as a local verification aid, not as a provider guarantee.

## Clean-environment checks

Maintainers may also verify install, uninstall, startup preferences, and first-run behavior on a fresh Windows user profile or virtual machine. The purpose is to catch packaging and onboarding issues that cannot be seen on a development machine. Do not publish the profile name, local paths, screenshots with account data, or raw test logs.

## Reporting a problem

Before opening an issue, remove private data from screenshots and logs. Include the AIQD version, operating system, selected source type, and a short reproduction. Security reports should follow [SECURITY.md](../SECURITY.md) and should not be posted publicly.
