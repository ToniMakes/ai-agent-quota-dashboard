import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

export type PathInspection = {
  path: string;
  exists: boolean;
  readable: boolean;
  modifiedAt?: string;
  error?: string;
};

export async function inspectPath(path: string): Promise<PathInspection> {
  try {
    await access(path, constants.F_OK);
  } catch (error) {
    return {
      path,
      exists: false,
      readable: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  try {
    await access(path, constants.R_OK);
    const stats = await stat(path);

    return {
      path,
      exists: true,
      readable: true,
      modifiedAt: stats.mtime.toISOString()
    };
  } catch (error) {
    return {
      path,
      exists: true,
      readable: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function uniquePaths(paths: Array<string | undefined>): string[] {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

export function resolveDataPaths(
  defaultDataPaths: string[],
  configuredDataPaths: string[] = []
): string[] {
  return uniquePaths([...defaultDataPaths, ...configuredDataPaths]);
}
