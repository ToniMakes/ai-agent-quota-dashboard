import {
  buildQuotaExport,
  quotaSnapshotsToCsv
} from "../core/export-data.js";
import type { QuotaSnapshot, ResetEvent } from "../core/types.js";

export type CliExportFormat = "csv" | "json";

export type CliExportOptions = {
  format: CliExportFormat;
  refresh: boolean;
};

export function parseCliExportOptions(argv: readonly string[]): CliExportOptions {
  const explicitFormats = [
    argv.includes("--json") ? "json" : undefined,
    argv.includes("--csv") ? "csv" : undefined,
    readFlagValue(argv, "--format")
  ].filter((value): value is string => value !== undefined);
  const uniqueFormats = new Set(explicitFormats);

  if (uniqueFormats.size > 1) {
    throw new Error("Use only one export format: --json, --csv, or --format.");
  }

  const format = parseExportFormat(explicitFormats[0] ?? "json");

  return {
    format,
    refresh: !argv.includes("--no-refresh")
  };
}

export function formatCliExport(input: {
  format: CliExportFormat;
  generatedAt: string;
  resetEvents: readonly ResetEvent[];
  snapshots: readonly QuotaSnapshot[];
}): string {
  if (input.format === "json") {
    return `${JSON.stringify(
      buildQuotaExport({
        generatedAt: input.generatedAt,
        snapshots: input.snapshots,
        resetEvents: input.resetEvents
      }),
      null,
      2
    )}\n`;
  }

  return quotaSnapshotsToCsv(input.snapshots);
}

function parseExportFormat(value: string): CliExportFormat {
  if (value === "json" || value === "csv") {
    return value;
  }

  throw new Error('Unsupported export format. Use "json" or "csv".');
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index !== -1) {
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }

    return value;
  }

  const inline = argv.find((value) => value.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}
