import { inspectPath, type PathInspection } from "../adapters/path-utils.js";
import { providerManifest } from "../adapters/provider-manifest.js";
import {
  loadUserConfig,
  readUserConfigDataPaths,
  type SupportedConfigAgent
} from "../config/user-config.js";

export type LocalPathsSetupStatus = {
  configPath: string;
  configExists: boolean;
  loadErrors: string[];
  listCommand: string;
  agents: LocalPathsAgentStatus[];
};

export type LocalPathsAgentStatus = {
  agent: SupportedConfigAgent;
  displayName: string;
  defaultDataPaths: string[];
  configuredDataPaths: PathInspection[];
  effectiveDataPaths: string[];
  addCommand: string;
  removeCommand: string;
};

export async function getLocalPathsSetupStatus(
  configPath?: string
): Promise<LocalPathsSetupStatus> {
  const loaded = await loadUserConfig(configPath);
  const agentStatuses = await Promise.all(
    providerManifest.map(async (entry) => {
      const configuredDataPaths = readUserConfigDataPaths(
        loaded.config,
        entry.agent
      );

      return {
        agent: entry.agent,
        displayName: entry.displayName,
        defaultDataPaths: entry.getDefaultDataPaths(),
        configuredDataPaths: await Promise.all(
          configuredDataPaths.map(inspectPath)
        ),
        effectiveDataPaths: entry.resolveDataPaths(configuredDataPaths),
        addCommand: `node dist/index.js config path add ${entry.agent} <path>`,
        removeCommand: `node dist/index.js config path remove ${entry.agent} <path>`
      };
    })
  );

  return {
    configPath: loaded.path,
    configExists: loaded.exists,
    loadErrors: loaded.errors,
    listCommand: "node dist/index.js config path list",
    agents: agentStatuses
  };
}
