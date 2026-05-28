import fs from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;

/** Hand-rolled .env loader (legacy convention): real process.env wins over the file.
 *  Searches upward from startDir for the nearest .env (monorepo: scripts run from a
 *  workspace dir, but .env lives at the repo root). */
export function loadEnvFile(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (;;) {
    let txt: string;
    try {
      txt = fs.readFileSync(path.join(dir, ".env"), "utf8");
    } catch (e) {
      // Only "file not found" means "keep looking upward"; surface real read errors
      // (e.g. EACCES) rather than silently walking past an unreadable .env.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const parent = path.dirname(dir);
      if (parent === dir) return; // reached filesystem root, no .env found
      dir = parent;
      continue;
    }
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
    return;
  }
}

export interface AppConfig {
  stage1Model: string;
  stage2Model: string;
  kieModel: string;
  kieResolution: string;
  openrouterConfigured: boolean;
  kieConfigured: boolean;
  supabaseConfigured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    stage1Model: env.STAGE1_MODEL ?? "",
    stage2Model: env.STAGE2_MODEL ?? "",
    kieModel: env.KIE_IMAGE_MODEL ?? "gpt-image-2-image-to-image",
    kieResolution: env.KIE_IMAGE_RESOLUTION ?? "1K",
    openrouterConfigured: Boolean(env.OPENROUTER_API_KEY),
    kieConfigured: Boolean(env.KIE_API_KEY),
    // Frontend auth needs the anon key too (returned to the browser), so it counts toward
    // "configured" — otherwise /api/config can report ready while client auth can't init.
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY),
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseAnonKey: env.SUPABASE_ANON_KEY ?? "",
  };
}
