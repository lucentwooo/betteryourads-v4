"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function BrandSwitcher({
  brands,
  activeId,
}: {
  brands: { id: string; name: string }[];
  activeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = brands.find((b) => b.id === activeId);
  if (brands.length === 0) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border hairline bg-paper px-3 py-1.5 text-sm"
      >
        {active?.name ?? "Select brand"} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-48 rounded-xl border hairline bg-paper p-1 shadow">
          {brands.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/brand/${b.id}`}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-cream"
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
