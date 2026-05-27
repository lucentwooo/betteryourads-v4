import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";

const KEY = "BYA_ENVLOADER_TEST";
const tempDirs: string[] = [];

function tempRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bya-env-"));
  tempDirs.push(d);
  return d;
}

afterEach(() => {
  delete process.env[KEY];
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("loadEnvFile upward search", () => {
  it("finds a .env in a parent directory when started from a nested cwd", () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_parent\n`, "utf8");
    const nested = path.join(root, "apps", "backend");
    fs.mkdirSync(nested, { recursive: true });

    loadEnvFile(nested);
    expect(process.env[KEY]).toBe("from_parent");
  });

  it("does not overwrite a value already present in process.env", () => {
    process.env[KEY] = "already_set";
    const root = tempRoot();
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_file\n`, "utf8");

    loadEnvFile(root);
    expect(process.env[KEY]).toBe("already_set");
  });

  it("returns quietly when no .env exists up the chain", () => {
    const root = tempRoot();
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });

    expect(() => loadEnvFile(nested)).not.toThrow();
    expect(process.env[KEY]).toBeUndefined();
  });
});
