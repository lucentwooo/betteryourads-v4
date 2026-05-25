"use client";
export function CreativeTile({
  c,
  onKeep,
  onDismiss,
}: {
  c: any;
  onKeep?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-[1.3rem] border hairline bg-card p-3">
      {c.status === "generating" && (
        <div className="grid h-64 place-items-center text-sm text-ink/50">
          Generating…
        </div>
      )}
      {c.status === "failed" && (
        <div className="grid h-64 place-items-center px-3 text-sm text-coral">
          Failed: {c.error}
        </div>
      )}
      {c.status === "done" && c.imageUrl && (
        <img src={c.imageUrl} alt="creative" className="w-full rounded-lg" />
      )}
      {(onKeep || onDismiss) && c.status === "done" && (
        <div className="mt-3 flex gap-2">
          {onKeep && (
            <button onClick={onKeep} className="btn-chunk flex-1 justify-center">
              Keep
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="btn-ghost-ink flex-1 justify-center"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
