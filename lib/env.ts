// Typed process.env getters. Next.js auto-loads .env, so the hand-rolled file
// reader from server.js (loadEnv) is gone — these accessors replace it.
//
// Server-only: never import this from a client component. The secret getters
// (OpenRouter / KIE / Supabase service-role keys) must never reach the browser.

const str = (v: string | undefined): string => v || "";

export const SUPABASE_URL = (): string => str(process.env.SUPABASE_URL);
export const SUPABASE_ANON_KEY = (): string => str(process.env.SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_ROLE_KEY = (): string => str(process.env.SUPABASE_SERVICE_ROLE_KEY);

export const OPENROUTER_API_KEY = (): string => str(process.env.OPENROUTER_API_KEY);
export const KIE_API_KEY = (): string => str(process.env.KIE_API_KEY);

export const STAGE1_MODEL = (): string => str(process.env.STAGE1_MODEL);
export const STAGE2_MODEL = (): string => str(process.env.STAGE2_MODEL);

export const KIE_IMAGE_MODEL = (): string => str(process.env.KIE_IMAGE_MODEL);
export const KIE_IMAGE_RESOLUTION = (): string => str(process.env.KIE_IMAGE_RESOLUTION);
export const IMAGE_BACKEND = (): string => (process.env.IMAGE_BACKEND || "kie").toLowerCase();

export const OPENROUTER_IMAGE_MODEL = (): string => str(process.env.OPENROUTER_IMAGE_MODEL);
export const OPENROUTER_IMAGE_MODELS = (): string => str(process.env.OPENROUTER_IMAGE_MODELS);
export const OPENROUTER_CHAT_MODELS = (): string => str(process.env.OPENROUTER_CHAT_MODELS);
