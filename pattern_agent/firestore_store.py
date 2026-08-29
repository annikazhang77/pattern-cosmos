from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any

from google.cloud import firestore


class FirestoreStateStore:
    """Small Firestore adapter; PatternCurator remains independent of persistence."""

    def __init__(self, project_id: str, collection: str = "cosmos_sessions") -> None:
        self.client = firestore.Client(project=project_id)
        self.collection = self.client.collection(collection)

    def load(self, session_id: str) -> dict[str, Any] | None:
        snapshot = self.collection.document(session_id).get()
        return snapshot.to_dict() if snapshot.exists else None

    def save(self, session_id: str, payload: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc)
        batch = self.client.batch()
        batch.set(self.collection.document(session_id), {**payload, "updated_at": now})

        bundle = payload.get("pattern_bundle") or {}
        state = bundle.get("state") or {}
        experiences = bundle.get("experiences") or []
        patterns = state.get("patterns") or []
        for experience in experiences:
            document_id = self._doc_id(session_id, experience["experience_id"])
            batch.set(
                self.client.collection("experiences").document(document_id),
                {**experience, "session_id": session_id, "updated_at": now},
            )
        for pattern in patterns:
            document_id = self._doc_id(session_id, pattern["pattern_id"])
            batch.set(
                self.client.collection("patterns").document(document_id),
                {**pattern, "session_id": session_id, "updated_at": now},
            )
            if pattern.get("principle_draft"):
                batch.set(
                    self.client.collection("principles").document(document_id),
                    {
                        "session_id": session_id,
                        "pattern_id": pattern["pattern_id"],
                        "draft": pattern["principle_draft"],
                        "updated_at": now,
                    },
                )
            for relationship, ids in (
                ("support", pattern.get("supporting_experience_ids", [])),
                ("contradiction", pattern.get("contradicting_experience_ids", [])),
            ):
                for experience_id in ids:
                    link_id = self._doc_id(
                        session_id, pattern["pattern_id"], experience_id, relationship
                    )
                    batch.set(
                        self.client.collection("evidence_links").document(link_id),
                        {
                            "session_id": session_id,
                            "pattern_id": pattern["pattern_id"],
                            "experience_id": experience_id,
                            "relationship": relationship,
                            "updated_at": now,
                        },
                    )
        batch.commit()

    @staticmethod
    def _doc_id(*parts: str) -> str:
        raw = "|".join(parts)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]
        return f"{parts[0][:24]}-{digest}"

    def log_run(self, session_id: str, payload: dict[str, Any]) -> None:
        self.collection.document(session_id).collection("runs").add(
            {**payload, "created_at": datetime.now(timezone.utc)}
        )
