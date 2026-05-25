import { OnboardingClient } from "@/components/OnboardingClient";
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="eyebrow text-ink/55">Onboarding · 01</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Tell us about <span className="display-italic">your business</span>.
      </h1>
      <OnboardingClient />
    </main>
  );
}
