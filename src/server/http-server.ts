import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, relative, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { AgentQuotaService } from "../core/agent-quota-service.js";
import type { AppConfig } from "../config/app-config.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import {
  parseCodexManualSnapshotInput,
  writeCodexManualSnapshot
} from "../cli/codex-snapshot.js";
import {
  buildQuotaExport,
  quotaSnapshotsToCsv,
  sanitizeAgentSummary,
  sanitizeQuotaSnapshot
} from "../core/export-data.js";
import { getCodexSnapshotSetupStatus } from "../setup/codex-snapshot-status.js";
import { getClaudeStatuslineSetupStatus } from "../setup/claude-statusline-status.js";
import { getLocalPathsSetupStatus } from "../setup/local-paths-status.js";

export type ServerContext = {
  config: AppConfig;
  service: AgentQuotaService;
  staticDir: string;
  store: SqliteStore;
};

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function createHttpServer(context: ServerContext) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`
      );

      if (url.pathname.startsWith("/api/")) {
        await handleApiRequest(context, request, response, url);
        return;
      }

      await serveStaticFile(context.staticDir, url.pathname, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

export function listen(server: ReturnType<typeof createHttpServer>, config: AppConfig) {
  return new Promise<AddressInfo>((resolveListen) => {
    server.listen(config.port, config.host, () => {
      resolveListen(server.address() as AddressInfo);
    });
  });
}

async function handleApiRequest(
  context: ServerContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      dbPath: context.store.path,
      demoMode: context.config.demoMode
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      agents: context.service.listAgents().map(sanitizeAgentSummary)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/quota") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      snapshots: context.service.listQuotaSnapshots().map(sanitizeQuotaSnapshot)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/doctor") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      checks: context.service.listDoctorChecks()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reset-events") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      events: context.service.listResetEvents()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/refresh-runs") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      runs: context.service.listRefreshRuns()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    const generatedAt = new Date().toISOString();
    const snapshots = context.service.listQuotaSnapshots();
    const resetEvents = context.service.listResetEvents(100);
    const format = url.searchParams.get("format") ?? "json";

    if (format === "json") {
      const payload = buildQuotaExport({
        generatedAt,
        snapshots,
        resetEvents
      });
      sendDownload(
        response,
        200,
        JSON.stringify(payload, null, 2),
        "application/json; charset=utf-8",
        "ai-agent-quota-export.json"
      );
      return;
    }

    if (format === "csv") {
      sendDownload(
        response,
        200,
        quotaSnapshotsToCsv(snapshots),
        "text/csv; charset=utf-8",
        "ai-agent-quota-snapshots.csv"
      );
      return;
    }

    sendJson(response, 400, { error: "Unsupported export format" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/setup/claude-statusline") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      status: await getClaudeStatuslineSetupStatus()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/setup/codex-snapshot") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      status: await getCodexSnapshotSetupStatus()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/setup/codex-snapshot") {
    const now = new Date();
    let snapshotOptions;

    try {
      const body = await readJsonBody(request);

      if (!isRecord(body)) {
        throw new HttpRequestError(400, "Request body must be a JSON object.");
      }

      snapshotOptions = parseCodexManualSnapshotInput(
        {
          planLabel: readOptionalStringField(body, "planLabel"),
          remainingPercent: readOptionalNumberField(body, "remainingPercent"),
          resetAt: readOptionalStringField(body, "resetAt"),
          usedPercent: readOptionalNumberField(body, "usedPercent")
        },
        now
      );
    } catch (error) {
      sendJson(response, errorStatusCode(error), {
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    const result = await writeCodexManualSnapshot(snapshotOptions, now);
    const refreshResult = await context.service.refresh();
    const snapshot = result.snapshot.quota_snapshot;

    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      result: {
        outputPath: result.outputPath,
        observedAt: snapshot.observed_at,
        remainingPercent: snapshot.remaining_percent,
        resetAt: snapshot.reset_at,
        usedPercent: snapshot.used_percent
      },
      refreshResult,
      status: await getCodexSnapshotSetupStatus()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/setup/local-paths") {
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      status: await getLocalPathsSetupStatus(context.config.userConfigPath)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refresh") {
    const result = await context.service.refresh();
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

class HttpRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes = 16 * 1024
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBytes) {
      throw new HttpRequestError(413, "Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (size === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpRequestError(400, "Request body must be valid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalNumberField(
  body: Record<string, unknown>,
  field: string
): number | undefined {
  const value = body[field];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new Error(`${field} must be a number.`);
  }

  return value;
}

function readOptionalStringField(
  body: Record<string, unknown>,
  field: string
): string | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  return value;
}

function errorStatusCode(error: unknown): number {
  return error instanceof HttpRequestError ? error.statusCode : 400;
}

async function serveStaticFile(
  staticDir: string,
  pathname: string,
  response: ServerResponse
): Promise<void> {
  const safePathname = pathname === "/" ? "/index.html" : pathname;
  const staticRoot = resolve(staticDir);
  const filePath = resolve(join(staticRoot, decodeURIComponent(safePathname)));
  const relativePath = relative(staticRoot, filePath);

  if (relativePath.startsWith("..")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = extname(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": fileStats.size,
      "Content-Type": mimeTypes[extension] ?? "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendDownload(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
  filename: string
): void {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": contentType
  });
  response.end(body);
}
