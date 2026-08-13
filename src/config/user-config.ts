import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { isRecord } from "../adapters/parse-utils.js";
import { uniquePaths } from "../adapters/path-utils.js";
import { defaultUserConfigPath } from "./paths.js";

export type SupportedConfigAgent = "codex" | "claude-code" | "claude-desktop";

export type AgentUserConfig = {
  dataPaths: string[];
};

export type UserConfig = {
  schemaVersion: 1;
  agents: {
    codex?: AgentUserConfig;
    "claude-code"?: AgentUserConfig;
    "claude-desktop"?: AgentUserConfig;
  };
};

export type LoadedUserConfig = {
  path: string;
  config: UserConfig;
  exists: boolean;
  errors: string[];
};

export type AddUserConfigDataPathResult = {
  path: string;
  agent: SupportedConfigAgent;
  dataPath: string;
  added: boolean;
  config: UserConfig;
};

export type RemoveUserConfigDataPathResult = {
  path: string;
  agent: SupportedConfigAgent;
  dataPath: string;
  removed: boolean;
  config: UserConfig;
};

const supportedAgents = new Set<SupportedConfigAgent>([
  "codex",
  "claude-code",
  "claude-desktop"
]);

export async function loadUserConfig(
  configPath = defaultUserConfigPath()
): Promise<LoadedUserConfig> {
  let raw: string;

  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isFileMissing(error)) {
      return {
        path: configPath,
        config: createEmptyUserConfig(),
        exists: false,
        errors: []
      };
    }

    return {
      path: configPath,
      config: createEmptyUserConfig(),
      exists: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }

  try {
    return {
      path: configPath,
      exists: true,
      ...parseUserConfig(raw)
    };
  } catch (error) {
    return {
      path: configPath,
      config: createEmptyUserConfig(),
      exists: true,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export function readUserConfigDataPaths(
  config: UserConfig,
  agent: SupportedConfigAgent
): string[] {
  return config.agents[agent]?.dataPaths ?? [];
}

export async function addUserConfigDataPath(options: {
  agent: string;
  configPath?: string;
  dataPath: string;
}): Promise<AddUserConfigDataPathResult> {
  const agent = parseSupportedAgent(options.agent);
  const configPath = options.configPath ?? defaultUserConfigPath();
  const loaded = await loadUserConfig(configPath);

  if (loaded.errors.length > 0) {
    throw new Error(
      `Cannot update config until it can be read: ${loaded.errors.join("; ")}`
    );
  }

  const dataPath = normalizeDataPath(options.dataPath);
  const previousPaths = readUserConfigDataPaths(loaded.config, agent);
  const nextPaths = uniquePaths([...previousPaths, dataPath]);

  loaded.config.agents[agent] = {
    dataPaths: nextPaths
  };

  await writeUserConfig(configPath, loaded.config);

  return {
    path: configPath,
    agent,
    dataPath,
    added: nextPaths.length > previousPaths.length,
    config: loaded.config
  };
}

export async function removeUserConfigDataPath(options: {
  agent: string;
  configPath?: string;
  dataPath: string;
}): Promise<RemoveUserConfigDataPathResult> {
  const agent = parseSupportedAgent(options.agent);
  const configPath = options.configPath ?? defaultUserConfigPath();
  const loaded = await loadUserConfig(configPath);

  if (loaded.errors.length > 0) {
    throw new Error(
      `Cannot update config until it can be read: ${loaded.errors.join("; ")}`
    );
  }

  const dataPath = normalizeDataPath(options.dataPath);
  const previousPaths = readUserConfigDataPaths(loaded.config, agent);
  const nextPaths = previousPaths.filter((path) => path !== dataPath);

  if (nextPaths.length === 0) {
    delete loaded.config.agents[agent];
  } else {
    loaded.config.agents[agent] = {
      dataPaths: nextPaths
    };
  }

  await writeUserConfig(configPath, loaded.config);

  return {
    path: configPath,
    agent,
    dataPath,
    removed: nextPaths.length < previousPaths.length,
    config: loaded.config
  };
}

export function parseSupportedAgent(agent: string): SupportedConfigAgent {
  if (supportedAgents.has(agent as SupportedConfigAgent)) {
    return agent as SupportedConfigAgent;
  }

  throw new Error(
    `Unsupported agent "${agent}". Use codex, claude-code, or claude-desktop.`
  );
}

export function createEmptyUserConfig(): UserConfig {
  return {
    schemaVersion: 1,
    agents: {}
  };
}

function parseUserConfig(raw: string): Pick<LoadedUserConfig, "config" | "errors"> {
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("Config must be a JSON object.");
  }

  const errors: string[] = [];

  if (
    parsed.schemaVersion !== undefined &&
    parsed.schemaVersion !== 1
  ) {
    errors.push("Unsupported config schemaVersion; expected 1.");
  }

  const agents = isRecord(parsed.agents) ? parsed.agents : {};
  const config = createEmptyUserConfig();

  for (const agent of supportedAgents) {
    const rawAgentConfig = agents[agent];

    if (!isRecord(rawAgentConfig)) {
      continue;
    }

    const rawDataPaths = rawAgentConfig.dataPaths;

    if (rawDataPaths === undefined) {
      continue;
    }

    if (!Array.isArray(rawDataPaths)) {
      errors.push(`${agent}.dataPaths must be an array of strings.`);
      continue;
    }

    const dataPaths = rawDataPaths
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(normalizeDataPath);

    config.agents[agent] = {
      dataPaths: uniquePaths(dataPaths)
    };
  }

  return {
    config,
    errors
  };
}

function normalizeDataPath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Data path cannot be empty.");
  }

  if (trimmed === "~") {
    return homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }

  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(trimmed);
}

async function writeUserConfig(configPath: string, config: UserConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function isFileMissing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
