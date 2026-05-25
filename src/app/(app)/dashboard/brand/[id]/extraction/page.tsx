import { admin } from "@/lib/supabase";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: brand } = await admin()
    .from("brands")
    .select("name, extraction_json")
    .eq("id", id)
    .single();
  if (!brand) return <main className="p-12">Not found.</main>;
  return (
    <main className="mx-auto max-w-[1000px] px-12 py-10">
      <h1 className="display text-3xl">{brand.name} — full extraction</h1>
      <pre className="mt-6 overflow-auto rounded-xl border hairline bg-card p-4 text-xs leading-relaxed">
        {JSON.stringify(brand.extraction_json, null, 2)}
      </pre>
    </main>
  );
}
