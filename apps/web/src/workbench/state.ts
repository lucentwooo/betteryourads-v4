import type { MeasuredSiteData, BrandExtraction, ConceptSet } from "@bya/shared";
import type { BatchItemView } from "../api/client";

export type Stage =
  | "idle" | "analyzing"
  | "concepts-loading" | "pick-concepts" | "pick-assets" | "batch-running" | "batch-done"
  | "error";

export type AssetSlot = "ref" | "logo" | "product";
export type ConceptAssets = { ref?: string; logo?: string; product?: string };

export type WorkbenchState = {
  stage: Stage;
  url: string;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  brandExtractionId: string | null;
  conceptSet: ConceptSet | null;
  selectedIdeaNumbers: number[];
  assets: Record<number, ConceptAssets>;
  batchId: string | null;
  batchItems: BatchItemView[];
  error: string | null;
  errorCode: string | null;
};

export const initialState: WorkbenchState = {
  stage: "idle",
  url: "",
  measuredSiteData: null,
  brandExtraction: null,
  brandExtractionId: null,
  conceptSet: null,
  selectedIdeaNumbers: [],
  assets: {},
  batchId: null,
  batchItems: [],
  error: null,
  errorCode: null,
};

export type Action =
  | { type: "START"; url: string }
  | { type: "ANALYZED"; measuredSiteData: MeasuredSiteData; brandExtraction: BrandExtraction; brandExtractionId: string }
  | { type: "PRESET_BRAND"; brandExtraction: BrandExtraction; brandExtractionId: string; measuredSiteData: MeasuredSiteData | null; url?: string }
  | { type: "CONCEPTS_READY"; conceptSet: ConceptSet }
  | { type: "TOGGLE_CONCEPT"; ideaNumber: number }
  | { type: "PROCEED_ASSETS" }
  | { type: "BACK_TO_CONCEPTS" }
  | { type: "SET_ASSET"; ideaNumber: number; slot: AssetSlot; dataUrl: string | null }
  | { type: "COPY_ASSETS_TO_ALL"; ideaNumber: number }
  | { type: "BATCH_STARTED"; batchId: string }
  | { type: "BATCH_UPDATED"; items: BatchItemView[] }
  | { type: "BATCH_DONE"; items: BatchItemView[] }
  | { type: "FAILED"; message: string; code?: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case "START":
      return { ...initialState, stage: "analyzing", url: action.url };
    case "ANALYZED":
      return { ...state, stage: "concepts-loading", measuredSiteData: action.measuredSiteData, brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId };
    case "PRESET_BRAND":
      return { ...initialState, stage: "concepts-loading", brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId, measuredSiteData: action.measuredSiteData, url: action.url ?? "" };
    case "CONCEPTS_READY":
      return { ...state, stage: "pick-concepts", conceptSet: action.conceptSet };
    case "TOGGLE_CONCEPT": {
      const has = state.selectedIdeaNumbers.includes(action.ideaNumber);
      return {
        ...state,
        selectedIdeaNumbers: has
          ? state.selectedIdeaNumbers.filter((n) => n !== action.ideaNumber)
          : [...state.selectedIdeaNumbers, action.ideaNumber],
      };
    }
    case "PROCEED_ASSETS":
      return { ...state, stage: "pick-assets" };
    case "BACK_TO_CONCEPTS":
      return { ...state, stage: "pick-concepts" };
    case "SET_ASSET":
      return {
        ...state,
        assets: { ...state.assets, [action.ideaNumber]: { ...state.assets[action.ideaNumber], [action.slot]: action.dataUrl ?? undefined } },
      };
    case "COPY_ASSETS_TO_ALL": {
      const src = state.assets[action.ideaNumber];
      if (!src) return state;
      const next: Record<number, ConceptAssets> = {};
      for (const n of state.selectedIdeaNumbers) next[n] = { ...src };
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
      return state.conceptSet
        ? { ...state, stage: "pick-concepts", error: null, errorCode: null }
        : initialState;
    case "RESET":
      return initialState;
  }
}
