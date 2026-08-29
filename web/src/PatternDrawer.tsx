import { ArrowRight, CircleNotch, Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type {
  AlternativeResponse,
  ChangedOrbit,
  DefaultFutureProjection,
  Experience,
  FortuneStage,
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
  fortuneStage: FortuneStage;
  onRevealFartherFuture: () => void;
  onChooseAlternative: (alternative: AlternativeResponse) => void;
  onConfirmChangedOrbit: () => void;
  cosmicEventMode: boolean;
}

const visualOptions: Array<{ value: VisualState; label: string; hint: string }> = [
  { value: "nebula", label: "Nebula", hint: "Observe" },
  { value: "constellation", label: "Constellation", hint: "Reinforce" },
  { value: "black_hole", label: "Black Hole", hint: "Interrupt" },
];

function condensedEvidence(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = clean.match(/^.*?[.!?。！？](?:\s|$)/)?.[0]?.trim() ?? clean;
  return sentence.length > 118 ? `${sentence.slice(0, 115).trimEnd()}…` : sentence;
}

function EvidenceDisclosure({
  experience,
  contradiction = false,
}: {
  experience: Experience;
  contradiction?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const original = experience.original_text ?? experience.text;
  return (
    <article className={`evidence-row${contradiction ? " evidence-row--contradiction" : ""}`}>
      <button
        className="evidence-summary"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <time>{experience.date}</time>
        <span>{condensedEvidence(experience.text)}</span>
        <i aria-hidden="true">{expanded ? "−" : "+"}</i>
      </button>
      {expanded && (
        <div className="evidence-original">
          <p>{original}</p>
          <small>
            Source · {experience.source_file ?? "Imported experience"}
            {experience.source_line ? ` · line ${experience.source_line}` : ""}
            {` · ${experience.source_id ?? experience.experience_id}`}
          </small>
        </div>
      )}
    </article>
  );
}

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
  fortuneStage,
  onRevealFartherFuture,
  onChooseAlternative,
  onConfirmChangedOrbit,
  cosmicEventMode,
}: PatternDrawerProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  useEffect(() => {
    setShowAlternatives(false);
  }, [pattern?.pattern_id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!pattern) return null;

  const experienceMap = new Map(experiences.map((item) => [item.experience_id, item]));
  const evidence = pattern.supporting_experience_ids
    .map((id) => experienceMap.get(id))
    .filter((item): item is Experience => Boolean(item));
  const contradictions = pattern.contradicting_experience_ids
    .map((id) => experienceMap.get(id))
    .filter((item): item is Experience => Boolean(item));
  const orbitAction = pattern.visual_state === "black_hole" ? "Escape this orbit" : "Change the orbit";

  return (
    <aside
      className={`pattern-reading${cosmicEventMode ? " is-event-hidden" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${pattern.name}`}
      aria-hidden={cosmicEventMode}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button className="reading-close" onClick={onClose} aria-label="Close pattern reading">
        <X size={20} />
      </button>

      <div className="pattern-reading__column" onMouseDown={(event) => event.stopPropagation()}>
        <header className="reading-heading">
          <h2>{pattern.name}</h2>
          <p className="reading-hypothesis">{pattern.hypothesis}</p>
          <p className="reading-kicker">Seen in {pattern.evidence_count} supporting moments</p>
        </header>

        <section className="reading-section evidence-reading">
          <p className="reading-intro">Here are the moments that formed this pattern.</p>
          <h3>Supporting evidence</h3>
          <div className="evidence-stack">
            {evidence.map((experience) => <EvidenceDisclosure key={experience.experience_id} experience={experience} />)}
          </div>
        </section>

        <section className="reading-section contradiction-reading">
          <h3>Contradictions</h3>
          {contradictions.length > 0 ? (
            <div className="evidence-stack">
              {contradictions.map((experience) => (
                <EvidenceDisclosure key={experience.experience_id} experience={experience} contradiction />
              ))}
            </div>
          ) : (
            <p className="quiet-copy">No contradiction recorded yet.</p>
          )}
        </section>

        <section className="meaning-section" aria-labelledby="meaning-heading">
          <p id="meaning-heading">Choose what this pattern means now.</p>
          <nav className="visual-state-control" aria-label="Pattern visual state">
            {visualOptions.map((option) => (
              <button
                key={option.value}
                className={pattern.visual_state === option.value ? "is-active" : ""}
                onClick={() => onSetVisualState(option.value)}
                disabled={busy}
                aria-label={`${option.label} ${option.hint}`}
              >
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </nav>
        </section>

        <section className="orbit-section">
          {fortuneStage === "HIDDEN" ? (
            <button
              className="oracle-action"
              onClick={(event) => {
                event.currentTarget.classList.add("is-opening");
                onSeeDefaultFuture();
              }}
              disabled={busy || pattern.evidence_count < 3}
            >
              <span className="oracle-orb" aria-hidden="true">
                <span className="oracle-orb__gas" />
                <span className="oracle-orb__glint" />
              </span>
              <span className="oracle-copy">
                <strong>{busy ? "Reading the current orbit" : "Read the orbit"}</strong>
                <small>See where this pattern leads if nothing changes.</small>
              </span>
              {busy && <CircleNotch className="spin" size={19} />}
            </button>
          ) : projection ? (
            <div className="default-future">
              <header className="future-heading">
                <span>Default Future · One Year</span>
                <small>{projection.evidence_ids.length} cited moments</small>
                <h3>If this pattern continues...</h3>
              </header>

              <div className="trajectory-moment">
                <span>One year</span>
                <p>{projection.one_year_default_trajectory}</p>
              </div>

              <p className="orbit-caveat">{projection.uncertainty_evidence_caveat}</p>

              {fortuneStage === "ONE_YEAR" && (
                <button className="farther-orbit-action" type="button" onClick={onRevealFartherFuture}>
                  <span>Look farther along this orbit</span>
                  <ArrowRight size={17} />
                </button>
              )}

              {fortuneStage === "THREE_YEARS" && (
                <div className="trajectory-details is-revealed">
                  <h4>Farther along this orbit</h4>
                <div className="trajectory-moment">
                  <span>Three years</span>
                  <p>{projection.three_year_default_trajectory}</p>
                </div>
                <p className="compounding-copy">{projection.likely_compounding_effect}</p>
                </div>
              )}

              {fortuneStage === "THREE_YEARS" && !showAlternatives && !changedOrbit && (
                <button className="change-orbit-action" onClick={() => setShowAlternatives(true)}>
                  <Sparkle size={17} weight="fill" />
                  <span>{orbitAction}</span>
                  <ArrowRight size={17} />
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
                      {alternative.response}
                    </button>
                  ))}
                  {futureChoice && (
                    <div className="future-choice-confirm">
                      <p>Move the Future Choice Star, then confirm the direction you want to test.</p>
                      <button onClick={onConfirmChangedOrbit} disabled={busy}>
                        {busy ? <CircleNotch className="spin" size={16} /> : <Sparkle size={16} weight="fill" />}
                        Set this new orbit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {changedOrbit && (
                <div className="changed-orbit-result">
                  <div className="orbit-comparison orbit-comparison--current">
                    <span>Current Orbit</span>
                    <p>{changedOrbit.current_orbit.response}</p>
                  </div>
                  <ArrowRight size={18} />
                  <div className="orbit-comparison orbit-comparison--changed">
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
          ) : null}
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
      </div>
    </aside>
  );
}
