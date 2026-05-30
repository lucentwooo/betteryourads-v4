"use client";

import { useEffect } from "react";

type Props = { message: string; open: boolean; onDone: () => void; subtext?: string };

export function Toast({ message, open, onDone, subtext }: Props) {
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onDone, 4500);
    return () => clearTimeout(id);
  }, [open, onDone]);

  if (!open) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-check" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 9.5L7.5 13L14 5.5" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="toast-text">
        <span className="toast-headline">{message}</span>
        {subtext && <span className="toast-sub">{subtext}</span>}
      </span>
    </div>
  );
}
