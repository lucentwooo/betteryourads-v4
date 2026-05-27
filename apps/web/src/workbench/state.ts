import type { MeasuredSiteData, BrandExtraction, AdPrompt } from "@bya/shared";

export type Stage = "idle" | "analyzing" | "pick-ref" | "generating" | "ready" | "error";

export type WorkbenchState = {
  stage: Stage;
  url: string;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  refImage: string | null;
  logoImage: string | null;
  productAsset: string | null;
  adPrompt: AdPrompt | null;
  imageUrl: string | null;
  error: string | null;
};

export const initialState: WorkbenchState = {
  stage: "idle",
  url: "",
  measuredSiteData: null,
  brandExtraction: null,
  refImage: null,
  logoImage: null,
  productAsset: null,
  adPrompt: null,
  imageUrl: null,
  error: null,
};

export type Action =
  | { type: "START"; url: string }
  | { type: "ANALYZED"; measuredSiteData: MeasuredSiteData; brandExtraction: BrandExtraction }
  | { type: "SET_REF"; dataUrl: string | null }
  | { type: "SET_LOGO"; dataUrl: string | null }
  | { type: "SET_PRODUCT"; dataUrl: string | null }
  | { type: "GENERATE" }
  | { type: "GENERATED"; adPrompt: AdPrompt; imageUrl: string }
  | { type: "FAILED"; message: string }
  | { type: "PRESET_BRAND"; brandExtraction: BrandExtraction; url?: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case "START":
      return { ...initialState, stage: "analyzing", url: action.url };
    case "ANALYZED":
      return { ...state, stage: "pick-ref", measuredSiteData: action.measuredSiteData, brandExtraction: action.brandExtraction };
    case "SET_REF":
      return { ...state, refImage: action.dataUrl };
    case "SET_LOGO":
      return { ...state, logoImage: action.dataUrl };
    case "SET_PRODUCT":
      return { ...state, productAsset: action.dataUrl };
    case "GENERATE":
      return { ...state, stage: "generating", error: null };
    case "GENERATED":
      return { ...state, stage: "ready", adPrompt: action.adPrompt, imageUrl: action.imageUrl };
    case "FAILED":
      return { ...state, stage: "error", error: action.message };
    case "PRESET_BRAND":
      return { ...initialState, stage: "pick-ref", brandExtraction: action.brandExtraction, url: action.url ?? "" };
    case "RETRY":
      // Analysis succeeded (we have brandExtraction) → keep inputs, return to pick-ref.
      // Otherwise the failure was during analysis → full reset.
      return state.brandExtraction
        ? { ...state, stage: "pick-ref", error: null }
        : initialState;
    case "RESET":
      return initialState;
  }
}
