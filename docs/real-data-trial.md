# Real Data Trial

This guide is for a local desktop trial with real Codex and Claude (Claude Code or Claude Desktop) quota signals. It uses only visible or official local data sources.

## 1. Clean Windows VM Release Gate

This is the required first-public-preview gate. It must be run on a clean Windows user profile or VM, not on the maintainer development machine, because the development machine already has AIQD, Codex, Claude Code, and Claude Desktop state.

Record the trial in the release notes or issue used for the release:

```text
Windows version:
VM or clean user profile:
AIQD installer filename:
Installer checksum, if recorded:
Startup checkbox trial: off / on / both
Codex source result:
Claude Desktop source result:
Claude Code source result:
Final readiness result:
Confusing copy or recovery notes:
```

### Clean-State Checks

Before installing AIQD, confirm the profile has no AIQD state:

```powershell
Test-Path "$env:USERPROFILE\.ai-agent-quota-dashboard"
Test-Path "$env:APPDATA\AI Agent Quota"
Test-Path "$env:APPDATA\AI Agent Quota Dashboard"
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue |
  Select-Object "AI Agent Quota Dashboard", "com.isToniLiu.ai-agent-quota-dashboard", "com.istoniliu.ai-agent-quota-dashboard"
```

Expected:

- The path checks return `False`.
- The startup registry query does not show an AIQD value.
- Codex, Claude Desktop, and Claude Code may be absent at the start of the trial. If they are installed, they must not already contain usable local quota state for this Windows profile.

### Installer Startup Off

1. Run `AI Agent Quota Dashboard-0.1.0-win-x64.exe`.
2. Leave `Start AIQD when I sign in` unchecked.
3. Launch AIQD from the desktop or Start menu entry.
4. Confirm the main dashboard window opens, not only the mini panel.
5. Open Settings > Desktop Startup.

Expected:

- Settings shows `Launch at startup` as off.
- The UI can reach Settings without `npm`, `node`, or PowerShell.
- No AIQD startup entry is created.

Optional PowerShell confirmation:

```powershell
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue |
  Select-Object "AI Agent Quota Dashboard", "com.isToniLiu.ai-agent-quota-dashboard", "com.istoniliu.ai-agent-quota-dashboard"
```

### Settings Startup Toggle

1. In Settings > Desktop Startup, turn `Launch at startup` on.
2. Confirm the setting changes to on.
3. Turn it off again.
4. Confirm the setting changes to off.

Expected:

- Enabling creates only an AIQD-managed login item for the packaged executable.
- Disabling removes the AIQD-managed login item.
- The app does not approve global shortcuts, configure Codex or Claude, add data sources, or read extra files as part of startup changes.

### Installer Startup On

Run this as a second pass after uninstalling AIQD, or from a clean VM snapshot:

1. Install AIQD again.
2. Check `Start AIQD when I sign in`.
3. Open Settings > Desktop Startup.

Expected:

- Settings shows `Launch at startup` as on.
- The Windows startup command launches the packaged AIQD executable with `--background`.
- If setup is still missing, first-run guidance may open Settings or Doctor. After setup is complete and the guide has already been shown, sign-in should start only the tray shell and local backend.

Optional PowerShell confirmation:

```powershell
Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue |
  Select-Object "AI Agent Quota Dashboard"
```

### Uninstall Cleanup

1. Quit AIQD from the tray menu.
2. Uninstall AIQD from Windows Settings or Control Panel.
3. Check startup entries again.

Expected:

- AIQD is removed.
- No AIQD startup entry remains.
- AIQD does not delete provider-owned Codex, Claude Desktop, or Claude Code files.

## 2. Normal-User First Run

Normal-user installer trial:

1. Install AIQD from the release artifact: `AI Agent Quota Dashboard-0.1.0-win-x64.exe`.
2. Open AIQD from the installed desktop or Start menu entry.
3. Confirm the main dashboard window opens.
4. Open Settings if the first-run guide does not take you there automatically.

The normal-user first run should not require `npm`, `node`, or source checkout commands. PowerShell checks in this document are maintainer verification aids only.

Developer source-mode trial:

```bash
npm install
npm test
npm run trial:preflight
npm run desktop:first-run-smoke
```

Expected:

- `npm test` passes.
- `trial:preflight` either reports `Overall: ready` or prints the next action for Codex, Claude Code, or Doctor.
- `desktop:first-run-smoke` reports the expected Settings deep link using isolated temporary provider paths.

If Windows PowerShell blocks `npm` with `running scripts is disabled`, use `npm.cmd` for the same commands:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run trial:preflight
npm.cmd run desktop:first-run-smoke
```

The first-run smoke uses temporary paths. It does not read your real Codex or Claude Code data.

## 3. Launch The Desktop App

```bash
npm run desktop:local
```

Expected first launch behavior:

- If Codex has no usable local CLI quota data, the app opens Settings at `Codex Quota Source`.
- If Claude Code setup or data is missing, the app opens Settings at `Claude Code Statusline`.
- If an adapter has a blocking error, the app opens Doctor.
- If primary sources are ready, the app opens the mini panel.

The guide is one-time per desktop user data directory. After that, use the tray menu or mini panel actions to open Settings, Doctor, Dashboard, or the always-on-top widget.

If the desktop app does not open, run:

```bash
npm run desktop:smoke
npm run trial:preflight
npm run doctor
```

Startup failures should show recovery guidance with the backend error tail. The smoke command checks whether the desktop shell can launch its local backend without touching real Codex or Claude Code data.

## 4. Detect Codex

First action: use Codex once, then click `Refresh` in AIQD or run:

```bash
npm run trial:preflight
```

Expected: Codex is marked ready from `official_cli` when AIQD finds supported local `rate_limits` events.

If not ready: automatic detection may be unavailable on this machine or Codex version. Use the manual fallback in AIQD Settings and fill:

- `Remaining %`
- `Reported reset`
- Optional label

Then click `Save snapshot`.

CLI equivalent:

```bash
npm run build
node dist/index.js codex snapshot --remaining-percent 72 --reset-at 2026-08-16T03:00:00Z
```

Manual Codex fallback snapshots expire at their reported reset time. If Codex later changes the reset anchor, refresh first; if no CLI data appears, record a new visible fallback value.

## 5. Verify Claude Desktop Coverage

Normal Claude users should not need to open Claude Code CLI just to make AIQD useful. If you use Claude Desktop, AIQD reads it automatically with nothing to install.

Verify the app can read the local Claude Desktop plan usage history source:

```text
%APPDATA%\Claude\plan-usage-history.json
```

Normal-user path from the desktop app:

1. Open Settings.
2. In the first-run setup area, click `Check Claude Desktop` to expand the Claude Desktop details.
3. If the file exists and has a recent sample, it shows as `Done` immediately — nothing to install or connect.
4. If it shows `Waiting`, open Claude Desktop so it records a new usage sample, then click `Refresh Claude Desktop`.

Expected: AIQD shows Claude Desktop five-hour and weekly usage from local plan usage samples, labels the source clearly (`Local snapshot`), and does not read chat content, cookies, hidden API responses, prompts, responses, or attachments. Claude readiness in Doctor and the real-data overview shows ready as soon as this source is fresh, even if Claude Code CLI is never set up.

## 6. Connect Claude Code

For product readiness, Claude Code CLI is an alternative source and is not required when Claude Desktop is fresh. For the clean Windows VM release gate, still run this section once so both Claude paths are verified on a fresh profile.

Normal-user path from the desktop app:

1. Open Settings.
2. In the first-run setup area, click `Set up Claude Code CLI` to expand the Claude Code setup details. Click it again to collapse, or click `Set up Codex` to switch to the Codex details.
3. If Claude Code CLI is missing, click `Install Claude Code CLI`.
4. If AIQD still needs the local capture setting, click `Connect Claude data`.
5. Open Claude Code in a project, finish Claude's own login/trust prompts, send one short message, and wait for the reply.
6. Return to AIQD and click the check/refresh action.

Expected: Claude Code is marked ready after AIQD receives supported `rate_limits` fields. If Claude opens but AIQD still says it is waiting, send one short message in Claude and wait for the response to finish.

Developer source-mode fallback:

Run the sink self-test first. It uses fake `rate_limits` data and temporary files.

```bash
npm run claude:self-test
```

Expected: the self-test reports parsed rate-limit windows and does not write to the normal Claude statusline snapshot path.

Preview the managed statusline command:

```bash
npm run build
node dist/index.js setup claude-statusline
```

Expected: the preview shows the command AIQD would install, without changing Claude settings.

Install only after reviewing the preview:

```bash
node dist/index.js setup claude-statusline --write
```

Then open Claude Code once in any project so its statusline renders. AIQD will refresh when supported `rate_limits` fields arrive.

Platform notes:

- Windows: the Settings flow can install Claude Code CLI with the explicit install button when the supported Windows package is available. If Doctor says `claude.exe` is outside `PATH`, use the full-path command shown by Settings or Doctor, or restart AIQD after opening Claude Code from your normal terminal.
- macOS/Linux: open a terminal in a project and run `claude`; if the command is not found, install or expose the Claude Code CLI first.

If not ready: run `npm run trial:preflight`. A common next action is `Open Claude Code to refresh the statusline snapshot`, which means Claude is configured but has not sent a fresh supported `rate_limits` payload yet.

## 7. Verify

```bash
npm run trial:preflight
npm run doctor
npm run trial:ready
```

Expected:

- `trial:preflight` gives the shortest next action or says `Overall: ready`.
- `doctor` shows source checks and any non-blocking warnings.
- `trial:ready` passes when Codex has fresh non-demo quota data and at least one Claude source (Claude Code or Claude Desktop) has fresh non-demo quota data; it does not require both Claude sources.

In the desktop app, check:

- Dashboard shows Codex, Claude Code, and/or Claude Desktop quota rows.
- Mini panel shows the most constrained remaining quota and reported reset.
- Mini panel and always-on-top widget can switch between Chinese and English with the shared language preference.
- Doctor first-run checklist shows quota sources ready or gives a specific next action.
- Refresh History has a recent run with snapshot and check counts.

`npm run trial:preflight` gives the shortest next action for Codex, Claude Code, and blocking Doctor issues. `npm run trial:ready` uses strict Doctor mode. It fails until every configured agent has a fresh non-demo quota snapshot, which is useful right before deciding whether the app is ready for a real-data experience.

The Settings > Real Data Setup summary, desktop first-run guide, tray status, and mini footer show the same strict readiness result as `npm run trial:ready`.

## Notes

- Reported reset times are observations from the current source, not guaranteed future reset predictions.
- AIQD does not approve prompts, automate other apps, read cookies, or parse arbitrary transcripts.
- If a source cannot be obtained legally and reliably, AIQD should show `unavailable` instead of guessing.
