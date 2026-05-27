# Web Frontend Home + Library + Saved-Brand Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Home dashboard, the Library, and saved-brand reuse against the real read endpoints; move the Workbench to `/create`.

**Architecture:** Extend the `api` client with `getBrands`/`getBrand`/`getAds` (typed via `@bya/shared` `BrandSummary`/`AdSummary`/`BrandDetail`). New `Home` and `Library` screens fetch on mount. The Workbench gains a `PRESET_BRAND` reducer action + a `?brandId=` loader for reuse. Routing: `/`→Home, `/create`→Workbench, `/library`→Library.

**Tech Stack:** React 18, react-router-dom 6 (`useSearchParams`, `Link`), Vitest + RTL. All endpoints gated → the client already attaches the bearer token.

**Reference:** `apps/web/src/api/client.ts`, `apps/web/src/workbench/{state.ts,Workbench.tsx}`, `apps/web/src/App.tsx`, `apps/web/src/shell/AppShell.tsx`, `legacy/app.html` (home/library markup).

Run commands from `apps/web`. Push after each commit.

---

### Task 1: API client read functions

**Files:** Modify `apps/web/src/api/client.ts`, `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Add a failing test** — append to `client.test.ts` (inside the existing `describe`)

```ts
  it("GETs /api/brands", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await api.getBrands();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brands");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("GETs /api/ads", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await api.getAds();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ads");
  });

  it("GETs /api/brand/:id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "b1" }), { status: 200 }));
    await api.getBrand("b1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brand/b1");
  });
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- client` → FAIL (`getBrands` not a function).

- [ ] **Step 3: Implement** — in `client.ts`

Extend the `@bya/shared` type import to add `BrandSummary, AdSummary, BrandDetail`. Update `brand` and add the three readers in the `api` object:

```ts
  brand: (req: BrandRequest) => request<{ id: string; brandExtraction: BrandExtraction }>("/api/brand", req),
  getBrands: () => request<BrandSummary[]>("/api/brands"),
  getBrand: (id: string) => request<BrandDetail>(`/api/brand/${id}`),
  getAds: () => request<AdSummary[]>("/api/ads"),
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- client` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/api/client.test.ts
git commit -m "feat(web): api client read functions (brands, brand/:id, ads)"
git push
```

---

### Task 2: Workbench PRESET_BRAND action

**Files:** Modify `apps/web/src/workbench/state.ts`, `apps/web/src/workbench/state.test.ts`

- [ ] **Step 1: Add a failing test** — append to `state.test.ts`

```ts
  it("PRESET_BRAND jumps to pick-ref with the loaded brand", () => {
    const be = { brand_identity: { brand_name: "Acme" } } as never;
    const s = reducer(initialState, { type: "PRESET_BRAND", brandExtraction: be, url: "https://acme.com" });
    expect(s.stage).toBe("pick-ref");
    expect(s.brandExtraction).toBe(be);
    expect(s.url).toBe("https://acme.com");
  });
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- state` → FAIL.

- [ ] **Step 3: Implement** — add to the `Action` union and `reducer` in `state.ts`

Union member:
```ts
  | { type: "PRESET_BRAND"; brandExtraction: BrandExtraction; url?: string }
```
Reducer case (before `RESET`):
```ts
    case "PRESET_BRAND":
      return { ...initialState, stage: "pick-ref", brandExtraction: action.brandExtraction, url: action.url ?? "" };
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- state` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/state.ts apps/web/src/workbench/state.test.ts
git commit -m "feat(web): PRESET_BRAND action for saved-brand reuse"
git push
```

---

### Task 3: Workbench preset loader (`?brandId=`)

**Files:** Modify `apps/web/src/workbench/Workbench.tsx`, `apps/web/src/workbench/Workbench.test.tsx`

- [ ] **Step 1: Add the preset loader to `Workbench.tsx`**

Import `useSearchParams` from `react-router-dom`. Add an effect that runs once: if `brandId` is present in the query and the stage is still `idle`, load the brand and preset it.

```tsx
import { useSearchParams } from "react-router-dom";
// ...
const [searchParams] = useSearchParams();
const brandId = searchParams.get("brandId");

useEffect(() => {
  if (!brandId) return;
  let active = true;
  api
    .getBrand(brandId)
    .then((detail) => {
      if (active) dispatch({ type: "PRESET_BRAND", brandExtraction: detail.brandExtraction });
    })
    .catch((e) => {
      if (active) dispatch({ type: "FAILED", message: e instanceof ApiError ? e.message : "Could not load that brand." });
    });
  return () => {
    active = false;
  };
}, [brandId]);
```

(Place after the `useReducer`. `ApiError` is already imported. `useEffect` may need adding to the React import.)

- [ ] **Step 2: Add a failing test** — append to `Workbench.test.tsx`

The existing file mocks `../api/client`. Add `getBrand: vi.fn()` to that mock's `api` object (update the mock factory). Then add:

```tsx
import { MemoryRouter } from "react-router-dom";
// ... (existing imports; the file already imports render/screen/waitFor)

it("presets a saved brand from ?brandId and lands in pick-ref", async () => {
  vi.mocked(api.getBrand).mockResolvedValue({
    id: "b1",
    brandExtraction: { brand_identity: { brand_name: "Acme" } },
    measuredSiteData: null,
  } as never);
  render(
    <MemoryRouter initialEntries={["/create?brandId=b1"]}>
      <Workbench />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
  // pick-ref shows the "Make my ad" button
  expect(screen.getByRole("button", { name: /make my ad/i })).toBeInTheDocument();
});
```

Note: the existing two flow tests render `<Workbench/>` without a router. Since `useSearchParams` requires a router context, wrap those existing renders in `<MemoryRouter>` too (update them minimally) so they keep passing. Add `getBrand: vi.fn()` to the mocked `api`.

- [ ] **Step 3: Run it, confirm it passes** — `npm test -- Workbench` → PASS (existing 3 + new 1 = 4; existing tests still green wrapped in MemoryRouter).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/workbench/Workbench.tsx apps/web/src/workbench/Workbench.test.tsx
git commit -m "feat(web): workbench loads a saved brand from ?brandId"
git push
```

---

### Task 4: Home dashboard

**Files:** Create `apps/web/src/home/Home.tsx`, `apps/web/src/home/Home.test.tsx`

- [ ] **Step 1: Write the failing test** — `Home.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getBrands: vi.fn(), getAds: vi.fn() } };
});
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
import { api } from "../api/client";
import { useAuth } from "../auth/useAuth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ email: "a@b.com" } as ReturnType<typeof useAuth>);
});

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

describe("Home", () => {
  it("shows stats, recent ads, and saved-brand pills", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" },
    ]);
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/x.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    renderHome();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://signed/x.png"));
    // a brand pill links to /create?brandId=b1
    const reuse = screen.getByRole("link", { name: /acme\.com/i });
    expect(reuse).toHaveAttribute("href", "/create?brandId=b1");
    // primary CTA links to /create
    expect(screen.getByRole("link", { name: /make .*ad/i })).toHaveAttribute("href", "/create");
  });

  it("renders without crashing when there is no data", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderHome();
    await waitFor(() => expect(screen.getByRole("link", { name: /make .*ad/i })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- Home` → FAIL.

- [ ] **Step 3: Implement** — `Home.tsx`

Build a dashboard with `useState` for `brands: BrandSummary[]` and `ads: AdSummary[]`, loaded in a `useEffect` (`api.getBrands()` + `api.getAds()`, guarded with an `active` flag; swallow errors into empty arrays or a small error note — keep simple). Render with ported classes:
- Greeting using `useAuth().email`.
- A primary CTA `<Link to="/create" className="btn primary">Make today's ad</Link>`.
- Stats: `brands.length` brands, `ads.length` ads.
- Recent ads: `ads.slice(0, 4)` → `<img src={ad.imageUrl} .../>` each.
- Saved brands: `brands.map` → `<Link to={`/create?brandId=${b.id}`} ...>{hostname(b.websiteUrl)}</Link>` (a small `hostname` helper: `try { return new URL(u).hostname } catch { return u }`). The link's accessible name must contain the hostname (e.g. "acme.com") for the test.

`export default function Home()`. Keep it a single file; helper `hostname` inline.

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- Home` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/home/Home.tsx apps/web/src/home/Home.test.tsx
git commit -m "feat(web): Home dashboard (stats, recent ads, saved-brand reuse)"
git push
```

---

### Task 5: Library

**Files:** Create `apps/web/src/library/Library.tsx`, `apps/web/src/library/Library.test.tsx`

- [ ] **Step 1: Write the failing test** — `Library.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Library from "./Library";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn() } };
});
import { api } from "../api/client";

beforeEach(() => vi.clearAllMocks());

describe("Library", () => {
  it("renders a grid of ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
      { id: "a2", imageUrl: "https://signed/2.png", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z" },
    ]);
    render(<MemoryRouter><Library /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("shows an empty state when there are no ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    render(<MemoryRouter><Library /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- Library` → FAIL.

- [ ] **Step 3: Implement** — `Library.tsx`

`useState<AdSummary[]>`, load via `api.getAds()` in a guarded `useEffect`. Render an H1 "My Ad Library" and a responsive grid (`display:grid; gridTemplateColumns: repeat(auto-fill, minmax(220px,1fr))`) of cards: each `<a href={ad.imageUrl} target="_blank" rel="noreferrer"><img src={ad.imageUrl} alt="" .../></a>` + a small `createdAt` date line. When the list is empty, render "No ads yet — generate one →" with a `<Link to="/create">`. `export default function Library()`.

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- Library` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/library/Library.tsx apps/web/src/library/Library.test.tsx
git commit -m "feat(web): Library grid of generated ads"
git push
```

---

### Task 6: Routing + nav wiring

**Files:** Modify `apps/web/src/App.tsx`, `apps/web/src/shell/AppShell.tsx`

- [ ] **Step 1: Update `App.tsx` routes**

Import `Home`, `Library`, keep `Workbench`. Remove the `LibraryPlaceholder`. Routes:

```tsx
<Route element={<AppShell />}>
  <Route path="/" element={<Home />} />
  <Route path="/create" element={<Workbench />} />
  <Route path="/library" element={<Library />} />
</Route>
```

Imports:
```tsx
import Home from "./home/Home";
import Library from "./library/Library";
import Workbench from "./workbench/Workbench";
```

- [ ] **Step 2: Update `AppShell.tsx` nav**

Add a "Make an ad" link and a Home link; keep Library. The rail should have: `<NavLink to="/">Home</NavLink>`, `<NavLink to="/create">Make an ad</NavLink>`, `<NavLink to="/library">Library</NavLink>` (Home already present from Foundation — adjust so all three exist).

- [ ] **Step 3: Full suite + build**

Run: `npm test` (all suites green — client, state, Workbench, Home, Library, auth, shell) and `npm run build` (tsc clean + Vite build).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/shell/AppShell.tsx
git commit -m "feat(web): route / → Home, /create → Workbench, /library → Library"
git push
```

---

## Self-Review

**Spec coverage:** read functions + `brand()` reconcile → Task 1 ✅; `PRESET_BRAND` → Task 2 ✅; `?brandId` reuse loader → Task 3 ✅; Home dashboard (greeting/CTA/stats/recent/brand pills) → Task 4 ✅; Library grid + empty → Task 5 ✅; routing `/`→Home, `/create`→Workbench, `/library`→Library + nav → Task 6 ✅. Out-of-scope (domain grouping, delete, angles, ship-to-Meta) absent.

**Placeholder scan:** Home/Library JSX is constrained by structure + the tests' assertions (img src, link hrefs, empty text); `hostname` helper specified inline. No "TODO" gaps.

**Type consistency:** `BrandSummary`/`AdSummary`/`BrandDetail` from `@bya/shared` used in `client.ts` and the screens. `PRESET_BRAND` added to `Action`, handled in `reducer`, dispatched by Workbench's loader. Routes/imports match new file paths (`home/Home`, `library/Library`, `workbench/Workbench`). The Workbench `useSearchParams` requires a router — provided by `App.tsx`'s `BrowserRouter` (prod) and `MemoryRouter` (tests). Existing Workbench flow tests are wrapped in `MemoryRouter` so they keep passing.
