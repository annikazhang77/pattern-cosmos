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
  DrawnOrbitPath,
  FortuneState,
  GenesisBirth,
  FutureChoiceDraft,
  FutureChoicePosition,
  InteractionMode,
  OrbitDrawStage,
  OracleOrigin,
  OracleSequenceState,
  OrbitState,
  Pattern,
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

// v4 stores the exact user-drawn path. Future Seed data is normalized into the
// same record so existing hand-drawn paths keep working without reviving the
// old predetermined curve.
const fortuneStorageKey = "pattern-cosmos-fortune-state-v4-drawn-orbit";
const staleFortuneStorageKeys = [
  "pattern-cosmos-fortune-state-v2",
  "pattern-cosmos-fortune-state-v3-contract",
];

interface StoredWorldState {
  orbits: Record<string, OrbitState>;
  drawnOrbits: Record<string, DrawnOrbitPath>;
}

function readStoredWorldState(): StoredWorldState {
  if (productMode.isolatedFresh) return { orbits: {}, drawnOrbits: {} };
  try {
    staleFortuneStorageKeys.forEach((key) => window.localStorage.removeItem(key));
    const stored = window.localStorage.getItem(fortuneStorageKey);
    if (!stored) return { orbits: {}, drawnOrbits: {} };
    const parsed = JSON.parse(stored) as Partial<StoredWorldState>;
    const drawnOrbits = Object.fromEntries(
      Object.entries(parsed.drawnOrbits ?? {}).map(([patternId, orbit]) => {
        const bornAt = orbit.completed_at ?? new Date().toISOString();
        return [patternId, {
          ...orbit,
          future_seed: orbit.future_seed ?? {
            position: orbit.endpoint,
            born_at: bornAt,
            seed: Array.from(patternId).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261),
          },
        }];
      }),
    ) as Record<string, DrawnOrbitPath>;
    // Only a user-created changed orbit belongs to the persistent cosmos.
    // `unread / one_year / three_year` and a merely revealed current orbit are
    // transient reading stages and must never bypass a fresh Oracle ritual.
    const orbits = Object.fromEntries(
      Object.keys(drawnOrbits).map((patternId) => [patternId, "changed"]),
    ) as Record<string, OrbitState>;
    return { orbits, drawnOrbits };
  } catch {
    return { orbits: {}, drawnOrbits: {} };
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function patternEvidenceVersion(pattern: Pattern) {
  return `supporting:${pattern.supporting_experience_ids.join("|")};contradicting:${pattern.contradicting_experience_ids.join("|")}`;
}

function projectionMatchesPattern(pattern: Pattern, evidenceVersion?: string) {
  return evidenceVersion === patternEvidenceVersion(pattern);
}

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [futureChoice, setFutureChoice] = useState<FutureChoiceDraft | null>(null);
  const [orbitDrawStage, setOrbitDrawStage] = useState<OrbitDrawStage>("idle");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("READ_MODE");
  const [cosmicEvent, setCosmicEvent] = useState<CosmicEventState | null>(null);
  const storedWorld = useMemo(readStoredWorldState, []);
  const [fortuneStates, setFortuneStates] = useState<Record<string, FortuneState>>({});
  const [orbitStates, setOrbitStates] = useState<Record<string, OrbitState>>(storedWorld.orbits);
  const [drawnOrbits, setDrawnOrbits] = useState<Record<string, DrawnOrbitPath>>(storedWorld.drawnOrbits);
  const [oracleSequence, setOracleSequence] = useState<OracleSequenceState | null>(null);
  const [lastOracleDurationMs, setLastOracleDurationMs] = useState(0);
  const [lastFutureRevealDelayMs, setLastFutureRevealDelayMs] = useState(0);
  const [hydrating, setHydrating] = useState(true);
  const [genesisBirths, setGenesisBirths] = useState<GenesisBirth[]>([]);
  const [emergingPatternId, setEmergingPatternId] = useState<string | null>(null);
  const [genesisMessage, setGenesisMessage] = useState<string | null>(null);
  const [genesisDemoStep, setGenesisDemoStep] = useState(0);
  const {
    muted,
    play: playGenesisCue,
    toggleMuted,
    unlock: unlockAudio,
    beginIntroMusic,
    duckMusic,
    startOrbitDrag,
    updateOrbitDrag,
    stopOrbitDrag,
  } = useGenesisAudio();
  const settleTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  const projectionRequests = useRef(new Map<string, ReturnType<typeof api.createProjection>>());
  const projectionWarmFailures = useRef(new Set<string>());
  const oracleProjectionRequest = useRef<{ patternId: string; request: ReturnType<typeof api.createProjection> } | null>(null);
  const oracleTraceCompleting = useRef(false);
  const projectionEpoch = useRef(0);
  const genesisTimers = useRef<number[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const [introRequested] = useState(() => {
    const introMode = new URLSearchParams(window.location.search).get("intro");
    if (introMode === "0") return false;
    if (introMode === "1") return true;
    return window.sessionStorage.getItem("pattern-cosmos-intro-seen") !== "1";
  });
  const [showIntro, setShowIntro] = useState(false);
  const [entryGate, setEntryGate] = useState<"none" | "checking" | "blocked">(
    () => introRequested ? "checking" : "none",
  );

  const finishIntro = useCallback(() => {
    window.sessionStorage.setItem("pattern-cosmos-intro-seen", "1");
    setShowIntro(false);
  }, []);

  useEffect(() => {
    if (entryGate !== "checking") return;
    let active = true;
    void beginIntroMusic().then((started) => {
      if (!active) return;
      if (started) {
        setEntryGate("none");
        setShowIntro(true);
      } else {
        setEntryGate("blocked");
      }
    });
    return () => {
      active = false;
    };
  }, [beginIntroMusic, entryGate]);

  const beginGatedIntro = useCallback(() => {
    if (entryGate !== "blocked") return;
    // `beginIntroMusic` calls HTMLAudioElement.play synchronously while this
    // pointer/key gesture is still trusted; the Intro starts only once that
    // same first-piano-note attempt has been made.
    void beginIntroMusic().then((started) => {
      if (!started) return;
      void unlockAudio(false);
      setEntryGate("none");
      setShowIntro(true);
    });
  }, [beginIntroMusic, entryGate, unlockAudio]);

  useEffect(() => {
    const bootstrap = async () => {
      let nextState = productMode.seededDemo
        ? await api.loadDemo()
        : productMode.genesisDemo || productMode.isolatedFresh
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
    if (productMode.isolatedFresh) return;
    const persistentOrbits = Object.fromEntries(
      Object.keys(drawnOrbits).map((patternId) => [patternId, "changed"]),
    );
    window.localStorage.setItem(fortuneStorageKey, JSON.stringify({
      orbits: persistentOrbits,
      drawnOrbits,
    }));
  }, [drawnOrbits]);

  const selectedPattern = useMemo(
    () => state.patterns.find((pattern) => pattern.pattern_id === selectedPatternId) ?? null,
    [state.patterns, selectedPatternId],
  );
  const selectedProjectionReady = selectedPattern
    ? projectionMatchesPattern(
      selectedPattern,
      state.trajectory_projections[selectedPattern.pattern_id]?.evidence_version,
    )
    : false;

  const ensureProjection = useCallback((pattern: Pattern) => {
    const patternId = pattern.pattern_id;
    const evidenceVersion = patternEvidenceVersion(pattern);
    const existing = stateRef.current.trajectory_projections[patternId];
    if (existing && projectionMatchesPattern(pattern, existing.evidence_version)) {
      return Promise.resolve({ projection: existing, state: stateRef.current, cached: true });
    }
    const requestKey = `${patternId}:${evidenceVersion}`;
    const activeRequest = projectionRequests.current.get(requestKey);
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
      .finally(() => projectionRequests.current.delete(requestKey));
    projectionRequests.current.set(requestKey, request);
    return request;
  }, []);

  useEffect(() => {
    // Projection is world preparation, not a step in opening a reading. Start it as
    // soon as a real recurring pattern is present: on demo/returning-Cosmos load and
    // immediately after Genesis routing upgrades a pattern to recurrence.
    const queue = state.patterns.filter((pattern) => {
      if (pattern.status !== "recurring" || pattern.evidence_count < 3) return false;
      const evidenceVersion = patternEvidenceVersion(pattern);
      const cached = state.trajectory_projections[pattern.pattern_id];
      return !projectionMatchesPattern(pattern, cached?.evidence_version)
        && !projectionWarmFailures.current.has(`${pattern.pattern_id}:${evidenceVersion}`);
    });
    if (!queue.length) return;

    let cancelled = false;
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (!cancelled) {
        const pattern = queue.shift();
        if (!pattern) return;
        const requestKey = `${pattern.pattern_id}:${patternEvidenceVersion(pattern)}`;
        try {
          await ensureProjection(pattern);
        } catch {
          // A background warmup must never surface an error or flood retries. Oracle
          // can still retry its own pattern deliberately if this request failed.
          projectionWarmFailures.current.add(requestKey);
        }
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [ensureProjection, state.patterns, state.trajectory_projections]);

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

  const openPattern = useCallback((patternId: string) => {
    // A pattern's evidence, visual identity, cached projection, changed orbit,
    // and Future Seed belong to the world. Reading progress does not. Every
    // fresh focus therefore starts at READ and requires the Oracle again.
    setFortuneStates((current) => ({ ...current, [patternId]: "unread" }));
    setOrbitStates((current) => {
      const next = { ...current };
      if (drawnOrbits[patternId]) next[patternId] = "changed";
      else delete next[patternId];
      return next;
    });
    setFutureChoice(null);
    setOrbitDrawStage("idle");
    setOracleSequence(null);
    oracleProjectionRequest.current = null;
    oracleTraceCompleting.current = false;
    setCosmicEvent(null);
    setInteractionMode("READ_MODE");
    setSelectedPatternId(patternId);
  }, [drawnOrbits]);

  const loadDemo = () => run(api.loadDemo, (nextState) => {
    projectionEpoch.current += 1;
    projectionRequests.current.clear();
    projectionWarmFailures.current.clear();
    setState(nextState);
    setSelectedPatternId(null);
    setFortuneStates({});
    setOrbitStates({});
    setDrawnOrbits({});
    setFutureChoice(null);
    setOrbitDrawStage("idle");
    setOracleSequence(null);
    setCosmicEvent(null);
    setInteractionMode("READ_MODE");
    staleFortuneStorageKeys.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem(fortuneStorageKey);
  });

  const resetGenesis = () => run(api.startGenesis, (nextState) => {
    projectionEpoch.current += 1;
    projectionRequests.current.clear();
    projectionWarmFailures.current.clear();
    setState(nextState);
    setSelectedPatternId(null);
    setFortuneStates({});
    setOrbitStates({});
    setDrawnOrbits({});
    setFutureChoice(null);
    setOrbitDrawStage("idle");
    setCosmicEvent(null);
    setInteractionMode("READ_MODE");
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
      const importedPatternId = nextState.last_routing?.target_pattern_id ?? null;
      if (importedPatternId) openPattern(importedPatternId);
      else setSelectedPatternId(null);
    });
  };

  const setVisualState = async (visualState: VisualState) => {
    if (!selectedPattern) return;
    if (visualState !== "nebula" && selectedPattern.status !== "recurring") {
      setError("Keep observing this possible pattern until repeated evidence establishes recurrence.");
      return;
    }
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

  const seeDefaultFuture = (origin: OracleOrigin) => {
    if (!selectedPattern) return;
    const patternId = selectedPattern.pattern_id;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void unlockAudio().then(() => duckMusic(980));
    setBusy(true);
    setError(null);
    setInteractionMode("ORACLE_SEQUENCE");
    setOracleSequence({ patternId, phase: "GATHER", origin });
    oracleTraceCompleting.current = false;
    oracleProjectionRequest.current = {
      patternId,
      request: ensureProjection(selectedPattern),
    };
    void (async () => {
      try {
        await delay(reducedMotion ? 15 : 220);
        setOracleSequence((current) => current?.patternId === patternId
          ? { ...current, phase: "OPENING" }
          : current);
        await delay(reducedMotion ? 15 : 520);
        setOracleSequence((current) => current?.patternId === patternId
          ? { ...current, phase: "TRACE" }
          : current);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Something went wrong");
        setOracleSequence(null);
        setInteractionMode("READ_MODE");
        setBusy(false);
      }
    })();
  };

  const completeOracleTrace = useCallback(async () => {
    const sequence = oracleSequence;
    if (!sequence || sequence.phase !== "TRACE" || oracleTraceCompleting.current) return;
    const patternId = sequence.patternId;
    const pattern = stateRef.current.patterns.find((candidate) => candidate.pattern_id === patternId);
    if (!pattern) return;
    oracleTraceCompleting.current = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    try {
      setOracleSequence((current) => current?.patternId === patternId
        ? { ...current, phase: "COMPLETE" }
        : current);
      duckMusic(1120);
      await delay(reducedMotion ? 20 : 190);
      setOracleSequence((current) => current?.patternId === patternId
        ? { ...current, phase: "MIST" }
        : current);
      const projectionRequest = oracleProjectionRequest.current?.patternId === patternId
        ? oracleProjectionRequest.current.request
        : ensureProjection(pattern);
      await Promise.all([projectionRequest, delay(reducedMotion ? 25 : 390)]);
      setOracleSequence((current) => current?.patternId === patternId
        ? { ...current, phase: "REVEAL" }
        : current);
      await delay(reducedMotion ? 25 : 270);
      const mistCompletedAt = performance.now();
      setFortuneStates((current) => ({ ...current, [patternId]: "one_year" }));
      setOrbitStates((current) => ({ ...current, [patternId]: "current" }));
      setLastOracleDurationMs(Math.round(performance.now() - startedAt));
      setOracleSequence(null);
      setInteractionMode("READ_MODE");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const future = document.querySelector<HTMLElement>(`.default-future[data-pattern-id="${patternId}"]`);
          future?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
          setLastFutureRevealDelayMs(Math.round(performance.now() - mistCompletedAt));
        });
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
      setOracleSequence(null);
      setInteractionMode("READ_MODE");
    } finally {
      oracleProjectionRequest.current = null;
      oracleTraceCompleting.current = false;
      setBusy(false);
    }
  }, [duckMusic, ensureProjection, oracleSequence]);

  const revealFartherFuture = () => {
    if (!selectedPattern) return;
    setFortuneStates((current) => ({
      ...current,
      [selectedPattern.pattern_id]: "three_year",
    }));
  };

  const beginOrbitDrawing = (alternativeId: string, customResponse?: string) => {
    if (!selectedPattern) return;
    const patternId = selectedPattern.pattern_id;
    const blackHole = selectedPattern.visual_state === "black_hole";
    const origin = blackHole
      ? { x: 0.03, y: 0.01, z: 1.03 }
      : { x: 0.38, y: -0.1, z: 1.08 };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setFutureChoice({ patternId, alternativeId, customResponse, position: origin });
    setError(null);
    setBusy(true);
    setInteractionMode("COSMIC_EVENT_MODE");
    setOrbitDrawStage("preframe");
    setCosmicEvent({ kind: "CHANGE_ORBIT", phase: "PREFRAME", patternId });
    void (async () => {
      await delay(reducedMotion ? 30 : 720);
      setCosmicEvent((current) => current?.kind === "CHANGE_ORBIT" && current.patternId === patternId
        ? { ...current, phase: "PLAYING" }
        : current);
      setOrbitDrawStage("ready");
      setBusy(false);
    })();
  };

  const chooseAlternative = (alternative: AlternativeResponse) => {
    beginOrbitDrawing(alternative.alternative_id);
  };

  const chooseCustomResponse = (response: string) => {
    beginOrbitDrawing("custom-response", response);
  };

  const startDrawnOrbit = useCallback(() => {
    setOrbitDrawStage("drawing");
    void playGenesisCue("choice_pickup");
    void startOrbitDrag();
  }, [playGenesisCue, startOrbitDrag]);

  const cancelDrawnOrbit = useCallback(() => {
    stopOrbitDrag(false);
    setOrbitDrawStage("ready");
  }, [stopOrbitDrag]);

  const completeDrawnOrbit = useCallback(async (
    points: FutureChoicePosition[],
    endpoint: FutureChoicePosition,
  ) => {
    if (!selectedPattern || !futureChoice || futureChoice.patternId !== selectedPattern.pattern_id) return;
    const patternId = selectedPattern.pattern_id;
    const choice = futureChoice;
    const blackHole = selectedPattern.visual_state === "black_hole";
    const completedAt = new Date().toISOString();
    const drawnOrbit: DrawnOrbitPath = {
      pattern_id: patternId,
      points,
      endpoint,
      future_seed: {
        position: endpoint,
        born_at: completedAt,
        seed: Array.from(`${patternId}:${completedAt}`).reduce(
          (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
          2166136261,
        ),
      },
      black_hole: blackHole,
      completed_at: completedAt,
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOrbitDrawStage("blooming");
    setBusy(true);
    stopOrbitDrag(false);
    setFutureChoice({ ...choice, position: endpoint });
    setDrawnOrbits((current) => ({ ...current, [patternId]: drawnOrbit }));
    try {
      const [result] = await Promise.all([
        api.confirmChangedOrbit(
          patternId,
          choice.alternativeId,
          endpoint,
          choice.customResponse,
        ),
        delay(reducedMotion ? 40 : 2250),
      ]);
      await playGenesisCue("choice_resolve");
      setState(result.state);
      setOrbitStates((current) => ({ ...current, [patternId]: "changed" }));
      setFutureChoice(null);
      setOrbitDrawStage("idle");
      setCosmicEvent({ kind: "CHANGE_ORBIT", phase: "SETTLED", patternId });
      setBusy(false);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        setCosmicEvent(null);
        setInteractionMode("READ_MODE");
        settleTimer.current = null;
      }, reducedMotion ? 30 : 520);
    } catch (requestError) {
      setDrawnOrbits((current) => {
        const next = { ...current };
        delete next[patternId];
        return next;
      });
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
      setOrbitDrawStage("ready");
      setCosmicEvent({ kind: "CHANGE_ORBIT", phase: "PLAYING", patternId });
      setBusy(false);
    }
  }, [futureChoice, playGenesisCue, selectedPattern, stopOrbitDrag]);

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
      className={`app-shell${showIntro || entryGate !== "none" ? " is-entering" : ""}${selectedPattern ? " has-reading" : ""}${isGenesisEmpty ? " is-genesis-empty" : ""}${interactionMode === "COSMIC_EVENT_MODE" ? " is-cosmic-event" : interactionMode === "ORACLE_SEQUENCE" ? " is-oracle-sequence" : " is-read-mode"}`}
      data-interaction-mode={interactionMode}
      data-cosmic-event={cosmicEvent?.kind ?? "NONE"}
      data-cosmic-event-phase={cosmicEvent?.phase ?? "NONE"}
      data-orbit-draw-stage={orbitDrawStage}
      data-drawn-orbit-count={Object.keys(drawnOrbits).length}
      data-future-seed-count={Object.values(drawnOrbits).filter((orbit) => Boolean(orbit.future_seed)).length}
      data-oracle-duration-ms={lastOracleDurationMs}
      data-future-reveal-delay-ms={lastFutureRevealDelayMs}
      data-projection-prefetch-ready={selectedProjectionReady ? "true" : "false"}
      data-future-choice-selected={futureChoice ? "true" : "false"}
      data-product-mode={productMode.seededDemo
        ? "seeded-demo"
        : productMode.genesisDemo
          ? "genesis-demo"
          : productMode.isolatedFresh
            ? "isolated-fresh"
            : "personal"}
      data-genesis-stage={genesisStage}
      data-user-pattern-count={state.patterns.length}
      data-user-experience-count={state.experiences.length}
      onPointerDown={() => {
        if (entryGate === "none") void unlockAudio();
      }}
      onKeyDown={() => {
        if (entryGate === "none") void unlockAudio();
      }}
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
            onSelectPattern={openPattern}
            futureChoice={futureChoice}
            projections={state.trajectory_projections}
            changedOrbits={state.changed_orbits}
            orbitStates={orbitStates}
            drawnOrbits={drawnOrbits}
            orbitDrawStage={orbitDrawStage}
            cosmicEvent={cosmicEvent}
            interactionMode={interactionMode}
            genesisBirths={genesisBirths}
            emergingPatternId={emergingPatternId}
            onOrbitDrawStart={startDrawnOrbit}
            onOrbitDrawSpeed={updateOrbitDrag}
            onOrbitDrawCancel={cancelDrawnOrbit}
            onOrbitDrawComplete={completeDrawnOrbit}
          />

          {cosmicEvent?.kind === "CHANGE_ORBIT"
            && cosmicEvent.phase === "PLAYING"
            && futureChoice
            && (orbitDrawStage === "ready" || orbitDrawStage === "drawing") && (
            <div className={`orbit-draw-instruction is-${orbitDrawStage}`} aria-live="polite">
              Draw another way.
            </div>
          )}

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
            onSeeDefaultFuture={seeDefaultFuture}
            fortuneState={fortuneStates[selectedPattern.pattern_id] ?? "unread"}
            orbitState={orbitStates[selectedPattern.pattern_id] ?? "hidden"}
            onRevealFartherFuture={revealFartherFuture}
            onChooseAlternative={chooseAlternative}
            onChooseCustomResponse={chooseCustomResponse}
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
      {oracleSequence && (
        <OracleSequence
          sequence={oracleSequence}
          onTraceComplete={() => void completeOracleTrace()}
        />
      )}
      {entryGate === "blocked" && (
        <section
          className="entry-gate"
          role="button"
          tabIndex={0}
          aria-label="Enter the Cosmos"
          onPointerDown={(event) => {
            event.stopPropagation();
            beginGatedIntro();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              beginGatedIntro();
            }
          }}
        >
          <span className="entry-gate__star" aria-hidden="true" />
          <p>Enter the Cosmos</p>
          <span>Click anywhere to begin</span>
        </section>
      )}
      {showIntro && <EntryIntro onComplete={finishIntro} />}
    </main>
  );
}
