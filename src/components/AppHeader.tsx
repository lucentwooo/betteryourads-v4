import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { admin } from "@/lib/supabase";

export async function AppHeader({ activeBrandId }: { activeBrandId?: string }) {
  const { data } = await admin()
    .from("brands")
    .select("id, name")
    .order("created_at", { ascending: false });
  const brands = (data ?? []) as { id: string; name: string }[];
  const active = activeBrandId ?? brands[0]?.id;
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--ink-faint)] bg-[var(--paper)]/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-8 px-8">
        <Link href="/onboarding">
          <Wordmark size="sm" />
        </Link>
        <BrandSwitcher brands={brands} activeId={active} />
        <nav className="ml-auto flex items-center gap-6 text-sm">
          {active && <Link href={`/dashboard/brand/${active}`}>Dashboard</Link>}
          {active && (
            <Link href={`/dashboard/brand/${active}/library`}>Library</Link>
          )}
          <Link href="/onboarding" className="text-ink/60 hover:text-ink">
            + New brand
          </Link>
        </nav>
      </div>
    </header>
  );
}
