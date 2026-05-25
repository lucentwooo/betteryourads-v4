import { AppHeader } from "@/components/AppHeader";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <AppHeader />
      {children}
    </div>
  );
}
