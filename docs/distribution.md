# Distribution and Startup

Last updated: 2026-08-11

## Current Release Shape

The v0.1.0 preview is source-only. Users clone the repository, install dependencies, and run the local dashboard or desktop shell from source.

There is no installer, packaged Electron build, signed binary, update channel, or app-managed launch-at-login setting in v0.1.0.

## Startup Decision

Launch at login should be part of the packaged desktop story, not a hidden side effect of source mode.

For v0.2, provide startup control in two places:

- Installer option: `Start AIQD when I sign in`
- App Settings toggle: `Launch at startup`

The first packaged release should default the installer option to off. AIQD runs a local backend and a tray shell, so startup behavior should be explicit, reversible, and easy to understand.

## Expected Behavior

- Startup launches the desktop tray shell and local backend.
- Startup should not open the full dashboard unless first-run setup or recovery guidance needs user attention.
- The Settings toggle should reflect the actual OS startup state when the platform exposes it.
- Disabling the toggle should remove the OS startup entry created by AIQD.
- Startup must not approve global shortcuts, automate other apps, change provider settings, or add extra data sources.
- Backend startup failures should use the same recovery guidance as manual desktop launch.

## Platform Notes

- Windows and macOS: prefer Electron's packaged-app login item APIs, such as `app.setLoginItemSettings()` and `app.getLoginItemSettings()`.
- Linux: use XDG autostart `.desktop` integration or installer-managed startup support, and document the supported desktop environments.
- Source mode: do not treat a manual Windows Startup folder shortcut or Task Scheduler entry for `npm run desktop:local` as the official product path.

## Acceptance Checks

- Fresh install with the installer option off does not create a startup entry.
- Fresh install with the installer option on starts AIQD after sign-in and shows only the desktop shell/tray behavior.
- Settings can enable and disable startup after installation.
- Uninstall or app removal does not leave an orphaned startup entry.
- Startup launch preserves the same privacy boundary as manual launch: no cookies, no simulated login, no hidden APIs, and no prompt/response/source-code upload.
