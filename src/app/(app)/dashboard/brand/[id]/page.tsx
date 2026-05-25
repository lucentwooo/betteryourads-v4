import Link from "next/link";
import { admin } from "@/lib/supabase";
import { ProductionClient } from "@/components/ProductionClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = admin();
  const { data: brand } = await db
    .from("brands")
    .select("*")
    .eq("id", id)
    .single();
  const { data: concepts } = await db
    .from("concepts")
    .select("*")
    .eq("brand_id", id)
    .order("created_at");
  if (!brand) return <main className="p-12">Brand not found.</main>;
  const swatches = [
    ["Primary", brand.color_primary],
    ["Secondary", brand.color_secondary],
    ["Accent", brand.color_accent],
    ["Background", brand.color_background],
    ["Text", brand.color_text],
  ] as const;
  const logoUrl = brand.logo_path
    ? db.storage.from("logos").getPublicUrl(brand.logo_path).data.publicUrl
    : null;
  const snippet = JSON.stringify(brand.extraction_json).slice(0, 600);
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-4xl">{brand.name}</h1>
      <p className="mt-1 text-ink/60">
        {brand.url} · {brand.brand_vibe ?? "—"}
      </p>
      <section className="mt-6 flex flex-wrap items-center gap-4">
        {logoUrl && (
          <img
            src={logoUrl}
            alt="logo"
            className="h-12 w-12 rounded border hairline object-contain"
          />
        )}
        {swatches.map(
          ([label, hex]) =>
            hex && (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span
                  className="h-6 w-6 rounded border hairline"
                  style={{ background: hex }}
                />{" "}
                {label} {hex}
              </div>
            ),
        )}
      </section>
      <section className="mt-6 rounded-xl border hairline bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-ink/50">Extraction JSON (preview)</span>
          <Link
            className="text-sm text-[var(--ultra)]"
            href={`/dashboard/brand/${id}/extraction`}
          >
            View full →
          </Link>
        </div>
        <pre className="mt-2 overflow-hidden text-xs text-ink/60">
          {snippet}…
        </pre>
      </section>
      <h2 className="h2 mt-10">Concepts</h2>
      <div className="mt-4">
        <ProductionClient brandId={id} concepts={(concepts ?? []) as any} />
      </div>
    </main>
  );
}
