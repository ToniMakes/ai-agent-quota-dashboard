import { createClaudeCodeAdapter } from "./claude-code/adapter.js";
import { createCodexAdapter } from "./codex/adapter.js";
import type { AgentAdapter } from "./contracts.js";

export type AdapterRegistry = {
  adapters: AgentAdapter[];
};

export type RegistryOptions = {
  demoMode: boolean;
};

export function createDefaultRegistry(options: RegistryOptions): AdapterRegistry {
  return {
    adapters: [
      createCodexAdapter({ demoMode: options.demoMode }),
      createClaudeCodeAdapter({ demoMode: options.demoMode })
    ]
  };
}
