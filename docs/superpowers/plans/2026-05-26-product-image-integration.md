# Product / UI Image Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach up to 3 product/UI/mockup images, saved per brand, that the AI places into the generated ad with maximum-fidelity "don't alter the UI" prompting.

**Architecture:** Browser-direct CRUD via `Auth.client` (mirrors the existing brands flow) against a new `brand_assets` table + private `brand-assets` storage bucket. Selected assets are sent as base64 to the existing `/kie/generate` proxy (appended to `input_urls`) and attached to the Stage 2 vision call with a runtime "reproduce faithfully, never invent UI" directive. No baked-prompt edits; additive and optional.

**Tech Stack:** Vanilla JS + Express (no framework, no bundler, **no test suite, no linter** — verification is "server boots" + manual browser checklist), Supabase (anon key + RLS in the browser; service role server-side), KIE GPT-Image-2.

**Reference spec:** `docs/superpowers/specs/2026-05-26-product-image-integration-design.md`

**Note on verification:** This repo has no automated tests. Each task's verification is a structural check and/or starting the server (`npm start`) and confirming it boots without error. Full end-to-end requires the user to run the new SQL in their Supabase dashboard and have KIE/Supabase keys in `.env` — called out in Task 1 and the final hand-off, not blocking code completion.

---

## File Structure

- **Modify** `supabase/schema.sql` — append `brand_assets` table + `brand-assets` bucket + 3 storage policies (idempotent).
- **Modify** `server.js` (`/kie/generate`, ~lines 269–307) — accept optional `productImages` base64 array, append to `input_urls`.
- **Modify** `index.html`:
  - HTML: new "Product / UI images" block in Stage 3 (after line 188).
  - JS: element refs + module vars; downscale helper; brand-asset CRUD (`loadBrandAssets`, `addProductAsset`, `deleteProductAsset`, `renderProductAssets`); selection state + `productAssetDataUrls`; hooks into brand switch + auth load; generation wiring in `runKieGeneration` and `runStage2`.

---

## Task 1: Database schema — `brand_assets` table, bucket, policies

**Files:**
- Modify: `supabase/schema.sql` (append at end, after the `ads` storage policy at line ~85)

- [ ] **Step 1: Append the schema block**

Add to the very end of `supabase/schema.sql`:

```sql

-- brand_assets: user-uploaded product / UI / mockup images, saved per brand.
-- Bytes live in the private `brand-assets` Storage bucket; rows inserted by the
-- browser via Auth.client (anon key + user JWT) under RLS, like `brands`.
create table if not exists public.brand_assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_id    uuid not null references public.brands(id) on delete cascade,
  image_path  text not null,
  kind        text not null default 'product',
  label       text,
  created_at  timestamptz not null default now()
);
alter table public.brand_assets enable row level security;
drop policy if exists "own brand_assets" on public.brand_assets;
create policy "own brand_assets" on public.brand_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage: private bucket for product assets. Unlike `ads` (server-written, read-only
-- policy), this bucket is written FROM THE BROWSER, so it needs read+insert+delete,
-- each scoped to the user's <uid>/ prefix.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

drop policy if exists "own brand-asset files read" on storage.objects;
create policy "own brand-asset files read" on storage.objects
  for select to authenticated using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own brand-asset files write" on storage.objects;
create policy "own brand-asset files write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own brand-asset files delete" on storage.objects;
create policy "own brand-asset files delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Verify idempotency/syntax by reading it back**

The block uses only `create table if not exists`, `insert ... on conflict do nothing`, and `drop policy if exists` + `create policy` — safe to re-run. Confirm no stray duplicate policy names against the existing file (existing storage policy is `"own ad files read"`; ours are all `"... brand-asset ..."` — no collision).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add brand_assets table and brand-assets storage bucket

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> **Hand-off note (not a code step):** the user must paste the updated `schema.sql` into the Supabase SQL editor and run it before the feature works end-to-end.

---

## Task 2: Server — `/kie/generate` accepts `productImages`

**Files:**
- Modify: `server.js` (the `/kie/generate` handler, ~lines 269–307)

- [ ] **Step 1: Destructure `productImages` from the body**

In `server.js`, change the destructuring line (currently line ~274):

```js
let { prompt, referenceImage, logoImage, aspect_ratio, resolution } = req.body || {};
```

to:

```js
let { prompt, referenceImage, logoImage, productImages, aspect_ratio, resolution } = req.body || {};
```

- [ ] **Step 2: Upload product images and append to `input_urls`**

Replace the `input_urls` construction (currently lines ~285–288):

```js
    // Reference ad first, brand logo second.
    const input_urls = [
      await kieUploadBase64(apiKey, referenceImage, "reference.png"),
      await kieUploadBase64(apiKey, logoImage, "logo.png"),
    ];
```

with:

```js
    // Reference ad first, brand logo second, then up to 3 product/UI assets.
    const input_urls = [
      await kieUploadBase64(apiKey, referenceImage, "reference.png"),
      await kieUploadBase64(apiKey, logoImage, "logo.png"),
    ];
    const products = Array.isArray(productImages) ? productImages.filter(Boolean).slice(0, 3) : [];
    for (let i = 0; i < products.length; i++) {
      input_urls.push(await kieUploadBase64(apiKey, products[i], "product" + (i + 1) + ".png"));
    }
```

- [ ] **Step 3: Verify the server still boots**

Run: `npm start`
Expected: prints "Site analyzer running." and "Open -> http://localhost:3000" with no syntax error. Stop it with Ctrl-C (or it may say port busy and increment — that's fine, still booted).

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): accept optional product images in /kie/generate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend — Stage 3 HTML block + downscale helper + module vars/refs

**Files:**
- Modify: `index.html` (HTML ~after line 188; JS in the `<script>` block)

- [ ] **Step 1: Add the Stage 3 HTML block**

In `index.html`, immediately after line 188 (`<div id="logoPreview3" style="margin-top:8px;"></div>`), insert:

```html

  <label style="margin-top:16px;">Product / UI images (optional)</label>
  <p class="hint" id="productAssetsHint">The AI places these into the ad's product area and is told to reproduce them faithfully — but generated images are never pixel-perfect, so fine UI text may soften. Up to 3 per generation.</p>
  <div id="productAssetsList" style="display:flex; flex-wrap:wrap; gap:8px; margin:8px 0;"></div>
  <input id="productAssetInput" type="file" accept="image/*" style="padding:8px;" />
  <div id="productAssetStatus" class="hint" style="margin-top:6px;"></div>
```

- [ ] **Step 2: Add element refs and module vars**

Find the Stage 3 element refs near line 1310–1314 (`refImage3El`, `logoImage3El`, `aspectRatioEl`). Immediately after `const aspectRatioEl = $("aspectRatio");`, add:

```js
  const productAssetInputEl = $("productAssetInput");
  const productAssetsListEl = $("productAssetsList");
  const productAssetStatusEl = $("productAssetStatus");
```

Find the data-URL module vars near line 1333–1335 (`refImage3DataUrl`, `logoImage3DataUrl`). Immediately after `let logoImage3DataUrl = null;`, add:

```js
  // Product/UI assets saved for the current brand. `loadedProductAssets` holds
  // { id, image_path, label, dataUrl, selected }. `productAssetDataUrls` (computed)
  // is the base64 list of selected assets sent to generation.
  let loadedProductAssets = [];
  let productAssetDataUrls = [];
  function recomputeSelectedProductAssets() {
    productAssetDataUrls = loadedProductAssets.filter((a) => a.selected && a.dataUrl).map((a) => a.dataUrl);
  }
```

- [ ] **Step 3: Add the client-side downscale helper**

Find the existing `readImageFile` helper (~line 1866). Immediately before it, add a downscale helper (reuses a canvas; returns a base64 data URL, longest side ≤ 1600px):

```js
  // Downscale an image File to a base64 data URL with longest side <= maxDim, to keep
  // request bodies small. Falls back to the raw FileReader result on any failure.
  function downscaleImageFile(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            // PNG preserves crisp UI text better than JPEG for screenshots.
            resolve(canvas.toDataURL("image/png"));
          } catch (e) {
            resolve(reader.result); // fall back to original
          }
        };
        img.onerror = () => resolve(reader.result);
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }
```

- [ ] **Step 4: Verify it still loads**

Run: `npm start`, open `http://localhost:3000`. Expected: page loads, no JS console error (`productAssetInput` etc. exist). The new block renders below "Brand logo". Stop the server.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(web): add Stage 3 product-image UI scaffold and downscale helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — brand-asset CRUD (browser-direct via `Auth.client`)

**Files:**
- Modify: `index.html` (JS — add CRUD functions; hook brand switch + auth load)

**Context:** `Auth.client` is the browser Supabase client (anon key + user session). `currentBrandId` is the selected/saved brand (null when none). The brands flow at lines ~2435–2492 is the pattern to mirror.

- [ ] **Step 1: Add render + CRUD functions**

Add this block just after the `logoImage3El`/`refImage3El` change listeners (~line 1882, after the `logoImage3El.addEventListener(...)` line):

```js
  // ===== Product / UI assets (saved per brand) =====

  function setProductAssetStatus(msg, kind) {
    productAssetStatusEl.textContent = msg || "";
    productAssetStatusEl.style.color = kind === "error" ? "var(--err, #c0392b)" : "";
  }

  function renderProductAssets() {
    productAssetsListEl.innerHTML = "";
    if (!currentBrandId) {
      productAssetInputEl.disabled = true;
      setProductAssetStatus("Save a brand first to attach product images.", "");
      return;
    }
    productAssetInputEl.disabled = false;
    if (!loadedProductAssets.length) {
      setProductAssetStatus("No product images yet for this brand. Add one below.", "");
    } else {
      setProductAssetStatus("");
    }
    const selectedCount = loadedProductAssets.filter((a) => a.selected).length;
    loadedProductAssets.forEach((a) => {
      const tile = document.createElement("div");
      tile.style.cssText = "position:relative; width:88px;";
      const cap = (selectedCount >= 3 && !a.selected);
      tile.innerHTML =
        '<img src="' + (a.dataUrl || "") + '" alt="' + (a.label || "product") + '" style="width:88px; height:88px; object-fit:cover; border:2px solid ' +
        (a.selected ? "var(--accent, #2d7ff9)" : "var(--border)") + '; border-radius:8px; opacity:' + (cap ? "0.4" : "1") + ';" />' +
        '<label style="display:block; font-size:11px; margin-top:2px;"><input type="checkbox" class="pa-select"' + (a.selected ? " checked" : "") + (cap ? " disabled" : "") + ' /> use</label>' +
        '<button type="button" class="pa-del" title="Delete" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; border:none; background:#c0392b; color:#fff; cursor:pointer; line-height:1;">×</button>';
      tile.querySelector(".pa-select").addEventListener("change", function (e) {
        a.selected = e.target.checked;
        recomputeSelectedProductAssets();
        renderProductAssets();
      });
      tile.querySelector(".pa-del").addEventListener("click", function () { deleteProductAsset(a); });
      productAssetsListEl.appendChild(tile);
    });
  }

  // Load a Blob into a base64 data URL.
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read blob"));
      r.readAsDataURL(blob);
    });
  }

  async function loadBrandAssets() {
    loadedProductAssets = [];
    recomputeSelectedProductAssets();
    if (!Auth.client || !currentBrandId) { renderProductAssets(); return; }
    const { data, error } = await Auth.client
      .from("brand_assets").select("id,image_path,label,created_at")
      .eq("brand_id", currentBrandId).order("created_at", { ascending: false });
    if (error) { setProductAssetStatus("Couldn't load product images: " + error.message, "error"); return; }
    for (const row of data || []) {
      let dataUrl = "";
      const dl = await Auth.client.storage.from("brand-assets").download(row.image_path);
      if (!dl.error && dl.data) { try { dataUrl = await blobToDataUrl(dl.data); } catch (e) {} }
      loadedProductAssets.push({ id: row.id, image_path: row.image_path, label: row.label, dataUrl: dataUrl, selected: false });
    }
    recomputeSelectedProductAssets();
    renderProductAssets();
  }

  async function addProductAsset(file) {
    if (!Auth.client || !currentBrandId || !currentUserId) {
      setProductAssetStatus("Save a brand first to attach product images.", "error"); return;
    }
    setProductAssetStatus("Uploading…", "");
    try {
      const dataUrl = await downscaleImageFile(file, 1600);
      const base64 = dataUrl.split(",")[1] || "";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const assetId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      const path = currentUserId + "/" + assetId + ".png";
      const up = await Auth.client.storage.from("brand-assets").upload(path, bytes, { contentType: "image/png", upsert: false });
      if (up.error) { setProductAssetStatus("Upload failed: " + up.error.message, "error"); return; }
      const ins = await Auth.client.from("brand_assets")
        .insert({ id: assetId, brand_id: currentBrandId, image_path: path, kind: "product", label: file.name || null })
        .select().single();
      if (ins.error) {
        await Auth.client.storage.from("brand-assets").remove([path]); // roll back the orphan
        setProductAssetStatus("Saving failed: " + ins.error.message, "error"); return;
      }
      // Auto-select the new asset if under the cap.
      const selectedCount = loadedProductAssets.filter((a) => a.selected).length;
      loadedProductAssets.unshift({ id: assetId, image_path: path, label: file.name || null, dataUrl: dataUrl, selected: selectedCount < 3 });
      recomputeSelectedProductAssets();
      renderProductAssets();
      setProductAssetStatus("Added ✓", "");
    } catch (e) {
      setProductAssetStatus("Add failed: " + e.message, "error");
    }
  }

  async function deleteProductAsset(asset) {
    if (!Auth.client) return;
    await Auth.client.storage.from("brand-assets").remove([asset.image_path]);
    const del = await Auth.client.from("brand_assets").delete().eq("id", asset.id);
    if (del.error) { setProductAssetStatus("Delete failed: " + del.error.message, "error"); return; }
    loadedProductAssets = loadedProductAssets.filter((a) => a.id !== asset.id);
    recomputeSelectedProductAssets();
    renderProductAssets();
  }

  productAssetInputEl.addEventListener("change", function () {
    const f = productAssetInputEl.files && productAssetInputEl.files[0];
    if (f) addProductAsset(f);
    productAssetInputEl.value = ""; // allow re-selecting the same file
  });
```

- [ ] **Step 2: Refresh assets when the brand changes**

In the `brandSwitcherEl` change handler (~line 2451–2462), add a call to `loadBrandAssets()` at the end of the handler body, right after `updateStage1Status();`:

```js
    updateStage1Status();
    loadBrandAssets();
```

- [ ] **Step 3: Load assets after a brand is saved and on initial auth**

In `saveBrand` (~line 2477), the success line is:

```js
    if (data) { currentBrandId = data.id; await loadBrands(); brandSwitcherEl.value = data.id; }
```

Change it to also refresh assets:

```js
    if (data) { currentBrandId = data.id; await loadBrands(); brandSwitcherEl.value = data.id; loadBrandAssets(); }
```

In the `Auth.guard().then(...)` block (~line 2486–2489), after `if (typeof loadBrands === "function") loadBrands();`, add an initial render so the "save a brand first" fallback shows for new users:

```js
    if (typeof loadBrands === "function") loadBrands();
    renderProductAssets();
```

- [ ] **Step 4: Verify**

Run: `npm start`, open the app, sign in (if keys present). Expected, depending on environment:
- No brand selected → product block shows "Save a brand first…", file input disabled.
- With Supabase SQL applied + a saved brand selected → can add an image (thumbnail appears, selected), toggle "use", delete (× removes it), and it persists across reload.
- Without the SQL applied, add will show a clear "Upload failed" / "Saving failed" error (expected until the user runs the SQL) and nothing else breaks.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(web): per-brand product image CRUD via Auth.client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — feed selected assets into generation + Stage 2

**Files:**
- Modify: `index.html` (`runKieGeneration` ~line 1981; `runStage2` ~line 1650)

- [ ] **Step 1: Send product images to KIE**

In `runKieGeneration` (~line 1986), the POST body currently is:

```js
      body: JSON.stringify({
        prompt: promptText,
        referenceImage: refImage3DataUrl,
        logoImage: logoImage3DataUrl,
        aspect_ratio: aspectRatioEl.value,
        resolution: resolutionEl.value,
      }),
```

Change it to include the selected product assets:

```js
      body: JSON.stringify({
        prompt: promptText,
        referenceImage: refImage3DataUrl,
        logoImage: logoImage3DataUrl,
        productImages: productAssetDataUrls,
        aspect_ratio: aspectRatioEl.value,
        resolution: resolutionEl.value,
      }),
```

(`productAssetDataUrls` is a module var kept current by `recomputeSelectedProductAssets`; it is `[]` when nothing is selected, so single and batch paths both work unchanged.)

- [ ] **Step 2: Attach product assets + directive to the Stage 2 vision call**

In `runStage2` (~line 1650–1671), the function builds `text` and a `messages` content array with the reference image. Replace the body of `runStage2` from the `const text = ...` line through the `Auth.authedFetch` `body` so that, when product assets are selected, it appends a directive and attaches each asset image.

Find:

```js
    const text = promptText +
      "\n\n=== BRAND_EXTRACTION_JSON ===\n" + stripFences(lastStage1Output) +
      "\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached to this message. Analyze it as REFERENCE_AD_IMAGE.";

    const started = Date.now();
    const res = await Auth.authedFetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: 2,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: text },
            { type: "image_url", image_url: { url: refImageDataUrl } },
          ],
        }],
      }),
    });
```

Replace with:

```js
    const productAssets = productAssetDataUrls;
    let text = promptText +
      "\n\n=== BRAND_EXTRACTION_JSON ===\n" + stripFences(lastStage1Output) +
      "\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached to this message. Analyze it as REFERENCE_AD_IMAGE.";
    if (productAssets.length) {
      text += "\n\n=== PRODUCT_ASSETS ===\n" +
        productAssets.length + " real product/UI asset image(s) are attached as additional inputs AFTER the reference ad. " +
        "These ARE the product visual — they must be used in the ad's product slot, and the same files are passed to the image renderer. " +
        "Describe ONLY their placement and treatment (size, position, device framing) to match how the reference ad depicts its product — do NOT transcribe, summarize, or invent any UI text, labels, charts, numbers, or screen contents. " +
        "This OVERRIDES any instruction to represent the product abstractly: do not produce an abstract/iconic stand-in. " +
        "The generated ad_prompt's product_visual_direction MUST instruct the renderer to reproduce the attached product asset(s) faithfully and place them in the product slot, and its negative_prompt MUST forbid altering, relabeling, redrawing, recoloring, cropping, blurring, or inventing any UI, text, charts, or data inside the attached product asset(s).";
    }

    const content = [
      { type: "text", text: text },
      { type: "image_url", image_url: { url: refImageDataUrl } },
    ];
    productAssets.forEach((u) => content.push({ type: "image_url", image_url: { url: u } }));

    const started = Date.now();
    const res = await Auth.authedFetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 2, messages: [{ role: "user", content: content }] }),
    });
```

(The rest of `runStage2` — reading `data`, `secs`, returning `{ ok, content, meta }` — is unchanged.)

- [ ] **Step 3: Verify the server boots and the page loads**

Run: `npm start`, open the app. Expected: no JS console errors; page renders. (Full generation requires keys + the Supabase SQL; structural load is the gate here.) Stop the server.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(web): pass selected product images to KIE and Stage 2 with fidelity directive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification + hand-off note

**Files:** none (verification only)

- [ ] **Step 1: Boot check**

Run: `npm start`. Expected: "Site analyzer running." with no error. Stop it.

- [ ] **Step 2: Static review against acceptance criteria**

Confirm by reading the diff (`git diff main -- index.html server.js supabase/schema.sql`):
1. `brand_assets` table + `brand-assets` bucket + 3 storage policies present in schema.sql.
2. `/kie/generate` appends up to 3 `productImages` after reference+logo.
3. Stage 3 has the product block; no-brand state disables the input and shows the fallback.
4. `runStage2` attaches assets + the PRODUCT_ASSETS directive only when assets are selected.
5. `runKieGeneration` sends `productImages: productAssetDataUrls` (so single + batch both covered).
6. No API keys or service-role key added to client code; CRUD uses `Auth.client` (anon + RLS).

- [ ] **Step 3: Write the user hand-off note** (in the final message to the user, not a file): they must run the updated `supabase/schema.sql` in the Supabase SQL editor before product images will save/load.

---

## Self-Review (completed during planning)

- **Spec coverage:** UX block (Task 3/4), `brand_assets` + bucket + policies (Task 1), browser-direct CRUD (Task 4), `/kie/generate` wiring (Task 2/5), Stage 2 directive + vision attach (Task 5), downscale safety (Task 3), no-brand fallback (Task 4), batch coverage via shared `productAssetDataUrls` (Task 5) — all mapped.
- **Placeholder scan:** none — every code step shows full code.
- **Type/name consistency:** `productAssetDataUrls`, `loadedProductAssets`, `recomputeSelectedProductAssets`, `loadBrandAssets`, `renderProductAssets`, `addProductAsset`, `deleteProductAsset`, `downscaleImageFile`, `blobToDataUrl`, element ids `productAssetInput`/`productAssetsList`/`productAssetStatus` — used consistently across tasks. Server `productImages` body key matches client.
