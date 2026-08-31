from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from pattern_agent.agent import build_agent, build_projection_agent, configure_tools
from pattern_agent.firestore_store import FirestoreStateStore
from pattern_agent.importer import parse_dated_text
from pattern_agent.projection import ChangedOrbitInput, DefaultFutureProjection
from pattern_agent.state import PatternState


ROOT = Path(__file__).resolve().parent
WEB_STATE_DIR = ROOT / "web_state"
DEMO_PROJECTION_CACHE_PATH = WEB_STATE_DIR / "sanitized_demo_projection_cache.json"
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "project-4698d4bd-13c6-4d4b-b5d")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
MODEL_ID = os.getenv("PATTERN_AGENT_MODEL", "gemini-3.7-flash")
USE_FIRESTORE = os.getenv("STATE_BACKEND", "local").lower() == "firestore"
MAX_IMPORT_BYTES = 1_000_000
MAX_IMPORT_ENTRIES = 12
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION


class ExperienceInput(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    text: str = Field(min_length=8, max_length=2000)


class VisualStateInput(BaseModel):
    visual_state: str


class SessionState:
    def __init__(self) -> None:
        self.loaded = False
        self.state: PatternState | None = None
        self.last_routing: dict[str, Any] | None = None
        self.agent_call_count = 0
        self.last_import: dict[str, Any] | None = None
        self.trajectory_projections: dict[str, dict[str, Any]] = {}
        self.changed_orbits: dict[str, dict[str, Any]] = {}
        self.demo_seeded = False

    def require_state(self) -> PatternState:
        if not self.loaded or self.state is None:
            raise HTTPException(status_code=409, detail="Load demo data or import a file first")
        return self.state

    def load_demo(self) -> None:
        # Submission demo is deliberately synthetic. Private spike folders are never read here.
        # Demo reload resets the world, but a projection is expensive and remains valid when the
        # seeded evidence is identical. Keep only cache entries that still match below.
        previous_projections = {
            **load_demo_projection_cache(),
            **self.trajectory_projections,
        }
        base = load_json(ROOT / "base_experiences.json")
        detected = load_json(ROOT / "agent_detected_patterns.json")
        self.state = PatternState(WEB_STATE_DIR, base, [], persist_files=not USE_FIRESTORE)
        for pattern in detected:
            self.state.create_pattern(pattern["pattern_id"], pattern["name"], pattern["hypothesis"])
            for experience_id in pattern["supporting_experience_ids"]:
                self.state.add_supporting_evidence(
                    pattern["pattern_id"], experience_id, "Loaded from sanitized demo evidence"
                )
            for experience_id in pattern["contradicting_experience_ids"]:
                self.state.add_contradiction(
                    pattern["pattern_id"], experience_id, "Loaded from sanitized demo evidence"
                )
        self.loaded = True
        self.last_routing = None
        self.agent_call_count = 0
        self.last_import = None
        self.changed_orbits = {}
        self.demo_seeded = True
        self.trajectory_projections = previous_projections
        prune_projection_cache(self)

    def start_genesis(self) -> None:
        """Create a real empty personal Cosmos without any seeded patterns."""
        self.state = PatternState(WEB_STATE_DIR, [], [], persist_files=not USE_FIRESTORE)
        self.loaded = True
        self.last_routing = None
        self.agent_call_count = 0
        self.last_import = None
        self.trajectory_projections = {}
        self.changed_orbits = {}
        self.demo_seeded = False

    def export(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "pattern_bundle": self.state.export_bundle() if self.state else None,
            "last_routing": self.last_routing,
            "agent_call_count": self.agent_call_count,
            "last_import": self.last_import,
            "trajectory_projections": self.trajectory_projections,
            "changed_orbits": self.changed_orbits,
            "demo_seeded": self.demo_seeded,
        }

    @classmethod
    def restore(cls, payload: dict[str, Any]) -> "SessionState":
        session = cls()
        session.loaded = bool(payload.get("loaded"))
        bundle = payload.get("pattern_bundle")
        if session.loaded and bundle:
            session.state = PatternState.from_bundle(WEB_STATE_DIR, bundle, persist_files=False)
        session.last_routing = payload.get("last_routing")
        session.agent_call_count = int(payload.get("agent_call_count", 0))
        session.last_import = payload.get("last_import")
        session.trajectory_projections = dict(payload.get("trajectory_projections", {}))
        session.changed_orbits = dict(payload.get("changed_orbits", {}))
        session.demo_seeded = bool(payload.get("demo_seeded", False))
        return session

    def payload(self) -> dict[str, Any]:
        if not self.loaded or self.state is None:
            return {
                "loaded": False,
                "patterns": [],
                "experiences": [],
                "merge_proposals": [],
                "last_routing": None,
                "agent_call_count": 0,
                "last_import": self.last_import,
                "trajectory_projections": self.trajectory_projections,
                "changed_orbits": self.changed_orbits,
                "model": MODEL_ID,
                "persistence": "firestore" if USE_FIRESTORE else "local-json",
            }
        snapshot = self.state.snapshot()
        return {
            "loaded": True,
            "patterns": snapshot["patterns"],
            "experiences": self.state.experience_rows(),
            "merge_proposals": snapshot["merge_proposals"],
            "last_routing": self.last_routing,
            "agent_call_count": self.agent_call_count,
            "last_import": self.last_import,
            "trajectory_projections": self.trajectory_projections,
            "changed_orbits": self.changed_orbits,
            "model": MODEL_ID,
            "persistence": "firestore" if USE_FIRESTORE else "local-json",
        }


store = FirestoreStateStore(PROJECT_ID) if USE_FIRESTORE else None
local_sessions: dict[str, SessionState] = {}
session_locks: dict[str, asyncio.Lock] = {}
projection_locks: dict[str, asyncio.Lock] = {}
# Projection calls are independent per pattern, but keep the shared Vertex/ADK budget modest.
projection_semaphore = asyncio.Semaphore(3)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_demo_projection_cache() -> dict[str, dict[str, Any]]:
    """A server-side cache shared only by the sanitized public demo data."""
    try:
        payload = load_json(DEMO_PROJECTION_CACHE_PATH)
        projections = payload.get("trajectory_projections", {})
        return dict(projections) if isinstance(projections, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_demo_projection_cache(projections: dict[str, dict[str, Any]]) -> None:
    WEB_STATE_DIR.mkdir(parents=True, exist_ok=True)
    DEMO_PROJECTION_CACHE_PATH.write_text(
        json.dumps({"trajectory_projections": projections}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def normalized_session_id(raw: str | None) -> str:
    value = (raw or "local-demo-session").strip()
    if not SESSION_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid anonymous session ID")
    return value


def load_session(session_id: str) -> SessionState:
    if store:
        persisted = store.load(session_id)
        return SessionState.restore(persisted) if persisted else SessionState()
    return local_sessions.setdefault(session_id, SessionState())


def save_session(session_id: str, session: SessionState) -> None:
    if store:
        store.save(session_id, session.export())
    else:
        local_sessions[session_id] = session


def routing_context(state: PatternState) -> list[dict[str, Any]]:
    experience_map = {
        row["experience_id"]: row for row in state.experience_rows()
    }
    context: list[dict[str, Any]] = []
    for pattern in state.patterns():
        context.append(
            {
                **pattern,
                "supporting_evidence": [
                    {
                        "experience_id": experience_map[item_id]["experience_id"],
                        "date": experience_map[item_id]["date"],
                        "text": experience_map[item_id]["text"],
                        "mechanism": experience_map[item_id].get("mechanism"),
                    }
                    for item_id in pattern["supporting_experience_ids"]
                    if item_id in experience_map
                ],
                "contradicting_evidence": [
                    {
                        "experience_id": experience_map[item_id]["experience_id"],
                        "date": experience_map[item_id]["date"],
                        "text": experience_map[item_id]["text"],
                        "mechanism": experience_map[item_id].get("mechanism"),
                    }
                    for item_id in pattern["contradicting_experience_ids"]
                    if item_id in experience_map
                ],
            }
        )
    return context


def routing_prompt(experience: dict[str, Any], patterns: list[dict[str, Any]]) -> str:
    return f"""
Route exactly one new experience against the existing pattern state.

Allowed actions: NEW_PATTERN, REINFORCE_EXISTING, CONTRADICT_EXISTING, PROPOSE_MERGE.
Before selecting an action, normalize the new experience into these required tool arguments:
- trigger: the situation, cue, or internal state that begins the path
- regulatory_function: the immediate need the automatic response serves, such as soothing,
  escape, control, stimulation, connection, or tension release
- response_behavior: what the person did or felt pulled to do; preserve concrete manifestations
- immediate_outcome: the directly observed short-term result
- conscious_intervention: any deliberate interruption or deviation; use an empty string if absent

Compare mechanisms in this order:
1. meaningful overlap in trigger or internal state
2. meaningful overlap in regulatory function or need
3. response and outcome details

Shared trigger plus shared regulatory function outweigh different surface actions. For example,
fiction generation, scrolling, and body-focused habits can support one higher-level candidate when
each is an immediate soothing or attentional escape response to pressure or avoidance. Conversely,
do not merge experiences merely because both mention stress, work, AI, or distraction.

If a person feels the same automatic pull but deliberately interrupts it, the experience may
REINFORCE the underlying trigger-function pattern while conscious_intervention records the deviation.
Use CONTRADICT_EXISTING only when the experience is genuine counter-evidence to the mechanism, not
merely because the final behavior was redirected.

Call route_new_experience exactly once. Cite older supporting evidence IDs that make the decision
grounded. For NEW_PATTERN, cite no old evidence, leave target_pattern_id empty, and provide a
cautious mechanism-level pattern name and hypothesis. Keep surface behaviors as evidence details,
not as the pattern identity. Write the display name in the same language as the experience. It must
read like a natural human phrase, not an ID or hyphenated slug. Name the trigger-function path, not
the current app, habit, or content type. The hypothesis may mention the current behavior as one
manifestation, but it must leave room for different behaviors serving the same function. Do not
force a merge. Do not diagnose the user.

For REINFORCE_EXISTING, normally leave new_pattern_name and new_pattern_hypothesis empty. When a
new surface behavior reveals that the existing name or hypothesis is too narrow, use those fields
to refine it into a broader natural-language trigger-function identity. Preserve the concrete
manifestations in evidence; do not broaden into a vague label such as stress response.

Existing patterns:
{json.dumps(patterns, indent=2, ensure_ascii=False)}

New experience:
{json.dumps(experience, indent=2, ensure_ascii=False)}
""".strip()


async def invoke_pattern_curator(
    state: PatternState, experience: dict[str, str]
) -> tuple[dict[str, Any], int]:
    configure_tools(state)
    agent = build_agent(MODEL_ID)
    session_service = InMemorySessionService()
    adk_session_id = f"route-{experience['experience_id'].lower()}"
    await session_service.create_session(
        app_name="pattern_cosmos_web", user_id="anonymous-demo-user", session_id=adk_session_id
    )
    runner = Runner(agent=agent, app_name="pattern_cosmos_web", session_service=session_service)
    content = types.Content(
        role="user", parts=[types.Part(text=routing_prompt(experience, routing_context(state)))]
    )
    model_calls = 0
    async for event in runner.run_async(
        user_id="anonymous-demo-user", session_id=adk_session_id, new_message=content
    ):
        event_content = getattr(event, "content", None)
        if getattr(event_content, "role", None) == "model" and not bool(
            getattr(event, "partial", False)
        ):
            model_calls += 1
        if model_calls > 3:
            raise RuntimeError("PatternCurator exceeded the per-experience call budget")

    matching = [
        row
        for row in state.snapshot()["probe_results"]
        if row["experience_id"] == experience["experience_id"]
    ]
    if len(matching) != 1:
        raise RuntimeError("PatternCurator did not produce exactly one routing decision")
    return matching[0], model_calls


def discovery_prompt(experiences: list[dict[str, str]]) -> str:
    return f"""
Discover only recurring behavioral mechanisms in this bounded import.

Use situation/trigger -> response/choice -> outcome, not shared topics or vocabulary.
A pattern requires at least three supplied experience IDs from three different dates. If no such
pattern exists, create nothing. Do not create one-off patterns. Do not diagnose personality.
For each qualifying pattern, call create_pattern once, then add_supporting_evidence for every
directly supporting experience. Preserve a genuine counterexample with add_contradiction. Reuse one
broader mechanism when feedback, commitment, or another external signal causes the same response
path; do not split semantic variants merely because the surface context differs. Do not call
route_new_experience or propose_merge in this bulk discovery pass.

Imported experiences:
{json.dumps(experiences, indent=2, ensure_ascii=False)}
""".strip()


async def invoke_pattern_discovery(
    state: PatternState, experiences: list[dict[str, str]]
) -> tuple[list[dict[str, Any]], int]:
    configure_tools(state)
    agent = build_agent(MODEL_ID)
    session_service = InMemorySessionService()
    adk_session_id = f"discover-{experiences[0]['experience_id'].lower()}"
    await session_service.create_session(
        app_name="pattern_cosmos_web", user_id="anonymous-demo-user", session_id=adk_session_id
    )
    runner = Runner(agent=agent, app_name="pattern_cosmos_web", session_service=session_service)
    content = types.Content(
        role="user", parts=[types.Part(text=discovery_prompt(experiences))]
    )
    before_ids = {pattern["pattern_id"] for pattern in state.patterns()}
    model_calls = 0
    async for event in runner.run_async(
        user_id="anonymous-demo-user", session_id=adk_session_id, new_message=content
    ):
        event_content = getattr(event, "content", None)
        if getattr(event_content, "role", None) == "model" and not bool(
            getattr(event, "partial", False)
        ):
            model_calls += 1
        if model_calls > 8:
            raise RuntimeError("PatternCurator exceeded the bulk-discovery call budget")
    discovered = [pattern for pattern in state.patterns() if pattern["pattern_id"] not in before_ids]
    return discovered, model_calls


def projection_prompt(
    pattern: dict[str, Any],
    supporting: list[dict[str, str]],
    contradictions: list[dict[str, str]],
) -> str:
    return f"""
Project the current trajectory of one recurring behavioral pattern using only the supplied evidence.

This is not fortune telling and not a deterministic prediction. Describe a scenario that begins with
the exact conditional phrase "If this pattern continues". Ground every claim in the repeated trigger,
response, and observed outcome. Preserve uncertainty and counter-evidence. Never diagnose personality.
Never predict a specific job, partner, illness, income, or other event unsupported by evidence.

Return 2 or 3 small alternative responses. Each alternative must change the response at the same
trigger while keeping the user's underlying situation and constraints recognizable. Make each option
concrete enough to try once. Use only supplied experience IDs in evidence_ids.

Pattern:
{json.dumps(pattern, indent=2, ensure_ascii=False)}

Supporting evidence:
{json.dumps(supporting, indent=2, ensure_ascii=False)}

Contradictions and counter-evidence:
{json.dumps(contradictions, indent=2, ensure_ascii=False)}
""".strip()


async def invoke_orbit_projector(
    pattern: dict[str, Any],
    supporting: list[dict[str, str]],
    contradictions: list[dict[str, str]],
) -> tuple[dict[str, Any], int, dict[str, Any]]:
    started_at = time.perf_counter()
    agent = build_projection_agent(MODEL_ID)
    agent_ready_at = time.perf_counter()
    session_service = InMemorySessionService()
    adk_session_id = f"project-{pattern['pattern_id'].replace('pattern-', '')[:40]}"
    await session_service.create_session(
        app_name="pattern_cosmos_orbit", user_id="anonymous-demo-user", session_id=adk_session_id
    )
    runner = Runner(agent=agent, app_name="pattern_cosmos_orbit", session_service=session_service)
    content = types.Content(
        role="user",
        parts=[types.Part(text=projection_prompt(pattern, supporting, contradictions))],
    )
    model_calls = 0
    model_event_offsets_ms: list[int] = []
    response_text = ""
    structured_output: Any | None = None
    async for event in runner.run_async(
        user_id="anonymous-demo-user", session_id=adk_session_id, new_message=content
    ):
        event_content = getattr(event, "content", None)
        if bool(getattr(event, "partial", False)):
            continue
        if getattr(event_content, "role", None) == "model":
            model_calls += 1
            model_event_offsets_ms.append(round((time.perf_counter() - started_at) * 1000))
        if getattr(event, "output", None) is not None:
            structured_output = event.output
        if event_content is None:
            continue
        text_parts = [
            getattr(part, "text", "")
            for part in getattr(event_content, "parts", [])
            if getattr(part, "text", None)
        ]
        if text_parts:
            response_text = "".join(text_parts)
        if model_calls > 3:
            raise RuntimeError("OrbitProjector exceeded the projection call budget")
    if structured_output is not None:
        projection = DefaultFutureProjection.model_validate(structured_output).model_dump()
    elif response_text:
        projection = DefaultFutureProjection.model_validate_json(response_text).model_dump()
    else:
        raise RuntimeError("OrbitProjector returned no structured projection")
    valid_evidence_ids = {
        row["experience_id"] for row in [*supporting, *contradictions]
    }
    invalid_ids = set(projection["evidence_ids"]) - valid_evidence_ids
    if invalid_ids:
        raise RuntimeError(f"OrbitProjector cited unknown evidence IDs: {sorted(invalid_ids)}")
    completed_at = time.perf_counter()
    return projection, model_calls, {
        "agent_setup_ms": round((agent_ready_at - started_at) * 1000),
        "runner_ms": round((completed_at - agent_ready_at) * 1000),
        "total_generation_ms": round((completed_at - started_at) * 1000),
        "model_event_offsets_ms": model_event_offsets_ms,
        "model_request_count": model_calls,
    }


def principle_for(pattern: dict[str, Any]) -> str:
    name = pattern["name"].rstrip(".")
    if pattern.get("visual_state") == "black_hole":
        return f"When I notice {name.lower()}, I will pause and choose one smaller intentional action."
    if pattern.get("visual_state") == "constellation":
        return f"When {name.lower()} helps, I will recreate the useful conditions and record the outcome."
    return f"When I notice {name.lower()}, I will record the trigger, response, and outcome."


app = FastAPI(title="Pattern Cosmos submission build")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": MODEL_ID,
        "location": LOCATION,
        "persistence": "firestore" if USE_FIRESTORE else "local-json",
    }


@app.get("/api/state")
def get_state(x_cosmos_session: str | None = Header(default=None)) -> dict[str, Any]:
    return load_session(normalized_session_id(x_cosmos_session)).payload()


@app.post("/api/demo/load")
def load_demo(x_cosmos_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    session = load_session(session_id)
    session.load_demo()
    save_session(session_id, session)
    if store:
        store.log_run(session_id, {"kind": "LOAD_SANITIZED_DEMO"})
    return session.payload()


@app.post("/api/genesis/start")
def start_genesis(x_cosmos_session: str | None = Header(default=None)) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    session = SessionState()
    session.start_genesis()
    save_session(session_id, session)
    if store:
        store.log_run(session_id, {"kind": "START_GENESIS"})
    return session.payload()


@app.post("/api/import")
async def import_file(
    file: UploadFile = File(...), x_cosmos_session: str | None = Header(default=None)
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    content_bytes = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content_bytes) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Import file must be 1 MB or smaller")
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Import file must be UTF-8 text") from exc

    parsed = parse_dated_text(file.filename or "import.txt", content)
    if not parsed["experiences"]:
        return {
            "import_result": {**parsed, "imported": 0, "duplicates": 0},
            "state": load_session(session_id).payload(),
        }
    if len(parsed["experiences"]) > MAX_IMPORT_ENTRIES:
        raise HTTPException(
            status_code=400,
            detail=f"This demo accepts at most {MAX_IMPORT_ENTRIES} dated entries per import",
        )

    lock = session_locks.setdefault(session_id, asyncio.Lock())
    async with lock:
        session = load_session(session_id)
        if not session.loaded:
            session.loaded = True
            session.state = PatternState(WEB_STATE_DIR, [], [], persist_files=not USE_FIRESTORE)
        state = session.require_state()
        existing_ids = {row["experience_id"] for row in state.experience_rows()}
        imported = 0
        duplicates = 0
        imported_rows: list[dict[str, Any]] = []
        for experience in parsed["experiences"]:
            if experience["experience_id"] in existing_ids:
                duplicates += 1
                continue
            state.register_experience(experience)
            imported += 1
            imported_rows.append(experience)
        discoveries: list[dict[str, Any]] = []
        if imported_rows:
            discoveries, calls = await invoke_pattern_discovery(state, imported_rows)
            session.agent_call_count += calls
        # Evidence changed: stale futures are not allowed to survive as candidates
        # for a different version of the same pattern.
        prune_projection_cache(session)
        session.last_import = {
            "source_file": Path(file.filename or "import.txt").name,
            "parsed": len(parsed["experiences"]),
            "imported": imported,
            "duplicates": duplicates,
            "skipped": parsed["skipped"],
            "actions": [
                {
                    "action": "DISCOVER_PATTERN",
                    "target_pattern_id": pattern["pattern_id"],
                    "evidence_count": pattern["evidence_count"],
                    "status": pattern["status"],
                }
                for pattern in discoveries
            ],
        }
        save_session(session_id, session)
        if store:
            store.log_run(session_id, {"kind": "IMPORT", **session.last_import})
        return {"import_result": session.last_import, "state": session.payload()}


@app.post("/api/experiences")
async def add_experience(
    payload: ExperienceInput, x_cosmos_session: str | None = Header(default=None)
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    lock = session_locks.setdefault(session_id, asyncio.Lock())
    async with lock:
        session = load_session(session_id)
        state = session.require_state()
        existing_ids = [
            row["experience_id"]
            for row in state.experience_rows()
            if row["experience_id"].startswith("WEB-")
        ]
        next_number = max([int(item.split("-")[1]) for item in existing_ids] or [0]) + 1
        experience = {
            "experience_id": f"WEB-{next_number:03d}",
            "source_id": "web-capture",
            "source_file": "web-capture",
            "date": payload.date,
            "text": payload.text.strip(),
            "original_text": payload.text.strip(),
        }
        state.register_experience(experience)
        try:
            routing, calls = await invoke_pattern_curator(state, experience)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"PatternCurator failed: {exc}") from exc
        session.agent_call_count += calls
        session.last_routing = {**routing, "model": MODEL_ID, "model_calls": calls}
        # The client will prewarm a fresh projection if this routing made (or
        # strengthened) a recurring pattern. Never retain the prior evidence version.
        prune_projection_cache(session)
        save_session(session_id, session)
        if store:
            store.log_run(session_id, {"kind": "ROUTE_EXPERIENCE", **session.last_routing})
        return {"routing": session.last_routing, "state": session.payload()}


@app.post("/api/patterns/{pattern_id}/visual-state")
def update_visual_state(
    pattern_id: str,
    payload: VisualStateInput,
    x_cosmos_session: str | None = Header(default=None),
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    session = load_session(session_id)
    try:
        session.require_state().set_visual_state(pattern_id, payload.visual_state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_session(session_id, session)
    return session.payload()


def projection_evidence_version(pattern: dict[str, Any]) -> str:
    supporting = "|".join(str(item) for item in pattern.get("supporting_experience_ids", []))
    contradicting = "|".join(str(item) for item in pattern.get("contradicting_experience_ids", []))
    return f"supporting:{supporting};contradicting:{contradicting}"


def prune_projection_cache(session: SessionState) -> None:
    """Retain only projections whose exact evidence is still a recurring pattern."""
    if not session.loaded or session.state is None:
        session.trajectory_projections = {}
        return
    valid_versions = {
        pattern["pattern_id"]: projection_evidence_version(pattern)
        for pattern in session.state.patterns()
        if pattern.get("status") == "recurring" and pattern.get("evidence_count", 0) >= 3
    }
    session.trajectory_projections = {
        pattern_id: projection
        for pattern_id, projection in session.trajectory_projections.items()
        if projection.get("evidence_version") == valid_versions.get(pattern_id)
    }


def projection_snapshot(
    session: SessionState, pattern_id: str
) -> tuple[dict[str, Any], list[dict[str, str]], list[dict[str, str]], str]:
    state = session.require_state()
    try:
        pattern = next(row for row in state.patterns() if row["pattern_id"] == pattern_id)
    except StopIteration as exc:
        raise HTTPException(status_code=404, detail="Unknown pattern") from exc
    evidence_version = projection_evidence_version(pattern)
    experience_map = {row["experience_id"]: row for row in state.experience_rows()}
    supporting = [
        experience_map[item_id]
        for item_id in pattern["supporting_experience_ids"]
        if item_id in experience_map
    ]
    contradictions = [
        experience_map[item_id]
        for item_id in pattern["contradicting_experience_ids"]
        if item_id in experience_map
    ]
    if pattern.get("status") != "recurring" or len(supporting) < 3:
        raise HTTPException(
            status_code=400,
            detail="Default Future requires a recurring pattern with at least three supporting experiences",
        )
    return pattern, supporting, contradictions, evidence_version


@app.post("/api/patterns/{pattern_id}/projection")
async def create_default_future(
    pattern_id: str, x_cosmos_session: str | None = Header(default=None)
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    request_started_at = time.perf_counter()
    state_lock = session_locks.setdefault(session_id, asyncio.Lock())
    pattern_lock = projection_locks.setdefault(f"{session_id}:{pattern_id}", asyncio.Lock())

    # Pattern-specific locking lets different mature patterns prewarm in parallel while
    # coalescing duplicate calls for the same evidence version.
    async with pattern_lock:
        async with state_lock:
            session = load_session(session_id)
            pattern, supporting, contradictions, evidence_version = projection_snapshot(session, pattern_id)
            existing = session.trajectory_projections.get(pattern_id)
            if existing and existing.get("evidence_version") == evidence_version:
                return {
                    "projection": existing,
                    "state": session.payload(),
                    "cached": True,
                    "timing": {
                        "cache_lookup_ms": round((time.perf_counter() - request_started_at) * 1000),
                        "total_ms": round((time.perf_counter() - request_started_at) * 1000),
                        "model_request_count": 0,
                    },
                }

        try:
            async with projection_semaphore:
                projection, calls, generation_timing = await invoke_orbit_projector(
                    pattern, supporting, contradictions
                )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"OrbitProjector failed: {exc}") from exc

        async with state_lock:
            session = load_session(session_id)
            _, _, _, current_evidence_version = projection_snapshot(session, pattern_id)
            if current_evidence_version != evidence_version:
                # New evidence landed while Gemini was working. Do not write a stale future.
                raise HTTPException(status_code=409, detail="Pattern evidence changed while projection was generated")
            stored_projection = {
                **projection,
                "pattern_id": pattern_id,
                "model": MODEL_ID,
                "model_calls": calls,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "evidence_version": evidence_version,
                "generation_timing": generation_timing,
            }
            session.trajectory_projections[pattern_id] = stored_projection
            session.agent_call_count += calls
            save_session(session_id, session)
            if session.demo_seeded:
                # The seeded Cosmos is public/sanitized and identical for every demo
                # session, so its validated model result can be reused tomorrow without
                # making each recorded demo pay another 20+ second model wait.
                save_demo_projection_cache(session.trajectory_projections)
            if store:
                store.log_run(
                    session_id,
                    {
                        "kind": "PROJECT_DEFAULT_FUTURE",
                        "pattern_id": pattern_id,
                        "evidence_ids": stored_projection["evidence_ids"],
                        "model": MODEL_ID,
                        "model_calls": calls,
                        "timing": generation_timing,
                    },
                )
            return {
                "projection": stored_projection,
                "state": session.payload(),
                "cached": False,
                "timing": {
                    "cache_lookup_ms": 0,
                    **generation_timing,
                    "total_ms": round((time.perf_counter() - request_started_at) * 1000),
                },
            }


@app.post("/api/patterns/{pattern_id}/changed-orbit")
def confirm_changed_orbit(
    pattern_id: str,
    payload: ChangedOrbitInput,
    x_cosmos_session: str | None = Header(default=None),
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    session = load_session(session_id)
    session.require_state()
    projection = session.trajectory_projections.get(pattern_id)
    if not projection:
        raise HTTPException(status_code=409, detail="See the default future first")
    if payload.custom_response:
        alternative = {
            "alternative_id": "custom-response",
            "response": payload.custom_response,
            "what_changed": "You chose a different response at the same repeated trigger.",
            "what_stayed_the_same": projection["repeated_trigger"],
            "likely_short_term_effect": "This creates one observable deviation from the current path. The next outcome remains evidence to collect.",
            "likely_long_term_compounding_effect": "Only repeating this choice across future triggers can establish a changed pattern.",
        }
    else:
        alternative = next(
            (
                row
                for row in projection["alternatives"]
                if row["alternative_id"] == payload.alternative_id
            ),
            None,
        )
    if not alternative:
        raise HTTPException(status_code=400, detail="Unknown alternative response")
    changed_orbit = {
        "pattern_id": pattern_id,
        "alternative_id": alternative["alternative_id"],
        "future_choice_position": payload.future_choice_position.model_dump(),
        "current_orbit": {
            "trigger": projection["repeated_trigger"],
            "response": projection["repeated_response"],
            "observed_outcome": projection["observed_outcome"],
        },
        "changed_orbit": alternative,
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }
    session.changed_orbits[pattern_id] = changed_orbit
    save_session(session_id, session)
    if store:
        store.log_run(
            session_id,
            {
                "kind": "CONFIRM_CHANGED_ORBIT",
                "pattern_id": pattern_id,
                "alternative_id": alternative["alternative_id"],
            },
        )
    return {"changed_orbit": changed_orbit, "state": session.payload()}


@app.post("/api/patterns/{pattern_id}/principle")
def create_principle(
    pattern_id: str, x_cosmos_session: str | None = Header(default=None)
) -> dict[str, Any]:
    session_id = normalized_session_id(x_cosmos_session)
    session = load_session(session_id)
    state = session.require_state()
    try:
        pattern = next(row for row in state.patterns() if row["pattern_id"] == pattern_id)
        result = state.set_principle_draft(pattern_id, principle_for(pattern))
    except (StopIteration, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_session(session_id, session)
    return {"result": result, "state": session.payload()}


frontend_dist = ROOT / "web" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
