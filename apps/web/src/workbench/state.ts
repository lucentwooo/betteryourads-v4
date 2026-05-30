import type { MeasuredSiteData, BrandExtraction, Concept } from "@bya/shared";
import type { BatchItemView } from "../api/client";

export type Stage = "empty" | "pick-assets" | "batch-running" | "batch-done" | "error";

export type AssetSlot = "ref" | "logo" | "product";
export type ConceptAssets = { ref?: string; logo?: string; product?: string };

export type WorkbenchState = {
  stage: Stage;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  brandExtractionId: string | null;
  selectedConcepts: Concept[];
  assets: Record<number, ConceptAssets>;
  batchId: string | null;
  batchItems: BatchItemView[];
  error: string | null;
  errorCode: string | null;
};

export const initialState: WorkbenchState = {
  stage: "empty",
  measuredSiteData: null,
  brandExtraction: null,
  brandExtractionId: null,
  selectedConcepts: [],
  assets: {},
  batchId: null,
  batchItems: [],
  error: null,
  errorCode: null,
};

export type Action =
  | { type: "PRESET"; brandExtraction: BrandExtraction; brandExtractionId: string; measuredSiteData: MeasuredSiteData | null; concepts: Concept[] }
  | { type: "SET_ASSET"; index: number; slot: AssetSlot; dataUrl: string | null }
  | { type: "COPY_ASSETS_TO_ALL"; index: number }
  | { type: "BATCH_STARTED"; batchId: string }
  | { type: "BATCH_UPDATED"; items: BatchItemView[] }
  | { type: "BATCH_DONE"; items: BatchItemView[] }
  | { type: "FAILED"; message: string; code?: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case "PRESET":
      return {
        ...initialState,
        stage: "pick-assets",
        brandExtraction: action.brandExtraction,
        brandExtractionId: action.brandExtractionId,
        measuredSiteData: action.measuredSiteData,
        selectedConcepts: action.concepts,
      };
    case "SET_ASSET":
      return {
        ...state,
        assets: { ...state.assets, [action.index]: { ...state.assets[action.index], [action.slot]: action.dataUrl ?? undefined } },
      };
    case "COPY_ASSETS_TO_ALL": {
      const src = state.assets[action.index];
      if (!src) return state;
      const next: Record<number, ConceptAssets> = {};
      for (let i = 0; i < state.selectedConcepts.length; i++) next[i] = { ...src };
      return { ...state, assets: { ...state.assets, ...next } };
    }
    case "BATCH_STARTED":
      return { ...state, stage: "batch-running", batchId: action.batchId, error: null, errorCode: null };
    case "BATCH_UPDATED":
      return { ...state, batchItems: action.items };
    case "BATCH_DONE":
      return { ...state, stage: "batch-done", batchItems: action.items };
    case "FAILED":
      return { ...state, stage: "error", error: action.message, errorCode: action.code ?? null };
    case "RETRY":
      return state.selectedConcepts.length > 0
        ? { ...state, stage: "pick-assets", error: null, errorCode: null }
        : initialState;
    case "RESET":
      return initialState;
  }
}
