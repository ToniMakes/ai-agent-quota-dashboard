import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export type CandidateFile = {
  path: string;
  content: string;
};

export type FindCandidateFileOptions = {
  maxDepth?: number;
  maxFiles?: number;
  maxBytes?: number;
  namePattern: RegExp;
};

export async function findReadableCandidateFiles(
  roots: string[],
  options: FindCandidateFileOptions
): Promise<CandidateFile[]> {
  const maxDepth = options.maxDepth ?? 4;
  const maxFiles = options.maxFiles ?? 20;
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const candidates: CandidateFile[] = [];

  for (const root of roots) {
    await collect(root, 0);

    if (candidates.length >= maxFiles) {
      break;
    }
  }

  return candidates;

  async function collect(path: string, depth: number): Promise<void> {
    if (depth > maxDepth || candidates.length >= maxFiles) {
      return;
    }

    let pathStats;

    try {
      pathStats = await stat(path);
    } catch {
      return;
    }

    if (pathStats.isFile()) {
      await maybeAddFile(path, basename(path), pathStats.size);
      return;
    }

    if (!pathStats.isDirectory()) {
      return;
    }

    let entries;

    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (candidates.length >= maxFiles) {
        return;
      }

      const fullPath = join(path, entry.name);

      if (entry.isDirectory()) {
        await collect(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const fileStats = await stat(fullPath);
        await maybeAddFile(fullPath, entry.name, fileStats.size);
      } catch {
        continue;
      }
    }
  }

  async function maybeAddFile(
    path: string,
    name: string,
    size: number
  ): Promise<void> {
    if (candidates.length >= maxFiles) {
      return;
    }

    if (size > maxBytes || !options.namePattern.test(name)) {
      return;
    }

    try {
      candidates.push({
        path,
        content: await readFile(path, "utf8")
      });
    } catch {
      return;
    }
  }
}
