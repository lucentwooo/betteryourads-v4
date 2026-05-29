/* bya-pipeline.js — the BetterYourAds creative pipeline as a clean, DOM-free API.
 *
 * Wraps the server endpoints (/extract, /chat, /kie/*, /library/ads) so the customer
 * UI (app.html) never re-implements the wiring. Depends on:
 *   - window.Auth         (auth.js — authedFetch + Supabase client)
 *   - window.STRATEGIST_PROMPT / STAGE2_PROMPT / STAGE2_MODE_RULES (bya-prompts.js)
 *
 * Every method that hits the model/image backend returns a normalized result and
 * throws/【ok:false】 with a human-readable message — the UI just renders it.
 */
(function () {
  "use strict";

  // ─── Pure helpers (verbatim from the original app — no DOM, safe to share) ───

  // Pull JSON out of a model reply that may be wrapped in ```json ... ``` fences.
  function stripFences(s) {
    const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (m ? m[1] : s).trim();
  }
  // Strip JS-style comments and trailing commas WITHOUT touching string literals.
  function sanitizeJsonish(s) {
    let out = "";
    let i = 0;
    const n = s.length;
    let inStr = false, quote = "";
    while (i < n) {
      const c = s[i];
      if (inStr) {
        out += c;
        if (c === "\\") { out += (s[i + 1] || ""); i += 2; continue; }
        if (c === quote) inStr = false;
        i++; continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; out += c; i++; continue; }
      if (c === "/" && s[i + 1] === "/") { i += 2; while (i < n && s[i] !== "\n") i++; continue; }
      if (c === "/" && s[i + 1] === "*") { i += 2; while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
      out += c; i++;
    }
    return out.replace(/,(\s*[}\]])/g, "$1");
  }
  // Parse JSON tolerantly: strip fences; retry after sanitizing; else grab outermost {…}.
  function parseJsonLoose(s) {
    const cleaned = stripFences(s);
    try { return JSON.parse(cleaned); } catch (e) {}
    const sanitized = sanitizeJsonish(cleaned);
    try { return JSON.parse(sanitized); } catch (e) {}
    const a = sanitized.indexOf("{"), b = sanitized.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(sanitized.slice(a, b + 1)); } catch (e) {} }
    throw new Error("no JSON object found in response");
  }
  // Normalize a URL for matching saved brands.
  function normalizeUrl(u) {
    let s = String(u || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    try {
      const parsed = new URL(s);
      const host = parsed.hostname.replace(/^www\./i, "");
      const path = parsed.pathname.replace(/\/+$/, "");
      return (host + path).toLowerCase();
    } catch (e) { return s.toLowerCase(); }
  }
  // KIE GPT-Image-2 supports: auto, 1:1, 9:16, 16:9, 4:3, 3:4. Map anything else to the nearest.
  function mapAspectRatio(ar) {
    if (!ar) return "auto";
    const s = String(ar).trim();
    if (["1:1", "16:9", "9:16", "4:3", "3:4"].includes(s)) return s;
    const m = s.match(/(\d+(?:\.\d+)?)\s*[:x\/]\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const r = parseFloat(m[1]) / parseFloat(m[2]);
      if (!isFinite(r) || r <= 0) return "auto";
      if (Math.abs(r - 1) < 0.05) return "1:1";
      if (r > 1) return r >= 1.55 ? "16:9" : "4:3";
      return r <= 0.62 ? "9:16" : "3:4";
    }
    return "auto";
  }

  // ─── Product-asset fidelity (verbatim) — keeps KIE from inventing a fake UI ───
  // === product-fidelity helpers (start) ===
  function leadProductDirective(assetCount) {
    if (!assetCount) return "";
    return "IMPORTANT — PRODUCT VISUAL: " + assetCount +
      " real product/UI screenshot image(s) are attached after the reference ad and logo. " +
      "Place the attached screenshot into the product slot exactly. Reproduce its real UI, text, and layout faithfully. " +
      "Do NOT draw, invent, relabel, recolor, or replace it with any other interface — no microphones, waveforms, " +
      "chat bubbles, dashboards, or fake screens unless they appear in the attached image. " +
      "Treat the screenshot as SCREEN CONTENT ONLY: crop to the screen or UI card, drop and mask out any surrounding page background or browser/window chrome, and composite the screen into a clean device frame or floating card that matches the way the reference ad depicts its product. " +
      "NEVER carry the screenshot's original page background color or surrounding chrome into the ad — the page background must not appear in the final image.";
  }
  function applyProductAssetFidelity(adPrompt, assetCount) {
    if (!adPrompt || typeof adPrompt !== "object" || !assetCount) return adPrompt;
    let pvd = adPrompt.product_visual_direction;
    if (!pvd || typeof pvd !== "object") { pvd = {}; adPrompt.product_visual_direction = pvd; }
    pvd.visual_type = "attached real product screenshot";
    pvd.source_asset_to_use = "THE ATTACHED PRODUCT/UI SCREENSHOT image(s), attached after the reference ad and logo. Use the screen content exactly as provided; drop the surrounding page background and browser/window chrome before placing it.";
    pvd.what_it_should_show = "Exactly the attached product/UI screenshot's screen content, cropped to its screen/UI card (page background and browser chrome removed) and composited into a clean device frame or floating card.";
    if (Array.isArray(adPrompt.elements)) {
      adPrompt.elements.forEach(function (el) {
        if (!el || typeof el !== "object") return;
        const name = String(el.name || "");
        if (el.type === "image" && !/logo/i.test(name)) {
          el.content = { source_asset_to_use: "ATTACHED_PRODUCT_IMAGE — use the real attached screenshot exactly; do not draw or invent any UI; drop its surrounding page background / browser chrome." };
        }
      });
    }
    const guard = "Do not copy, transcribe, or reproduce any UI, text, or screen contents from the reference ad's own device/screen — the only product screen shown is the attached screenshot.";
    const neg = typeof adPrompt.negative_prompt === "string" ? adPrompt.negative_prompt.trim() : "";
    adPrompt.negative_prompt = neg ? neg + " " + guard : guard;
    return adPrompt;
  }
  function withProductFidelity(adPrompt, assetCount, trailingDirective) {
    applyProductAssetFidelity(adPrompt, assetCount);
    const jsonStr = JSON.stringify(adPrompt, null, 2);
    const lead = leadProductDirective(assetCount);
    let out = lead ? lead + "\n\n" + jsonStr : jsonStr;
    const trail = (trailingDirective || "").trim();
    if (trail) out += "\n\n" + trail;
    return out;
  }
  // === product-fidelity helpers (end) ===
  // Build the full KIE prompt for one angle variation (swap headline + recolor only).
  function buildVariantPrompt(baseAdPromptObj, variation, productCount) {
    const clone = JSON.parse(JSON.stringify(baseAdPromptObj));
    clone.copy = clone.copy || {};
    clone.copy.headline = variation.headline;

    let subheadlineApplied = false;
    if (typeof variation.subheadline === "string" && variation.subheadline.trim() !== "" &&
        typeof clone.copy.subheadline === "string") {
      clone.copy.subheadline = variation.subheadline;
      subheadlineApplied = true;
    }

    const ct = variation.color_treatment;
    const bg = ct && typeof ct.background === "string" ? ct.background.trim() : "";
    const tx = ct && typeof ct.text === "string" ? ct.text.trim() : "";
    const colorApplied = bg !== "" && tx !== "";
    if (colorApplied) {
      clone.background = clone.background || {};
      clone.background.type = "solid";
      clone.background.treatment = "Solid " + bg + " background.";
      clone.background.gradient = "";
      clone.background.color_palette = clone.background.color_palette || {};
      clone.background.color_palette.primary = [bg];
      clone.typography = clone.typography || {};
      ["headline", "subheadline", "proof_line", "cta"].forEach(function (k) {
        if (clone.typography[k] && typeof clone.typography[k] === "object") clone.typography[k].color = tx;
      });
    }

    let directive = "VARIATION DIRECTIVE: headline=" + JSON.stringify(variation.headline) + ";";
    if (subheadlineApplied) directive += " subheadline=" + JSON.stringify(variation.subheadline) + ";";
    if (colorApplied) {
      directive += " COLOR: solid " + bg + " background with " + tx + " headline, subheadline, and text." +
        " Use ONLY these brand-palette colors. Recolor ONLY the ad's background and text —" +
        " do NOT recolor, redraw, or restyle the product UI / screenshot, the logo, the layout, or the fonts.";
    }
    directive += " Keep everything else identical.";
    return withProductFidelity(clone, productCount || 0, directive);
  }

  // ─── Backend-coupled pipeline (uses Auth.authedFetch) ───
  function authed() {
    if (!window.Auth || !window.Auth.authedFetch) throw new Error("Auth is not loaded.");
    return window.Auth;
  }

  // Stage 1a: load the live page in headless Chromium and read exact colors/fonts/text.
  async function extractSite(url) {
    const res = await authed().authedFetch("/extract", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { throw new Error("Extractor returned a non-JSON response. Is server.js running? First 120 chars: " + raw.slice(0, 120)); }
    if (!res.ok) throw new Error(data.error || ("Couldn't read the site (HTTP " + res.status + ")."));
    return data;
  }

  // Compose the grounded Stage-1 base prompt (measured site data + STRATEGIST_PROMPT).
  function buildGroundedPrompt(extracted, url) {
    let p = "Website to analyze: " + (extracted.finalUrl || url) + "\n\n";
    p += "=== MEASURED SITE DATA (authoritative) ===\n";
    p += "These values were extracted directly from the live rendered page. " +
      "Use these EXACT hex codes and font names. Do NOT invent or alter colors. " +
      "Counts indicate how often/prominently each color appears.\n\n";
    p += JSON.stringify({
      title: extracted.title, description: extracted.description, colors: extracted.colors,
      cssColorVariables: extracted.cssColorVariables, fonts: extracted.fonts, logos: extracted.logos,
    }, null, 2);
    p += "\n\n=== PAGE TEXT ===\n" + (extracted.text || "") + "\n=== END SITE DATA ===\n\n";
    p += STRATEGIST_PROMPT;
    return p;
  }

  // Stage 1b: 3 parallel agents, each producing its slice of the brand JSON.
  const AGENT_GROUPS = [
    { name: "A", keys: ["brand_identity", "visual_brand_system", "product_representation", "offer_dna"] },
    { name: "B", keys: ["messaging_foundation", "proof_library", "customer_dna_from_website", "external_customer_research_plan", "competitor_intelligence", "claim_constraints"] },
    { name: "C", keys: ["static_ad_creative_recommendations", "missing_information", "source_map"] },
  ];
  async function analyzeBrand(extracted, opts) {
    opts = opts || {};
    const basePrompt = buildGroundedPrompt(extracted, opts.url);
    async function runAgent(group) {
      const directive =
        "\n\n=== PARALLEL EXTRACTION DIRECTIVE (this OVERRIDES the output-format instructions above) ===\n" +
        "You are one of several parallel workers analyzing this same site. Return a SINGLE valid JSON object " +
        "containing EXACTLY these top-level keys and NOTHING else: " + JSON.stringify(group.keys) + ".\n" +
        "Use the exact sub-structure defined for those keys in the schema above, and follow every extraction rule. " +
        "Do NOT include any other top-level keys. Do NOT wrap the JSON in markdown fences.";
      const res = await authed().authedFetch("/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: 1, online: !!opts.online, messages: [{ role: "user", content: basePrompt + directive }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Agent " + group.name + ": " + ((data && data.error && data.error.message) || ("HTTP " + res.status)));
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error("Agent " + group.name + ": empty response");
      return { obj: parseJsonLoose(content), tokens: (data.usage && data.usage.total_tokens) || 0 };
    }
    const settled = await Promise.allSettled(AGENT_GROUPS.map(runAgent));
    const merged = {}; const errors = []; let tokens = 0;
    settled.forEach(function (r) {
      if (r.status === "fulfilled") { Object.assign(merged, r.value.obj); tokens += r.value.tokens; }
      else errors.push((r.reason && r.reason.message) ? r.reason.message : String(r.reason));
    });
    if (Object.keys(merged).length === 0) throw new Error("Brand analysis failed:\n- " + errors.join("\n- "));
    return { merged: merged, errors: errors, tokens: tokens };
  }

  // Stage 2: reference ad image + brand JSON → render-ready ad-prompt JSON.
  async function makeAdPrompt(args) {
    const brandJson = args.brandJson;            // string (Stage-1 merged JSON)
    const refImageDataUrl = args.refImageDataUrl; // data URL
    const productAssets = args.productAssets || []; // array of data URLs
    const mode = STAGE2_MODE_RULES[args.mode] ? args.mode : "exact";

    const base = STAGE2_PROMPT;
    let text = STAGE2_MODE_RULES[mode] + "\n\n" + base +
      "\n\n=== BRAND_EXTRACTION_JSON ===\n" + stripFences(brandJson) +
      "\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached to this message. Analyze it as REFERENCE_AD_IMAGE.";
    if (productAssets.length) {
      text += "\n\n=== PRODUCT_ASSETS ===\n" +
        productAssets.length + " real product/UI asset image(s) are attached as additional inputs AFTER the reference ad. " +
        "These ARE the product visual — they must be used in the ad's product slot, and the same files are passed to the image renderer. " +
        "Describe ONLY their placement and treatment (size, position, device framing) to match how the reference ad depicts its product — do NOT transcribe, summarize, or invent any UI text, labels, charts, numbers, or screen contents. " +
        "This OVERRIDES any instruction to represent the product abstractly: do not produce an abstract/iconic stand-in, and do NOT invent any product interface (no microphones, waveforms, chat bubbles, dashboards, or fake screens). " +
        "In the generated ad_prompt you MUST write the literal phrase \"the attached product screenshot\" into product_visual_direction.source_asset_to_use and product_visual_direction.what_it_should_show, and set the product element's content.source_asset_to_use to \"ATTACHED_PRODUCT_IMAGE\" — never describe an imagined product UI in those fields. " +
        "product_visual_direction MUST describe cropping the asset to its screen/UI card (dropping the surrounding page background and browser/window chrome), then compositing it into a clean device frame or floating card that matches the way the reference ad depicts its product. " +
        "The negative_prompt MUST forbid altering, relabeling, redrawing, recoloring, cropping the UI screen contents or UI text, blurring, or inventing any UI, text, charts, or data inside the attached product asset(s), MUST forbid copying any UI or screen contents from the reference ad's own device, and MUST forbid the screenshot's original page background or surrounding window/browser chrome bleeding into the ad.";
    }
    const msgContent = [{ type: "text", text: text }, { type: "image_url", image_url: { url: refImageDataUrl } }];
    productAssets.forEach(function (u) { msgContent.push({ type: "image_url", image_url: { url: u } }); });

    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 2, messages: [{ role: "user", content: msgContent }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("Stage 2 failed (HTTP " + res.status + ")"));
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("Stage 2 returned no content.");
    return content;
  }

  // Pull the render-ready ad_prompt out of the Stage-2 JSON, with mapped aspect ratio.
  function prepareStage3(stage2Content) {
    let parsed = null;
    try { parsed = parseJsonLoose(stage2Content); } catch (e) {}
    if (parsed && parsed.ad_prompt) {
      const ar = parsed.ad_prompt.canvas && parsed.ad_prompt.canvas.aspect_ratio;
      return { adPromptObj: parsed.ad_prompt, adPromptStr: JSON.stringify(parsed.ad_prompt, null, 2), aspect: mapAspectRatio(ar) };
    }
    return { adPromptObj: null, adPromptStr: stripFences(stage2Content), aspect: "1:1" };
  }

  // Generate n distinct on-brand ad-copy angles (text-only, cheap).
  async function generateAngles(baseCopy, brandJson, n) {
    if (!n || n < 1) throw new Error("generateAngles: n must be >= 1");
    const hasSub = baseCopy && typeof baseCopy.subheadline === "string" && baseCopy.subheadline.trim() !== "";
    const subInstr = hasSub
      ? 'Each item MUST include a "subheadline" field (the base ad has one).'
      : 'Do NOT include a "subheadline" field (the base ad does not have one).';
    const angleTypes = ["pain", "outcome", "promise", "proof", "objection", "status", "urgency"];
    const angleHints = Array.from({ length: n }, function (_, i) { return angleTypes[i % angleTypes.length]; }).join(", ");
    const prompt =
      "You are a direct-response ad copywriter. Your task is to produce EXACTLY " + n + " distinct ad angles for the advertisement described below.\n\n" +
      "CURRENT AD COPY (base):\n" + JSON.stringify(baseCopy, null, 2) + "\n\n" +
      "BRAND FACTS (authoritative — use ONLY brand-supported claims; invent NO numbers, features, testimonials, guarantees, or statistics not present here):\n" + brandJson + "\n\n" +
      "ANGLE TYPES TO USE (one per item, in this order, repeat only if n exceeds the list): " + angleHints + "\n" +
      "Angle types reference: pain=addresses a frustration, outcome=highlights a desirable result, promise=makes a specific commitment, proof=social/data evidence (only if brand facts support it), objection=preempts a doubt, status=appeals to identity/aspiration, urgency=time or scarcity motivation.\n\n" +
      "COLOR VARIATION RULES (the ONLY visual change allowed — everything else stays identical):\n" +
      "- Each item picks a \"color_treatment\": which brand color is the background and which is the text/headline.\n" +
      "- Use ONLY colors that actually appear in the brand's palette in BRAND FACTS (prefer their hex codes; if none, name the brand color). Never introduce a color that is not in the brand palette.\n" +
      "- The background and text colors MUST have strong, legible contrast. Never put a color on a near-identical color.\n" +
      "- Vary the treatment across the items by swapping which palette color is background vs text. Keep it sensible and on-brand.\n" +
      "- This recolors ONLY the ad's background and text. It must NOT recolor, redraw, or restyle the product UI / screenshot, the logo, the layout, or the fonts.\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"variations\": [\n" +
      "  { \"angle\": \"<type-label>\", \"headline\": \"<new headline>\", " +
      (hasSub ? '"subheadline": "<new subheadline>", ' : "") +
      "\"color_treatment\": { \"background\": \"<a brand-palette color, hex preferred>\", \"text\": \"<a different brand-palette color with strong contrast vs background>\" } }\n" +
      "] }\n\n" + subInstr + "\n" +
      "Produce exactly " + n + " items in the \"variations\" array. No extra keys. No prose outside the JSON object.";
    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 2, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("generateAngles: no content in model response.");
    const parsed = parseJsonLoose(raw);
    const arr = parsed.variations || parsed.angles || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("generateAngles: model did not return a non-empty variations array.");
    return arr;
  }

  // One-time external voice-of-customer pass. Uses the analysis's
  // external_customer_research_plan (subreddits / review sites / queries) and the
  // :online web-search plugin (stage 1) to collect what real prospects actually say.
  // Returns a compact VOC object. Best-effort: callers treat failure as "no VOC".
  async function researchCustomers(analysis) {
    analysis = analysis || {};
    const plan = analysis.external_customer_research_plan || {};
    const identity = analysis.brand_identity || {};
    const messaging = analysis.messaging_foundation || {};
    const ctx = {
      brand: identity.brand_name || identity.name || "",
      positioning: identity.positioning || identity.tagline || "",
      customer_segments: messaging.customer_segments || [],
    };
    const prompt =
      "You are a senior B2B SaaS market researcher. Using web search, find what REAL prospective " +
      "customers of this product actually say, complain about, and want — in their own words — " +
      "across the sources below. Do NOT invent quotes; report only what you actually find. " +
      "If a source yields nothing, omit it.\n\n" +
      "BRAND CONTEXT (so you research the right audience):\n" + JSON.stringify(ctx, null, 2) + "\n\n" +
      "RESEARCH TARGETS (where to look):\n" + JSON.stringify({
        recommended_subreddits: plan.recommended_subreddits || [],
        review_sites: plan.review_sites || [],
        communities: plan.communities || [],
        search_queries: plan.search_queries || [],
        competitor_review_targets: plan.competitor_review_targets || [],
        what_to_extract: plan.what_to_extract || [],
      }, null, 2) + "\n\n" +
      "Extract recurring complaints, the exact phrases people use, desired outcomes, objections/" +
      "hesitations, what makes people switch from alternatives, and gripes about competitors. " +
      "Prefer concrete, quotable language over summaries.\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"top_complaints\": [], \"recurring_phrases\": [], \"desired_outcomes\": [], " +
      "\"objections\": [], \"switching_triggers\": [], \"competitor_gripes\": [], \"sources\": [] }\n" +
      "Keep each array to the most salient 5–10 items.";
    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 1, online: true, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("researchCustomers: no content in model response.");
    const parsed = parseJsonLoose(raw);
    return {
      top_complaints: parsed.top_complaints || [],
      recurring_phrases: parsed.recurring_phrases || [],
      desired_outcomes: parsed.desired_outcomes || [],
      objections: parsed.objections || [],
      switching_triggers: parsed.switching_triggers || [],
      competitor_gripes: parsed.competitor_gripes || [],
      sources: parsed.sources || [],
    };
  }

  // Concept ideation for the board. A single text-only stage-2 /chat call.
  // Grounded ONLY in the stored analysis (reuse; no Stage-1 re-run). Returns an
  // array of { angle, stage, headline, rationale } objects. `stage` is one of:
  // unaware|problem|solution|product|most.
  function conceptFocusForGoal(goal) {
    if (goal === "waitlist") return ["problem", "solution"];
    if (goal === "paid") return ["product", "most"];
    return ["solution", "product"]; // trials (default)
  }
  async function generateConcepts(analysis, goal) {
    analysis = analysis || {};
    const focus = conceptFocusForGoal(goal);
    const goalLabel = goal === "waitlist" ? "Grow a waitlist" : goal === "paid" ? "Convert to paid" : "Get signups / trials";
    const proof = analysis.proof_library || {};
    const claims = analysis.claim_constraints || {};
    const sac = analysis.static_ad_creative_recommendations || {};
    const facts = {
      customer_voice: analysis.external_voc || "none collected",
      customer_dna: analysis.customer_dna_from_website || {},
      messaging: analysis.messaging_foundation || {},
      proof: {
        safe_ad_proof_points: proof.safe_ad_proof_points || [],
        testimonials: proof.testimonials || [],
        roi_claims: proof.roi_claims || [],
        case_study_metrics: proof.case_study_metrics || [],
      },
      competitors: analysis.competitor_intelligence || {},
      claim_constraints: { allowed: claims.allowed_claims || [], forbidden: claims.forbidden_claims || [], requires_proof: claims.claims_requiring_proof || [] },
      existing_seeds: sac.ad_concepts || [],
    };
    const prompt =
      "You are a senior direct-response Meta ads strategist who has run paid social for B2B SaaS " +
      "for over a decade. Produce a board of DISTINCT ad concepts for the brand below, organized by " +
      "customer awareness stage.\n\n" +
      "A concept is a different PSYCHOLOGICAL ANGLE into the same customer (e.g. Transformation / " +
      "Before→After, Vs. the old way, Customer proof, Risk reversal, How it works, ROI / value) — " +
      "NOT a reworded headline. Each must be genuinely different from the others.\n\n" +
      "AWARENESS STAGES (tag every concept with exactly one):\n" +
      "- \"unaware\": doesn't know they have the problem yet\n" +
      "- \"problem\": feels the pain, doesn't know solutions exist\n" +
      "- \"solution\": knows tools like this exist, weighing approaches\n" +
      "- \"product\": knows this product, comparing to alternatives\n" +
      "- \"most\": ready to buy, needs a nudge\n\n" +
      "GOAL FOCUS: the founder's goal is \"" + goalLabel + "\". Weight the board toward these stages: " +
      JSON.stringify(focus) + ". Still include a few concepts in the other stages, but produce the " +
      "most (and strongest) concepts for the focus stages.\n\n" +
      "GROUNDING — these are authoritative facts. Invent NO numbers, testimonials, guarantees, " +
      "statistics, or claims not present here. A proof-based concept may ONLY cite proof present in " +
      "facts.proof. Honor claim_constraints (never use a forbidden claim; only use a " +
      "requires_proof claim if matching proof exists).\n" +
      JSON.stringify(facts, null, 2) + "\n\n" +
      "Write each concept's example headline in the brand's own voice — prefer their repeated phrases " +
      "and the exact phrases real customers use (facts.customer_voice / facts.customer_dna).\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"concepts\": [ { \"angle\": \"<short label>\", \"stage\": \"<unaware|problem|solution|product|most>\", " +
      "\"headline\": \"<example hook in brand voice>\", \"rationale\": \"<one short line: why this lands for this ICP>\" } ] }\n" +
      "Produce 10–16 concepts total. No extra keys.";
    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 2, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("generateConcepts: no content in model response.");
    const parsed = parseJsonLoose(raw);
    const arr = parsed.concepts || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("generateConcepts: model returned no concepts.");
    const valid = ["unaware", "problem", "solution", "product", "most"];
    return arr.filter(function (c) { return c && c.headline && c.angle; }).map(function (c) {
      return { angle: String(c.angle), stage: valid.indexOf(c.stage) >= 0 ? c.stage : "solution", headline: String(c.headline), rationale: c.rationale ? String(c.rationale) : "" };
    });
  }

  // Stage 3: create the KIE task and poll to completion. Returns { ok, urls } | { ok:false, error }.
  async function generateImage(args, onStatus) {
    if (onStatus) onStatus("Uploading images and starting the render…");
    const genRes = await authed().authedFetch("/kie/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: args.prompt,
        referenceImage: args.referenceImage,
        logoImage: args.logoImage,
        productImages: args.productImages || [],
        aspect_ratio: args.aspect || "1:1",
        // Omit when unset so the server's KIE_IMAGE_RESOLUTION (.env) governs.
        resolution: args.resolution,
      }),
    });
    const gen = await genRes.json();
    if (!genRes.ok) return { ok: false, error: "Couldn't start the render: " + (gen.error || ("HTTP " + genRes.status)) };
    // Synchronous backend (OpenRouter) returns the finished image right away — no polling.
    if (gen.done && Array.isArray(gen.urls)) {
      if (!gen.urls.length) return { ok: false, error: "Render finished but returned no image." };
      return { ok: true, urls: gen.urls };
    }
    if (!gen.taskId) return { ok: false, error: "Couldn't start the render: " + (gen.error || ("HTTP " + genRes.status)) };
    const taskId = gen.taskId;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      const pollRes = await authed().authedFetch("/kie/result?taskId=" + encodeURIComponent(taskId));
      const poll = await pollRes.json();
      if (!pollRes.ok) return { ok: false, error: "Render polling failed: " + (poll.error || ("HTTP " + pollRes.status)) };
      const state = String(poll.state || "").toLowerCase();
      if (state === "success") {
        const urls = poll.urls || [];
        if (!urls.length) return { ok: false, error: "Render finished but returned no image." };
        return { ok: true, urls: urls };
      }
      if (state === "fail") return { ok: false, error: "Render failed: " + (poll.failMsg || "unknown error") };
      if (onStatus) onStatus("Drawing your ad…" + (poll.progress != null ? " " + Math.round(poll.progress * 100) + "%" : ""));
    }
    return { ok: false, timedOut: true, taskId: taskId, error: "Still rendering — it'll appear in My ads automatically when it finishes." };
  }

  // Single-poll helper for resuming timed-out renders from app.html.
  async function pollRender(taskId) {
    const res = await authed().authedFetch("/kie/result?taskId=" + encodeURIComponent(taskId));
    const poll = await res.json();
    if (!res.ok) return { state: "error", error: poll.error || ("HTTP " + res.status) };
    const state = String(poll.state || "").toLowerCase();
    return { state: state, urls: poll.urls || [], failMsg: poll.failMsg || "", progress: poll.progress };
  }

  // Persist a generated ad (server downloads the temp KIE image into Storage + inserts a row).
  async function saveAd(args) {
    const res = await authed().authedFetch("/library/ads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: args.imageUrl, brandId: args.brandId || null, websiteUrl: args.websiteUrl || null,
        prompt: args.prompt || null, aspectRatio: args.aspectRatio || null, resolution: args.resolution || null,
      }),
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) return { ok: false, error: data.error || ("HTTP " + res.status) };
    return { ok: true, ad: data.ad };
  }

  // ─── Supabase data (read via the user's JWT under RLS) ───
  async function loadBrands() {
    const c = authed().client; if (!c) return [];
    const { data, error } = await c.from("brands").select("id,name,website_url,analysis,goal,updated_at").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  async function saveBrand(websiteUrl, analysisObj, userId, goal) {
    const c = authed().client; if (!c || !userId) return null;
    let host = websiteUrl; try { host = new URL(websiteUrl).hostname; } catch (e) {}
    const row = { user_id: userId, name: host, website_url: websiteUrl, analysis: analysisObj, updated_at: new Date().toISOString() };
    if (goal !== undefined && goal !== null) row.goal = goal; // only set when provided
    const { data, error } = await c.from("brands").upsert(row, { onConflict: "user_id,website_url" }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  // Load saved product/UI assets for a brand as data URLs (used as KIE product inputs).
  async function loadBrandAssets(brandId) {
    const c = authed().client; if (!c || !brandId) return [];
    const { data, error } = await c.from("brand_assets").select("id,image_path,label,created_at").eq("brand_id", brandId).order("created_at", { ascending: false });
    if (error) return [];
    const out = [];
    for (const row of data || []) {
      const dl = await c.storage.from("brand-assets").download(row.image_path);
      if (!dl.error && dl.data) {
        const dataUrl = await new Promise(function (res) { const r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(""); }; r.readAsDataURL(dl.data); });
        if (dataUrl) out.push({ id: row.id, label: row.label, dataUrl: dataUrl });
      }
    }
    return out;
  }
  // Load the user's saved ads with short-lived signed image URLs (private bucket).
  async function loadAds() {
    const c = authed().client; if (!c) return [];
    const { data, error } = await c.from("ads").select("id,brand_id,website_url,prompt,aspect_ratio,resolution,image_path,created_at").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const sig = await c.storage.from("ads").createSignedUrl(row.image_path, 3600);
      row.signedUrl = (sig && sig.data && sig.data.signedUrl) || "";
    }
    return rows;
  }

  window.BYA = {
    // helpers
    stripFences: stripFences, parseJsonLoose: parseJsonLoose, normalizeUrl: normalizeUrl, mapAspectRatio: mapAspectRatio,
    buildVariantPrompt: buildVariantPrompt,
    // pipeline
    extractSite: extractSite, analyzeBrand: analyzeBrand, makeAdPrompt: makeAdPrompt, prepareStage3: prepareStage3,
    generateAngles: generateAngles, researchCustomers: researchCustomers, generateConcepts: generateConcepts, generateImage: generateImage, pollRender: pollRender, saveAd: saveAd,
    // data
    loadBrands: loadBrands, saveBrand: saveBrand, loadBrandAssets: loadBrandAssets, loadAds: loadAds,
  };
})();
