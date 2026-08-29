import { Aperture, CircleNotch, Sparkle, X } from "@phosphor-icons/react";
import type { Experience, Pattern, VisualState } from "./types";

interface PatternDrawerProps {
  pattern: Pattern | null;
  experiences: Experience[];
  busy: boolean;
  onClose: () => void;
  onSetVisualState: (visualState: VisualState) => void;
  onCreatePrinciple: () => void;
}

const visualOptions: Array<{ value: VisualState; label: string; hint: string }> = [
  { value: "nebula", label: "Nebula", hint: "Observe" },
  { value: "constellation", label: "Constellation", hint: "Reinforce" },
  { value: "black_hole", label: "Black Hole", hint: "Interrupt" },
];

export function PatternDrawer({
  pattern,
  experiences,
  busy,
  onClose,
  onSetVisualState,
  onCreatePrinciple,
}: PatternDrawerProps) {
  if (!pattern) {
    return (
      <aside className="pattern-drawer pattern-drawer--empty">
        <Aperture size={28} weight="thin" />
        <p>Select a pattern in the Cosmos to inspect its evidence.</p>
      </aside>
    );
  }

  const experienceMap = new Map(experiences.map((item) => [item.experience_id, item]));

  const renderEvidence = (ids: string[], contradiction = false) => ids.map((id) => {
    const experience = experienceMap.get(id);
    if (!experience) return null;
    return (
      <article className={`evidence-row${contradiction ? " evidence-row--contradiction" : ""}`} key={id}>
        <div className="evidence-meta">
          <span>{experience.date}</span>
          <span title={experience.source_file}>{experience.source_id ?? experience.experience_id}</span>
        </div>
        <p>{experience.text}</p>
      </article>
    );
  });

  return (
    <aside className="pattern-drawer">
      <button className="icon-button drawer-close" onClick={onClose} aria-label="Close pattern detail">
        <X size={18} />
      </button>

      <div className="drawer-heading">
        <div className="drawer-status">
          <span>{pattern.status}</span>
          <span>Seen in {pattern.evidence_count} supporting moments</span>
        </div>
        <h2>{pattern.name}</h2>
        <p>{pattern.hypothesis}</p>
      </div>

      <div className="visual-state-control" aria-label="Pattern visual state">
        {visualOptions.map((option) => (
          <button
            key={option.value}
            className={pattern.visual_state === option.value ? "is-active" : ""}
            onClick={() => onSetVisualState(option.value)}
            disabled={busy}
          >
            <strong>{option.label}</strong>
            <span>{option.hint}</span>
          </button>
        ))}
      </div>

      <section className="drawer-section">
        <p className="drawer-intro">Here are the moments that formed this pattern.</p>
        <h3>Supporting evidence</h3>
        <div className="evidence-stack">{renderEvidence(pattern.supporting_experience_ids)}</div>
      </section>

      <section className="drawer-section">
        <h3>Contradictions</h3>
        {pattern.contradicting_experience_ids.length > 0 ? (
          <div className="evidence-stack">
            {renderEvidence(pattern.contradicting_experience_ids, true)}
          </div>
        ) : (
          <p className="quiet-copy">No contradiction recorded yet.</p>
        )}
      </section>

      <section className="principle-section">
        <div>
          <h3>Draft Principle</h3>
          <p>A conscious rule built from repeated evidence.</p>
        </div>
        {pattern.principle_draft ? (
          <blockquote>{pattern.principle_draft}</blockquote>
        ) : (
          <button
            className="secondary-button"
            onClick={onCreatePrinciple}
            disabled={busy || pattern.status !== "recurring"}
          >
            {busy ? <CircleNotch className="spin" size={16} /> : <Sparkle size={16} />}
            Generate draft
          </button>
        )}
      </section>
    </aside>
  );
}
