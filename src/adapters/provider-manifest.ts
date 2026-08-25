// Single list of "what providers exist and how do you talk to them." Adding
// a provider means adding one entry here instead of updating the registry,
// the local-paths status view, and any other place that used to enumerate
// codex/claude-code/claude-desktop by hand.
import {
  claudeCodeDisplayName,
  createClaudeCodeAdapter,
  getDefaultClaudeCodeDataPaths,
  resolveClaudeCodeDataPaths
} from "./claude-code/adapter.js";
import {
  claudeDesktopDisplayName,
  createClaudeDesktopAdapter,
  getDefaultClaudeDesktopDataPaths,
  resolveClaudeDesktopDataPaths
} from "./claude-desktop/adapter.js";
import {
  codexDisplayName,
  createCodexAdapter,
  getDefaultCodexDataPaths,
  resolveCodexDataPaths
} from "./codex/adapter.js";
import type { AgentAdapter, CommonAdapterOptions } from "./contracts.js";
import type { SupportedConfigAgent } from "../config/user-config.js";

export type ProviderManifestEntry = {
  agent: SupportedConfigAgent;
  displayName: string;
  createAdapter: (options: CommonAdapterOptions) => AgentAdapter;
  getDefaultDataPaths: () => string[];
  resolveDataPaths: (configuredDataPaths?: string[]) => string[];
};

export const providerManifest: ProviderManifestEntry[] = [
  {
    agent: "codex",
    displayName: codexDisplayName,
    createAdapter: createCodexAdapter,
    getDefaultDataPaths: getDefaultCodexDataPaths,
    resolveDataPaths: resolveCodexDataPaths
  },
  {
    agent: "claude-code",
    displayName: claudeCodeDisplayName,
    createAdapter: createClaudeCodeAdapter,
    getDefaultDataPaths: getDefaultClaudeCodeDataPaths,
    resolveDataPaths: resolveClaudeCodeDataPaths
  },
  {
    agent: "claude-desktop",
    displayName: claudeDesktopDisplayName,
    createAdapter: createClaudeDesktopAdapter,
    getDefaultDataPaths: getDefaultClaudeDesktopDataPaths,
    resolveDataPaths: resolveClaudeDesktopDataPaths
  }
];
