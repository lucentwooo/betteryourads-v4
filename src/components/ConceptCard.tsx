"use client";
export type Concept = {
  id: string;
  name: string | null;
  headline: string | null;
  subheadline: string | null;
  cta: string | null;
  rationale: string | null;
};
export function ConceptCard({
  concept,
  selected,
  onToggle,
}: {
  concept: Concept;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-[1.3rem] border p-5 text-left transition ${selected ? "border-[var(--ultra)] bg-[var(--ultra-tint)]" : "border-hairline bg-card hover:border-ink/40"}`}
    >
      <div className="eyebrow text-ink/50">{concept.name ?? "Concept"}</div>
      <div className="mt-2 h2">{concept.headline ?? "—"}</div>
      {concept.subheadline && (
        <p className="mt-1 text-sm text-ink/70">{concept.subheadline}</p>
      )}
      {concept.rationale && (
        <p className="mt-3 text-xs text-ink/55">{concept.rationale}</p>
      )}
      {concept.cta && (
        <span className="mt-3 inline-block rounded-full border hairline px-3 py-1 text-xs">
          {concept.cta}
        </span>
      )}
    </button>
  );
}
