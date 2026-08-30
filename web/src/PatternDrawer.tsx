import { ArrowRight, CircleNotch, Sparkle, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  AlternativeResponse,
  ChangedOrbit,
  DefaultFutureProjection,
  Experience,
  FortuneState,
  FutureChoicePosition,
  OracleOrigin,
  OrbitState,
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
    customResponse?: string;
    position: FutureChoicePosition;
  } | null;
  onSeeDefaultFuture: (origin: OracleOrigin) => void;
  fortuneState: FortuneState;
  orbitState: OrbitState;
  onRevealFartherFuture: () => void;
  onChooseAlternative: (alternative: AlternativeResponse) => void;
  onChooseCustomResponse: (response: string) => void;
  onConfirmChangedOrbit: () => void;
  immersiveEventMode: boolean;
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

function visualSummary(text: string, maxLength = 176) {
  const clean = text.replace(/\s+/g, " ").trim();
  const firstTwo = clean.match(/^.*?[.!?。！？](?:\s+.*?[.!?。！？])?/)?.[0]?.trim() ?? clean;
  const candidate = firstTwo.length > maxLength ? clean : firstTwo;
  return candidate.length > maxLength ? `${candidate.slice(0, maxLength - 1).trimEnd()}…` : candidate;
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
  fortuneState,
  orbitState,
  onRevealFartherFuture,
  onChooseAlternative,
  onChooseCustomResponse,
  onConfirmChangedOrbit,
  immersiveEventMode,
}: PatternDrawerProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [customResponse, setCustomResponse] = useState("");
  const orbRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setShowAlternatives(false);
    setCustomResponse("");
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
      className={`pattern-reading${immersiveEventMode ? " is-event-hidden" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${pattern.name}`}
      aria-hidden={immersiveEventMode}
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
          {fortuneState === "unread" ? (
            <button
              className="oracle-action"
              onClick={() => {
                const bounds = orbRef.current?.getBoundingClientRect();
                onSeeDefaultFuture(bounds ? {
                  x: bounds.left + bounds.width / 2,
                  y: bounds.top + bounds.height / 2,
                  size: bounds.width,
                } : { x: window.innerWidth * 0.64, y: window.innerHeight * 0.62, size: 92 });
              }}
              disabled={busy || pattern.evidence_count < 3}
            >
              <span ref={orbRef} className="oracle-orb" aria-hidden="true">
                <span className="oracle-orb__gas" />
                <span className="oracle-orb__glint" />
              </span>
              <span className="oracle-copy">
                <strong>Read the orbit</strong>
                <small>See where this pattern leads if nothing changes.</small>
              </span>
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
                <p className="trajectory-summary">{visualSummary(projection.one_year_default_trajectory)}</p>
              </div>
              <details className="reasoning-disclosure">
                <summary>Read the reasoning</summary>
                <div>
                  <p>{projection.one_year_default_trajectory}</p>
                  <p className="orbit-caveat">{projection.uncertainty_evidence_caveat}</p>
                </div>
              </details>

              {fortuneState === "one_year" && (
                <button className="farther-orbit-action" type="button" onClick={onRevealFartherFuture}>
                  <span>Look farther along this orbit</span>
                  <ArrowRight size={17} />
                </button>
              )}

              {fortuneState === "three_year" && (
                <div className="trajectory-details is-revealed">
                  <h4>Farther along this orbit</h4>
                <div className="trajectory-moment">
                  <span>Three years</span>
                  <p className="trajectory-summary">{visualSummary(projection.three_year_default_trajectory)}</p>
                </div>
                <details className="reasoning-disclosure">
                  <summary>Read the reasoning</summary>
                  <div>
                    <p>{projection.three_year_default_trajectory}</p>
                    <p className="compounding-copy">{projection.likely_compounding_effect}</p>
                  </div>
                </details>
                </div>
              )}

              {fortuneState === "three_year" && !showAlternatives && !changedOrbit && (
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
                      <span>{visualSummary(alternative.response, 138)}</span>
                    </button>
                  ))}
                  <label className="custom-response-field">
                    <span>Or write your own small response</span>
                    <textarea
                      value={customResponse}
                      rows={3}
                      placeholder="At the same trigger, I will..."
                      onChange={(event) => {
                        const response = event.target.value;
                        setCustomResponse(response);
                        if (response.trim().length >= 12) onChooseCustomResponse(response.trim());
                      }}
                    />
                  </label>
                  {futureChoice && (
                    <div className="future-choice-confirm">
                      <p>Confirm this response to let the choice enter the Cosmos.</p>
                      <button onClick={onConfirmChangedOrbit} disabled={busy}>
                        <Sparkle size={16} weight="fill" />
                        Set this new orbit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {changedOrbit && fortuneState === "three_year" && orbitState === "changed" && (
                <div className="changed-orbit-result">
                  <header>
                    <span>Changed Orbit</span>
                    <h4>{visualSummary(changedOrbit.changed_orbit.response, 150)}</h4>
                  </header>
                  <details className="reasoning-disclosure reasoning-disclosure--changed">
                    <summary>Read the reasoning</summary>
                    <div>
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
                  </details>
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
