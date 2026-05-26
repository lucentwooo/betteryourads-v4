// Standalone check for the product-fidelity helpers in index.html.
// Extracts the sentinel-delimited helper block, evals it, and asserts.
// Run: node scripts/check-product-fidelity.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const START = "// === product-fidelity helpers (start) ===";
const END = "// === product-fidelity helpers (end) ===";
const a = html.indexOf(START);
const b = html.indexOf(END);
assert.ok(a !== -1 && b !== -1 && b > a, "helper sentinels not found in index.html");
const block = html.slice(a + START.length, b);

const { leadProductDirective, applyProductAssetFidelity, withProductFidelity } =
  new Function(block + "\nreturn { leadProductDirective, applyProductAssetFidelity, withProductFidelity };")();

const fixture = () => ({
  product_visual_direction: {
    visual_type: "Iconic product mockup",
    source_asset_to_use: "Birdie voice interface mockup (orange microphone + transcript examples)",
    what_it_should_show: "Orange microphone symbol with transcript-like UI",
    avoid: "Do not invent UI elements",
  },
  negative_prompt: "no extra text",
  elements: [
    { name: "brand_logo", type: "image", content: {} },
    { name: "product_visual", type: "image", content: { source_asset_to_use: "Birdie voice interface mockup (orange microphone + transcript examples)" } },
    { name: "headline_text", type: "text", content: { text: "Hi" } },
  ],
});

// leadProductDirective
assert.equal(leadProductDirective(0), "", "lead is empty when count is 0");
assert.match(leadProductDirective(2), /2 real product\/UI screenshot/, "lead names the count");
assert.match(leadProductDirective(1), /attached/i, "lead mentions the attachment");

// applyProductAssetFidelity — no-op at 0
const untouched = fixture();
const before = JSON.stringify(untouched);
applyProductAssetFidelity(untouched, 0);
assert.equal(JSON.stringify(untouched), before, "count 0 is a no-op");

// applyProductAssetFidelity — count 1
const f = fixture();
applyProductAssetFidelity(f, 1);
assert.match(f.product_visual_direction.source_asset_to_use, /attached/i, "pvd.source points at attachment");
assert.match(f.product_visual_direction.what_it_should_show, /attached/i, "pvd.what_it_should_show points at attachment");
assert.doesNotMatch(JSON.stringify(f.product_visual_direction), /voice interface mockup/i, "invented pvd text removed");
const logo = f.elements.find((e) => e.name === "brand_logo");
assert.deepEqual(logo.content, {}, "logo element left untouched");
const prod = f.elements.find((e) => e.name === "product_visual");
assert.match(prod.content.source_asset_to_use, /ATTACHED_PRODUCT_IMAGE/, "product element points at attachment");
assert.doesNotMatch(JSON.stringify(prod.content), /voice interface mockup/i, "invented product element text removed");
const txt = f.elements.find((e) => e.name === "headline_text");
assert.deepEqual(txt.content, { text: "Hi" }, "text elements left untouched");
assert.match(f.negative_prompt, /reference ad's own/i, "reference-screen guard appended");

// applyProductAssetFidelity — missing product_visual_direction is created
const g = { elements: [] };
applyProductAssetFidelity(g, 1);
assert.ok(g.product_visual_direction && /attached/i.test(g.product_visual_direction.source_asset_to_use), "pvd created when absent");

// withProductFidelity
const w1 = withProductFidelity(fixture(), 1, "TRAILING_X");
assert.ok(w1.startsWith("IMPORTANT — PRODUCT VISUAL"), "lead directive is at the top");
assert.match(w1, /TRAILING_X\s*$/, "trailing directive appended at end");
assert.match(w1, /attached/i, "JSON body now references the attachment");
const w0 = withProductFidelity(fixture(), 0, "");
assert.ok(!w0.startsWith("IMPORTANT"), "no lead directive when count is 0");

console.log("OK — product-fidelity helpers pass all checks");
