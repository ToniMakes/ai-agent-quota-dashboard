import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

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
    await walk(root, 0);

    if (candidates.length >= maxFiles) {
      break;
    }
  }

  return candidates;

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || candidates.length >= maxFiles) {
      return;
    }

    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (candidates.length >= maxFiles) {
        return;
      }

      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile() || !options.namePattern.test(entry.name)) {
        continue;
      }

      try {
        const fileStats = await stat(fullPath);

        if (fileStats.size > maxBytes) {
          continue;
        }

        candidates.push({
          path: fullPath,
          content: await readFile(fullPath, "utf8")
        });
      } catch {
        continue;
      }
    }
  }
}
