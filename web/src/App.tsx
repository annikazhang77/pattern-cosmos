import { Database, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddExperience } from "./AddExperience";
import { api } from "./api";
import { EntryIntro } from "./EntryIntro";
import { PatternDrawer } from "./PatternDrawer";
import { ThreeCosmosView } from "./ThreeCosmosView";
import type { AppState, VisualState } from "./types";

const emptyState: AppState = {
  loaded: false,
  patterns: [],
  experiences: [],
  merge_proposals: [],
  last_routing: null,
  agent_call_count: 0,
  model: "gemini-3.7-flash",
  last_import: null,
};

export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const selectedPattern = useMemo(
    () => state.patterns.find((pattern) => pattern.pattern_id === selectedPatternId) ?? null,
    [state.patterns, selectedPatternId],
  );

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

  const setVisualState = (visualState: VisualState) => {
    if (!selectedPattern) return;
    run(() => api.setVisualState(selectedPattern.pattern_id, visualState), setState);
  };

  const createPrinciple = () => {
    if (!selectedPattern) return;
    run(() => api.createPrinciple(selectedPattern.pattern_id), (result) => setState(result.state));
  };

  return (
    <main className={`app-shell${showIntro ? " is-entering" : ""}`}>
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
              experiences={state.experiences}
              selectedPatternId={selectedPatternId}
              onSelectPattern={setSelectedPatternId}
            />
          ) : (
            <div className="cosmos-empty">
              <div className="empty-orbit"><Sparkle size={26} weight="thin" /></div>
              <h1>See what repeats.</h1>
              <p>Load dated experiences to turn isolated moments into evidence-linked patterns.</p>
              <button className="primary-button" onClick={loadDemo} disabled={busy}>
                <Database size={18} />
                Load Personal Cosmos
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
          />
        )}
      </section>

      <AddExperience disabled={!state.loaded} busy={busy} onSubmit={addExperience} />
      {showIntro && <EntryIntro onComplete={finishIntro} />}
    </main>
  );
}
