from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from pattern_agent.agent import build_agent, configure_tools
from pattern_agent.firestore_store import FirestoreStateStore
from pattern_agent.importer import parse_dated_text
from pattern_agent.state import PatternState


ROOT = Path(__file__).resolve().parent
WEB_STATE_DIR = ROOT / "web_state"
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

    def require_state(self) -> PatternState:
        if not self.loaded or self.state is None:
            raise HTTPException(status_code=409, detail="Load demo data or import a file first")
        return self.state

    def load_demo(self) -> None:
        # Submission demo is deliberately synthetic. Private spike folders are never read here.
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

    def export(self) -> dict[str, Any]:
        return {
            "loaded": self.loaded,
            "pattern_bundle": self.state.export_bundle() if self.state else None,
            "last_routing": self.last_routing,
            "agent_call_count": self.agent_call_count,
            "last_import": self.last_import,
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
            "model": MODEL_ID,
            "persistence": "firestore" if USE_FIRESTORE else "local-json",
        }


store = FirestoreStateStore(PROJECT_ID) if USE_FIRESTORE else None
local_sessions: dict[str, SessionState] = {}
session_locks: dict[str, asyncio.Lock] = {}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


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


def routing_prompt(experience: dict[str, str], patterns: list[dict[str, Any]]) -> str:
    return f"""
Route exactly one new experience against the existing pattern state.

Allowed actions: NEW_PATTERN, REINFORCE_EXISTING, CONTRADICT_EXISTING, PROPOSE_MERGE.
Call route_new_experience exactly once. Cite older supporting evidence IDs that make the decision
grounded. For NEW_PATTERN, cite no old evidence, leave target_pattern_id empty, and provide a
cautious new pattern name and hypothesis. Do not force a merge. Do not diagnose the user.

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
        role="user", parts=[types.Part(text=routing_prompt(experience, state.patterns()))]
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
    session = SessionState()
    session.load_demo()
    save_session(session_id, session)
    if store:
        store.log_run(session_id, {"kind": "LOAD_SANITIZED_DEMO"})
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
