import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { isRecord, readString } from "./parse-utils.js";
import { uniquePaths } from "./path-utils.js";

export async function readClaudeSubscriptionTier(
  roots: string[] = []
): Promise<string | undefined> {
  const candidates = uniquePaths([
    ...roots.flatMap(claudeCredentialsCandidates),
    ...defaultClaudeCredentialsCandidates()
  ]);

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      const tier = normalizeClaudeSubscriptionTier(
        readClaudeCredentialsSubscriptionType(parsed)
      );

      if (tier) {
        return tier;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function defaultClaudeCredentialsCandidates(): string[] {
  return uniquePaths([
    process.env.CLAUDE_CONFIG_DIR
      ? join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json")
      : undefined,
    join(homedir(), ".claude", ".credentials.json"),
    process.env.APPDATA
      ? join(process.env.APPDATA, "Claude", ".credentials.json")
      : undefined,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Claude", ".credentials.json")
      : undefined
  ]);
}

function claudeCredentialsCandidates(path: string): string[] {
  const name = basename(path).toLowerCase();

  if (name === ".credentials.json") {
    return [path];
  }

  if (name.endsWith(".json") || name.endsWith(".jsonl") || name.endsWith(".txt")) {
    return [join(dirname(path), ".credentials.json")];
  }

  return [join(path, ".credentials.json")];
}

function readClaudeCredentialsSubscriptionType(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const claudeAiOauth = readRecordFromUnknown(value.claudeAiOauth);

  return (
    readString(value, ["subscriptionType", "subscription_type"]) ??
    (claudeAiOauth
      ? readString(claudeAiOauth, ["subscriptionType", "subscription_type"])
      : undefined)
  );
}

function readRecordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function normalizeClaudeSubscriptionTier(
  value: string | undefined
): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  if (!normalized) {
    return undefined;
  }

  switch (normalized.replace(/\s+/g, "")) {
    case "pro":
      return "Pro";
    case "max":
      return "Max";
    case "team":
      return "Team";
    case "enterprise":
      return "Enterprise";
    case "free":
      return "Free";
    default:
      return undefined;
  }
}
