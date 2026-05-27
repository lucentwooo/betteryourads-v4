# Web Frontend Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-ad generate flow in `apps/web`: URL → analyzing (extract+brand) → pick reference+logo → generating (ad-prompt+render) → preview + download.

**Architecture:** One `useReducer` state machine (`workbench/state.ts`) owns the flow; the `Workbench` component runs async orchestration in handlers and dispatches results. Pure units (reducer, `fileToDataUrl`, brand-chip selectors) are TDD'd; views reuse Foundation's ported CSS classes and follow `legacy/app.html` for fidelity. Uses the existing Foundation `api` client unchanged.

**Tech Stack:** React 18 + TS, react-router-dom 6, Vitest + React Testing Library (all already configured in Foundation).

**Reference:** `legacy/app.html` (the original workbench markup/classes — consult for fidelity; do NOT copy its `/chat` logic, which is obsolete). `apps/web/src/api/client.ts` (the `api` object). `packages/shared/src/brand-extraction.ts` (all fields optional + passthrough).

---

## File Structure (all under `apps/web/src/workbench/` unless noted)

- `state.ts` (+ `state.test.ts`) — types, `initialState`, pure `reducer`
- `fileToDataUrl.ts` (+ `fileToDataUrl.test.ts`) — `File → Promise<string>`
- `brandChip.ts` (+ `brandChip.test.ts`) — defensive selectors over `BrandExtraction`
- `Dropzone.tsx` (+ `Dropzone.test.tsx`) — reusable image picker
- `Workbench.tsx` (+ `Workbench.test.tsx`) — flow component + stage views + integration test
- Modify: `apps/web/src/App.tsx` — route `/` renders `<Workbench/>` instead of `HomePlaceholder`

Run all commands from `apps/web`. Push after each commit.

---

### Task 1: Workbench state machine (reducer)

**Files:** Create `apps/web/src/workbench/state.ts`, `apps/web/src/workbench/state.test.ts`

- [ ] **Step 1: Write the failing test** — `state.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { reducer, initialState, type WorkbenchState } from "./state";

const at = (over: Partial<WorkbenchState>): WorkbenchState => ({ ...initialState, ...over });

describe("workbench reducer", () => {
  it("START moves idle → analyzing and records the url", () => {
    const s = reducer(initialState, { type: "START", url: "https://acme.com" });
    expect(s.stage).toBe("analyzing");
    expect(s.url).toBe("https://acme.com");
    expect(s.error).toBeNull();
  });

  it("ANALYZED moves analyzing → pick-ref with data", () => {
    const msd = { title: "Acme" } as never;
    const be = { brand_identity: { brand_name: "Acme" } } as never;
    const s = reducer(at({ stage: "analyzing" }), { type: "ANALYZED", measuredSiteData: msd, brandExtraction: be });
    expect(s.stage).toBe("pick-ref");
    expect(s.measuredSiteData).toBe(msd);
    expect(s.brandExtraction).toBe(be);
  });

  it("SET_REF / SET_LOGO / SET_PRODUCT store data urls in pick-ref", () => {
    let s = at({ stage: "pick-ref" });
    s = reducer(s, { type: "SET_REF", dataUrl: "data:ref" });
    s = reducer(s, { type: "SET_LOGO", dataUrl: "data:logo" });
    s = reducer(s, { type: "SET_PRODUCT", dataUrl: "data:prod" });
    expect(s.refImage).toBe("data:ref");
    expect(s.logoImage).toBe("data:logo");
    expect(s.productAsset).toBe("data:prod");
    expect(s.stage).toBe("pick-ref");
  });

  it("GENERATE moves pick-ref → generating", () => {
    const s = reducer(at({ stage: "pick-ref", refImage: "r", logoImage: "l" }), { type: "GENERATE" });
    expect(s.stage).toBe("generating");
  });

  it("GENERATED moves generating → ready with the image", () => {
    const ap = { ad_prompt: {} } as never;
    const s = reducer(at({ stage: "generating" }), { type: "GENERATED", adPrompt: ap, imageUrl: "https://img" });
    expect(s.stage).toBe("ready");
    expect(s.imageUrl).toBe("https://img");
    expect(s.adPrompt).toBe(ap);
  });

  it("FAILED moves to error and stores the message", () => {
    const s = reducer(at({ stage: "analyzing" }), { type: "FAILED", message: "boom" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("boom");
  });

  it("RESET returns to initialState", () => {
    const s = reducer(at({ stage: "ready", imageUrl: "x", url: "y" }), { type: "RESET" });
    expect(s).toEqual(initialState);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- state` → FAIL (no `./state`).

- [ ] **Step 3: Implement** — `state.ts`

```ts
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
    case "RESET":
      return initialState;
  }
}
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- state` → PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/state.ts apps/web/src/workbench/state.test.ts
git commit -m "feat(web): workbench state machine (reducer)"
git push
```

---

### Task 2: `fileToDataUrl` utility

**Files:** Create `apps/web/src/workbench/fileToDataUrl.ts`, `fileToDataUrl.test.ts`

- [ ] **Step 1: Write the failing test** — `fileToDataUrl.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { fileToDataUrl } from "./fileToDataUrl";

describe("fileToDataUrl", () => {
  it("resolves a base64 data URL for a file", async () => {
    const file = new File(["hello"], "x.png", { type: "image/png" });
    const url = await fileToDataUrl(file);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- fileToDataUrl` → FAIL.

- [ ] **Step 3: Implement** — `fileToDataUrl.ts`

```ts
/** Reads a File into a base64 data URL (the format the backend expects for images). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- fileToDataUrl` → PASS. (jsdom provides `FileReader`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/fileToDataUrl.ts apps/web/src/workbench/fileToDataUrl.test.ts
git commit -m "feat(web): fileToDataUrl helper for base64 image uploads"
git push
```

---

### Task 3: Brand-chip selectors

**Files:** Create `apps/web/src/workbench/brandChip.ts`, `brandChip.test.ts`

Context: `BrandExtraction` fields are ALL optional (`packages/shared/src/brand-extraction.ts`). `visual_brand_system.colors.accent` is a `string[]` (or absent). `measuredSiteData.colors.accent_cta` is `{hex,count}[]`. Selectors must never throw on partial data.

- [ ] **Step 1: Write the failing test** — `brandChip.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { brandName, positioningLine, accentColor } from "./brandChip";

describe("brandChip selectors", () => {
  it("brandName reads brand_identity.brand_name, falls back to 'Your brand'", () => {
    expect(brandName({ brand_identity: { brand_name: "Acme" } })).toBe("Acme");
    expect(brandName({})).toBe("Your brand");
    expect(brandName(null)).toBe("Your brand");
  });

  it("positioningLine prefers positioning_statement then one_line_description", () => {
    expect(positioningLine({ brand_identity: { positioning_statement: "P" } })).toBe("P");
    expect(positioningLine({ brand_identity: { one_line_description: "D" } })).toBe("D");
    expect(positioningLine({})).toBe("");
  });

  it("accentColor reads brand accent, falls back to measured accent_cta, then token default", () => {
    expect(accentColor({ visual_brand_system: { colors: { accent: ["#abc"] } } }, null)).toBe("#abc");
    expect(accentColor({}, { colors: { accent_cta: [{ hex: "#def", count: 3 }] } } as never)).toBe("#def");
    expect(accentColor({}, null)).toBe("var(--accent)");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- brandChip` → FAIL.

- [ ] **Step 3: Implement** — `brandChip.ts`

```ts
import type { BrandExtraction, MeasuredSiteData } from "@bya/shared";

export function brandName(be: BrandExtraction | null): string {
  return be?.brand_identity?.brand_name?.trim() || "Your brand";
}

export function positioningLine(be: BrandExtraction | null): string {
  const bi = be?.brand_identity;
  return (bi?.positioning_statement || bi?.one_line_description || "").trim();
}

export function accentColor(be: BrandExtraction | null, msd: MeasuredSiteData | null): string {
  const colors = be?.visual_brand_system?.colors;
  const brandAccent = colors?.accent?.[0] ?? colors?.primary?.[0];
  if (brandAccent) return brandAccent;
  const measured = msd?.colors?.accent_cta?.[0]?.hex;
  if (measured) return measured;
  return "var(--accent)";
}
```

Note: `visual_brand_system.colors.accent`/`primary` are `strList` (string arrays) per the schema; `.passthrough()` means `be.brand_identity` may carry extra keys but the typed ones suffice here. If TS narrows `colors.accent` as possibly non-array, guard with `Array.isArray` — adjust only if the compiler requires it.

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- brandChip` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/brandChip.ts apps/web/src/workbench/brandChip.test.ts
git commit -m "feat(web): defensive brand-chip selectors"
git push
```

---

### Task 4: Dropzone component

**Files:** Create `apps/web/src/workbench/Dropzone.tsx`, `Dropzone.test.tsx`

Behavior: a labelled image picker. Click opens the file input; drag-drop also works. On a chosen file it calls `fileToDataUrl` then `onPick(dataUrl)`. Shows a thumbnail preview when `value` (a data URL) is set, else the prompt label. Uses ported classes `.dropzone` / `.field`. Props:

```ts
type DropzoneProps = {
  label: string;
  value: string | null;       // current data URL (for preview)
  onPick: (dataUrl: string) => void;
  height?: number;            // px; default 160
};
```

- [ ] **Step 1: Write the failing test** — `Dropzone.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Dropzone } from "./Dropzone";

describe("Dropzone", () => {
  it("renders the label and calls onPick with a data URL when a file is chosen", async () => {
    const onPick = vi.fn();
    const { container } = render(<Dropzone label="Reference ad" value={null} onPick={onPick} />);
    expect(screen.getByText("Reference ad")).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "ad.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect((onPick.mock.calls[0][0] as string).startsWith("data:image/png;base64,")).toBe(true);
  });

  it("shows a preview image when value is set", () => {
    render(<Dropzone label="Logo" value="data:image/png;base64,AAAA" onPick={() => {}} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- Dropzone` → FAIL.

- [ ] **Step 3: Implement** — `Dropzone.tsx`

Implement a component meeting the test + behavior above. Required structure:
- A `<label className="field">` wrapping the visible `<div className="dropzone">`.
- A visually-hidden `<input type="file" accept="image/*">`; its `onChange` reads `e.target.files?.[0]`, and if present calls `await fileToDataUrl(file)` then `onPick(url)`.
- The `dropzone` div also handles `onDragOver` (preventDefault) and `onDrop` (read `e.dataTransfer.files?.[0]`, same path).
- When `value` is set, render `<img src={value} alt={label} style={{maxHeight: height ?? 160, ...}}/>`; else render the `label` text + a hint ("Drag an image or click to upload").
- Use the `height` prop (default 160) for the dropzone min-height (logo call site passes 96).

```tsx
import { useRef, type DragEvent, type ChangeEvent } from "react";
import { fileToDataUrl } from "./fileToDataUrl";

type DropzoneProps = {
  label: string;
  value: string | null;
  onPick: (dataUrl: string) => void;
  height?: number;
};

export function Dropzone({ label, value, onPick, height = 160 }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onPick(await fileToDataUrl(file));
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFile(e.target.files?.[0]);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <label className="field" style={{ display: "block" }}>
      <span>{label}</span>
      <div
        className="dropzone"
        style={{ minHeight: height, display: "grid", placeItems: "center", cursor: "pointer" }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {value ? (
          <img src={value} alt={label} style={{ maxHeight: height, maxWidth: "100%", objectFit: "contain" }} />
        ) : (
          <span className="hint">Drag an image or click to upload</span>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
      </div>
    </label>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- Dropzone` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/Dropzone.tsx apps/web/src/workbench/Dropzone.test.tsx
git commit -m "feat(web): reusable image Dropzone"
git push
```

---

### Task 5: Workbench component + stage views

**Files:** Create `apps/web/src/workbench/Workbench.tsx`

The component uses `useReducer(reducer, initialState)` and renders by `state.stage`. Async handlers dispatch results. Use the ported classes (`.stage`, `.btn`, `.badge`, `.brand-panel`, `.field`). Consult `legacy/app.html` for markup/structure fidelity (workbench stages), but wire everything to the reducer + `api` — do not reuse legacy JS.

Handlers:
- `runAnalyze(url)`: `dispatch START(url)`; then `try { const msd = await api.extract(url); const { brandExtraction } = await api.brand({ url, measuredSiteData: msd }); dispatch ANALYZED(msd, brandExtraction) } catch (e) { dispatch FAILED(message(e)) }`.
- `runGenerate()`: requires `refImage` && `logoImage`; `dispatch GENERATE`; then `try { const { adPrompt } = await api.adPrompt({ brandExtraction, referenceAdImage: refImage, logoImage, productAsset: productAsset ?? undefined }); const { imageUrl } = await api.render({ adPrompt, referenceAdImage: refImage, logoImage, productAsset: productAsset ?? undefined }); dispatch GENERATED(adPrompt, imageUrl) } catch (e) { dispatch FAILED(message(e)) }`.
- `message(e)`: `e instanceof ApiError ? e.message : "Something went wrong."` (import `ApiError` from `../api/client`).

Stage rendering (each a small inline component or block):
- `idle` → **StartView**: a `.stage` card with a heading ("Make an ad"), a URL `<input className="input">`, and a "Analyze brand" `.btn` (disabled when empty) → `runAnalyze(url)`.
- `analyzing` → **AnalyzingView**: `.stage` with "Reading {hostname of url}…" and a spinner/placeholder text.
- `pick-ref` → **PickRefView**: a `.brand-panel` chip showing `brandName(be)`, `positioningLine(be)`, and a color swatch `accentColor(be, msd)`; then `<Dropzone label="Reference ad" value={refImage} onPick={(d)=>dispatch SET_REF}/>`, `<Dropzone label="Logo" height={96} value={logoImage} onPick={SET_LOGO}/>`, `<Dropzone label="Product image (optional)" value={productAsset} onPick={SET_PRODUCT}/>`; a "Make my ad" `.btn.primary` disabled unless `refImage && logoImage` → `runGenerate()`.
- `generating` → **GeneratingView**: `.stage` "Generating your ad…" + spinner.
- `ready` → **ReadyView**: show `<img src={imageUrl}>`, a "Download" link (`<a href={imageUrl} download>`), and a "Start over" `.btn` → `dispatch RESET`.
- `error` → **ErrorView**: `.stage` showing `state.error`, plus a "Try again" `.btn` → `dispatch RESET`.

Default export the `Workbench` component. (Integration test is Task 6.)

- [ ] **Step 1: Implement `Workbench.tsx`** per the spec above (no test step here; covered by Task 6's integration test which will fail until this exists).

- [ ] **Step 2: Typecheck** — `npm run build` → `tsc --noEmit` must pass. Fix any type issues (e.g. `productAsset ?? undefined` to satisfy the optional request field).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/workbench/Workbench.tsx
git commit -m "feat(web): workbench flow component + stage views"
git push
```

---

### Task 6: Workbench integration test + route wiring

**Files:** Create `apps/web/src/workbench/Workbench.test.tsx`; Modify `apps/web/src/App.tsx`

- [ ] **Step 1: Write the failing integration test** — `Workbench.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Workbench from "./Workbench";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      extract: vi.fn(),
      brand: vi.fn(),
      adPrompt: vi.fn(),
      render: vi.fn(),
      getConfig: vi.fn(),
    },
  };
});
import { api } from "../api/client";

describe("Workbench flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drives URL → analyzing → pick-ref → generating → ready", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockResolvedValue({ imageUrl: "https://img/out.png" } as never);

    const { container } = render(<Workbench />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://img/out.png"));
  });

  it("shows an error when analysis fails", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("nope"));
    render(<Workbench />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- Workbench` → FAIL until `Workbench.tsx` satisfies the flow (and any selector wiring). Fix `Workbench.tsx` (Task 5) as needed so both tests pass.

Expected: the happy-path waits — after the ref+logo file changes resolve (async `fileToDataUrl`), the "Make my ad" button enables; clicking it runs ad-prompt+render and the result image appears.

- [ ] **Step 3: Run it, confirm it passes** — `npm test -- Workbench` → PASS (2 tests).

- [ ] **Step 4: Wire the route** — modify `apps/web/src/App.tsx`

Replace the `HomePlaceholder` import/usage so route `/` renders the workbench:

```tsx
import Workbench from "./workbench/Workbench";
```

Remove the `HomePlaceholder` function and change the `/` route element to `<Workbench />`. Leave `/library` → `LibraryPlaceholder` unchanged.

```tsx
<Route path="/" element={<Workbench />} />
<Route path="/library" element={<LibraryPlaceholder />} />
```

- [ ] **Step 5: Full suite + build** — `npm test` (all suites green) and `npm run build` (tsc clean + Vite build).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/workbench/Workbench.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): workbench integration test + route /"
git push
```

---

## Self-Review

**Spec coverage:** state machine → Task 1 ✅; base64 uploads → Task 2 ✅; defensive brand chip → Task 3 ✅; reusable Dropzone (3 call sites) → Task 4 ✅; full flow extract+brand / ad-prompt+render with stage views → Task 5 ✅; happy + failure integration + route `/` → Task 6 ✅. Angle variations / save / library correctly absent (deferred per spec).

**Placeholder scan:** No "TODO"/"add handling" gaps. Task 5 specifies exact handlers, actions, api calls, props, and classes; view JSX is fully constrained (legacy `app.html` is the fidelity reference). No vague steps.

**Type consistency:** `WorkbenchState`/`Action`/`reducer`/`initialState` defined in `state.ts`, consumed in `Workbench.tsx`. Selectors `brandName`/`positioningLine`/`accentColor` in `brandChip.ts` used by PickRefView. `Dropzone` props (`label`,`value`,`onPick`,`height`) match call sites. `api.adPrompt`/`render` request fields match `apps/backend` routes (`brandExtraction`, `referenceAdImage`, `logoImage`, `productAsset?`); `productAsset ?? undefined` satisfies the optional field. `ApiError` imported from `../api/client`.
