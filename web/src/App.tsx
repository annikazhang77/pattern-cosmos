import { Database, SpeakerHigh, SpeakerSlash, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddExperience } from "./AddExperience";
import { api, productMode } from "./api";
import { EntryIntro } from "./EntryIntro";
import { OracleSequence } from "./OracleSequence";
import { PatternDrawer } from "./PatternDrawer";
import { ThreeCosmosView } from "./ThreeCosmosView";
import { useGenesisAudio } from "./useGenesisAudio";
import type {
  AlternativeResponse,
  AppState,
  CosmicEventState,
  FortuneState,
  GenesisBirth,
  FutureChoicePosition,
  InteractionMode,
  OracleOrigin,
  OracleSequenceState,
  OrbitState,
  VisualState,
} from "./types";

const genesisExamples = [
  {
    date: "2026-08-12",
    text: "I was building a small portfolio page, but when deployment failed I opened several tutorials and switched to testing a new framework instead of finishing the page.",
  },
  {
    date: "2026-08-20",
    text: "While making a newsletter archive, the email template broke, so I spent the evening comparing automation tools and left the archive unfinished.",
  },
  {
    date: "2026-08-27",
    text: "While debugging a small AI prototype, an authentication error blocked me, so I began comparing voice-agent tools and never returned to the original fix.",
  },
];

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

// v3 intentionally invalidates interaction state written by the regressed
// polish build. New user-triggered progress still persists across refreshes.
const fortuneStorageKey = "pattern-cosmos-fortune-state-v3-contract";
const staleFortuneStorageKeys = ["pattern-cosmos-fortune-state-v2"];

interface StoredFortuneState {
  fortunes: Record<string, FortuneState>;
  orbits: Record<string, OrbitState>;
}

function readStoredFortuneState(): StoredFortuneState {
  try {
    staleFortuneStorageKeys.forEach((key) => window.localStorage.removeItem(key));
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
  const [hydrating, setHydrating] = useState(true);
  const [genesisBirths, setGenesisBirths] = useState<GenesisBirth[]>([]);
  const [emergingPatternId, setEmergingPatternId] = useState<string | null>(null);
  const [genesisMessage, setGenesisMessage] = useState<string | null>(null);
  const [genesisDemoStep, setGenesisDemoStep] = useState(0);
  const { muted, play: playGenesisCue, toggleMuted, unlock: unlockAudio } = useGenesisAudio();
  const settleTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  const projectionRequests = useRef(new Map<string, ReturnType<typeof api.createProjection>>());
  const projectionEpoch = useRef(0);
  const genesisTimers = useRef<number[]>([]);
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
    const bootstrap = async () => {
      let nextState = productMode.seededDemo
        ? await api.loadDemo()
        : productMode.genesisDemo
          ? await api.startGenesis()
          : await api.state();
      if (!nextState.loaded) nextState = await api.startGenesis();
      setState(nextState);
      const requestedFocus = new URLSearchParams(window.location.search).get("focus");
      const validRequestedFocus = nextState.patterns.some(
        (pattern) => pattern.pattern_id === requestedFocus,
      ) ? requestedFocus : null;
      setSelectedPatternId(
        validRequestedFocus ?? nextState.last_routing?.target_pattern_id ?? null,
      );
      setHydrating(false);
    };
    void bootstrap().catch((requestError: Error) => {
      setError(requestError.message);
      setHydrating(false);
    });
  }, []);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    genesisTimers.current.forEach((timer) => window.clearTimeout(timer));
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
    const requestEpoch = projectionEpoch.current;
    const request = api.createProjection(patternId)
      .then((result) => {
        if (requestEpoch !== projectionEpoch.current) return result;
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
    projectionEpoch.current += 1;
    projectionRequests.current.clear();
    setState(nextState);
    setSelectedPatternId(null);
    setFortuneStates({});
    setOrbitStates({});
    setFutureChoice(null);
    setOracleSequence(null);
    setCosmicEvent(null);
    setInteractionMode("READ_MODE");
    staleFortuneStorageKeys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(fortuneStorageKey);
  });

  const resetGenesis = () => run(api.startGenesis, (nextState) => {
    projectionEpoch.current += 1;
    projectionRequests.current.clear();
    setState(nextState);
    setSelectedPatternId(null);
    setFortuneStates({});
    setOrbitStates({});
    setGenesisBirths([]);
    setEmergingPatternId(null);
    setGenesisMessage(null);
    setGenesisDemoStep(0);
    window.localStorage.removeItem(fortuneStorageKey);
  });

  const enterSeededDemo = () => {
    void unlockAudio();
    window.location.assign(`${window.location.pathname}?demo=1&intro=0`);
  };

  const exitDemo = () => {
    window.location.assign(`${window.location.pathname}?intro=0`);
  };

  const addExperience = async (date: string, text: string) => {
    const sequence = stateRef.current.experiences.length;
    const birthId = `birth-${Date.now()}-${sequence}`;
    const beforePatterns = new Map(stateRef.current.patterns.map((pattern) => [pattern.pattern_id, pattern.evidence_count]));
    setBusy(true);
    setError(null);
    setSelectedPatternId(null);
    setGenesisMessage("A new star enters your cosmos.");
    setGenesisBirths((current) => [...current, { birth_id: birthId, sequence, phase: "birthing" }]);
    void playGenesisCue("birth");
    const routingTimer = window.setTimeout(() => {
      setGenesisBirths((current) => current.map((birth) => birth.birth_id === birthId ? { ...birth, phase: "routing" } : birth));
      setGenesisMessage("PatternCurator is listening for what this moment belongs to.");
    }, 680);
    genesisTimers.current.push(routingTimer);
    try {
      const { state: nextState, routing } = await api.addExperience(date, text);
      setState(nextState);
      const targetPattern = routing.target_pattern_id
        ? nextState.patterns.find((pattern) => pattern.pattern_id === routing.target_pattern_id) ?? null
        : nextState.patterns[nextState.patterns.length - 1] ?? null;
      setEmergingPatternId(targetPattern?.pattern_id ?? null);
      setGenesisBirths((current) => current.map((birth) => birth.birth_id === birthId ? { ...birth, phase: "settling" } : birth));
      const previousCount = targetPattern ? beforePatterns.get(targetPattern.pattern_id) ?? 0 : 0;
      if (routing.action === "NEW_PATTERN") {
        setGenesisMessage("A faint new region begins to gather around this moment.");
        void playGenesisCue("proto");
      } else if (routing.action === "REINFORCE_EXISTING" && targetPattern) {
        if (previousCount < 3 && targetPattern.evidence_count >= 3) {
          setGenesisMessage("Repeated evidence resolves the haze into a nebula.");
          void playGenesisCue("mature");
        } else {
          setGenesisMessage("This star joins an existing region. The pattern grows brighter.");
          void playGenesisCue("join");
        }
      } else if (routing.action === "CONTRADICT_EXISTING") {
        setGenesisMessage("This star settles at the edge of the pattern as counter-evidence.");
        void playGenesisCue("join");
      } else {
        setGenesisMessage("This moment reveals a possible relationship between regions.");
        void playGenesisCue("join");
      }
      const settleTimerId = window.setTimeout(() => {
        setGenesisBirths((current) => current.filter((birth) => birth.birth_id !== birthId));
      }, 1500);
      const messageTimerId = window.setTimeout(() => {
        setGenesisMessage(null);
        setEmergingPatternId(null);
      }, 5200);
      genesisTimers.current.push(settleTimerId, messageTimerId);
    } catch (requestError) {
      setGenesisBirths((current) => current.filter((birth) => birth.birth_id !== birthId));
      setGenesisMessage(null);
      setError(requestError instanceof Error ? requestError.message : "PatternCurator failed");
    } finally {
      setBusy(false);
    }
  };

  const addNextGenesisExample = async () => {
    const example = genesisExamples[genesisDemoStep];
    if (!example) return;
    await unlockAudio();
    await addExperience(example.date, example.text);
    setGenesisDemoStep((current) => Math.min(current + 1, genesisExamples.length));
  };

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
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".pattern-reading")?.scrollTo({ top: 0 });
      });
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

  const isGenesisEmpty = state.loaded && state.experiences.length === 0 && state.patterns.length === 0;
  const genesisStage = state.patterns.some((pattern) => pattern.evidence_count >= 3)
    ? "mature"
    : state.patterns.some((pattern) => pattern.evidence_count === 2)
      ? "gathering"
      : state.patterns.some((pattern) => pattern.evidence_count === 1)
        ? "proto"
        : genesisBirths.length > 0
          ? "star"
          : "empty";

  return (
    <main
      className={`app-shell${showIntro ? " is-entering" : ""}${selectedPattern ? " has-reading" : ""}${isGenesisEmpty ? " is-genesis-empty" : ""}${interactionMode === "COSMIC_EVENT_MODE" ? " is-cosmic-event" : interactionMode === "ORACLE_SEQUENCE" ? " is-oracle-sequence" : " is-read-mode"}`}
      data-interaction-mode={interactionMode}
      data-cosmic-event={cosmicEvent?.kind ?? "NONE"}
      data-cosmic-event-phase={cosmicEvent?.phase ?? "NONE"}
      data-oracle-duration-ms={lastOracleDurationMs}
      data-future-choice-selected={futureChoice ? "true" : "false"}
      data-product-mode={productMode.seededDemo ? "seeded-demo" : productMode.genesisDemo ? "genesis-demo" : "personal"}
      data-genesis-stage={genesisStage}
      data-user-pattern-count={state.patterns.length}
      data-user-experience-count={state.experiences.length}
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
          {productMode.seededDemo && (
            <button className="load-button" onClick={loadDemo} disabled={busy}>
              <Database size={15} /> Reset demo
            </button>
          )}
          {productMode.genesisDemo && (
            <button className="load-button" onClick={resetGenesis} disabled={busy}>
              <Database size={15} /> Reset Genesis
            </button>
          )}
          {(productMode.seededDemo || productMode.genesisDemo) && (
            <button className="load-button" onClick={exitDemo}>Return to my Cosmos</button>
          )}
          <button
            className="sound-toggle"
            type="button"
            onClick={() => void toggleMuted()}
            aria-label={muted ? "Unmute cosmic sound" : "Mute cosmic sound"}
            aria-pressed={muted}
          >
            {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
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
            genesisBirths={genesisBirths}
            emergingPatternId={emergingPatternId}
            onTrajectoryComplete={finishTrajectoryEvent}
          />

          {isGenesisEmpty && !hydrating && (
            <div className="genesis-invitation">
              <span className="genesis-invitation__kicker">Your cosmos begins without a story imposed on it.</span>
              <h1>Add a moment from your life.</h1>
              <p>A star appears first. PatternCurator listens for where it belongs.</p>
              {!productMode.genesisDemo && (
                <button className="genesis-demo-link" type="button" onClick={enterSeededDemo}>
                  Explore a demo cosmos
                </button>
              )}
            </div>
          )}

          {productMode.genesisDemo && (
            <div className="genesis-demo-control" aria-label="Hackathon Genesis sequence">
              <span>GENESIS DEMO · {genesisDemoStep}/{genesisExamples.length}</span>
              <button type="button" onClick={() => void addNextGenesisExample()} disabled={busy || genesisDemoStep >= genesisExamples.length}>
                {genesisDemoStep >= genesisExamples.length ? "Sequence complete" : `Release example ${genesisDemoStep + 1}`}
              </button>
            </div>
          )}

          {genesisMessage && (
            <div className="genesis-response" role="status" aria-live="polite">
              <Sparkle size={12} weight="fill" />
              <span>{genesisMessage}</span>
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

      <AddExperience
        disabled={!state.loaded || hydrating}
        busy={busy}
        genesis={isGenesisEmpty}
        onInteract={() => void unlockAudio()}
        onSubmit={addExperience}
      />
      {oracleSequence && <OracleSequence sequence={oracleSequence} />}
      {showIntro && <EntryIntro onComplete={finishIntro} />}
    </main>
  );
}
