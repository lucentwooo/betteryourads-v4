"use client";
import { useState } from "react";
import { CreativeTile } from "@/components/CreativeTile";

export function LibraryClient({ initial }: { initial: any[] }) {
  const [items, setItems] = useState(initial);
  async function setState(id: string, state: string) {
    try {
      const res = await fetch(`/api/creatives/${id}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      // Only move the tile once the DB write succeeds, so the UI never
      // diverges from persisted state (it would otherwise revert on refresh).
      if (!res.ok) return;
      setItems((xs) =>
        state === "dismissed"
          ? xs.filter((x) => x.id !== id)
          : xs.map((x) => (x.id === id ? { ...x, state } : x)),
      );
    } catch {
      // Network error: leave the UI unchanged so it stays in sync with the DB.
    }
  }
  const kept = items.filter((i) => i.state === "kept");
  const inbox = items.filter((i) => i.state === "inbox");
  return (
    <div className="space-y-10">
      <section>
        <h2 className="h2">Inbox</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {inbox.map((c) => (
            <CreativeTile
              key={c.id}
              c={c}
              onKeep={() => setState(c.id, "kept")}
              onDismiss={() => setState(c.id, "dismissed")}
            />
          ))}
          {inbox.length === 0 && (
            <p className="text-sm text-ink/50">No new creatives.</p>
          )}
        </div>
      </section>
      <section>
        <h2 className="h2">Kept</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {kept.map((c) => (
            <CreativeTile
              key={c.id}
              c={c}
              onDismiss={() => setState(c.id, "dismissed")}
            />
          ))}
          {kept.length === 0 && (
            <p className="text-sm text-ink/50">Nothing kept yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
