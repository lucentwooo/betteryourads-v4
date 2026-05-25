import { getBrowser } from "@/lib/browser";
import { extractFromPage, parseJsonLoose } from "@/lib/extract";
import { STRATEGIST_PROMPT } from "@/lib/prompts";
import { env } from "@/lib/env";

const AGENT_GROUPS = [
  {
    name: "A",
    keys: [
      "brand_identity",
      "visual_brand_system",
      "product_representation",
      "offer_dna",
    ],
  },
  {
    name: "B",
    keys: [
      "messaging_foundation",
      "proof_library",
      "customer_dna_from_website",
      "external_customer_research_plan",
      "competitor_intelligence",
      "claim_constraints",
    ],
  },
  {
    name: "C",
    keys: [
      "static_ad_creative_recommendations",
      "missing_information",
      "source_map",
    ],
  },
];

export async function extractSite(url: string) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const data = await page.evaluate(extractFromPage);
    return { ...data, finalUrl: page.url() };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function runAgent(
  basePrompt: string,
  group: (typeof AGENT_GROUPS)[number],
) {
  const directive = `\n\n=== PARALLEL EXTRACTION DIRECTIVE (OVERRIDES output-format above) ===\nReturn a SINGLE valid JSON object containing EXACTLY these top-level keys and nothing else: ${JSON.stringify(group.keys)}. No markdown fences.`;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openrouterKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.stage1Model(),
      messages: [{ role: "user", content: basePrompt + directive }],
    }),
  });
  const json = await r.json();
  if (!r.ok)
    throw new Error(`Agent ${group.name}: ${json?.error?.message ?? r.status}`);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Agent ${group.name}: empty`);
  return parseJsonLoose(content) as Record<string, unknown>;
}

export async function runStage1(url: string) {
  const extracted = await extractSite(url);
  const base =
    `Website to analyze: ${extracted.finalUrl || url}\n\n=== MEASURED SITE DATA (authoritative) ===\nUse these EXACT hex codes and font names.\n\n` +
    JSON.stringify(
      {
        title: extracted.title,
        description: extracted.description,
        colors: extracted.colors,
        cssColorVariables: extracted.cssColorVariables,
        fonts: extracted.fonts,
        logos: extracted.logos,
      },
      null,
      2,
    ) +
    `\n\n=== PAGE TEXT ===\n${extracted.text || ""}\n=== END SITE DATA ===\n\n` +
    STRATEGIST_PROMPT;
  const settled = await Promise.allSettled(
    AGENT_GROUPS.map((g) => runAgent(base, g)),
  );
  const merged: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") Object.assign(merged, s.value);
    else
      errors.push(
        s.reason instanceof Error ? s.reason.message : String(s.reason),
      );
  }
  if (Object.keys(merged).length === 0)
    throw new Error(`All agents failed: ${errors.join("; ")}`);
  return { extraction: merged, errors };
}
