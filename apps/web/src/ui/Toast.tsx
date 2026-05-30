"use client";

import { useEffect } from "react";

type Props = { message: string; open: boolean; onDone: () => void };

export function Toast({ message, open, onDone }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDone, 4500);
    return () => clearTimeout(id);
  }, [open, onDone]);

  if (!open) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
