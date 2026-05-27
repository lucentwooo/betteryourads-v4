import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";

const KEY = "BYA_ENVLOADER_TEST";

afterEach(() => {
  delete process.env[KEY];
});

describe("loadEnvFile upward search", () => {
  it("finds a .env in a parent directory when started from a nested cwd", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bya-env-"));
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_parent\n`, "utf8");
    const nested = path.join(root, "apps", "backend");
    fs.mkdirSync(nested, { recursive: true });

    loadEnvFile(nested);
    expect(process.env[KEY]).toBe("from_parent");
  });

  it("does not overwrite a value already present in process.env", () => {
    process.env[KEY] = "already_set";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bya-env-"));
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_file\n`, "utf8");

    loadEnvFile(root);
    expect(process.env[KEY]).toBe("already_set");
  });
});
