"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";
import { useAuth } from "../src/auth/useAuth";
import { AuthGate } from "../src/shell/AuthGate";
import { AppShell } from "../src/shell/AppShell";
import { CacheProvider, usePrimeAfterAuth } from "../src/data/cache";

/** Warms the cache once the user is approved, so Home/Library are instant on first nav. */
function CachePrimer() {
  const { status } = useAuth();
  const prime = usePrimeAfterAuth();
  useEffect(() => {
    if (status === "approved") prime();
  }, [status, prime]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CacheProvider>
        <CachePrimer />
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </CacheProvider>
    </AuthProvider>
  );
}
