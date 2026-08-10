export type DesktopShortcutAction = "panel" | "refresh" | "widget";

export type DesktopShortcutStatusItem = {
  action: DesktopShortcutAction;
  description: string;
  envVar: string;
  value: string | undefined;
  defaultValue: string;
  enabled: boolean;
};

export type DesktopShortcutsStatus = {
  shortcuts: DesktopShortcutStatusItem[];
  disableValue: string;
  privacy: {
    controlsOtherApps: false;
    note: string;
  };
};

const shortcutDefinitions: DesktopShortcutStatusItem[] = [
  {
    action: "panel",
    defaultValue: "CommandOrControl+Alt+Q",
    description: "Toggle mini panel",
    enabled: true,
    envVar: "AIQD_SHORTCUT_PANEL",
    value: "CommandOrControl+Alt+Q"
  },
  {
    action: "refresh",
    defaultValue: "CommandOrControl+Alt+R",
    description: "Refresh quota data",
    enabled: true,
    envVar: "AIQD_SHORTCUT_REFRESH",
    value: "CommandOrControl+Alt+R"
  },
  {
    action: "widget",
    defaultValue: "CommandOrControl+Alt+W",
    description: "Toggle desktop widget",
    enabled: true,
    envVar: "AIQD_SHORTCUT_WIDGET",
    value: "CommandOrControl+Alt+W"
  }
];

const disabledValues = new Set(["0", "false", "off", "none", "disabled"]);

export function getDesktopShortcutsStatus(
  env: NodeJS.ProcessEnv = process.env
): DesktopShortcutsStatus {
  return {
    disableValue: "off",
    privacy: {
      controlsOtherApps: false,
      note:
        "Desktop shortcuts only control AIQD windows and refresh. They do not approve, click, or automate permissions in other apps."
    },
    shortcuts: shortcutDefinitions.map((definition) =>
      resolveShortcutStatusItem(definition, env[definition.envVar])
    )
  };
}

function resolveShortcutStatusItem(
  definition: DesktopShortcutStatusItem,
  configuredValue: string | undefined
): DesktopShortcutStatusItem {
  const value = resolveShortcutValue(configuredValue, definition.defaultValue);

  return {
    ...definition,
    enabled: value !== undefined,
    value
  };
}

function resolveShortcutValue(
  value: string | undefined,
  fallback: string
): string | undefined {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return fallback;
  }

  if (disabledValues.has(normalized.toLowerCase())) {
    return undefined;
  }

  return normalized;
}
