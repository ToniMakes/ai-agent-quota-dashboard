# Local Data Trial

This guide is for developers and early testers who want to check AIQD with usage data produced by tools on their own device. It contains no account-specific setup values. Do not paste prompts, responses, credentials, cookies, or raw logs into public issues or pull requests.

## Before you start

Use the packaged Windows preview for the normal user path, or run the source checkout for development. AIQD does not log in to providers and cannot monitor accounts used only in a browser.

For a source checkout:

```bash
npm install
npm test
npm run trial:preflight
```

On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm`.

## Verify Codex

1. Use Codex once so it can write a supported local rate-limit reading.
2. Refresh AIQD to check the local data source.
3. Check the Codex card and Connections view.

If automatic local data is not available, AIQD may offer an explicitly labeled manual fallback. Manual values are local observations and expire at their reported reset time.

## Verify Claude Desktop

1. Select Claude Desktop in the first-run setup when that is your source.
2. Open Claude Desktop once so it can record recent local usage.
3. Refresh AIQD and check the Claude card. This source may not report a reset time.

AIQD reads only the supported local plan usage history source. It does not read browser cookies or Claude conversation content. Claude Desktop and Claude Code are alternative sources, so both are not required.

## Verify Claude Code

1. Select Claude Code CLI in the first-run setup.
2. Use the setup action to connect the local statusline receiver when offered.
3. Open Claude Code, complete its own setup, and let it send a new usage reading.
4. Refresh AIQD and check Connections.

If the reading is out of date, follow the recovery guidance shown by AIQD. Refresh after the source has recorded new usage; checking again does not create a new provider reading.

## Readiness commands

```bash
npm run trial:preflight
npm run trial:ready
```

`trial:preflight` reports the next action. `trial:ready` requires recent, non-demo Codex data and at least one recent Claude source. It is a local verification aid, not a guarantee about provider account limits.

## Clean-environment checks

Maintainers may also verify install, uninstall, startup preferences, and first-run behavior on a fresh Windows user profile or virtual machine. The purpose is to catch packaging and onboarding issues that cannot be seen on a development machine. Do not publish the profile name, local paths, screenshots with account data, or raw test logs.

## Reporting a problem

Before opening an issue, remove private data from screenshots and logs. Include the AIQD version, operating system, selected source type, and a short reproduction. Security reports should follow [SECURITY.md](../SECURITY.md) and should not be posted publicly.
