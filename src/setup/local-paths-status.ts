import {
  getDefaultClaudeCodeDataPaths,
  resolveClaudeCodeDataPaths
} from "../adapters/claude-code/adapter.js";
import {
  getDefaultCodexDataPaths,
  resolveCodexDataPaths
} from "../adapters/codex/adapter.js";
import { inspectPath, type PathInspection } from "../adapters/path-utils.js";
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
};

type AgentPathDescriptor = {
  agent: SupportedConfigAgent;
  displayName: string;
  defaultDataPaths: () => string[];
  effectiveDataPaths: (configuredDataPaths: string[]) => string[];
};

const agents: AgentPathDescriptor[] = [
  {
    agent: "codex",
    displayName: "Codex",
    defaultDataPaths: getDefaultCodexDataPaths,
    effectiveDataPaths: resolveCodexDataPaths
  },
  {
    agent: "claude-code",
    displayName: "Claude Code",
    defaultDataPaths: getDefaultClaudeCodeDataPaths,
    effectiveDataPaths: resolveClaudeCodeDataPaths
  }
];

export async function getLocalPathsSetupStatus(
  configPath?: string
): Promise<LocalPathsSetupStatus> {
  const loaded = await loadUserConfig(configPath);
  const agentStatuses = await Promise.all(
    agents.map(async (descriptor) => {
      const configuredDataPaths = readUserConfigDataPaths(
        loaded.config,
        descriptor.agent
      );

      return {
        agent: descriptor.agent,
        displayName: descriptor.displayName,
        defaultDataPaths: descriptor.defaultDataPaths(),
        configuredDataPaths: await Promise.all(
          configuredDataPaths.map(inspectPath)
        ),
        effectiveDataPaths: descriptor.effectiveDataPaths(configuredDataPaths),
        addCommand: `node dist/index.js config path add ${descriptor.agent} <path>`
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
