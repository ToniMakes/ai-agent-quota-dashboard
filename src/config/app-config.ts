import { homedir } from "node:os";
import { join } from "node:path";

export type AppConfig = {
  host: string;
  port: number;
  dbPath: string;
  demoMode: boolean;
};

export function loadConfig(
  argv = process.argv.slice(2),
  env = process.env
): AppConfig {
  return {
    host: readFlagValue(argv, "--host") ?? env.AIQD_HOST ?? "127.0.0.1",
    port: Number(readFlagValue(argv, "--port") ?? env.PORT ?? 4317),
    dbPath:
      readFlagValue(argv, "--db") ??
      env.AIQD_DB_PATH ??
      join(homedir(), ".ai-agent-quota-dashboard", "quota.db"),
    demoMode: argv.includes("--demo") || env.AIQD_DEMO_DATA === "1"
  };
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index === -1) {
    const inline = argv.find((value) => value.startsWith(`${flag}=`));
    return inline?.slice(flag.length + 1);
  }

  return argv[index + 1];
}
