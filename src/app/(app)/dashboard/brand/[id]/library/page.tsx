import { admin } from "@/lib/supabase";
import { LibraryClient } from "@/components/LibraryClient";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = admin();
  const { data } = await db
    .from("creatives")
    .select("*")
    .eq("brand_id", id)
    .in("state", ["inbox", "kept"])
    .eq("status", "done")
    .order("created_at", { ascending: false });
  const items = (data ?? []).map((c) => ({
    ...c,
    imageUrl: c.image_path
      ? db.storage.from("creatives").getPublicUrl(c.image_path).data.publicUrl
      : null,
  }));
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-3xl">Library</h1>
      <div className="mt-6">
        <LibraryClient initial={items} />
      </div>
    </main>
  );
}
