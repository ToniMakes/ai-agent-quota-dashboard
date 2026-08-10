import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDesktopShortcutsStatus } from "./desktop-shortcuts-status.js";

describe("getDesktopShortcutsStatus", () => {
  it("reports safe default desktop shortcuts", () => {
    const status = getDesktopShortcutsStatus({});

    assert.equal(status.privacy.controlsOtherApps, false);
    assert.deepEqual(
      status.shortcuts.map((shortcut) => ({
        action: shortcut.action,
        enabled: shortcut.enabled,
        value: shortcut.value
      })),
      [
        {
          action: "panel",
          enabled: true,
          value: "CommandOrControl+Alt+Q"
        },
        {
          action: "refresh",
          enabled: true,
          value: "CommandOrControl+Alt+R"
        },
        {
          action: "widget",
          enabled: true,
          value: "CommandOrControl+Alt+W"
        }
      ]
    );
  });

  it("honors environment overrides and disabled shortcuts", () => {
    const status = getDesktopShortcutsStatus({
      AIQD_SHORTCUT_PANEL: "F3",
      AIQD_SHORTCUT_REFRESH: "off",
      AIQD_SHORTCUT_WIDGET: "CommandOrControl+Shift+W"
    });

    assert.deepEqual(
      status.shortcuts.map((shortcut) => ({
        action: shortcut.action,
        enabled: shortcut.enabled,
        value: shortcut.value
      })),
      [
        {
          action: "panel",
          enabled: true,
          value: "F3"
        },
        {
          action: "refresh",
          enabled: false,
          value: undefined
        },
        {
          action: "widget",
          enabled: true,
          value: "CommandOrControl+Shift+W"
        }
      ]
    );
  });
});
