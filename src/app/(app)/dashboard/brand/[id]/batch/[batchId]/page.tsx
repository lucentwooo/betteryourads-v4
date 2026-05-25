import Link from "next/link";
import { BatchClient } from "@/components/BatchClient";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-3xl">Generating creatives</h1>
      <Link
        href={`/dashboard/brand/${id}/library`}
        className="text-sm text-[var(--ultra)]"
      >
        Go to library →
      </Link>
      <div className="mt-6">
        <BatchClient batchId={batchId} />
      </div>
    </main>
  );
}
