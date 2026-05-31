// Ensure a base64 string is a full data URL (OpenRouter's image_url wants
// `data:...;base64,`). Ported from server.js asDataUrl.
export function asDataUrl(s: string | null | undefined): string | null {
  if (!s) return null;
  return String(s).startsWith("data:") ? String(s) : "data:image/png;base64," + s;
}
