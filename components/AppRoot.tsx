'use client';

// Thin host that renders the ported SPA client (components/BYAApp). app/page.tsx
// and app/app/page.tsx both render this so "/" and "/app" boot the same app.
import BYAApp from '@/components/BYAApp';

export default function AppRoot() {
  return <BYAApp />;
}
