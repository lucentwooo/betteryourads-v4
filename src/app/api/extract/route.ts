import { NextResponse } from "next/server";
import { runStage1 } from "@/lib/stage1";
import { mapBrandFields, mapConcepts } from "@/lib/brand-map";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { name, url, businessType } = await req.json();
  if (!name || !/^https?:\/\//i.test(url ?? "")) {
    return NextResponse.json(
      { error: "name and a valid http(s) url are required" },
      { status: 400 },
    );
  }
  try {
    const { extraction, errors } = await runStage1(url);
    const fields = mapBrandFields(extraction);
    const db = admin();
    const { data: brand, error: be } = await db
      .from("brands")
      .insert({
        name,
        url,
        business_type: businessType ?? null,
        extraction_json: extraction,
        ...fields,
      })
      .select("id")
      .single();
    if (be || !brand) throw be ?? new Error("brand insert returned no row");
    const concepts = mapConcepts(extraction).map((c) => ({
      ...c,
      brand_id: brand.id,
    }));
    if (concepts.length) {
      const { error: ce } = await db.from("concepts").insert(concepts);
      if (ce) throw ce;
    }
    return NextResponse.json({ brandId: brand.id, warnings: errors });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
