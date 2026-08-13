import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  addUserConfigDataPath,
  loadUserConfig,
  parseSupportedAgent,
  readUserConfigDataPaths,
  removeUserConfigDataPath
} from "./user-config.js";

describe("user config", () => {
  it("loads an empty config when no file exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");

    try {
      const loaded = await loadUserConfig(configPath);

      assert.equal(loaded.exists, false);
      assert.deepEqual(loaded.errors, []);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "codex"), []);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("adds normalized agent data paths without duplicating them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");
    const dataPath = join(directory, "codex-data");

    try {
      const first = await addUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath
      });
      const second = await addUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath
      });
      const loaded = await loadUserConfig(configPath);
      const raw = await readFile(configPath, "utf8");

      assert.equal(first.added, true);
      assert.equal(second.added, false);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "codex"), [
        dataPath
      ]);
      assert.equal(JSON.parse(raw).schemaVersion, 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports invalid config shape without using unsafe values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");

    try {
      await writeFile(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          agents: {
            codex: {
              dataPaths: "C:\\Users\\someone\\.codex"
            }
          }
        })
      );

      const loaded = await loadUserConfig(configPath);

      assert.equal(loaded.exists, true);
      assert.equal(loaded.errors.length, 1);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "codex"), []);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("removes configured agent data paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");
    const firstPath = join(directory, "codex-one");
    const secondPath = join(directory, "codex-two");

    try {
      await addUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath: firstPath
      });
      await addUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath: secondPath
      });

      const result = await removeUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath: firstPath
      });
      const loaded = await loadUserConfig(configPath);

      assert.equal(result.removed, true);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "codex"), [
        secondPath
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps config unchanged when removing an unknown path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");
    const dataPath = join(directory, "codex-data");

    try {
      await addUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath
      });

      const result = await removeUserConfigDataPath({
        agent: "codex",
        configPath,
        dataPath: join(directory, "missing")
      });
      const loaded = await loadUserConfig(configPath);

      assert.equal(result.removed, false);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "codex"), [
        dataPath
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects unsupported agents", () => {
    assert.throws(
      () => parseSupportedAgent("gemini"),
      /Unsupported agent "gemini"/
    );
  });

  it("supports claude-desktop as a configured agent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-config-"));
    const configPath = join(directory, "config.json");
    const dataPath = join(directory, "claude-desktop-data");

    try {
      const added = await addUserConfigDataPath({
        agent: "claude-desktop",
        configPath,
        dataPath
      });
      const loaded = await loadUserConfig(configPath);

      assert.equal(added.added, true);
      assert.deepEqual(readUserConfigDataPaths(loaded.config, "claude-desktop"), [
        dataPath
      ]);
      assert.equal(parseSupportedAgent("claude-desktop"), "claude-desktop");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
