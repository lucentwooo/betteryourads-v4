'use client';

/* The BetterYourAds creative pipeline as a clean, DOM-free API.
 * Ported from bya-pipeline.js. Wraps the server route handlers
 * (/api/extract, /api/chat, /api/kie/*, /api/library/ads) so the React client
 * never re-implements the wiring. Prompt text comes from the single source
 * lib/prompts.ts; backend calls go through Auth.authedFetch.
 */
import {
  STRATEGIST_PROMPT,
  STAGE2_PROMPT,
  STAGE2_MODE_RULES,
} from '@/lib/prompts';
import { Auth } from '@/lib/client/auth';

type Json = unknown;
type JsonObject = Record<string, Json>;

// ─── Pure helpers (verbatim from the original app — no DOM) ───
// Kept internal: stripFences / parseJsonLoose / mapAspectRatio are no longer
// part of the public surface (dropped as standalone exports per the port plan).

// Pull JSON out of a model reply that may be wrapped in ```json ... ``` fences.
function stripFences(s: string): string {
  const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
// Strip JS-style comments and trailing commas WITHOUT touching string literals.
function sanitizeJsonish(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  let inStr = false, quote = '';
  while (i < n) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += (s[i + 1] || ''); i += 2; continue; }
      if (c === quote) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; out += c; i++; continue; }
    if (c === '/' && s[i + 1] === '/') { i += 2; while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}
// Parse JSON tolerantly: strip fences; retry after sanitizing; else grab outermost {…}.
function parseJsonLoose(s: string): Json {
  const cleaned = stripFences(s);
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const sanitized = sanitizeJsonish(cleaned);
  try { return JSON.parse(sanitized); } catch { /* fall through */ }
  const a = sanitized.indexOf('{'), b = sanitized.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(sanitized.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error('no JSON object found in response');
}
// Normalize a URL for matching saved brands.
function normalizeUrl(u: string): string {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const parsed = new URL(s);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return (host + path).toLowerCase();
  } catch { return s.toLowerCase(); }
}
// KIE GPT-Image-2 supports: auto, 1:1, 9:16, 16:9, 4:3, 3:4. Map anything else to the nearest.
function mapAspectRatio(ar: unknown): string {
  if (!ar) return 'auto';
  const s = String(ar).trim();
  if (['1:1', '16:9', '9:16', '4:3', '3:4'].includes(s)) return s;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const r = parseFloat(m[1]) / parseFloat(m[2]);
    if (!isFinite(r) || r <= 0) return 'auto';
    if (Math.abs(r - 1) < 0.05) return '1:1';
    if (r > 1) return r >= 1.55 ? '16:9' : '4:3';
    return r <= 0.62 ? '9:16' : '3:4';
  }
  return 'auto';
}

// ─── Product-asset fidelity (verbatim) — keeps KIE from inventing a fake UI ───
function leadProductDirective(assetCount: number): string {
  if (!assetCount) return '';
  return 'IMPORTANT — PRODUCT VISUAL: ' + assetCount +
    ' real product/UI screenshot image(s) are attached after the reference ad and logo. ' +
    'Place the attached screenshot into the product slot exactly. Reproduce its real UI, text, and layout faithfully. ' +
    'Do NOT draw, invent, relabel, recolor, or replace it with any other interface — no microphones, waveforms, ' +
    'chat bubbles, dashboards, or fake screens unless they appear in the attached image. ' +
    'Treat the screenshot as SCREEN CONTENT ONLY: crop to the screen or UI card, drop and mask out any surrounding page background or browser/window chrome, and composite the screen into a clean device frame or floating card that matches the way the reference ad depicts its product. ' +
    "NEVER carry the screenshot's original page background color or surrounding chrome into the ad — the page background must not appear in the final image.";
}
function applyProductAssetFidelity(adPrompt: JsonObject, assetCount: number): JsonObject {
  if (!adPrompt || typeof adPrompt !== 'object' || !assetCount) return adPrompt;
  let pvd = adPrompt.product_visual_direction as JsonObject | undefined;
  if (!pvd || typeof pvd !== 'object') { pvd = {}; adPrompt.product_visual_direction = pvd; }
  pvd.visual_type = 'attached real product screenshot';
  pvd.source_asset_to_use = 'THE ATTACHED PRODUCT/UI SCREENSHOT image(s), attached after the reference ad and logo. Use the screen content exactly as provided; drop the surrounding page background and browser/window chrome before placing it.';
  pvd.what_it_should_show = "Exactly the attached product/UI screenshot's screen content, cropped to its screen/UI card (page background and browser chrome removed) and composited into a clean device frame or floating card.";
  if (Array.isArray(adPrompt.elements)) {
    (adPrompt.elements as JsonObject[]).forEach((el) => {
      if (!el || typeof el !== 'object') return;
      const name = String(el.name || '');
      if (el.type === 'image' && !/logo/i.test(name)) {
        el.content = { source_asset_to_use: 'ATTACHED_PRODUCT_IMAGE — use the real attached screenshot exactly; do not draw or invent any UI; drop its surrounding page background / browser chrome.' };
      }
    });
  }
  const guard = "Do not copy, transcribe, or reproduce any UI, text, or screen contents from the reference ad's own device/screen — the only product screen shown is the attached screenshot.";
  const neg = typeof adPrompt.negative_prompt === 'string' ? adPrompt.negative_prompt.trim() : '';
  adPrompt.negative_prompt = neg ? neg + ' ' + guard : guard;
  return adPrompt;
}
function withProductFidelity(adPrompt: JsonObject, assetCount: number, trailingDirective?: string): string {
  applyProductAssetFidelity(adPrompt, assetCount);
  const art = adPrompt && typeof adPrompt.art_direction === 'string' ? adPrompt.art_direction.trim() : '';
  const jsonStr = JSON.stringify(adPrompt, null, 2);
  const lead = leadProductDirective(assetCount);
  let out = lead ? lead + '\n\n' + jsonStr : jsonStr;
  if (art) out = 'ART DIRECTION (follow precisely): ' + art + '\n\n' + out;
  const trail = (trailingDirective || '').trim();
  if (trail) out += '\n\n' + trail;
  return out;
}

type Variation = {
  headline: string;
  subheadline?: string;
  color_treatment?: { background?: string; text?: string };
  angle?: string;
};

// Build the full KIE prompt for one angle variation (swap headline + recolor only).
function buildVariantPrompt(baseAdPromptObj: JsonObject, variation: Variation, productCount?: number): string {
  const clone = JSON.parse(JSON.stringify(baseAdPromptObj)) as JsonObject;
  const copy = (clone.copy = (clone.copy as JsonObject) || {});
  copy.headline = variation.headline;

  let subheadlineApplied = false;
  if (typeof variation.subheadline === 'string' && variation.subheadline.trim() !== '' &&
      typeof copy.subheadline === 'string') {
    copy.subheadline = variation.subheadline;
    subheadlineApplied = true;
  }

  const ct = variation.color_treatment;
  const bg = ct && typeof ct.background === 'string' ? ct.background.trim() : '';
  const tx = ct && typeof ct.text === 'string' ? ct.text.trim() : '';
  const colorApplied = bg !== '' && tx !== '';
  if (colorApplied) {
    const background = (clone.background = (clone.background as JsonObject) || {});
    background.type = 'solid';
    background.treatment = 'Solid ' + bg + ' background.';
    background.gradient = '';
    const palette = (background.color_palette = (background.color_palette as JsonObject) || {});
    palette.primary = [bg];
    const typography = (clone.typography = (clone.typography as JsonObject) || {});
    ['headline', 'subheadline', 'proof_line', 'cta'].forEach((k) => {
      const t = typography[k];
      if (t && typeof t === 'object') (t as JsonObject).color = tx;
    });
  }

  let directive = 'VARIATION DIRECTIVE: headline=' + JSON.stringify(variation.headline) + ';';
  if (subheadlineApplied) directive += ' subheadline=' + JSON.stringify(variation.subheadline) + ';';
  if (colorApplied) {
    directive += ' COLOR: solid ' + bg + ' background with ' + tx + ' headline, subheadline, and text.' +
      ' Use ONLY these brand-palette colors. Recolor ONLY the ad\'s background and text —' +
      ' do NOT recolor, redraw, or restyle the product UI / screenshot, the logo, the layout, or the fonts.';
  }
  directive += ' Keep everything else identical.';
  return withProductFidelity(clone, productCount || 0, directive);
}

// ─── Backend-coupled pipeline (uses Auth.authedFetch) ───

type ChatChoice = { message?: { content?: string } };
type ChatResponse = {
  choices?: ChatChoice[];
  usage?: { total_tokens?: number };
  error?: { message?: string };
};
function chatContent(data: ChatResponse): string | undefined {
  return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
}

// Stage 1a: load the live page in headless Chromium and read exact colors/fonts/text.
async function extractSite(url: string): Promise<JsonObject> {
  const res = await Auth.authedFetch('/api/extract', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const raw = await res.text();
  let data: JsonObject;
  try { data = JSON.parse(raw); }
  catch { throw new Error('Extractor returned a non-JSON response. Is the server running? First 120 chars: ' + raw.slice(0, 120)); }
  if (!res.ok) throw new Error((data.error as string) || ("Couldn't read the site (HTTP " + res.status + ').'));
  return data;
}

// Compose the grounded Stage-1 base prompt (measured site data + STRATEGIST_PROMPT).
function buildGroundedPrompt(extracted: JsonObject, url?: string): string {
  let p = 'Website to analyze: ' + (extracted.finalUrl || url) + '\n\n';
  p += '=== MEASURED SITE DATA (authoritative) ===\n';
  p += 'These values were extracted directly from the live rendered page. ' +
    'Use these EXACT hex codes and font names. Do NOT invent or alter colors. ' +
    'Counts indicate how often/prominently each color appears.\n\n';
  p += JSON.stringify({
    title: extracted.title, description: extracted.description, colors: extracted.colors,
    cssColorVariables: extracted.cssColorVariables, fonts: extracted.fonts, logos: extracted.logos,
  }, null, 2);
  p += '\n\n=== PAGE TEXT ===\n' + (extracted.text || '') + '\n=== END SITE DATA ===\n\n';
  p += STRATEGIST_PROMPT;
  return p;
}

// Stage 1b: 3 parallel agents, each producing its slice of the brand JSON.
const AGENT_GROUPS = [
  { name: 'A', keys: ['brand_identity', 'visual_brand_system', 'product_representation', 'offer_dna'] },
  { name: 'B', keys: ['messaging_foundation', 'proof_library', 'customer_dna_from_website', 'external_customer_research_plan', 'competitor_intelligence', 'claim_constraints'] },
  { name: 'C', keys: ['static_ad_creative_recommendations', 'missing_information', 'source_map'] },
];
async function analyzeBrand(
  extracted: JsonObject,
  opts?: { url?: string; online?: boolean },
): Promise<{ merged: JsonObject; errors: string[]; tokens: number }> {
  opts = opts || {};
  const basePrompt = buildGroundedPrompt(extracted, opts.url);
  async function runAgent(group: { name: string; keys: string[] }) {
    const directive =
      '\n\n=== PARALLEL EXTRACTION DIRECTIVE (this OVERRIDES the output-format instructions above) ===\n' +
      'You are one of several parallel workers analyzing this same site. Return a SINGLE valid JSON object ' +
      'containing EXACTLY these top-level keys and NOTHING else: ' + JSON.stringify(group.keys) + '.\n' +
      'Use the exact sub-structure defined for those keys in the schema above, and follow every extraction rule. ' +
      'Do NOT include any other top-level keys. Do NOT wrap the JSON in markdown fences.';
    const res = await Auth.authedFetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 1, online: !!opts!.online, messages: [{ role: 'user', content: basePrompt + directive }] }),
    });
    const data: ChatResponse = await res.json();
    if (!res.ok) throw new Error('Agent ' + group.name + ': ' + ((data && data.error && data.error.message) || ('HTTP ' + res.status)));
    const content = chatContent(data);
    if (!content) throw new Error('Agent ' + group.name + ': empty response');
    return { obj: parseJsonLoose(content) as JsonObject, tokens: (data.usage && data.usage.total_tokens) || 0 };
  }
  const settled = await Promise.allSettled(AGENT_GROUPS.map(runAgent));
  const merged: JsonObject = {}; const errors: string[] = []; let tokens = 0;
  settled.forEach((r) => {
    if (r.status === 'fulfilled') { Object.assign(merged, r.value.obj); tokens += r.value.tokens; }
    else errors.push((r.reason && r.reason.message) ? r.reason.message : String(r.reason));
  });
  if (Object.keys(merged).length === 0) throw new Error('Brand analysis failed:\n- ' + errors.join('\n- '));
  return { merged, errors, tokens };
}

type Stage2Mode = keyof typeof STAGE2_MODE_RULES;

// Stage 2: reference ad image + brand JSON → render-ready ad-prompt JSON.
async function makeAdPrompt(args: {
  brandJson: string;
  refImageDataUrl: string;
  productAssets?: string[];
  mode?: string;
}): Promise<string> {
  const brandJson = args.brandJson;
  const refImageDataUrl = args.refImageDataUrl;
  const productAssets = args.productAssets || [];
  const mode: Stage2Mode = (args.mode && (args.mode in STAGE2_MODE_RULES)) ? (args.mode as Stage2Mode) : 'exact';

  const base = STAGE2_PROMPT;
  let text = STAGE2_MODE_RULES[mode] + '\n\n' + base +
    '\n\n=== BRAND_EXTRACTION_JSON ===\n' + stripFences(brandJson) +
    '\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached to this message. Analyze it as REFERENCE_AD_IMAGE.';
  if (productAssets.length) {
    text += '\n\n=== PRODUCT_ASSETS ===\n' +
      productAssets.length + ' real product/UI asset image(s) are attached as additional inputs AFTER the reference ad. ' +
      'These ARE the product visual — they must be used in the ad\'s product slot, and the same files are passed to the image renderer. ' +
      'Describe ONLY their placement and treatment (size, position, device framing) to match how the reference ad depicts its product — do NOT transcribe, summarize, or invent any UI text, labels, charts, numbers, or screen contents. ' +
      'This OVERRIDES any instruction to represent the product abstractly: do not produce an abstract/iconic stand-in, and do NOT invent any product interface (no microphones, waveforms, chat bubbles, dashboards, or fake screens). ' +
      'In the generated ad_prompt you MUST write the literal phrase "the attached product screenshot" into product_visual_direction.source_asset_to_use and product_visual_direction.what_it_should_show, and set the product element\'s content.source_asset_to_use to "ATTACHED_PRODUCT_IMAGE" — never describe an imagined product UI in those fields. ' +
      'product_visual_direction MUST describe cropping the asset to its screen/UI card (dropping the surrounding page background and browser/window chrome), then compositing it into a clean device frame or floating card that matches the way the reference ad depicts its product. ' +
      "The negative_prompt MUST forbid altering, relabeling, redrawing, recoloring, cropping the UI screen contents or UI text, blurring, or inventing any UI, text, charts, or data inside the attached product asset(s), MUST forbid copying any UI or screen contents from the reference ad's own device, and MUST forbid the screenshot's original page background or surrounding window/browser chrome bleeding into the ad.";
  }
  const msgContent: Json[] = [{ type: 'text', text }, { type: 'image_url', image_url: { url: refImageDataUrl } }];
  productAssets.forEach((u) => { msgContent.push({ type: 'image_url', image_url: { url: u } }); });

  const res = await Auth.authedFetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 2, messages: [{ role: 'user', content: msgContent }] }),
  });
  const data: ChatResponse = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Stage 2 failed (HTTP ' + res.status + ')'));
  const content = chatContent(data);
  if (!content) throw new Error('Stage 2 returned no content.');
  return content;
}

// Pull the render-ready ad_prompt out of the Stage-2 JSON, with mapped aspect ratio.
function prepareStage3(stage2Content: string): { adPromptObj: JsonObject | null; adPromptStr: string; aspect: string } {
  let parsed: Json = null;
  try { parsed = parseJsonLoose(stage2Content); } catch { /* leave null */ }
  if (parsed && typeof parsed === 'object' && (parsed as JsonObject).ad_prompt) {
    const ap = (parsed as JsonObject).ad_prompt as JsonObject;
    // Safety net: never let a phantom subheadline render when the reference has none.
    if (ap.reference_has_subheadline === false && ap.copy && typeof ap.copy === 'object') {
      (ap.copy as JsonObject).subheadline = '';
    }
    // Hoist art-direction prose to the top — image models honor forceful prose over nested JSON.
    const art = typeof ap.art_direction === 'string' ? ap.art_direction.trim() : '';
    const ar = ap.canvas && (ap.canvas as JsonObject).aspect_ratio;
    const json = JSON.stringify(ap, null, 2);
    const str = art ? 'ART DIRECTION (follow precisely): ' + art + '\n\n' + json : json;
    return { adPromptObj: ap, adPromptStr: str, aspect: mapAspectRatio(ar) };
  }
  return { adPromptObj: null, adPromptStr: stripFences(stage2Content), aspect: '1:1' };
}

type BaseCopy = { headline?: string; subheadline?: string };

// Generate n distinct on-brand ad-copy angles (text-only, cheap).
async function generateAngles(baseCopy: BaseCopy, brandJson: string, n: number): Promise<Variation[]> {
  if (!n || n < 1) throw new Error('generateAngles: n must be >= 1');
  const hasSub = !!baseCopy && typeof baseCopy.subheadline === 'string' && baseCopy.subheadline.trim() !== '';
  const subInstr = hasSub
    ? 'Each item MUST include a "subheadline" field (the base ad has one).'
    : 'Do NOT include a "subheadline" field (the base ad does not have one).';
  const angleTypes = ['pain', 'outcome', 'promise', 'proof', 'objection', 'status', 'urgency'];
  const angleHints = Array.from({ length: n }, (_, i) => angleTypes[i % angleTypes.length]).join(', ');
  const prompt =
    'You are a direct-response ad copywriter. Your task is to produce EXACTLY ' + n + ' distinct ad angles for the advertisement described below.\n\n' +
    'CURRENT AD COPY (base):\n' + JSON.stringify(baseCopy, null, 2) + '\n\n' +
    'BRAND FACTS (authoritative — use ONLY brand-supported claims; invent NO numbers, features, testimonials, guarantees, or statistics not present here):\n' + brandJson + '\n\n' +
    'ANGLE TYPES TO USE (one per item, in this order, repeat only if n exceeds the list): ' + angleHints + '\n' +
    'Angle types reference: pain=addresses a frustration, outcome=highlights a desirable result, promise=makes a specific commitment, proof=social/data evidence (only if brand facts support it), objection=preempts a doubt, status=appeals to identity/aspiration, urgency=time or scarcity motivation.\n\n' +
    'COLOR VARIATION RULES (the ONLY visual change allowed — everything else stays identical):\n' +
    '- Each item picks a "color_treatment": which brand color is the background and which is the text/headline.\n' +
    '- Use ONLY colors that actually appear in the brand\'s palette in BRAND FACTS (prefer their hex codes; if none, name the brand color). Never introduce a color that is not in the brand palette.\n' +
    '- The background and text colors MUST have strong, legible contrast. Never put a color on a near-identical color.\n' +
    '- Vary the treatment across the items by swapping which palette color is background vs text. Keep it sensible and on-brand.\n' +
    '- This recolors ONLY the ad\'s background and text. It must NOT recolor, redraw, or restyle the product UI / screenshot, the logo, the layout, or the fonts.\n\n' +
    'HEADLINE CRAFT — every headline must read like a scroll-stopping Meta ad headline, NOT a value proposition:\n' +
    '- Aim for 2–6 words, under ~40 characters. Strong default, not a hard cap — run longer ONLY for rhythm (e.g. three parallel chunks). Never two sentences. Never a full value prop.\n' +
    '- One idea per headline. If you\'re joining two thoughts with "and", a comma splice, or a second sentence, cut to one.\n' +
    '- Lead with the benefit, a concrete number, a tension, or the customer\'s own words. Banned openers (filler verbs): Gives, Helps, Lets, Allows, Provides, Enables, Makes, Offers.\n' +
    '- Before returning, re-read every headline and tighten any that run long, open with a banned verb, or carry two ideas. When in doubt, cut words.\n\n' +
    'OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n' +
    '{ "variations": [\n' +
    '  { "angle": "<type-label>", "headline": "<new headline>", ' +
    (hasSub ? '"subheadline": "<new subheadline>", ' : '') +
    '"color_treatment": { "background": "<a brand-palette color, hex preferred>", "text": "<a different brand-palette color with strong contrast vs background>" } }\n' +
    '] }\n\n' + subInstr + '\n' +
    'Produce exactly ' + n + ' items in the "variations" array. No extra keys. No prose outside the JSON object.';
  const res = await Auth.authedFetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 2, messages: [{ role: 'user', content: prompt }] }),
  });
  const data: ChatResponse = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  const raw = chatContent(data);
  if (!raw) throw new Error('generateAngles: no content in model response.');
  const parsed = parseJsonLoose(raw) as JsonObject;
  const arr = (parsed.variations || parsed.angles || (Array.isArray(parsed) ? parsed : null)) as Variation[] | null;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('generateAngles: model did not return a non-empty variations array.');
  return arr;
}

type Analysis = JsonObject;
type Voc = {
  top_complaints: Json[]; recurring_phrases: Json[]; desired_outcomes: Json[];
  objections: Json[]; switching_triggers: Json[]; competitor_gripes: Json[]; sources: Json[];
};

// One-time external voice-of-customer pass. Best-effort: callers treat failure as "no VOC".
async function researchCustomers(analysis: Analysis): Promise<Voc> {
  analysis = analysis || {};
  const plan = (analysis.external_customer_research_plan as JsonObject) || {};
  const identity = (analysis.brand_identity as JsonObject) || {};
  const messaging = (analysis.messaging_foundation as JsonObject) || {};
  const ctx = {
    brand: identity.brand_name || identity.name || '',
    positioning: identity.positioning || identity.tagline || '',
    customer_segments: messaging.customer_segments || [],
  };
  const prompt =
    'You are a senior B2B SaaS market researcher. Using web search, find what REAL prospective ' +
    'customers of this product actually say, complain about, and want — in their own words — ' +
    'across the sources below. Do NOT invent quotes; report only what you actually find. ' +
    'If a source yields nothing, omit it.\n\n' +
    'BRAND CONTEXT (so you research the right audience):\n' + JSON.stringify(ctx, null, 2) + '\n\n' +
    'RESEARCH TARGETS (where to look):\n' + JSON.stringify({
      recommended_subreddits: plan.recommended_subreddits || [],
      review_sites: plan.review_sites || [],
      communities: plan.communities || [],
      search_queries: plan.search_queries || [],
      competitor_review_targets: plan.competitor_review_targets || [],
      what_to_extract: plan.what_to_extract || [],
    }, null, 2) + '\n\n' +
    'Extract recurring complaints, the exact phrases people use, desired outcomes, objections/' +
    'hesitations, what makes people switch from alternatives, and gripes about competitors. ' +
    'Prefer concrete, quotable language over summaries.\n\n' +
    'OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n' +
    '{ "top_complaints": [], "recurring_phrases": [], "desired_outcomes": [], ' +
    '"objections": [], "switching_triggers": [], "competitor_gripes": [], "sources": [] }\n' +
    'Keep each array to the most salient 5–10 items.';
  const res = await Auth.authedFetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 1, online: true, messages: [{ role: 'user', content: prompt }] }),
  });
  const data: ChatResponse = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  const raw = chatContent(data);
  if (!raw) throw new Error('researchCustomers: no content in model response.');
  const parsed = parseJsonLoose(raw) as JsonObject;
  return {
    top_complaints: (parsed.top_complaints as Json[]) || [],
    recurring_phrases: (parsed.recurring_phrases as Json[]) || [],
    desired_outcomes: (parsed.desired_outcomes as Json[]) || [],
    objections: (parsed.objections as Json[]) || [],
    switching_triggers: (parsed.switching_triggers as Json[]) || [],
    competitor_gripes: (parsed.competitor_gripes as Json[]) || [],
    sources: (parsed.sources as Json[]) || [],
  };
}

type ConceptStage = 'unaware' | 'problem' | 'solution' | 'product' | 'most';
type Concept = { angle: string; stage: ConceptStage; headline: string; rationale: string };

function conceptFocusForGoal(goal?: string): ConceptStage[] {
  if (goal === 'waitlist') return ['problem', 'solution'];
  if (goal === 'paid') return ['product', 'most'];
  return ['solution', 'product']; // trials (default)
}
async function generateConcepts(analysis: Analysis, goal?: string): Promise<Concept[]> {
  analysis = analysis || {};
  const focus = conceptFocusForGoal(goal);
  const goalLabel = goal === 'waitlist' ? 'Grow a waitlist' : goal === 'paid' ? 'Convert to paid' : 'Get signups / trials';
  const proof = (analysis.proof_library as JsonObject) || {};
  const claims = (analysis.claim_constraints as JsonObject) || {};
  const sac = (analysis.static_ad_creative_recommendations as JsonObject) || {};
  const facts = {
    customer_voice: analysis.external_voc || 'none collected',
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
    'You are a senior direct-response Meta ads strategist who has run paid social for B2B SaaS ' +
    'for over a decade. Produce a board of DISTINCT ad concepts for the brand below, organized by ' +
    'customer awareness stage.\n\n' +
    'A concept is a different PSYCHOLOGICAL ANGLE into the same customer (e.g. Transformation / ' +
    'Before→After, Vs. the old way, Customer proof, Risk reversal, How it works, ROI / value) — ' +
    'NOT a reworded headline. Each must be genuinely different from the others.\n\n' +
    'AWARENESS STAGES (tag every concept with exactly one):\n' +
    '- "unaware": doesn\'t know they have the problem yet\n' +
    '- "problem": feels the pain, doesn\'t know solutions exist\n' +
    '- "solution": knows tools like this exist, weighing approaches\n' +
    '- "product": knows this product, comparing to alternatives\n' +
    '- "most": ready to buy, needs a nudge\n\n' +
    'GOAL FOCUS: the founder\'s goal is "' + goalLabel + '". Weight the board toward these stages: ' +
    JSON.stringify(focus) + '. Still include a few concepts in the other stages, but produce the ' +
    'most (and strongest) concepts for the focus stages.\n\n' +
    'GROUNDING — these are authoritative facts. Invent NO numbers, testimonials, guarantees, ' +
    'statistics, or claims not present here. A proof-based concept may ONLY cite proof present in ' +
    'facts.proof. Honor claim_constraints (never use a forbidden claim; only use a ' +
    'requires_proof claim if matching proof exists).\n' +
    JSON.stringify(facts, null, 2) + '\n\n' +
    'Write each concept\'s example headline in the brand\'s own voice — prefer their repeated phrases ' +
    'and the exact phrases real customers use (facts.customer_voice / facts.customer_dna).\n\n' +
    'HEADLINE CRAFT — every example headline must read like a scroll-stopping Meta ad headline, NOT ' +
    'a value proposition:\n' +
    '- LENGTH: aim for 2–6 words, under ~40 characters. This is a strong default, not a hard cap — ' +
    'run longer ONLY when the extra words buy rhythm or a deliberate parallel pattern (e.g. three ' +
    'chunks: "No agencies · zero commission · keep 100%"). Never two sentences. Never a full value prop.\n' +
    '- ONE IDEA: exactly one idea per headline. If you\'re joining two thoughts with "and", a comma ' +
    'splice, or a second sentence, that\'s two concepts — split them across concepts or cut the weaker one.\n' +
    '- LEAD WITH THE PUNCH: open with the benefit, a concrete number, a tension/objection, or the ' +
    'customer\'s own words. Banned openers (filler verbs): Gives, Helps, Lets, Allows, Provides, ' +
    'Enables, Makes, Offers. (✗ "Gives doctors more control of their shifts" → ✓ "Own your roster.")\n' +
    '- CONCRETE OVER ABSTRACT: prefer specifics, numbers, and exact phrases from facts.proof and ' +
    'facts.customer_voice over vague claims like "more control" or "better experience".\n' +
    '- SELF-REVISE: before returning, re-read every headline. If any runs past ~6 words without a ' +
    'rhythmic reason, opens with a banned verb, or carries two ideas — rewrite it tighter. When in doubt, cut words.\n' +
    'Calibration (pattern, not copy):\n' +
    '  ✗ "Gives teams more visibility and helps them stay aligned." → ✓ "See every project at a glance."\n' +
    '  ✗ "Our platform makes it easy to get paid faster than ever." → ✓ "Get paid in 48 hours."\n' +
    '  ✗ "Be in charge of your schedule and your work-life balance." → ✓ "Own your schedule."\n\n' +
    'OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n' +
    '{ "concepts": [ { "angle": "<short label>", "stage": "<unaware|problem|solution|product|most>", ' +
    '"headline": "<example hook in brand voice>", "rationale": "<one short line: why this lands for this ICP>" } ] }\n' +
    'Produce 10–16 concepts total. No extra keys.\n' +
    'FINAL CHECK before returning: every headline must be ≤6 words (rhythmic exceptions aside), carry one idea, and not open with a banned filler verb. If any headline reads like a sentence or a full value proposition, rewrite it shorter — short copy is the #1 driver of a clean, scroll-stopping ad.';
  const res = await Auth.authedFetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: 2, messages: [{ role: 'user', content: prompt }] }),
  });
  const data: ChatResponse = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
  const raw = chatContent(data);
  if (!raw) throw new Error('generateConcepts: no content in model response.');
  const parsed = parseJsonLoose(raw) as JsonObject;
  const arr = (parsed.concepts || (Array.isArray(parsed) ? parsed : null)) as JsonObject[] | null;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('generateConcepts: model returned no concepts.');
  const valid: ConceptStage[] = ['unaware', 'problem', 'solution', 'product', 'most'];
  return arr.filter((c) => c && c.headline && c.angle).map((c) => ({
    angle: String(c.angle),
    stage: valid.indexOf(c.stage as ConceptStage) >= 0 ? (c.stage as ConceptStage) : 'solution',
    headline: String(c.headline),
    rationale: c.rationale ? String(c.rationale) : '',
  }));
}

type GenerateImageArgs = {
  prompt: string;
  referenceImage?: string;
  logoImage?: string;
  productImages?: string[];
  aspect?: string;
  resolution?: string;
};
type GenerateResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string; timedOut?: boolean; taskId?: string };

type KieGenResponse = { done?: boolean; urls?: string[]; taskId?: string; error?: string };
type KiePollResponse = { state?: string; urls?: string[]; failMsg?: string; progress?: number; error?: string };

// Stage 3: create the KIE task and poll to completion.
async function generateImage(args: GenerateImageArgs, onStatus?: (msg: string) => void): Promise<GenerateResult> {
  if (onStatus) onStatus('Uploading images and starting the render…');
  const genRes = await Auth.authedFetch('/api/kie/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: args.prompt,
      referenceImage: args.referenceImage,
      logoImage: args.logoImage,
      productImages: args.productImages || [],
      aspect_ratio: args.aspect || '1:1',
      // Omit when unset so the server's KIE_IMAGE_RESOLUTION (.env) governs.
      resolution: args.resolution,
    }),
  });
  const gen: KieGenResponse = await genRes.json();
  if (!genRes.ok) return { ok: false, error: "Couldn't start the render: " + (gen.error || ('HTTP ' + genRes.status)) };
  // Synchronous backend (OpenRouter) returns the finished image right away — no polling.
  if (gen.done && Array.isArray(gen.urls)) {
    if (!gen.urls.length) return { ok: false, error: 'Render finished but returned no image.' };
    return { ok: true, urls: gen.urls };
  }
  if (!gen.taskId) return { ok: false, error: "Couldn't start the render: " + (gen.error || ('HTTP ' + genRes.status)) };
  const taskId = gen.taskId;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    await new Promise((r) => { setTimeout(r, 3000); });
    const pollRes = await Auth.authedFetch('/api/kie/result?taskId=' + encodeURIComponent(taskId));
    const poll: KiePollResponse = await pollRes.json();
    if (!pollRes.ok) return { ok: false, error: 'Render polling failed: ' + (poll.error || ('HTTP ' + pollRes.status)) };
    const state = String(poll.state || '').toLowerCase();
    if (state === 'success') {
      const urls = poll.urls || [];
      if (!urls.length) return { ok: false, error: 'Render finished but returned no image.' };
      return { ok: true, urls };
    }
    if (state === 'fail') return { ok: false, error: 'Render failed: ' + (poll.failMsg || 'unknown error') };
    if (onStatus) onStatus('Drawing your ad…' + (poll.progress != null ? ' ' + Math.round(poll.progress * 100) + '%' : ''));
  }
  return { ok: false, timedOut: true, taskId, error: "Still rendering — it'll appear in My ads automatically when it finishes." };
}

// Single-poll helper for resuming timed-out renders.
async function pollRender(taskId: string): Promise<{ state: string; urls: string[]; failMsg: string; progress?: number; error?: string }> {
  const res = await Auth.authedFetch('/api/kie/result?taskId=' + encodeURIComponent(taskId));
  const poll: KiePollResponse = await res.json();
  if (!res.ok) return { state: 'error', urls: [], failMsg: '', error: poll.error || ('HTTP ' + res.status) };
  const state = String(poll.state || '').toLowerCase();
  return { state, urls: poll.urls || [], failMsg: poll.failMsg || '', progress: poll.progress };
}

// Persist a generated ad (server downloads the temp KIE image into Storage + inserts a row).
async function saveAd(args: {
  imageUrl: string;
  brandId?: string | null;
  websiteUrl?: string | null;
  prompt?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
}): Promise<{ ok: true; ad: JsonObject } | { ok: false; error: string }> {
  const res = await Auth.authedFetch('/api/library/ads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: args.imageUrl, brandId: args.brandId || null, websiteUrl: args.websiteUrl || null,
      prompt: args.prompt || null, aspectRatio: args.aspectRatio || null, resolution: args.resolution || null,
    }),
  });
  const data = await res.json().catch(() => ({} as JsonObject));
  if (!res.ok) return { ok: false, error: (data.error as string) || ('HTTP ' + res.status) };
  return { ok: true, ad: data.ad as JsonObject };
}

// ─── Supabase data (read via the user's JWT under RLS) ───
async function loadBrands(): Promise<JsonObject[]> {
  const c = Auth.client; if (!c) return [];
  const { data, error } = await c.from('brands').select('id,name,website_url,analysis,goal,updated_at').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as JsonObject[]) || [];
}
async function saveBrand(websiteUrl: string, analysisObj: JsonObject, userId: string, goal?: string | null): Promise<JsonObject | null> {
  const c = Auth.client; if (!c || !userId) return null;
  let host = websiteUrl; try { host = new URL(websiteUrl).hostname; } catch { /* keep raw */ }
  const row: JsonObject = { user_id: userId, name: host, website_url: websiteUrl, analysis: analysisObj, updated_at: new Date().toISOString() };
  if (goal !== undefined && goal !== null) row.goal = goal; // only set when provided
  const { data, error } = await c.from('brands').upsert(row, { onConflict: 'user_id,website_url' }).select().single();
  if (error) throw new Error(error.message);
  return data as JsonObject;
}
// Load saved product/UI assets for a brand as data URLs (used as KIE product inputs).
async function loadBrandAssets(brandId: string): Promise<{ id: string; label: string; dataUrl: string }[]> {
  const c = Auth.client; if (!c || !brandId) return [];
  const { data, error } = await c.from('brand_assets').select('id,image_path,label,created_at').eq('brand_id', brandId).order('created_at', { ascending: false });
  if (error) return [];
  const out: { id: string; label: string; dataUrl: string }[] = [];
  for (const row of (data as JsonObject[]) || []) {
    const dl = await c.storage.from('brand-assets').download(row.image_path as string);
    if (!dl.error && dl.data) {
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => res('');
        r.readAsDataURL(dl.data);
      });
      if (dataUrl) out.push({ id: row.id as string, label: row.label as string, dataUrl });
    }
  }
  return out;
}
// Load the user's saved ads with short-lived signed image URLs (private bucket).
async function loadAds(): Promise<JsonObject[]> {
  const c = Auth.client; if (!c) return [];
  const { data, error } = await c.from('ads').select('id,brand_id,website_url,prompt,aspect_ratio,resolution,image_path,created_at').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data as JsonObject[]) || [];
  for (const row of rows) {
    const sig = await c.storage.from('ads').createSignedUrl(row.image_path as string, 3600);
    row.signedUrl = (sig && sig.data && sig.data.signedUrl) || '';
  }
  return rows;
}

export type { Variation, Concept, ConceptStage, Voc, GenerateImageArgs, GenerateResult, BaseCopy };

export const BYA = {
  // helpers (public)
  normalizeUrl,
  buildVariantPrompt,
  // pipeline
  extractSite,
  analyzeBrand,
  makeAdPrompt,
  prepareStage3,
  generateAngles,
  researchCustomers,
  generateConcepts,
  generateImage,
  pollRender,
  saveAd,
  // data
  loadBrands,
  saveBrand,
  loadBrandAssets,
  loadAds,
};
