import type {
  MeasuredSiteData,
  BrandRequest,
  BrandExtraction,
  AdPromptRequest,
  AdPrompt,
  RenderRequest,
  BrandSummary,
  AdSummary,
  BrandDetail,
  AdminUser,
  Concept,
  ConceptBoard,
  Goal,
  ReferenceAd,
  ReferenceAdVariant,
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

export type UsageInfo = {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
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

/** Best-effort JSON parse: a proxy 502, an Express HTML error page, or an empty body must
 *  not throw a raw SyntaxError before we can build an ApiError. Returns null when the body
 *  is empty or not JSON. */
function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorShape(json: unknown): { message?: string; code?: string; stage?: ErrorStage } {
  if (json && typeof json === "object" && "error" in json) {
    const err = (json as { error: unknown }).error;
    if (err && typeof err === "object") return err as { message?: string; code?: string; stage?: ErrorStage };
  }
  return {};
}

async function request<T>(path: string, body?: unknown, method?: "GET" | "POST" | "DELETE" | "PATCH"): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const json = parseBody(text);

  if (!res.ok) {
    const err = errorShape(json);
    const fallback = text.trim() ? text.trim().slice(0, 300) : `Request failed (${res.status})`;
    throw new ApiError(err.message ?? fallback, err.code ?? "UNKNOWN", res.status, err.stage);
  }
  // Trusted fetch boundary — backend validates shape before sending; add a runtime validator here if ever needed.
  return json as T;
}

export type BatchItemStatus = "queued" | "running" | "done" | "error";
export type BatchItemView = {
  id: string; ideaNumber: number | null; ideaName: string | null;
  status: BatchItemStatus; imageUrl: string | null; error: string | null;
};
export type BatchView = { id: string; status: BatchItemStatus; items: BatchItemView[] };
export type BatchItemInput = { concept: Concept; referenceAdImage: string; logoImage: string; productAsset?: string };

export const api = {
  getConfig: () => request<AppConfig>("/api/config"),
  extract: (url: string) => request<MeasuredSiteData>("/api/extract", { url }),
  brand: (req: BrandRequest) =>
    request<{ id: string; brandExtraction: BrandExtraction; partialAnalysis: { missing: string[] } | null }>("/api/brand", req),
  getBrands: () => request<BrandSummary[]>("/api/brands"),
  getBrand: (id: string) => request<BrandDetail>(`/api/brand/${id}`),
  getAds: () => request<AdSummary[]>("/api/ads"),
  adPrompt: (req: AdPromptRequest) => request<{ id: string; adPrompt: AdPrompt }>("/api/ad-prompt", req),
  render: (req: RenderRequest) => request<{ id: string; imageUrl: string }>("/api/render", req),
  generateConceptBoard: (brandExtractionId: string, goal: Goal) =>
    request<{ board: ConceptBoard }>("/api/concept-board", { brandExtractionId, goal }),
  getConceptBoard: (brandId: string) =>
    request<{ board: ConceptBoard }>(`/api/concept-board/${brandId}`),
  setBrandGoal: (brandId: string, goal: Goal) =>
    request<{ ok: true }>(`/api/brand/${brandId}/goal`, { goal }, "PATCH"),
  startBatch: (req: { brandExtractionId: string; brandExtraction: BrandExtraction; items: BatchItemInput[] }) =>
    request<{ batchId: string }>("/api/batch", req),
  getBatch: (batchId: string) => request<BatchView>(`/api/batch/${batchId}`),
  getUsage: () => request<UsageInfo>("/api/usage"),
  getAdminUsers: () => request<AdminUser[]>("/api/admin/users"),
  deleteAdminUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${id}`, undefined, "DELETE"),
  setUserApproval: (id: string, approved: boolean) =>
    request<{ ok: true }>(`/api/admin/users/${id}/approval`, { approved }, "PATCH"),
  getReferenceAds: (variant: ReferenceAdVariant) =>
    request<ReferenceAd[]>(`/api/reference-ads?variant=${variant}`),
  adminCreateReferenceAd: (variant: ReferenceAdVariant, dataUrl: string, label: string | null) =>
    request<ReferenceAd>("/api/admin/reference-ads", { variant, dataUrl, label }),
  adminDeleteReferenceAd: (id: string) =>
    request<{ ok: true }>(`/api/admin/reference-ads/${id}`, undefined, "DELETE"),
};
