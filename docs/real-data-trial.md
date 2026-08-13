# Real Data Trial

This guide is for a local desktop trial with real Codex and Claude (Claude Code or Claude Desktop) quota signals. It uses only visible or official local data sources.

## 1. Prepare

Normal-user installer trial:

1. Install AIQD from the release artifact: `AI Agent Quota Dashboard-0.1.0-win-x64.exe`.
2. Open AIQD from the installed desktop or Start menu entry.
3. Confirm the main dashboard window opens.
4. Open Settings if the first-run guide does not take you there automatically.

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

## 2. Launch The Desktop App

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

## 3. Detect Codex

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

## 4. Verify Claude Desktop Coverage

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

## 5. Connect Claude Code (optional if Claude Desktop is already ready)

Skip this section if step 4 already shows Claude as ready via Claude Desktop. Claude Code CLI is an alternative source, not an additional requirement.

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

## 6. Verify

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
