import fs from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;

/** Hand-rolled .env loader (legacy convention): real process.env wins over the file. */
export function loadEnvFile(dir: string = process.cwd()): void {
  try {
    const txt = fs.readFileSync(path.join(dir, ".env"), "utf8");
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
  } catch {
    /* no .env — rely on real environment variables */
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
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    stage1Model: env.STAGE1_MODEL ?? "",
    stage2Model: env.STAGE2_MODEL ?? "",
    kieModel: env.KIE_IMAGE_MODEL ?? "gpt-image-2-image-to-image",
    kieResolution: env.KIE_IMAGE_RESOLUTION ?? "1K",
    openrouterConfigured: Boolean(env.OPENROUTER_API_KEY),
    kieConfigured: Boolean(env.KIE_API_KEY),
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
