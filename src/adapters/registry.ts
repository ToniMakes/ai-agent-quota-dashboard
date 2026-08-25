import type { AgentAdapter } from "./contracts.js";
import { providerManifest } from "./provider-manifest.js";
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
    adapters: providerManifest.map((entry) =>
      entry.createAdapter({
        configuredDataPaths: options.userConfig
          ? readUserConfigDataPaths(options.userConfig, entry.agent)
          : [],
        demoMode: options.demoMode
      })
    )
  };
}
