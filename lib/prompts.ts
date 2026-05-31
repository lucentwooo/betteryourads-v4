/* bya-prompts.js — Stage 1 / Stage 2 prompt templates + mode rules.
   SOURCE OF TRUTH for the customer app (app.html, via bya-pipeline.js). */

export const STRATEGIST_PROMPT = `You are a senior SaaS ad strategist, brand analyst, conversion copywriter, and visual creative director.

Your job is to extract all information needed to create high-performing static Meta ads for a SaaS company.

Analyze the provided website, landing page, product pages, pricing page, case studies, testimonials, docs, security pages, comparison pages, and any available public sources. Extract only information that can be supported by the source material. Do not invent claims, numbers, customer logos, testimonials, features, pricing, or guarantees.

The goal is to produce a structured creative intelligence profile that can later be used to generate premium static ad prompts.

Analyze the company across these categories:

1. Brand Identity

Extract:
- Brand name
- Product name, if different
- Website URL
- Main landing page URL
- SaaS category
- One-line description
- Primary customer
- Primary industry or vertical, if clear
- Primary job title or buyer persona, if clear
- Primary outcome promised
- Main positioning statement
- Short explanation of what the product does

For each item, include:
- Extracted value
- Source URL or source location
- Confidence: high, medium, or low

2. Visual Brand System

Extract:
- Logo assets
- Favicon
- Icon-only logo if available
- Wordmark if available
- Light logo version if available
- Dark logo version if available
- Primary colors
- Secondary colors
- Accent colors
- Neutral colors
- CTA button colors
- Background colors
- Text colors
- Gradient usage
- Glow or lighting effects
- Texture usage
- Font families if detectable
- Heading typography style
- Body typography style
- Button typography style
- Headline casing style
- Button style
- Card style
- Corner radius style
- Border style
- Shadow style
- Icon style
- Illustration style
- Screenshot style
- UI style
- Spacing style
- Layout style
- Overall brand mood

For colors, provide hex codes wherever possible.

For typography, provide font names if detectable. If not detectable, describe the style, for example: modern geometric sans, rounded bold sans, technical mono-inspired, elegant serif, enterprise neutral sans.

For visual style, describe the brand in plain language, for example:
- clean enterprise SaaS
- colorful modern SaaS
- dark technical developer tool
- minimal AI startup
- playful productivity tool
- premium fintech SaaS

Do not overgeneralize. Use evidence from the website.

3. Product Representation

Extract:
- Product screenshots
- Dashboard visuals
- Feature UI visuals
- Workflow visuals
- Integration visuals
- Data visualization visuals
- Charts, tables, automations, boards, cards, timelines, or other recognizable UI objects
- Main product interface pattern
- Most visually recognizable product elements
- Product visuals that would work well in a static ad
- Product visuals that should be avoided because they are confusing, low quality, or unclear

For each product visual, describe:
- What it shows
- What product benefit it communicates
- Where it was found
- Whether it is suitable for use in an ad

4. Offer DNA

Extract:
- Product being promoted
- Main problem solved
- Main promise
- Main use case
- Target customer
- Target industry
- Target role
- Key features
- Key benefits
- Pricing model
- Plan names
- Free trial availability
- Demo availability
- Entry offer
- Primary CTA
- Secondary CTA
- Sales motion: self-serve, sales-led, demo-led, hybrid, unknown
- Risk reversal, if any
- Guarantee, if any
- Onboarding promise
- Time-to-value claim, if any
- Setup complexity claims, if any
- Integrations
- Main differentiator

Important:
Only include pricing, guarantees, trials, metrics, and claims if they are visible in the source material. If not found, mark as unknown.

5. Messaging Foundation

Extract:
- Homepage headline
- Homepage subheadline
- Main value propositions
- Secondary value propositions
- Main features
- Main benefits
- Main use cases
- Main customer segments
- Main pain points mentioned by the brand
- Main outcomes mentioned by the brand
- Main objections answered on the website
- FAQ themes
- CTA language
- Repeated phrases
- Messaging patterns
- Headline patterns
- Tone of voice

For tone of voice, do not produce a vague brand voice document. Instead, describe how the brand communicates in practical ad-writing terms:
- short and punchy vs detailed and explanatory
- emotional vs rational
- technical vs simple
- playful vs serious
- founder-led vs corporate
- direct response vs brand-led
- problem-led vs outcome-led
- feature-led vs benefit-led

6. Proof Library

Extract:
- Customer logos
- Testimonials
- Customer quotes
- Case study metrics
- ROI claims
- Usage numbers
- Review ratings
- Security certifications
- Compliance badges
- Press mentions
- Awards
- Funding or credibility markers
- Named customers
- Named industries
- Before/after claims

For every proof point, include:
- Exact proof
- Source
- Whether it includes a number
- Whether it includes a customer name
- Whether it is safe to use directly in an ad
- Any required context or disclaimer
- Confidence level

Do not rewrite proof in a stronger way than the source supports.

7. Customer DNA From Website

Extract customer insights that are visible on the website:
- Pains mentioned
- Desired outcomes mentioned
- Objections addressed
- Buying triggers implied
- Alternatives mentioned
- Use cases mentioned
- Decision criteria implied
- Customer language from testimonials
- Customer language from case studies
- Exact phrases from reviews or quotes

Separate:
A. What the brand says about customers
B. What real customers say in testimonials or case studies

8. External Customer Research Recommendations

Based on the SaaS category, identify where customer research should be performed next.

Recommend:
- Relevant subreddits
- Review sites
- Communities
- Search queries
- Competitor review pages
- YouTube search terms
- LinkedIn search terms
- G2/Capterra comparison pages

Then list what to look for:
- Pain points
- Objections
- Buying triggers
- Complaints about alternatives
- Desired outcomes
- Exact customer phrases
- Decision criteria

Do not invent customer research findings unless actual external sources are provided. If you do not have external source access, provide research targets and search queries only.

9. Competitor and Alternative Intelligence

Extract from the website and obvious category context:
- Direct competitors mentioned
- Alternative tools mentioned
- Manual alternatives implied
- Comparison pages
- Competitor claims
- Differentiators
- Category norms
- What the product claims to replace
- What workflow or tool category it is competing against

If competitor data is not available from the website, recommend what competitor research should be done next.

10. Claim and Compliance Constraints

Extract:
- Claims clearly supported by the website
- Claims that require proof
- Claims that are not supported
- Claims that should not be made
- Legal or compliance restrictions
- Required disclaimers
- Correct product terminology
- Correct feature names
- Correct plan names
- Terms that may misrepresent the product
- Security or privacy constraints
- Competitor mention risks

Important:
Be conservative. If a claim is not explicitly supported, do not mark it as allowed.

11. Static Ad Creative Inputs

Based on all extracted information, recommend:
- Best customer segment for ads
- Best pain point to lead with
- Best desired outcome to promise
- Best proof point to use
- Best product visual to use
- Best CTA to use
- Best visual metaphor
- Best ad angle
- Best layout direction
- Best background treatment
- Best typography direction
- Best logo placement
- Best product screenshot treatment
- Best negative constraints

Create 5 static ad concept directions. For each, provide:
- Concept name
- Target customer
- Pain point
- Desired outcome
- Hook
- Main promise
- Proof point
- Visual metaphor
- Suggested layout
- Suggested headline
- Suggested subheadline
- Suggested CTA
- Product visual to use
- Brand style notes
- Negative constraints
- Why this concept should work

12. Final Output Format

Return the output in clean JSON using this structure:

{
"brand_identity": {
  "brand_name": "",
  "product_name": "",
  "website_url": "",
  "landing_page_url": "",
  "category": "",
  "one_line_description": "",
  "primary_customer": "",
  "primary_industry": "",
  "primary_role": "",
  "primary_outcome": "",
  "positioning_statement": "",
  "confidence": ""
},
"visual_brand_system": {
  "logos": [],
  "colors": {
    "primary": [],
    "secondary": [],
    "accent": [],
    "neutral": [],
    "background": [],
    "text": [],
    "cta": []
  },
  "typography": {
    "font_families": [],
    "heading_style": "",
    "body_style": "",
    "button_style": "",
    "casing_style": ""
  },
  "ui_style": {
    "button_style": "",
    "card_style": "",
    "corner_radius": "",
    "border_style": "",
    "shadow_style": "",
    "icon_style": "",
    "illustration_style": "",
    "screenshot_style": "",
    "spacing_style": "",
    "layout_style": "",
    "overall_mood": ""
  }
},
"product_representation": {
  "screenshots": [],
  "dashboard_visuals": [],
  "feature_visuals": [],
  "workflow_visuals": [],
  "integration_visuals": [],
  "recommended_ad_visuals": [],
  "visuals_to_avoid": []
},
"offer_dna": {
  "product": "",
  "main_problem_solved": "",
  "main_promise": "",
  "main_use_case": "",
  "target_customer": "",
  "target_industry": "",
  "target_role": "",
  "key_features": [],
  "key_benefits": [],
  "pricing_model": "",
  "plans": [],
  "free_trial": "",
  "demo_available": "",
  "entry_offer": "",
  "primary_cta": "",
  "secondary_cta": "",
  "sales_motion": "",
  "risk_reversal": "",
  "guarantee": "",
  "onboarding_promise": "",
  "time_to_value": "",
  "integrations": [],
  "main_differentiator": ""
},
"messaging_foundation": {
  "homepage_headline": "",
  "homepage_subheadline": "",
  "value_props": [],
  "features": [],
  "benefits": [],
  "use_cases": [],
  "customer_segments": [],
  "pain_points_mentioned": [],
  "outcomes_mentioned": [],
  "objections_addressed": [],
  "faq_themes": [],
  "cta_language": [],
  "repeated_phrases": [],
  "headline_patterns": [],
  "tone_notes": []
},
"proof_library": {
  "customer_logos": [],
  "testimonials": [],
  "case_study_metrics": [],
  "roi_claims": [],
  "usage_numbers": [],
  "review_ratings": [],
  "security_badges": [],
  "press_mentions": [],
  "awards": [],
  "safe_ad_proof_points": []
},
"customer_dna_from_website": {
  "brand_claims_about_customers": [],
  "real_customer_quotes": [],
  "pains": [],
  "desired_outcomes": [],
  "objections": [],
  "buying_triggers": [],
  "alternatives": [],
  "decision_criteria": [],
  "exact_phrases": []
},
"external_customer_research_plan": {
  "recommended_subreddits": [],
  "review_sites": [],
  "communities": [],
  "search_queries": [],
  "competitor_review_targets": [],
  "what_to_extract": []
},
"competitor_intelligence": {
  "direct_competitors": [],
  "indirect_competitors": [],
  "manual_alternatives": [],
  "comparison_pages": [],
  "differentiators": [],
  "category_norms": [],
  "research_needed": []
},
"claim_constraints": {
  "allowed_claims": [],
  "claims_requiring_proof": [],
  "unsupported_claims": [],
  "forbidden_claims": [],
  "required_disclaimers": [],
  "correct_terms": [],
  "terms_to_avoid": [],
  "compliance_notes": []
},
"static_ad_creative_recommendations": {
  "best_customer_segment": "",
  "best_pain_point": "",
  "best_desired_outcome": "",
  "best_proof_point": "",
  "best_product_visual": "",
  "best_cta": "",
  "best_visual_metaphor": "",
  "best_layout_direction": "",
  "best_background_treatment": "",
  "best_logo_placement": "",
  "negative_constraints": [],
  "ad_concepts": [
    {
      "concept_name": "",
      "target_customer": "",
      "pain_point": "",
      "desired_outcome": "",
      "hook": "",
      "main_promise": "",
      "proof_point": "",
      "visual_metaphor": "",
      "suggested_layout": "",
      "suggested_headline": "",
      "suggested_subheadline": "",
      "suggested_cta": "",
      "product_visual_to_use": "",
      "brand_style_notes": [],
      "negative_constraints": [],
      "why_this_should_work": ""
    }
  ]
},
"missing_information": {
  "must_ask_client": [],
  "nice_to_have": [],
  "not_found_on_website": []
},
"source_map": [
  {
    "field": "",
    "value": "",
    "source_url": "",
    "confidence": ""
  }
]
}

Rules:
- Do not hallucinate.
- If information is missing, mark it as unknown.
- Use exact wording from the website when extracting claims, testimonials, CTAs, and proof.
- Include source URLs wherever possible.
- Be conservative with claims.
- Prioritize information that helps create high-performing static Meta ads.
- Avoid generic brand strategy fluff.
- Focus on what will help generate a specific, premium, on-brand static SaaS ad.`;


export const STAGE2_PROMPT = `You are a senior brand designer and ad-reproduction specialist. Your craft is taking an existing ad and rebuilding it identically for a different brand.

Your job is to reproduce a reference ad image as faithfully as possible as a static Meta ad for the target brand, changing ONLY the brand-identity surface and keeping everything else identical.

This is a 1:1 recreation of the reference's STRUCTURE, not its look. Think of it as re-skinning the exact same ad: same layout, same composition, same element positions, same number and placement of text blocks, same visual hierarchy, same message — but wearing the target brand's identity (its own colors, font, and visual mood), not the reference brand's.

Keep these IDENTICAL to the reference ad — this is the STRUCTURE ("the breakdown"), and nothing more:
- Composition and overall layout
- Position, size, and proportion of every element
- Visual hierarchy and reading order
- Number, placement, and role of every text block
- Type of every visual element (a mascot stays a mascot, a product shot stays a product shot, a person stays a person, a chart stays a chart, an icon grid stays an icon grid)
- Depth, layering, and object density
- Spacing, alignment, cropping, and whitespace
- Relative typography hierarchy (which text is largest, the size/weight relationship between blocks — NOT the actual typeface)
- Background composition (which zones are clean vs busy, where each element sits)
- The ad's core message, hook, and angle

Do NOT copy the reference ad's colors, fonts, lighting, textures, finish, or mood — those all come from the brand (see "THE BRAND'S VISUAL SYSTEM IS AUTHORITATIVE" below).

Replace ONLY these brand-identity elements with the target brand's equivalents from the brand extraction JSON:
- Brand name and any brand-specific words
- Logo (use the attached BRAND_LOGO_IMAGE as-is)
- Color palette
- Typography (swap to the target brand's fonts / type style while keeping the same relative hierarchy)
- Product / app imagery (swap the reference product for the target brand's real product)
- Mascot or character (swap for the target brand's own mascot / character if it has one)
- The wording of each text block (rewrite to be about the target brand's product, but keep the same meaning, role, length, and structure as the reference text it replaces)

=== CRITICAL: THE BRAND'S VISUAL SYSTEM IS AUTHORITATIVE ===

The reference ad gives you STRUCTURE ONLY (the layout above). EVERYTHING about how the ad LOOKS comes from the target brand's visual system in BRAND_EXTRACTION_JSON — never from the reference ad. Whenever the reference's look and the brand's look disagree, THE BRAND ALWAYS WINS.

Pull the look from BRAND_EXTRACTION_JSON.visual_brand_system and obey it:

COLOR — use ONLY the brand's extracted hex values:
- Background, cards, shapes, icons, accents, and text must all use the brand's colors (visual_brand_system.colors: primary, secondary, accent, neutral, background, text, cta).
- Write the brand's actual hex codes into the generated ad_prompt color fields (background.color_palette, typography colors, element fills).
- Do NOT use the reference ad's colors, and do NOT invent colors. No off-brand hues.
- BACKGROUND LIGHTNESS comes from the BRAND, not the reference. Decide whether the ad's background is light or dark from the brand's own background colors (visual_brand_system.colors.background / neutral), NOT from the reference ad. If the brand's backgrounds are light (e.g. white/cream), the ad background MUST be light even when the reference ad is dark; if the brand is dark, keep it dark. Never inherit the reference ad's overall light/dark mood — only its structure.

TYPOGRAPHY — use the brand's actual font:
- FONT FIDELITY (decide this first): Compare the reference ad's VISIBLE letterforms to visual_brand_system.typography. If they already match — typically when the reference is the target brand's own ad — instruct the renderer to REPLICATE THE REFERENCE'S EXACT LETTERFORMS (same typeface, weight, and proportions as shown in the reference), say so explicitly in typography_relationship, and do NOT re-describe or substitute a different font. If they DIFFER, swap to the brand's font using the rules below, naming it explicitly and leaning on the reference only for the size/weight HIERARCHY, never for letter shapes.
- For every text element, derive a VISUAL DESCRIPTOR from visual_brand_system.typography (its font_families, heading_style, body_style, casing_style). The descriptor is a short typographic classification + weight + tracking phrase, e.g. "geometric sans-serif, medium weight, slightly tight tracking" or "humanist serif, bold weight, normal tracking, all-caps headings". This descriptor is what image models can actually honor; the font name is a secondary anchor.
- In every typography.*.font_style field in the generated ad_prompt, write the descriptor FIRST, then reinforce with the font name in parentheses and casing/style notes — e.g. 'geometric sans-serif, medium weight, tight tracking (Poppins), sentence-case' or 'transitional serif, light weight, open tracking (Playfair Display), title-case headings'. Keep the sibling 'font_weight' and 'letter_spacing' fields as concise values (e.g. "600", "-0.02em"), not prose — the rich descriptor lives in 'font_style'.
- If multiple font families are listed, use the first for headings and the next for body.
- Reinforce the brand's heading_style, body_style, and casing_style throughout, and name the typeface explicitly in the ad_prompt's 'typography_relationship' field (e.g. "render all text in the 'Poppins' typeface — geometric sans-serif, medium weight").
- Do NOT fall back to a generic default sans-serif. The text must read as the brand's font.

LOOK & FEEL — match the brand's ui_style and mood:
- Corner radius, shadow style, border style, icon style, card style, illustration style, spacing style, and overall_mood from visual_brand_system.ui_style drive how every shape, card, and icon is rendered.
- If the brand is flat and sharp, do not produce glassy rounded cards; if the brand is soft and rounded, do not produce hard flat blocks. Match the brand, not a generic template.

The finished ad must look like the target brand designed it — its colors, its font, its mood — arranged inside the reference's structure.

=== CRITICAL: PRODUCT VISUAL — NEVER INVENT UI ===

Image models cannot render real software, so they hallucinate fake, cluttered interfaces full of unreadable text. Do not let that happen.

- If a real product screenshot or UI asset is attached as an input image, place it faithfully in the product slot and do not redraw, relabel, or invent its contents. Treat the screenshot as screen content only: crop to the screen or UI card, drop any surrounding page background or browser/window chrome, and composite the screen into a clean device frame or floating card that matches the way the reference ad depicts its product. NEVER carry the screenshot's original page background color or surrounding chrome into the ad.
- If NO real product asset is provided (this is the default right now), represent the product abstractly and iconically — a clean app-icon tile, a simple app card showing only the logo and a few minimal shapes, or a plain device frame with almost nothing on screen. Match the simple, iconic way the reference depicts its product.
- NEVER invent readable product UI: no dashboards, no data tables, no charts or graphs with numbers, no chat or voice transcripts, no lists of fake records, no menus, no settings panels, no fake feature names or button labels.
- The product visual must contain little or no readable text — at most one short label or a single number/badge, and only if the reference uses one.
- In the generated ad_prompt, the product_visual_direction and negative_prompt fields must explicitly forbid invented UI, fake data, and fake screens. When a real screenshot is attached, product_visual_direction must describe cropping the asset to its screen/UI card and compositing it into a clean device frame or floating card matching the reference; the negative_prompt must forbid the screenshot's original page background or surrounding window/browser chrome bleeding into the ad.

=== CRITICAL: TEXT BUDGET — KEEP IT MINIMAL ===

Match the reference ad's text amount. Do NOT pour the brand's full value proposition onto the canvas.

- First, count the reference ad's text blocks and the approximate number of words in each.
- The recreation must have the SAME number of text blocks or fewer, and a similar word count per block. Never more.
- Headline: short — match the reference's length (typically 2 to 6 words).
- Subheadline: HARD GATE — include a subheadline ONLY if the reference ad itself shows one. If the reference has NO subheadline, "copy.subheadline" MUST be "" (empty string). Never substitute a brand tagline, slogan, or value proposition for an absent subheadline. When the reference does have one, keep it to a single short line — never a paragraph or stacked sentences.
- Set the boolean "reference_has_subheadline" in the ad_prompt: true only if the reference ad itself shows a subheadline, otherwise false.
- Do NOT add body copy, feature lists, bullet points, extra captions, or sentences that the reference does not have.
- No paragraph of text anywhere on the canvas. When in doubt, use fewer words — a clean ad with little text beats a busy one.
- The generated ad_prompt's negative_prompt must forbid excess text, paragraphs, and cluttered small text.

=== LAYOUT FIDELITY — REPRODUCE THE REFERENCE EXACTLY ===

Copy the reference ad's composition; do not impose a default layout.
- ALIGNMENT: match the reference. If its text is centered, center the recreation's text; if left-aligned, left-align. Never default to left-aligned when the reference is centered.
- NEGATIVE SPACE: reproduce the reference's whitespace and margins. If the reference is airy with generous empty space, keep that breathing room — do NOT fill the canvas.
- ELEMENT SIZING: match the reference's proportions. Render the device/product at the SAME relative scale and the SAME crop as the reference. If the reference shows only the top third of a phone with space above it, show only the top third at that size — never enlarge the device to fill the canvas, and never stretch or distort it.
- ASPECT-RATIO MISMATCH (critical): the attached product asset has its OWN native aspect ratio (e.g. a tall portrait phone). That native aspect ratio is INVIOLABLE and ALWAYS wins over the reference's product slot. If the reference's product is wide/landscape (e.g. a desktop screenshot) but the attached asset is tall/portrait (or vice-versa), DO NOT widen, stretch, squash, or scale the asset non-uniformly to fill the reference's slot. Instead, place the asset at its true proportions, scaled to fit, and accept empty margins on the sides (or top/bottom) where the shapes differ. NEVER instruct the renderer to make a portrait asset "wide", "fill the horizontal space", or "span most of the width" — describe its size as a share of canvas HEIGHT and let its width follow naturally from its real aspect ratio.
- Record these decisions in layout.alignment, layout.cropping, layout.visual_balance, and the element position/width values.

Then write a precise "art_direction" string (2–4 plain-language sentences, NOT JSON) for ad_prompt.art_direction that restates the highest-leverage spatial facts MEASURED FROM THE REFERENCE, so the renderer reproduces the reference's spacing instead of improvising its own. Estimate and state, as approximate percentages of canvas height/width: (a) the headline block's top margin, the share of height it occupies, and its alignment; (b) each major visual's (e.g. device/product) on-canvas scale expressed as a share of canvas HEIGHT (its width follows from its real aspect ratio — never specify a portrait asset as "wide" or "filling the width"), its exact crop, and its vertical position; (c) the gap between the headline and the product — protect a MINIMUM ~6% of canvas height of clear space between them so text and visual never touch or mush; (d) the empty margins to preserve, INCLUDING a bottom margin: unless the reference deliberately bleeds the product off the edge, keep the entire product fully on-canvas with a visible margin on all four sides — do not let it run off the bottom or sides. Keep it forceful and concrete, and NO LONGER than 4 sentences. Example shape: "Center the headline in the top ~22% of the canvas, ~8% top margin, two tight lines. Show only the top ~55% of the phone, horizontally centered, its top edge ~42% down the canvas, cropped at the chin. Keep a ~10% gap between headline and phone and wide empty side margins; do not enlarge, shrink, or stretch the device."

Inputs:

1. REFERENCE_AD_IMAGE
This is the ad image whose layout and composition should be replicated.

2. BRAND_EXTRACTION_JSON
This contains the target brand's identity, visual system, product representation, offer DNA, messaging foundation, proof library, customer DNA, competitor intelligence, and claim constraints.

3. BRAND_LOGO_IMAGE
The target brand's official logo is also attached as a separate image input. Use this exact logo file in the final ad. Do not redraw, recreate, restyle, recolor, or reinterpret the logo. Place it as provided.

4. OPTIONAL_CUSTOMER_RESEARCH_JSON
This may include customer pain points, desired outcomes, objections, buying triggers, complaints about alternatives, and exact customer language.

5. OPTIONAL_PERFORMANCE_MEMORY_JSON
This may include past winning hooks, losing hooks, creative patterns, best-performing layouts, best-performing offers, audience segments, and performance notes.

6. OPTIONAL_USER_DIRECTION
This may include campaign goal, target customer, landing page, offer, preferred angle, CTA, aspect ratio, or specific product feature to promote.

Your task:

Produce a detailed AI image generation prompt that recreates the reference ad as exactly as possible, with only the brand-identity surface swapped to the target brand.

The final output should be a render-ready JSON image prompt.

Important rules:

1. Reproduce the composition exactly.
Match the reference ad's layout, every element's position and size, hierarchy, spatial relationships, object types, depth, pacing, spacing, cropping, and design logic. Do not add, remove, rearrange, or resize elements.

2. Do not reuse the reference brand's identity.
Do not use the reference brand's name, logo, colors, fonts, or its product / app imagery. These are the only things being swapped out.

3. Swap in the target brand's identity.
Use the target brand's colors, logo, fonts, product imagery, mascot / character, and brand-specific wording from BRAND_EXTRACTION_JSON. Use the attached BRAND_LOGO_IMAGE as-is.

4. Keep the same message, just re-worded for the target brand.
Preserve the reference ad's hook, angle, and the role of each text block. Rewrite the words so they are about the target brand's product, keeping the same meaning, tone, length, and structure. Do not invent a new angle, new concept, or new metaphor.

5. Do not fabricate facts.
Only state metrics, ratings, customer names, third-party logos, guarantees, or specific claims if they are supported by BRAND_EXTRACTION_JSON or the provided customer research. If the reference ad has a claim slot (e.g. "rated 4.8 stars") and the target brand has no supported equivalent, keep that slot in the same position but fill it with a supported benefit statement instead of a fabricated number or logo.

6. Do not fabricate the target brand's assets.
Use the target brand's real product imagery and real mascot / character from BRAND_EXTRACTION_JSON or the attached assets. If the reference ad contains a product visual or mascot and the target brand has no equivalent asset provided, reproduce the same element type and placement using a neutral, brand-styled stand-in (e.g. a simple brand-colored product frame or a generic figure) — never invent a fake product UI, fake data, or a fake brand mascot and present it as the brand's own.

7. Preserve the reference's visual metaphor as-is.
If the reference ad uses a visual metaphor or central visual idea, keep that same idea and only re-skin its surface with the target brand's colors, product, and mascot. Do not re-map or reinterpret the metaphor into a different concept.

8. Keep people, devices, 3D objects, and icons.
If the reference ad uses these, reproduce the same element types in the same positions, restyled to the target brand. Do not drop them.

9. The final prompt must be specific enough for an image model to render the recreation with minimal ambiguity.

Step 1: Analyze the reference ad image

Extract the following from the reference image:

- Canvas shape and aspect ratio
- Overall composition
- Main visual hierarchy
- Logo placement
- Headline placement
- Subheadline placement
- CTA placement, if present
- Product visual placement
- Proof placement, if present
- Background style
- Color treatment
- Typography relationship
- Number of text blocks
- Main visual objects
- Depth order
- Cropping rules
- Whitespace rules
- Alignment rules
- Mood
- Polish level
- Texture
- Lighting
- Shadows
- Borders
- Corner radius
- Object density
- What makes the ad visually strong

Describe the reference as a reusable layout template.

CRITICAL — content INSIDE a device/screen is part of the product visual, NOT an ad text block:
Any text, cards, labels, names, roles, numbers, badges, chat bubbles, list rows, or UI shown INSIDE a phone, laptop, browser window, app screen, or product screenshot belongs to the PRODUCT VISUAL. It is ONE element (the product), not separate ad text blocks. Do NOT count it as text blocks, do NOT lift it out onto the ad canvas, and do NOT recreate it as standalone ad copy, labels, badges, stakeholder cards, testimonials, or proof elements. Only count and reproduce text that sits directly on the ad BACKGROUND, OUTSIDE any device frame (typically: the headline, an optional subheadline, an optional on-background proof line, and the CTA). When unsure whether a piece of text is on the ad or on the product screen, treat it as on the product screen.

Do not include the original brand name, original copy, original logo, or original claims in the final ad prompt unless they also belong to the target brand.

Step 2: Analyze the target brand

From BRAND_EXTRACTION_JSON, extract:

- Brand name
- Product name
- Product category
- Target customer
- Primary customer pain
- Desired outcome
- Main product promise
- Main use case
- Main CTA
- Brand colors
- Logo assets
- Typography style
- UI style
- Button style
- Card style
- Corner radius style
- Shadow style
- Background style
- Product screenshots
- Dashboard visuals
- Integration visuals
- Workflow visuals
- Proof points
- Claim constraints
- Terms to use
- Terms to avoid

Step 3: Map the reference message to the target brand

Do not invent a new angle. Inherit the reference ad's angle and message.

First, transcribe the reference ad's text exactly as written, block by block (headline, subheadline, proof / badge, CTA, captions, labels — whatever is present).

Then, for each text block, write the target-brand equivalent that:
- Says the analogous thing about the target brand's product
- Keeps the same role (a headline stays a headline, a CTA stays a CTA)
- Keeps roughly the same length and word count
- Keeps the same tone, punctuation, and capitalization style
- Stays understandable in one second

Match the reference's text structure exactly:
- Same number of text blocks (EXCLUDING anything inside a device/app screen — that is the product visual, not a text block)
- Same blocks present (if the reference has no subheadline, do not add one; if it has no CTA, do not add one)
- Same block in the same position
- Do NOT add a stakeholder card, testimonial, customer name, badge, proof line, or any other text block that the reference does not show ON ITS BACKGROUND — even if you have a real, supported brand fact for it. A real fact does not earn a new element. If the reference's ad background has no such block, neither does the recreation.

Only pull product names, feature names, metrics, and proof from BRAND_EXTRACTION_JSON or provided research — never from the reference brand and never invented.

Step 4: Rebuild the composition with the target brand's identity

Keep ALL of the reference ad's structure identical:

- Layout and every element's position / size
- Spatial balance and visual rhythm
- Text hierarchy and reading order
- Object arrangement and types
- Depth and layering
- Cropping and whitespace
- Polish level and mood

Swap ONLY the brand-identity surface:

- Logo (use the attached BRAND_LOGO_IMAGE)
- Colors
- Fonts / typography style
- Product or app imagery (the target brand's real product in the same spot, same framing)
- Mascot or character (the target brand's own, if it has one, in the same pose / position role)
- The wording of each text block (from Step 3)

Step 5: Preserve the visual metaphor

If the reference ad has a central visual idea or metaphor, keep the exact same idea. Do not reinterpret it into a different concept.

Only re-skin its surface:
- Same arrangement, same composition, same meaning
- Swap the reference brand's colors, product, and mascot for the target brand's
- Example: if the reference shows many app icons orbiting one central app tile, keep that same orbit composition — just replace the central tile and icons with the target brand's app icon and colors. Do not turn it into a different metaphor.

Step 6: Define exact render instructions

The final JSON image prompt must include:

- Goal
- Canvas
- Overall style
- Background
- Layout
- Copy
- Typography
- Elements
- Product visual direction
- Precision notes
- Negative prompt

Make the prompt highly specific.

For every major element, include:
- Name
- Type
- Position
- Size
- Content
- Style
- Colors
- Typography
- Shadow
- Border
- Corner radius
- Relationship to other elements

If exact x/y coordinates are not necessary, use precise relative placement instead.

Step 7: Add safeguards

Include negative constraints:

- No reference brand name, logo, colors, fonts, or product imagery
- No fabricated metrics, ratings, customer logos, or claims
- No invented product UI, dashboards, charts, or data values
- No invented feature names, menu items, or button labels
- No fake or invented brand mascot presented as the target brand's own
- No redrawing, restyling, recoloring, or warping of the attached brand logo
- No changes to the layout, composition, element positions, or number of elements versus the reference
- No added, removed, or rearranged elements versus the reference
- No new angle, concept, or metaphor different from the reference
- No distorted or unreadable text
- No extra text beyond the reference's text blocks
- No off-brand colors (use only the target brand's palette)
- No generic AI aesthetic
- No generic glassmorphism or frosted-glass cards unless the brand's ui_style uses them
- No random or rainbow gradients; backgrounds use only the brand's palette
- No default "AI SaaS" look — match the brand's actual colors, font, and mood
- No generic Helvetica/Arial-style text when a brand font is specified — use the brand's typeface
- No low-resolution output

Final output:

Return only valid JSON in this structure:

{
"reference_ad_analysis": {
  "aspect_ratio": "",
  "composition_summary": "",
  "layout_template": "",
  "visual_hierarchy": "",
  "text_structure": "",
  "logo_placement": "",
  "main_visual_placement": "",
  "background_style": "",
  "typography_relationship": "",
  "color_strategy": "",
  "depth_and_layering": "",
  "cropping_rules": "",
  "spacing_rules": "",
  "mood": "",
  "what_to_replicate": [],
  "what_not_to_copy": []
},
"reskin_map": {
  "target_brand": "",
  "product_category": "",
  "reference_message_and_angle": "",
  "visual_metaphor_preserved": "",
  "element_swaps": [
    {
      "element": "",
      "reference_version": "",
      "target_brand_version": ""
    }
  ],
  "text_block_swaps": [
    {
      "role": "",
      "reference_text": "",
      "target_brand_text": ""
    }
  ],
  "what_stays_identical": []
},
"ad_prompt": {
  "goal": "",
  "reference_has_subheadline": false,
  "art_direction": "",
  "canvas": {
    "width": 1080,
    "height": 1080,
    "aspect_ratio": "1:1",
    "format": "static Meta ad",
    "safe_margin": "Keep all important text and logos within 80 px of canvas edges"
  },
  "overall_style": {
    "look": "",
    "mood": "",
    "render_quality": "high resolution, crisp typography, premium ad quality",
    "lighting": "",
    "texture": "",
    "brand_fit_notes": ""
  },
  "background": {
    "type": "",
    "color_palette": {
      "primary": [],
      "secondary": [],
      "accent": [],
      "neutral": []
    },
    "treatment": "",
    "gradient": "",
    "glow_shapes": [],
    "texture": "",
    "avoid": ""
  },
  "layout": {
    "template_name": "",
    "composition": "",
    "text_position": "",
    "visual_position": "",
    "logo_position": "",
    "proof_position": "",
    "cta_position": "",
    "depth_order": [],
    "cropping": "",
    "alignment": "",
    "visual_balance": "",
    "reference_structure_notes": ""
  },
  "copy": {
    "brand_name": "",
    "headline": "",
    "subheadline": "",
    "proof_line": "",
    "cta": "",
    "copy_notes": ""
  },
  "typography": {
    "headline": {
      "font_style": "",
      "font_size": "",
      "font_weight": "",
      "letter_spacing": "",
      "line_height": "",
      "color": ""
    },
    "subheadline": {
      "font_style": "",
      "font_size": "",
      "font_weight": "",
      "letter_spacing": "",
      "line_height": "",
      "color": ""
    },
    "proof_line": {
      "font_style": "",
      "font_size": "",
      "font_weight": "",
      "color": ""
    },
    "cta": {
      "font_style": "",
      "font_size": "",
      "font_weight": "",
      "color": ""
    }
  },
  "elements": [
    {
      "name": "",
      "type": "",
      "position": {
        "x": "",
        "y": "",
        "width": "",
        "height": ""
      },
      "content": {},
      "style": {
        "fill": "",
        "border": "",
        "corner_radius": "",
        "shadow": "",
        "opacity": "",
        "blur": ""
      },
      "typography": {},
      "relationship_to_reference": "",
      "notes": ""
    }
  ],
  "brand_logo_usage": {
    "source": "Use the attached BRAND_LOGO_IMAGE exactly as provided",
    "placement": "",
    "size": "",
    "clear_space": "",
    "rules": "Do not redraw, restyle, recolor, distort, crop, or reinterpret the logo. Place the provided logo file directly into the canvas."
  },
  "product_visual_direction": {
    "visual_type": "",
    "source_asset_to_use": "",
    "what_it_should_show": "",
    "what_benefit_it_communicates": "",
    "treatment": "",
    "avoid": "Do not invent UI elements, fake dashboards, fake data, fake charts, fake feature names, or brand mascots not provided in the brand assets"
  },
  "precision_notes": {
    "text_alignment": "",
    "visual_hierarchy": "",
    "mobile_readability": "",
    "brand_consistency": "",
    "claim_safety": "",
    "logo_rules": "Use the attached brand logo image directly. Do not recreate, redraw, restyle, or alter it.",
    "ui_and_mascot_rules": "Do not hallucinate any UI, dashboards, charts, data, feature names, menu items, mascots, characters, avatars, or illustrated brand personas. Only use assets explicitly provided in BRAND_EXTRACTION_JSON or attached files.",
    "reference_replication_rules": "",
    "do_not_add": []
  },
  "negative_prompt": ""
},
"assumptions": [],
"missing_inputs_that_would_improve_output": [],
"source_fields_used": []
}

Before returning the JSON, check:

- Is the layout, composition, and every element position identical to the reference?
- Is the number, placement, and role of text blocks identical to the reference?
- Did you swap ONLY the brand-identity surface (name, logo, colors, fonts, product, mascot, wording)?
- Is EVERY color taken from the brand's palette (no reference colors, no invented colors)?
- Is ALL text rendered in the brand's named font, not a generic sans-serif?
- Does the look match the brand's mood and ui_style rather than a generic AI aesthetic?
- Is the reference's angle and message preserved (not replaced with a new one)?
- Is the reference's visual metaphor preserved (not reinterpreted)?
- Is the attached brand logo used as-is, not redrawn?
- Did you avoid fabricating product UI, data, claims, or a fake brand mascot?
- Are all stated metrics and claims supported by the brand data?
- Is the target brand's product category still obvious?
- Is each text block re-worded for the target brand while keeping the same length and structure?
- Is the prompt specific enough for image generation?
- Are negative constraints strong enough?

Return only valid JSON.`;

export const STAGE2_MODE_RULES = {
  exact: "MODE: EXACT RECREATION (layout fidelity).\nRecreate the reference ad's LAYOUT and STRUCTURE as faithfully as possible — same elements, same positions, same proportions, same composition. This mode controls layout fidelity ONLY: the brand's colors, font, and visual mood remain fully authoritative and come entirely from BRAND_EXTRACTION_JSON, never from the reference. Follow the \"keep identical\" (structure) rules and the \"THE BRAND'S VISUAL SYSTEM IS AUTHORITATIVE\" rules below literally.",
  vibe: "MODE: VIBE / INSPIRED-BY (loose layout).\nDo NOT copy the reference ad's layout element-for-element. Capture its overall composition family, visual energy, and central metaphor, then design a clean, minimal ad that FEELS like the reference but is adapted to fit the target brand. You may change the number of elements, their positions, and the arrangement wherever a literal copy would not make sense. This mode loosens LAYOUT fidelity ONLY — the brand's colors, font, and visual mood remain fully authoritative (from BRAND_EXTRACTION_JSON). Prioritize clarity and minimalism. Still obey the PRODUCT VISUAL, TEXT BUDGET, and BRAND'S VISUAL SYSTEM rules strictly."
};

export const STAGE2_PROMPT_VERSION = "7";
