import type {
  MeasuredSiteData,
  BrandRequest,
  BrandExtraction,
  AdPromptRequest,
  AdPrompt,
  RenderRequest,
} from "@bya/shared";

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stage1Model: string;
  stage2Model: string;
  kieModel: string;
  kieResolution: string;
  openrouterConfigured: boolean;
  kieConfigured: boolean;
  supabaseConfigured: boolean;
};

export type ErrorStage =
  | "extract" | "brand" | "ad-prompt" | "render"
  | "validation" | "auth" | "persistence";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly stage?: ErrorStage,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Supplies the current Supabase JWT for authed calls. AuthProvider sets it once the
 *  client exists; getConfig() runs before auth so a missing/null token is fine. */
let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(fn: () => Promise<string | null>): void {
  tokenProvider = fn;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(
      err.message ?? `Request failed (${res.status})`,
      err.code ?? "UNKNOWN",
      res.status,
      err.stage,
    );
  }
  // Trusted fetch boundary — backend validates shape before sending; add a runtime validator here if ever needed.
  return json as T;
}

export const api = {
  getConfig: () => request<AppConfig>("/api/config"),
  extract: (url: string) => request<MeasuredSiteData>("/api/extract", { url }),
  brand: (req: BrandRequest) => request<{ brandExtraction: BrandExtraction }>("/api/brand", req),
  adPrompt: (req: AdPromptRequest) => request<{ adPrompt: AdPrompt }>("/api/ad-prompt", req),
  render: (req: RenderRequest) => request<{ imageUrl: string }>("/api/render", req),
};
