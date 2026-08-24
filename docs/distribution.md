# Distribution and Startup

Last updated: 2026-08-25

## Current Release Shape

The v0.1.0 preview target is installer-first. Normal users should download a packaged desktop installer, run it, and open AIQD from the desktop or Start menu entry. Source mode remains a developer fallback, not the primary public path.

The Windows x64 installer artifact is:

```text
release/AI Agent Quota Dashboard-0.1.0-win-x64.exe
```

The v0.1.0 desktop preview artifact is published unsigned because SignPath Foundation approval is still pending. The maintainer explicitly approved this unsigned formal preview on 2026-08-25. Release notes must label the installer as unsigned, describe the normal Windows unknown-publisher or SmartScreen warning, and include the final SHA256.

Build commands:

```bash
npm run package:win:dir
npm run package:win
```

Packaged smoke commands:

```powershell
& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke
& ".\release\win-unpacked\AI Agent Quota Dashboard.exe" --disable-gpu --disable-gpu-compositing --disable-gpu-sandbox --single-process --smoke-first-run-guide
```

The packaged app uses Electron's bundled Node runtime for the local backend. Normal users should not need a separate Node.js or npm install.

## Code Signing

AIQD's preferred no-cost signing path is SignPath Foundation open-source signing. The repository policy is documented in [Code Signing Policy](code-signing.md).

Release candidates may be unsigned and clearly labeled as such so SignPath can review a released/downloadable Windows artifact. The v0.1.0 formal preview is also unsigned by maintainer decision while SignPath review is pending.

The manual Windows packaging workflow can:

- build and upload an unsigned installer artifact for RC testing
- submit the GitHub Actions artifact to SignPath after approval and secret configuration
- verify the downloaded signed artifact with Windows Authenticode before release upload

Required GitHub configuration after SignPath approval:

- repository secret: `SIGNPATH_API_TOKEN`
- repository variables: `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`

The SignPath project should use the workflow artifact as the signing input. Maintainers should not sign locally built release binaries with the SignPath Foundation certificate.

Recommended signing sequence:

1. Run the manual `Package Windows` GitHub Actions workflow with `sign_with_signpath` set to `false`.
2. Create a GitHub Pre-release such as `v0.1.0-rc.1`, upload the unsigned installer, and use `docs/release-notes-v0.1.0-rc.1.md` as the release text.
3. Submit the SignPath Foundation OSS application with the repository URL, RC release URL, license, privacy policy, and code signing policy.
4. After approval, configure the SignPath GitHub secret and variables listed above.
5. Run the same workflow with `sign_with_signpath` set to `true` from the intended release commit or tag.
6. Verify the signed installer and upload only that artifact to a later signed follow-up release. Do not silently replace the v0.1.0 unsigned asset.

## Startup Decision

Launch at login is part of the packaged desktop story, not a hidden side effect of source mode.

For packaged releases, startup control is provided in two places:

- Installer option: `Start AIQD when I sign in (tray only)`
- App Settings toggle: `Launch at startup` in Desktop Preferences
- Dashboard topbar toggle: `Startup`

The first packaged release defaults startup to off. AIQD runs a local backend and a tray shell, so startup behavior is explicit, reversible, and easy to understand.

Implementation notes:

- The Windows Settings and topbar toggles read and write AIQD's current-user Run entry directly.
- macOS can use Electron's packaged-app login item APIs: `app.setLoginItemSettings()` and `app.getLoginItemSettings()`.
- Windows startup entries use the packaged executable with `--background`, so sign-in starts only the tray shell and local backend unless setup or recovery guidance needs attention.
- Source mode does not create an official startup entry.
- The NSIS installer checkbox calls the packaged app's short `--set-launch-at-login=1` mode, so AIQD owns the login-item write.
- The uninstaller removes AIQD-owned Windows Run and StartupApproved entries to avoid orphaned startup entries.

The installed desktop shortcut should open the main dashboard window. The tray mini panel remains a quick-access surface from the system tray, not the primary result of double-clicking the app entry.

## Main Window Close Behavior

The main dashboard window's close button is explicit for first-time users:

- Default behavior: ask whether to quit AIQD or keep the tray shell and local backend running.
- The dialog can remember either choice and stop asking.
- Settings can restore the prompt or set the default close action to tray or quit.
- Tray Quit remains the direct way to fully exit AIQD.

## Expected Behavior

- User-launched desktop entries open the main dashboard window.
- Startup launches the desktop tray shell and local backend.
- Startup should not open the full dashboard unless first-run setup or recovery guidance needs user attention.
- The Settings toggle should reflect the actual OS startup state when the platform exposes it.
- Disabling the toggle should remove the OS startup entry created by AIQD.
- Startup must not approve global shortcuts, automate other apps, change provider settings, or add extra data sources.
- Backend startup failures should use the same recovery guidance as manual desktop launch.
- Packaged GUI launches should tolerate disconnected stdout/stderr pipes so a desktop or Start menu launch never shows a JavaScript `EPIPE` crash while forwarding backend logs.

## Platform Notes

- Windows and macOS: prefer Electron's packaged-app login item APIs, such as `app.setLoginItemSettings()` and `app.getLoginItemSettings()`.
- Linux: use XDG autostart `.desktop` integration or installer-managed startup support, and document the supported desktop environments.
- Source mode: do not treat a manual Windows Startup folder shortcut or Task Scheduler entry for `npm run desktop:local` as the official product path.
- Source mode: keep `npm` and `node` commands in developer documentation only; normal-user docs should start from the installer and desktop shortcut.

## Acceptance Checks

- Fresh install with the installer option off does not create a startup entry.
- Fresh install with the installer option on starts AIQD after sign-in and shows only the desktop shell/tray behavior.
- Settings can enable and disable startup after installation.
- First main-window close asks whether to quit or keep AIQD in the tray.
- Settings can restore the close prompt or choose tray/quit as the default close action.
- Opening the packaged app from the desktop or Start menu does not crash if no console is attached or the inherited log pipe closes.
- Uninstall or app removal does not leave an orphaned startup entry.
- Startup launch preserves the same privacy boundary as manual launch: no cookies, no simulated login, no hidden APIs, and no prompt/response/source-code upload.
