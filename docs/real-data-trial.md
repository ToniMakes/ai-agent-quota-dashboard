# Real Data Trial

This guide is for a local desktop trial with real Codex and Claude Code quota signals. It uses only visible or official local data sources.

## 1. Prepare

```bash
npm install
npm test
npm run desktop:first-run-smoke
```

The first-run smoke uses temporary paths. It does not read your real Codex or Claude Code data.

## 2. Launch The Desktop App

```bash
npm run desktop:local
```

Expected first launch behavior:

- If Codex has no usable snapshot, the app opens Settings at `Codex Manual Snapshot`.
- If Claude Code setup or data is missing, the app opens Settings at `Claude Code Statusline`.
- If an adapter has a blocking error, the app opens Doctor.
- If primary sources are ready, the app opens the mini panel.

The guide is one-time per desktop user data directory. After that, use the tray menu or mini panel actions to open Settings, Doctor, Dashboard, or the always-on-top widget.

If the desktop app does not open, run:

```bash
npm run desktop:smoke
npm run doctor
```

Startup failures should show recovery guidance with the backend error tail. The smoke command checks whether the desktop shell can launch its local backend without touching real Codex or Claude Code data.

## 3. Record Codex

Open Codex and check a visible quota value, such as `/status` or Codex Settings > Usage.

In AIQD Settings, fill:

- `Remaining %`
- `Reported reset`
- Optional label

Then click `Save snapshot`.

CLI equivalent:

```bash
npm run build
node dist/index.js codex snapshot --remaining-percent 72 --reset-at 2026-08-16T03:00:00Z
```

Manual Codex snapshots expire at their reported reset time. If Codex later changes the reset anchor, record a new visible value.

## 4. Connect Claude Code

Run the sink self-test first. It uses fake `rate_limits` data and temporary files.

```bash
npm run claude:self-test
```

Preview the managed statusline command:

```bash
npm run build
node dist/index.js setup claude-statusline
```

Install only after reviewing the preview:

```bash
node dist/index.js setup claude-statusline --write
```

Then open Claude Code once so its statusline renders. AIQD will refresh when supported `rate_limits` fields arrive.

## 5. Verify

```bash
npm run doctor
```

In the desktop app, check:

- Dashboard shows Codex and/or Claude Code quota rows.
- Mini panel shows the most constrained remaining quota and reported reset.
- Doctor first-run checklist shows quota sources ready or gives a specific next action.
- Refresh History has a recent run with snapshot and check counts.

## Notes

- Reported reset times are observations from the current source, not guaranteed future reset predictions.
- AIQD does not approve prompts, automate other apps, read cookies, or parse arbitrary transcripts.
- If a source cannot be obtained legally and reliably, AIQD should show `unavailable` instead of guessing.
