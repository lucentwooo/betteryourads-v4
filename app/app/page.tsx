import AppRoot from "@/components/AppRoot";

// Backward-compat alias for "/app" (the legacy SPA was served at /app). Renders
// the same client SPA host as "/".
export default function Page() {
  return <AppRoot />;
}
