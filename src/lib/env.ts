export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
export const env = {
  appPassword: () => requireEnv("APP_PASSWORD"),
  sessionSecret: () => requireEnv("SESSION_SECRET"),
  openrouterKey: () => requireEnv("OPENROUTER_API_KEY"),
  stage1Model: () => process.env.STAGE1_MODEL || "deepseek/deepseek-v4-flash",
  stage2Model: () => process.env.STAGE2_MODEL || "openai/gpt-5-nano",
  kieKey: () => requireEnv("KIE_API_KEY"),
  kieModel: () => process.env.KIE_IMAGE_MODEL || "gpt-image-2-image-to-image",
  kieResolution: () => process.env.KIE_IMAGE_RESOLUTION || "1K",
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
};
