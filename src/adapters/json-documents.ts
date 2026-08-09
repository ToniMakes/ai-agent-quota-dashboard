export function parseJsonDocuments(text: string): unknown[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();

  if (!trimmed) {
    return [];
  }

  try {
    return [JSON.parse(trimmed)];
  } catch {
    // Fall through to JSONL parsing.
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
}
