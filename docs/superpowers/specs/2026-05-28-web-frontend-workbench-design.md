# Web Frontend — Workbench Slice — Design

**Date:** 2026-05-28
**Branch:** `feature/web-frontend`
**Status:** Approved (autonomous build authorized); pending implementation plan
**Builds on:** Foundation slice (`2026-05-28-web-frontend-foundation-design.md`)

## Context

Foundation stood up `apps/web` with the design system, auth gate, app shell, and a typed
`api` client (`api.extract/brand/adPrompt/render`). This slice builds the **generate flow**:
the core value path of the product, against the live (today) backend endpoints. No Plan 5
dependency.

## Scope decision (important — narrower than legacy)

The legacy `app.html` workbench had an **angle picker + variant strip**: it generated N
copy angles client-side via the old thin `/chat` proxy, then rendered each. The new typed
backend does **not** expose multi-angle/concept generation — that is the **future batch
feature, explicitly out-of-scope** in the backend rebuild spec (no endpoint exists). So this
slice builds the **single-ad linear flow** only:

```
URL → ANALYZING (extract + brand) → PICK-REF (reference + logo [+ product asset?])
    → GENERATING (ad-prompt + render) → READY (preview + download)
```

Deferred (NOT this slice): angle variations / batch (needs a backend endpoint that doesn't
exist), saving to the library + "ship to Meta" (persistence — Slice D), saved-brand reuse
(Slice D).

## Endpoints used (all live today, all gated → bearer token via the Foundation api client)

- `api.extract(url)` → `MeasuredSiteData`
- `api.brand({ url, measuredSiteData })` → `{ brandExtraction }`
- `api.adPrompt({ brandExtraction, referenceAdImage, logoImage, productAsset? })` → `{ adPrompt }`
- `api.render({ adPrompt, referenceAdImage, logoImage, productAsset? })` → `{ imageUrl }`

Images are **base64 data URLs** (the backend contract). `referenceAdImage` and `logoImage`
are required by Stage 2/3; `productAsset` is optional (selects the w-Asset prompt server-side).

## State machine

A single `useReducer` owns the flow (no external store — YAGNI). Stage is a discriminated
union; data accumulates as stages advance.

```ts
type Stage = "idle" | "analyzing" | "pick-ref" | "generating" | "ready" | "error";

type WorkbenchState = {
  stage: Stage;
  url: string;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  refImage: string | null;       // base64 data URL
  logoImage: string | null;      // base64 data URL
  productAsset: string | null;    // base64 data URL, optional
  adPrompt: AdPrompt | null;
  imageUrl: string | null;
  error: string | null;          // user-facing message (from ApiError.message)
};
```

Transitions (actions): `START(url)` → analyzing; `ANALYZED(measuredSiteData, brandExtraction)`
→ pick-ref; `SET_REF/SET_LOGO/SET_PRODUCT(dataUrl|null)` (within pick-ref); `GENERATE` →
generating; `GENERATED(adPrompt, imageUrl)` → ready; `FAILED(message)` → error; `RESET` → idle.

The async orchestration (calling the api pairs) lives in the Workbench component's event
handlers, dispatching the result/`FAILED` actions. The reducer itself stays pure and is the
primary unit under test.

## Components & files (`apps/web/src/workbench/`)

- `state.ts` — `WorkbenchState`, `Action`, `initialState`, pure `reducer` (+ tested)
- `fileToDataUrl.ts` — `File → Promise<string>` via `FileReader` (+ tested)
- `brandChip.ts` — pure selectors reading the (all-optional) `BrandExtraction` defensively:
  `brandName`, `positioningLine`, `accentColor` (falls back to `measuredSiteData` accent, then
  a token default) (+ tested)
- `Dropzone.tsx` — reusable image dropzone (drag/click → file → `onPick(dataUrl)`); 3 call
  sites (ref, logo, product) justify the component
- `Workbench.tsx` — owns the reducer, renders the right stage view, runs the async handlers
- stage views (small components, can live in `Workbench.tsx` or sibling files): `StartView`
  (URL input), `AnalyzingView` (spinner + "Reading {domain}…"), `PickRefView` (BrandChip +
  three Dropzones + "Make my ad"), `GeneratingView` (spinner), `ReadyView` (image + Download +
  Start over), `ErrorView` (message + retry)

Reuses Foundation's ported CSS classes (`.stage`, `.btn`, `.dropzone`, `.badge`, `.field`,
`.brand-panel`, etc.) for visual fidelity.

## Routing

This slice replaces Foundation's `HomePlaceholder` at `/` with `<Workbench/>` (the flow
starts at `StartView`). Slice D adds the real Home dashboard and re-wires "Make an ad" to
launch the workbench; that reorganization is noted there, not done here.

## Error handling

`ApiError` thrown by the client → `FAILED(err.message)` → `ErrorView` showing the message and
a retry that returns to the appropriate prior stage (`analyzing` failures → back to `idle`;
`generating` failures → back to `pick-ref`, inputs preserved). 403 `NOT_APPROVED` shouldn't
occur (the gate already routed unapproved users away), but its message renders like any other.

## Testing

- `reducer` — every transition (idle→analyzing→pick-ref→generating→ready; FAILED from each
  async stage; RESET; SET_* within pick-ref). Pure, exhaustive.
- `fileToDataUrl` — resolves a data URL (mock `FileReader`).
- `brandChip` selectors — partial/empty `BrandExtraction` and the `measuredSiteData`/default
  fallbacks.
- `Workbench` integration — mock the `api` module, drive a full happy path
  (enter URL → analyzing → pick-ref → pick ref+logo → generate → ready shows image) and a
  failure path (api rejects → ErrorView). React Testing Library.

## Out of scope (this slice)

- Angle variations / batch generation (no backend endpoint; future).
- Saving generated ads, the library, saved-brand reuse, "ship to Meta" (Slice D / Plan 5).
- The Home dashboard (Slice D).
- Auth screen UI (Slice B).
