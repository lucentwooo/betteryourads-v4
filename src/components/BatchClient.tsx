"use client";
import { useEffect, useState } from "react";
import { CreativeTile } from "@/components/CreativeTile";

const POLL_MS = 3000;
// Safety cap so a batch that never flips out of "running" can't poll forever.
// Comfortably longer than the server's maxDuration (800s) for the batch route.
const MAX_POLL_MS = 16 * 60 * 1000;

export function BatchClient({ batchId }: { batchId: string }) {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [status, setStatus] = useState("running");
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    let live = true;
    const start = Date.now();
    async function tick() {
      try {
        const res = await fetch(`/api/batch/${batchId}`);
        const data = await res.json();
        if (!live) return;
        setCreatives(data.creatives ?? []);
        const s = data.batch?.status ?? "running";
        setStatus(s);
        if (s === "running") {
          if (Date.now() - start < MAX_POLL_MS) setTimeout(tick, POLL_MS);
          else setTimedOut(true);
        }
      } catch {
        // Transient network error: keep trying until the safety cap.
        if (live && Date.now() - start < MAX_POLL_MS) setTimeout(tick, POLL_MS);
      }
    }
    tick();
    return () => {
      live = false;
    };
  }, [batchId]);
  return (
    <div>
      <p className="text-sm text-ink/55">
        Status:{" "}
        {timedOut ? "still working — refresh to check again" : status}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {creatives.map((c) => (
          <CreativeTile key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}
