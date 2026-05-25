"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConceptCard, type Concept } from "@/components/ConceptCard";

export function ProductionClient({
  brandId,
  concepts,
}: {
  brandId: string;
  concepts: Concept[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  async function generate() {
    if (sel.size === 0 || !file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("brandId", brandId);
      fd.append("conceptIds", JSON.stringify([...sel]));
      fd.append("inspiration", file);
      const res = await fetch("/api/batch", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        return;
      }
      router.push(`/dashboard/brand/${brandId}/batch/${data.batchId}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {concepts.map((c) => (
          <ConceptCard
            key={c.id}
            concept={c}
            selected={sel.has(c.id)}
            onToggle={() => toggle(c.id)}
          />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="btn-chunk"
          disabled={busy || sel.size === 0 || !file}
          onClick={generate}
        >
          Generate {sel.size} creative{sel.size === 1 ? "" : "s"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-coral">{error}</p>}
    </div>
  );
}
