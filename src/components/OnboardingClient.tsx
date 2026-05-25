"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const TYPES = ["saas-b2b", "saas-b2c", "dtc", "service", "other"];

const TYPE_LABELS: Record<string, string> = {
  "saas-b2b": "SaaS · B2B",
  "saas-b2c": "SaaS · B2C",
  dtc: "DTC",
  service: "Service",
  other: "Other",
};

const STAGES = [
  "Loading the page",
  "Sampling colors & fonts",
  "Drafting ad concepts",
];

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<"business" | "researching">("business");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("saas-b2b");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStep("researching");
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, businessType: type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Extraction failed");
        setStep("business");
        return;
      }
      router.push(`/dashboard/brand/${data.brandId}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStep("business");
    }
  }

  if (step === "researching") {
    return (
      <section className="mt-8 rounded-[1.3rem] border hairline bg-paper p-6 sm:p-8">
        <div className="rise eyebrow text-ink/55">Researching · Stage 01</div>
        <h2 className="rise rise-delay-1 display mt-3 text-2xl leading-[1.1]">
          Reading <span className="display-italic">your site</span>…
        </h2>
        <p className="rise rise-delay-1 body-s mt-3 max-w-md text-ink/55">
          We&rsquo;re crawling {url ? "your page" : "the page"} to pull brand
          colors, copy, and a set of ad angles. This usually takes 30–60
          seconds — hang tight.
        </p>

        <ul className="mt-8 space-y-4">
          {STAGES.map((label, i) => (
            <li
              key={label}
              className={cn(
                "rise flex items-center gap-3",
                i === 1 && "rise-delay-1",
                i === 2 && "rise-delay-2",
              )}
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ultra opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-ultra" />
              </span>
              <span className="body-s text-ink">{label}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rise mt-8 rounded-[1.3rem] border hairline bg-paper p-6 sm:p-8"
    >
      <div className="space-y-6">
        <div>
          <label htmlFor="biz-name" className="eyebrow text-ink/55">
            Business name
          </label>
          <input
            id="biz-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border hairline bg-paper px-3 outline-none focus:border-ultra"
            placeholder="Acme Inc"
            required
          />
        </div>

        <div>
          <label htmlFor="biz-url" className="eyebrow text-ink/55">
            Website URL
          </label>
          <input
            id="biz-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border hairline bg-paper px-3 outline-none focus:border-ultra"
            placeholder="https://acme.com"
            required
          />
        </div>

        <div>
          <span className="eyebrow text-ink/55">Business type</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-ink bg-ink text-[var(--paper)]"
                      : "hairline bg-paper text-ink hover:bg-cream",
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}

      <button className="btn-chunk mt-6" type="submit">
        Analyze my site →
      </button>
    </form>
  );
}
