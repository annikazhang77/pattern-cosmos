import { Aperture, ArrowRight, CircleNotch, Planet, Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type {
  AlternativeResponse,
  ChangedOrbit,
  DefaultFutureProjection,
  Experience,
  FutureChoicePosition,
  Pattern,
  VisualState,
} from "./types";

interface PatternDrawerProps {
  pattern: Pattern | null;
  experiences: Experience[];
  busy: boolean;
  onClose: () => void;
  onSetVisualState: (visualState: VisualState) => void;
  onCreatePrinciple: () => void;
  projection: DefaultFutureProjection | null;
  changedOrbit: ChangedOrbit | null;
  futureChoice: {
    patternId: string;
    alternativeId: string;
    position: FutureChoicePosition;
  } | null;
  onSeeDefaultFuture: () => void;
  onChooseAlternative: (alternative: AlternativeResponse) => void;
  onConfirmChangedOrbit: () => void;
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
  projection,
  changedOrbit,
  futureChoice,
  onSeeDefaultFuture,
  onChooseAlternative,
  onConfirmChangedOrbit,
}: PatternDrawerProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  useEffect(() => {
    setShowAlternatives(false);
  }, [pattern?.pattern_id]);

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

      <section className="orbit-section">
        {!projection ? (
          <button
            className="crystal-ball-action"
            onClick={onSeeDefaultFuture}
            disabled={busy || pattern.evidence_count < 3}
          >
            <span className="crystal-ball" aria-hidden="true">
              <span />
            </span>
            <span>
              <strong>{busy ? "Reading the current orbit" : "See where this leads"}</strong>
              <small>Project the default future from repeated evidence.</small>
            </span>
            {busy ? <CircleNotch className="spin" size={17} /> : <Planet size={17} />}
          </button>
        ) : (
          <div className="default-future">
            <div className="orbit-heading">
              <span>Current Orbit</span>
              <small>{projection.evidence_ids.length} cited moments</small>
            </div>
            <p className="orbit-condition">If this pattern continues...</p>
            <div className="trajectory-moment">
              <span>One year</span>
              <p>{projection.one_year_default_trajectory}</p>
            </div>
            <details className="trajectory-details">
              <summary>Look farther along this orbit</summary>
              <div className="trajectory-moment">
                <span>Three years</span>
                <p>{projection.three_year_default_trajectory}</p>
              </div>
              <p className="compounding-copy">{projection.likely_compounding_effect}</p>
            </details>
            <p className="orbit-caveat">{projection.uncertainty_evidence_caveat}</p>

            {!showAlternatives && !changedOrbit && (
              <button className="change-orbit-action" onClick={() => setShowAlternatives(true)}>
                <Sparkle size={16} weight="fill" />
                Change the orbit
                <ArrowRight size={15} />
              </button>
            )}

            {showAlternatives && !changedOrbit && (
              <div className="alternative-responses">
                <p>Choose a smaller response at the same trigger.</p>
                {projection.alternatives.map((alternative) => (
                  <button
                    key={alternative.alternative_id}
                    className={futureChoice?.alternativeId === alternative.alternative_id ? "is-active" : ""}
                    onClick={() => onChooseAlternative(alternative)}
                  >
                    <span>{alternative.response}</span>
                  </button>
                ))}
                {futureChoice && (
                  <div className="future-choice-confirm">
                    <p>Drag the gold star in the Cosmos, then confirm its new direction.</p>
                    <button onClick={onConfirmChangedOrbit} disabled={busy}>
                      {busy ? <CircleNotch className="spin" size={15} /> : <Sparkle size={15} weight="fill" />}
                      Set this new orbit
                    </button>
                  </div>
                )}
              </div>
            )}

            {changedOrbit && (
              <div className="changed-orbit-result">
                <div>
                  <span>Current Orbit</span>
                  <p>{changedOrbit.current_orbit.response}</p>
                </div>
                <ArrowRight size={16} />
                <div>
                  <span>Changed Orbit</span>
                  <p>{changedOrbit.changed_orbit.response}</p>
                </div>
                <dl>
                  <div>
                    <dt>What changed</dt>
                    <dd>{changedOrbit.changed_orbit.what_changed}</dd>
                  </div>
                  <div>
                    <dt>What stayed</dt>
                    <dd>{changedOrbit.changed_orbit.what_stayed_the_same}</dd>
                  </div>
                  <div>
                    <dt>Likely next effect</dt>
                    <dd>{changedOrbit.changed_orbit.likely_short_term_effect}</dd>
                  </div>
                  <div>
                    <dt>What may compound</dt>
                    <dd>{changedOrbit.changed_orbit.likely_long_term_compounding_effect}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
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
