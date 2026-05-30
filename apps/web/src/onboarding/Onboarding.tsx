"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GOAL_LABEL } from "@bya/shared";
import type { Goal } from "@bya/shared";
import { api } from "../api/client";

type Step = "url" | "analyzing" | "goal";

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingGoal, setSubmittingGoal] = useState(false);
  const runIdRef = useRef(0);

  async function handleContinue() {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setError(null);
    setStep("analyzing");
    try {
      const measuredSiteData = await api.extract(url);
      const result = await api.brand({ url, measuredSiteData });
      if (runId !== runIdRef.current) return;
      setBrandId(result.id);
      setStep("goal");
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleBack() {
    runIdRef.current += 1;
    setStep("url");
    setError(null);
  }

  async function handleGoal(goal: Goal) {
    if (!brandId || submittingGoal) return;
    setSubmittingGoal(true);
    try {
      await api.setBrandGoal(brandId, goal);
      router.push(`/board/${brandId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmittingGoal(false);
    }
  }

  if (step === "url" || (step === "analyzing" && error !== null)) {
    return (
      <div className="onboarding-center">
        <div className="stage">
          <div className="stage-body">
            <h1 className="onboarding-title">Let's learn your brand</h1>
            <p className="onboarding-lead">Enter your website URL and we'll extract your colors, fonts, and messaging.</p>
            <div className="field">
              <label htmlFor="site-url">Website URL</label>
              <input
                id="site-url"
                className="input"
                type="url"
                placeholder="https://yoursite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            {error && (
              <div className="onboarding-error">
                <p style={{ color: "var(--bya-oxblood)", margin: "0 0 12px" }}>{error}</p>
                <button className="btn" onClick={handleBack}>
                  Try another URL
                </button>
              </div>
            )}
            {!error && (
              <button
                className="btn primary"
                disabled={!url.trim()}
                onClick={handleContinue}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "analyzing") {
    return (
      <div className="onboarding-center">
        <div className="stage">
          <div className="stage-body">
            <div className="status-row">
              <span className="spinner" />
              Reading {hostname(url)}…
            </div>
            <p className="onboarding-lead">Learning your colors, voice, and customers…</p>
            <button className="btn" style={{ marginTop: "16px" }} onClick={handleBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // goal step
  const goals = Object.entries(GOAL_LABEL) as [Goal, string][];
  return (
    <div className="onboarding-center">
      <div className="stage">
        <div className="stage-body">
          <h2 className="onboarding-title">What are you trying to do right now?</h2>
          <div className="onboarding-goals">
            {goals.map(([goal, label]) => (
              <button
                key={goal}
                className="btn onboarding-goal-card"
                disabled={submittingGoal}
                onClick={() => handleGoal(goal)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn" style={{ marginTop: "16px" }} onClick={handleBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
