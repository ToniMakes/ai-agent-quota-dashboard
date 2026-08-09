import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDefaultRegistry } from "../adapters/registry.js";
import { loadConfig } from "../config/app-config.js";
import {
  addUserConfigDataPath,
  loadUserConfig,
  removeUserConfigDataPath
} from "../config/user-config.js";
import { AgentQuotaService } from "../core/agent-quota-service.js";
import { createHttpServer, listen } from "../server/http-server.js";
import {
  getLocalPathsSetupStatus,
  type LocalPathsSetupStatus
} from "../setup/local-paths-status.js";
import { SqliteStore } from "../storage/sqlite-store.js";
import { runClaudeStatuslineSink } from "./claude-statusline-sink.js";
import { setupClaudeStatusline } from "./claude-statusline-setup.js";
import { formatDoctorReport, hasDoctorFailures } from "./doctor-report.js";
import { readStdin } from "./stdin.js";

export async function runCli(argv: string[], entryPointUrl: string): Promise<void> {
  const [command, subcommand, ...rest] = argv;

  if (command === "claude-statusline-sink") {
    const input = await readStdin();
    const sinkOptions: Parameters<typeof runClaudeStatuslineSink>[0] = {
      input
    };

    if (process.env.AIQD_CLAUDE_STATUSLINE_HISTORY_PATH) {
      sinkOptions.historyPath = process.env.AIQD_CLAUDE_STATUSLINE_HISTORY_PATH;
    }

    if (process.env.AIQD_CLAUDE_STATUSLINE_LATEST_PATH) {
      sinkOptions.latestPath = process.env.AIQD_CLAUDE_STATUSLINE_LATEST_PATH;
    }

    const result = await runClaudeStatuslineSink(sinkOptions);
    console.log(result.statusText);
    return;
  }

  if (command === "setup" && subcommand === "claude-statusline") {
    const result = await setupClaudeStatusline({
      argv: rest,
      entryPointUrl
    });
    console.log(result.message);
    return;
  }

  if (command === "config" && subcommand === "path") {
    await runConfigPathCommand(argv);
    return;
  }

  if (command === "doctor") {
    await runDoctorCommand(argv);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(helpText());
    return;
  }

  await startServer(argv, entryPointUrl);
}

async function runDoctorCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(doctorHelpText());
    return;
  }

  const config = loadConfig(argv);
  const userConfig = await loadUserConfig(config.userConfigPath);
  const registry = createDefaultRegistry({
    demoMode: config.demoMode,
    userConfig: userConfig.config
  });
  const store = new SqliteStore(config.dbPath);

  try {
    const service = new AgentQuotaService(registry, store);
    const refreshResult = await service.initialize();
    const report = {
      agents: service.listAgents(),
      checks: service.listDoctorChecks(),
      configErrors: userConfig.errors,
      configPath: userConfig.path,
      dbPath: store.path,
      demoMode: config.demoMode,
      generatedAt: refreshResult.observedAt,
      refreshResult
    };

    console.log(formatDoctorReport(report));

    if (hasDoctorFailures(report)) {
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

async function runConfigPathCommand(argv: string[]): Promise<void> {
  const [, , action, agent, dataPath] = argv;
  const config = loadConfig(argv);

  if (action === "list") {
    const status = await getLocalPathsSetupStatus(config.userConfigPath);
    console.log(formatLocalPathStatus(status));
    return;
  }

  if (action === "add") {
    if (!agent || !dataPath) {
      throw new Error("Usage: ai-agent-quota config path add codex|claude-code <path>");
    }

    const result = await addUserConfigDataPath({
      agent,
      configPath: config.userConfigPath,
      dataPath
    });

    console.log(
      result.added
        ? `Added ${result.agent} data path: ${result.dataPath}`
        : `Already configured ${result.agent} data path: ${result.dataPath}`
    );
    console.log(`Config file: ${result.path}`);
    return;
  }

  if (action === "remove") {
    if (!agent || !dataPath) {
      throw new Error("Usage: ai-agent-quota config path remove codex|claude-code <path>");
    }

    const result = await removeUserConfigDataPath({
      agent,
      configPath: config.userConfigPath,
      dataPath
    });

    console.log(
      result.removed
        ? `Removed ${result.agent} data path: ${result.dataPath}`
        : `Path was not configured for ${result.agent}: ${result.dataPath}`
    );
    console.log(`Config file: ${result.path}`);
    return;
  }

  console.log("Usage: ai-agent-quota config path list");
  console.log("       ai-agent-quota config path add codex|claude-code <path>");
  console.log("       ai-agent-quota config path remove codex|claude-code <path>");
}

async function startServer(argv: string[], entryPointUrl: string): Promise<void> {
  const config = loadConfig(argv);
  const userConfig = await loadUserConfig(config.userConfigPath);
  const currentDir = dirname(fileURLToPath(entryPointUrl));
  const staticDir = join(currentDir, "..", "web");
  const registry = createDefaultRegistry({
    demoMode: config.demoMode,
    userConfig: userConfig.config
  });
  const store = new SqliteStore(config.dbPath);
  const service = new AgentQuotaService(registry, store);

  await service.initialize();

  const server = createHttpServer({
    config,
    service,
    staticDir,
    store
  });
  const address = await listen(server, config);
  const url = `http://${address.address}:${address.port}`;

  console.log(`AI Agent Quota Dashboard listening at ${url}`);
  console.log(`SQLite store: ${store.path}`);
  console.log(`Config file: ${userConfig.path}`);

  if (config.demoMode) {
    console.log("Demo data is enabled. Use npm run dev:local for local-only scans.");
  }

  for (const error of userConfig.errors) {
    console.warn(`Config warning: ${error}`);
  }

  process.on("SIGINT", () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

function formatLocalPathStatus(status: LocalPathsSetupStatus): string {
  const lines = [
    `Config file: ${status.configPath}`,
    `Config status: ${status.configExists ? "found" : "not found"}`,
    ""
  ];

  if (status.loadErrors.length > 0) {
    lines.push("Config warnings:");
    lines.push(...status.loadErrors.map((error) => `  - ${error}`));
    lines.push("");
  }

  for (const agent of status.agents) {
    lines.push(`${agent.displayName}:`);

    if (agent.configuredDataPaths.length === 0) {
      lines.push("  Configured paths: none");
    } else {
      for (const path of agent.configuredDataPaths) {
        const state = path.readable ? "readable" : path.exists ? "not readable" : "not found";
        lines.push(`  - ${path.path} (${state})`);
      }
    }

    lines.push(`  Add: ${agent.addCommand}`);
    lines.push(`  Remove: ${agent.removeCommand}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function helpText(): string {
  return [
    "AI Agent Quota Dashboard",
    "",
    "Commands:",
    "  ai-agent-quota [--demo] [--port 4317]       Start local dashboard",
    "  ai-agent-quota doctor                       Run one local scan and print diagnostics",
    "  ai-agent-quota claude-statusline-sink       Read Claude statusline JSON from stdin",
    "  ai-agent-quota config path list             Show configured local data paths",
    "  ai-agent-quota config path add <agent> <path>",
    "                                             Add an extra local data path",
    "  ai-agent-quota config path remove <agent> <path>",
    "                                             Remove a configured local data path",
    "  ai-agent-quota setup claude-statusline      Print Claude statusline setup snippet",
    "  ai-agent-quota setup claude-statusline --write [--force]",
    "                                             Write ~/.claude/settings.json after review"
  ].join("\n");
}

function doctorHelpText(): string {
  return [
    "AI Agent Quota Doctor",
    "",
    "Usage:",
    "  ai-agent-quota doctor [--demo] [--db <path>] [--config <path>]",
    "",
    "Runs one local scan, writes normalized results to SQLite, and prints agent",
    "status, Doctor checks, empty-state guidance, and refresh counts.",
    "",
    "Exit code is 1 only for blocking failures such as adapter errors or invalid",
    "config. Missing quota sources are reported as warnings."
  ].join("\n");
}
