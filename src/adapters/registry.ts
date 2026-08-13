import { createClaudeCodeAdapter } from "./claude-code/adapter.js";
import { createClaudeDesktopAdapter } from "./claude-desktop/adapter.js";
import { createCodexAdapter } from "./codex/adapter.js";
import type { AgentAdapter } from "./contracts.js";
import {
  readUserConfigDataPaths,
  type UserConfig
} from "../config/user-config.js";

export type AdapterRegistry = {
  adapters: AgentAdapter[];
};

export type RegistryOptions = {
  demoMode: boolean;
  userConfig?: UserConfig;
};

export function createDefaultRegistry(options: RegistryOptions): AdapterRegistry {
  return {
    adapters: [
      createCodexAdapter({
        configuredDataPaths: options.userConfig
          ? readUserConfigDataPaths(options.userConfig, "codex")
          : [],
        demoMode: options.demoMode
      }),
      createClaudeCodeAdapter({
        configuredDataPaths: options.userConfig
          ? readUserConfigDataPaths(options.userConfig, "claude-code")
          : [],
        demoMode: options.demoMode
      }),
      createClaudeDesktopAdapter({
        configuredDataPaths: options.userConfig
          ? readUserConfigDataPaths(options.userConfig, "claude-desktop")
          : [],
        demoMode: options.demoMode
      })
    ]
  };
}
