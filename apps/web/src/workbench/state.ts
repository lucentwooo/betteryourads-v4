import type { MeasuredSiteData, BrandExtraction, AdPrompt } from "@bya/shared";

export type Stage = "idle" | "analyzing" | "pick-ref" | "generating" | "ready" | "error";

export type WorkbenchState = {
  stage: Stage;
  url: string;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  brandExtractionId: string | null;
  refImage: string | null;
  logoImage: string | null;
  productAsset: string | null;
  adPrompt: AdPrompt | null;
  adPromptId: string | null;
  imageUrl: string | null;
  error: string | null;
  errorCode: string | null;
};

export const initialState: WorkbenchState = {
  stage: "idle",
  url: "",
  measuredSiteData: null,
  brandExtraction: null,
  brandExtractionId: null,
  refImage: null,
  logoImage: null,
  productAsset: null,
  adPrompt: null,
  adPromptId: null,
  imageUrl: null,
  error: null,
  errorCode: null,
};

export type Action =
  | { type: "START"; url: string }
  | { type: "ANALYZED"; measuredSiteData: MeasuredSiteData; brandExtraction: BrandExtraction; brandExtractionId: string }
  | { type: "SET_REF"; dataUrl: string | null }
  | { type: "SET_LOGO"; dataUrl: string | null }
  | { type: "SET_PRODUCT"; dataUrl: string | null }
  | { type: "GENERATE" }
  | { type: "GENERATED"; adPrompt: AdPrompt; adPromptId: string; imageUrl: string }
  | { type: "FAILED"; message: string; code?: string }
  | { type: "PRESET_BRAND"; brandExtraction: BrandExtraction; brandExtractionId: string; measuredSiteData: MeasuredSiteData | null; url?: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case "START":
      return { ...initialState, stage: "analyzing", url: action.url };
    case "ANALYZED":
      return { ...state, stage: "pick-ref", measuredSiteData: action.measuredSiteData, brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId };
    case "SET_REF":
      return { ...state, refImage: action.dataUrl };
    case "SET_LOGO":
      return { ...state, logoImage: action.dataUrl };
    case "SET_PRODUCT":
      return { ...state, productAsset: action.dataUrl };
    case "GENERATE":
      return { ...state, stage: "generating", error: null, errorCode: null };
    case "GENERATED":
      return { ...state, stage: "ready", adPrompt: action.adPrompt, adPromptId: action.adPromptId, imageUrl: action.imageUrl };
    case "FAILED":
      return { ...state, stage: "error", error: action.message, errorCode: action.code ?? null };
    case "PRESET_BRAND":
      return { ...initialState, stage: "pick-ref", brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId, measuredSiteData: action.measuredSiteData, url: action.url ?? "" };
    case "RETRY":
      // Analysis succeeded (we have brandExtraction) → keep inputs, return to pick-ref.
      // Otherwise the failure was during analysis → full reset.
      return state.brandExtraction
        ? { ...state, stage: "pick-ref", error: null, errorCode: null }
        : initialState;
    case "RESET":
      return initialState;
  }
}
