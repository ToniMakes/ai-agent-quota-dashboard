# SignPath Foundation Application Draft

Last updated: 2026-08-14

Use this draft when applying for SignPath Foundation open-source code signing:

https://signpath.org/apply.html

## Project

Project name:

```text
AI Agent Quota Dashboard
```

Short name / identifier:

```text
ai-agent-quota-dashboard
```

Homepage:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard#readme
```

Repository:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard
```

License:

```text
MIT License
```

License URL:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/LICENSE
```

Code of conduct:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/CODE_OF_CONDUCT.md
```

Code signing policy:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/code-signing.md
```

Privacy policy:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/docs/privacy.md
```

Download / release URL:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/tag/v0.1.0-rc.1
```

Unsigned RC installer URL:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/releases/download/v0.1.0-rc.1/AI.Agent.Quota.Dashboard-0.1.0-win-x64.exe
```

## Project Description

Short description:

```text
AI Agent Quota Dashboard is a local-first desktop dashboard for monitoring remaining quota, reset times, freshness, and source confidence for AI coding agents such as Codex, Claude Code, and Claude Desktop.
```

Detailed description:

```text
AI Agent Quota Dashboard (AIQD) is an open-source Windows desktop preview application for developers who use local AI coding agents and want a conservative view of available quota. It runs a local service bound to 127.0.0.1, stores normalized quota snapshots in local SQLite, and provides an Electron desktop shell with a dashboard, tray mini panel, Doctor diagnostics, Settings, and JSON/CSV export.

AIQD reads only narrow local quota-related data produced by tools the user already runs: Codex CLI structured local rate-limit events, Claude Code official statusline rate-limit payloads when explicitly configured, and Claude Desktop's local plan usage history file. It does not read browser cookies, simulate login, call hidden APIs, bypass rate limits, switch accounts, or upload prompts, responses, source code, chat content, credentials, cookies, session tokens, or raw local logs.

The Windows distribution is an NSIS installer built with electron-builder from the public GitHub repository using GitHub Actions. The current v0.1.0-rc.1 release candidate is unsigned and published only for clean-machine testing and SignPath Foundation review. The formal v0.1.0 release is intended to use a SignPath Foundation signed Windows installer if approval is complete.
```

Artifact type:

```text
Windows x64 NSIS installer (.exe)
```

Current unsigned artifact SHA256:

```text
D938A30F4289EE676FD181AC804B5DE0F372EEF502706FFE43142B85F26A0F72
```

## Repository Status

Repository type:

```text
GitHub
```

Visibility:

```text
Public
```

Primary language / runtime:

```text
TypeScript, JavaScript, Node.js, Electron
```

Project age:

```text
Started 2026-08-09; currently an active v0.1 desktop preview.
```

Commit count:

```text
109 commits as of 2026-08-14.
```

Contributors / maintainers:

```text
1 maintainer: Toni Liu / isToniLiu
```

Development status:

```text
Active. The project has local tests, Windows/Ubuntu GitHub Actions CI, a Windows package workflow, release checklist, privacy policy, and a published unsigned release candidate for review.
```

## Build And Signing Plan

CI workflow:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/blob/main/.github/workflows/package-windows.yml
```

Successful unsigned package workflow run:

```text
https://github.com/isToniLiu/ai-agent-quota-dashboard/actions/runs/31796488211
```

Build process:

```text
The GitHub Actions workflow checks out the public repository, installs npm dependencies, runs npm test, runs Electron desktop smoke checks, builds the Windows NSIS installer with electron-builder, runs packaged smoke checks, uploads the unsigned installer as a GitHub Actions artifact, and can submit that artifact to SignPath after approval.
```

Signing process after approval:

```text
After SignPath approval, the repository will configure SIGNPATH_API_TOKEN as a GitHub secret and SIGNPATH_ORGANIZATION_ID, SIGNPATH_PROJECT_SLUG, and SIGNPATH_SIGNING_POLICY_SLUG as GitHub variables. The package workflow will submit the GitHub Actions artifact to SignPath using signpath/github-action-submit-signing-request@v2, wait for manual approval/completion, download the signed installer, verify Authenticode status is Valid, and upload the signed installer as a workflow artifact for the formal GitHub Release.
```

## Roles

Committer / reviewer:

```text
Toni Liu / isToniLiu
https://github.com/isToniLiu
```

Signing approver:

```text
Toni Liu / isToniLiu
https://github.com/isToniLiu
```

MFA:

```text
Confirm before submitting: GitHub MFA is enabled for isToniLiu, and SignPath MFA will be enabled for the SignPath account.
```

## Contact

Primary contact name:

```text
Toni Liu
```

Primary contact email:

```text
TODO: use your preferred public or project contact email.
```

GitHub account:

```text
https://github.com/isToniLiu
```

## Terms Checklist

Before submitting, confirm:

- [ ] GitHub MFA is enabled
- [ ] The contact email is correct
- [ ] You accept that the certificate publisher will be `SignPath Foundation`
- [ ] You accept that every release signing request may require manual approval
- [ ] You accept that release signing must use CI-built artifacts from the public repository
