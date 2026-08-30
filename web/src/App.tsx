import { Database, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddExperience } from "./AddExperience";
import { api } from "./api";
import { EntryIntro } from "./EntryIntro";
import { OracleSequence } from "./OracleSequence";
import { PatternDrawer } from "./PatternDrawer";
import { ThreeCosmosView } from "./ThreeCosmosView";
import type {
  AlternativeResponse,
  AppState,
  CosmicEventState,
  FortuneState,
  FutureChoicePosition,
  InteractionMode,
  OracleOrigin,
  OracleSequenceState,
  OrbitState,
  VisualState,
} from "./types";

const emptyState: AppState = {
  loaded: false,
  patterns: [],
  experiences: [],
  merge_proposals: [],
  last_routing: null,
  agent_call_count: 0,
  model: "gemini-3.7-flash",
  trajectory_projections: {},
  changed_orbits: {},
  last_import: null,
};

interface FutureChoiceDraft {
  patternId: string;
  alternativeId: string;
  customResponse?: string;
  position: FutureChoicePosition;
}

const fortuneStorageKey = "pattern-cosmos-fortune-state-v2";

interface StoredFortuneState {
  fortunes: Record<string, FortuneState>;
  orbits: Record<string, OrbitState>;
}

function readStoredFortuneState(): StoredFortuneState {
  try {
    const stored = window.localStorage.getItem(fortuneStorageKey);
    if (!stored) return { fortunes: {}, orbits: {} };
    const parsed = JSON.parse(stored) as Partial<StoredFortuneState>;
    return { fortunes: parsed.fortunes ?? {}, orbits: parsed.orbits ?? {} };
  } catch {
    return { fortunes: {}, orbits: {} };
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [futureChoice, setFutureChoice] = useState<FutureChoiceDraft | null>(null);
  const [escapeAnimationId, setEscapeAnimationId] = useState(0);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("READ_MODE");
  const [cosmicEvent, setCosmicEvent] = useState<CosmicEventState | null>(null);
  const storedFortune = useMemo(readStoredFortuneState, []);
  const [fortuneStates, setFortuneStates] = useState<Record<string, FortuneState>>(storedFortune.fortunes);
  const [orbitStates, setOrbitStates] = useState<Record<string, OrbitState>>(storedFortune.orbits);
  const [oracleSequence, setOracleSequence] = useState<OracleSequenceState | null>(null);
  const [lastOracleDurationMs, setLastOracleDurationMs] = useState(0);
  const settleTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  const projectionRequests = useRef(new Map<string, ReturnType<typeof api.createProjection>>());
  const importInput = useRef<HTMLInputElement>(null);
  const [showIntro, setShowIntro] = useState(() => {
    const introMode = new URLSearchParams(window.location.search).get("intro");
    if (introMode === "0") return false;
    if (introMode === "1") return true;
    return window.sessionStorage.getItem("pattern-cosmos-intro-seen") !== "1";
  });

  const finishIntro = useCallback(() => {
    window.sessionStorage.setItem("pattern-cosmos-intro-seen", "1");
    setShowIntro(false);
  }, []);

  useEffect(() => {
    api.state().then((nextState) => {
      setState(nextState);
      const requestedFocus = new URLSearchParams(window.location.search).get("focus");
      const validRequestedFocus = nextState.patterns.some(
        (pattern) => pattern.pattern_id === requestedFocus,
      ) ? requestedFocus : null;
      setSelectedPatternId(
        validRequestedFocus ?? nextState.last_routing?.target_pattern_id ?? null,
      );
    }).catch((requestError: Error) => setError(requestError.message));
  }, []);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.localStorage.setItem(fortuneStorageKey, JSON.stringify({
      fortunes: fortuneStates,
      orbits: orbitStates,
    }));
  }, [fortuneStates, orbitStates]);

  const selectedPattern = useMemo(
    () => state.patterns.find((pattern) => pattern.pattern_id === selectedPatternId) ?? null,
    [state.patterns, selectedPatternId],
  );

  const ensureProjection = useCallback((patternId: string) => {
    if (stateRef.current.trajectory_projections[patternId]) return Promise.resolve(null);
    const activeRequest = projectionRequests.current.get(patternId);
    if (activeRequest) return activeRequest;
    const request = api.createProjection(patternId)
      .then((result) => {
        setState((current) => ({
          ...current,
          trajectory_projections: {
            ...current.trajectory_projections,
            [patternId]: result.projection,
          },
          agent_call_count: Math.max(current.agent_call_count, result.state.agent_call_count),
        }));
        return result;
      })
      .finally(() => projectionRequests.current.delete(patternId));
    projectionRequests.current.set(patternId, request);
    return request;
  }, []);

  useEffect(() => {
    if (!selectedPattern || selectedPattern.evidence_count < 3) return;
    const timer = window.setTimeout(() => {
      void ensureProjection(selectedPattern.pattern_id).catch(() => {
        // Prefetch is intentionally silent. The Oracle action retries visibly.
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [ensureProjection, selectedPattern?.pattern_id, selectedPattern?.evidence_count]);

  const run = async <T,>(operation: () => Promise<T>, apply: (result: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      apply(await operation());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = () => run(api.loadDemo, (nextState) => {
    setState(nextState);
    setSelectedPatternId(null);
    setFortuneStates({});
    setOrbitStates({});
    setFutureChoice(null);
    setOracleSequence(null);
    window.localStorage.removeItem(fortuneStorageKey);
  });

  const addExperience = (date: string, text: string) => run(
    () => api.addExperience(date, text),
    ({ state: nextState, routing }) => {
      setState(nextState);
      if (routing.target_pattern_id) setSelectedPatternId(routing.target_pattern_id);
      if (routing.action === "NEW_PATTERN") {
        const newest = nextState.patterns[nextState.patterns.length - 1];
        if (newest) setSelectedPatternId(newest.pattern_id);
      }
    },
  );

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    run(() => api.importFile(file), ({ state: nextState }) => {
      setState(nextState);
      setSelectedPatternId(nextState.last_routing?.target_pattern_id ?? null);
    });
  };

  const setVisualState = async (visualState: VisualState) => {
    if (!selectedPattern) return;
    if (visualState === "nebula" || selectedPattern.visual_state === visualState) {
      run(() => api.setVisualState(selectedPattern.pattern_id, visualState), setState);
      return;
    }

    const patternId = selectedPattern.pattern_id;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isConstellation = visualState === "constellation";
    setBusy(true);
    setError(null);
    setInteractionMode("COSMIC_EVENT_MODE");
    setCosmicEvent({ kind: isConstellation ? "CONSTELLATION" : "BLACK_HOLE", phase: "PREFRAME", patternId });
    try {
      await delay(reducedMotion ? 30 : isConstellation ? 620 : 1050);
      const nextState = await api.setVisualState(patternId, visualState);
      setState(nextState);
      setCosmicEvent({ kind: isConstellation ? "CONSTELLATION" : "BLACK_HOLE", phase: "PLAYING", patternId });
      await delay(reducedMotion ? 50 : isConstellation ? 1550 : 2800);
      setCosmicEvent({ kind: isConstellation ? "CONSTELLATION" : "BLACK_HOLE", phase: "SETTLED", patternId });
      await delay(reducedMotion ? 30 : isConstellation ? 460 : 700);
      setCosmicEvent(null);
      setInteractionMode("READ_MODE");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
      setCosmicEvent(null);
      setInteractionMode("READ_MODE");
    } finally {
      setBusy(false);
    }
  };

  const seeDefaultFuture = async (origin: OracleOrigin) => {
    if (!selectedPattern) return;
    const patternId = selectedPattern.pattern_id;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBusy(true);
    setError(null);
    setInteractionMode("ORACLE_SEQUENCE");
    setOracleSequence({ patternId, phase: "GATHER", origin });
    const startedAt = performance.now();
    try {
      const projectionPromise = ensureProjection(patternId);
      const ritualPromise = (async () => {
        await delay(reducedMotion ? 15 : 220);
        setOracleSequence((current) => current?.patternId === patternId
          ? { ...current, phase: "OPENING" }
          : current);
        await delay(reducedMotion ? 15 : 430);
        setOracleSequence((current) => current?.patternId === patternId
          ? { ...current, phase: "MIST" }
          : current);
        await delay(reducedMotion ? 15 : 430);
        setOracleSequence((current) => current?.patternId === patternId
          ? { ...current, phase: "REVEAL" }
          : current);
        await delay(reducedMotion ? 15 : 280);
      })();
      await Promise.all([projectionPromise, ritualPromise]);
      setFortuneStates((current) => ({ ...current, [patternId]: "one_year" }));
      setOrbitStates((current) => ({ ...current, [patternId]: "current" }));
      setLastOracleDurationMs(Math.round(performance.now() - startedAt));
      setOracleSequence(null);
      setInteractionMode("READ_MODE");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
      setOracleSequence(null);
      setInteractionMode("READ_MODE");
    } finally {
      setBusy(false);
    }
  };

  const revealFartherFuture = () => {
    if (!selectedPattern) return;
    setFortuneStates((current) => ({
      ...current,
      [selectedPattern.pattern_id]: "three_year",
    }));
  };

  const chooseAlternative = (alternative: AlternativeResponse) => {
    if (!selectedPattern) return;
    setFutureChoice({
      patternId: selectedPattern.pattern_id,
      alternativeId: alternative.alternative_id,
      position: { x: 2.15, y: 0.72, z: 0.55 },
    });
  };

  const chooseCustomResponse = (response: string) => {
    if (!selectedPattern) return;
    setFutureChoice({
      patternId: selectedPattern.pattern_id,
      alternativeId: "custom-response",
      customResponse: response,
      position: { x: 2.15, y: 0.72, z: 0.55 },
    });
  };

  const confirmChangedOrbit = async () => {
    if (!selectedPattern || !futureChoice || futureChoice.patternId !== selectedPattern.pattern_id) return;
    const patternId = selectedPattern.pattern_id;
    const choice = futureChoice;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setBusy(true);
    setError(null);
    setInteractionMode("COSMIC_EVENT_MODE");
    setCosmicEvent({ kind: "CHANGE_ORBIT", phase: "PREFRAME", patternId });
    try {
      const [result] = await Promise.all([
        api.confirmChangedOrbit(
        selectedPattern.pattern_id,
          choice.alternativeId,
          choice.position,
          choice.customResponse,
        ),
        new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 30 : 760)),
      ]);
      setState(result.state);
      setFutureChoice(null);
      setCosmicEvent({ kind: "CHANGE_ORBIT", phase: "PLAYING", patternId });
      setEscapeAnimationId((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
      setCosmicEvent(null);
      setInteractionMode("READ_MODE");
      setBusy(false);
    }
  };

  const finishTrajectoryEvent = useCallback(() => {
    setCosmicEvent((current) => current?.kind === "CHANGE_ORBIT" && current.phase === "PLAYING"
      ? (() => {
        setOrbitStates((states) => ({ ...states, [current.patternId]: "changed" }));
        return { ...current, phase: "SETTLED" };
      })()
      : current);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    settleTimer.current = window.setTimeout(() => {
      setCosmicEvent(null);
      setInteractionMode("READ_MODE");
      setBusy(false);
      settleTimer.current = null;
    }, reducedMotion ? 30 : 850);
  }, []);

  const createPrinciple = () => {
    if (!selectedPattern) return;
    run(() => api.createPrinciple(selectedPattern.pattern_id), (result) => setState(result.state));
  };

  return (
    <main
      className={`app-shell${showIntro ? " is-entering" : ""}${selectedPattern ? " has-reading" : ""}${interactionMode === "COSMIC_EVENT_MODE" ? " is-cosmic-event" : interactionMode === "ORACLE_SEQUENCE" ? " is-oracle-sequence" : " is-read-mode"}`}
      data-interaction-mode={interactionMode}
      data-cosmic-event={cosmicEvent?.kind ?? "NONE"}
      data-cosmic-event-phase={cosmicEvent?.phase ?? "NONE"}
      data-oracle-duration-ms={lastOracleDurationMs}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <Sparkle size={20} weight="fill" />
          <div>
            <strong>Pattern Cosmos</strong>
            <span>Evidence before identity</span>
          </div>
        </div>
        <div className="topbar-actions">
          <input
            ref={importInput}
            className="file-input"
            type="file"
            accept=".md,.txt,text/plain,text/markdown"
            onChange={importFile}
          />
          <button className="load-button" onClick={() => importInput.current?.click()} disabled={busy}>
            <UploadSimple size={15} /> Import dated notes
          </button>
          <button className="load-button" onClick={loadDemo} disabled={busy}>
            <Database size={15} />
            {state.loaded ? "Reset demo" : "Load demo"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {state.last_import && (
        <div className="import-result" role="status">
          {state.last_import.imported} imported · {state.last_import.duplicates} duplicates · {state.last_import.skipped.length} skipped
        </div>
      )}

      <section className={`workspace${selectedPattern ? " has-selection" : ""}`}>
        <div className="cosmos-column">
          {state.loaded ? (
            <ThreeCosmosView
              patterns={state.patterns}
              selectedPatternId={selectedPatternId}
              onSelectPattern={setSelectedPatternId}
              futureChoice={futureChoice}
              projections={state.trajectory_projections}
              changedOrbits={state.changed_orbits}
              orbitStates={orbitStates}
              escapeAnimationId={escapeAnimationId}
              cosmicEvent={cosmicEvent}
              interactionMode={interactionMode}
              onTrajectoryComplete={finishTrajectoryEvent}
            />
          ) : (
            <div className="cosmos-empty">
              <div className="empty-orbit" aria-hidden="true">
                <span />
                <Sparkle size={17} weight="thin" />
              </div>
              <h1>See what repeats.</h1>
              <p>Load dated experiences to turn isolated moments into evidence-linked patterns.</p>
              <button className="entry-action" onClick={loadDemo} disabled={busy}>
                <span className="entry-action__star" aria-hidden="true"><Sparkle size={15} weight="fill" /></span>
                <span>Load Personal Cosmos</span>
              </button>
            </div>
          )}

          {state.last_routing && (
            <div className="routing-result" role="status">
              <span>PatternCurator</span>
              <strong>{state.last_routing.action.replaceAll("_", " ")}</strong>
              <p>{state.last_routing.reason}</p>
              <small>{state.last_routing.model} / {state.last_routing.model_calls} calls</small>
            </div>
          )}
        </div>

        {selectedPattern && (
          <PatternDrawer
            pattern={selectedPattern}
            experiences={state.experiences}
            busy={busy}
            onClose={() => setSelectedPatternId(null)}
            onSetVisualState={setVisualState}
            onCreatePrinciple={createPrinciple}
            projection={state.trajectory_projections[selectedPattern.pattern_id] ?? null}
            changedOrbit={state.changed_orbits[selectedPattern.pattern_id] ?? null}
            futureChoice={futureChoice?.patternId === selectedPattern.pattern_id ? futureChoice : null}
            onSeeDefaultFuture={seeDefaultFuture}
            fortuneState={fortuneStates[selectedPattern.pattern_id] ?? "unread"}
            orbitState={orbitStates[selectedPattern.pattern_id] ?? "hidden"}
            onRevealFartherFuture={revealFartherFuture}
            onChooseAlternative={chooseAlternative}
            onChooseCustomResponse={chooseCustomResponse}
            onConfirmChangedOrbit={confirmChangedOrbit}
            immersiveEventMode={interactionMode !== "READ_MODE"}
          />
        )}
      </section>

      <AddExperience disabled={!state.loaded} busy={busy} onSubmit={addExperience} />
      {oracleSequence && <OracleSequence sequence={oracleSequence} />}
      {showIntro && <EntryIntro onComplete={finishIntro} />}
    </main>
  );
}
