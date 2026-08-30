from __future__ import annotations

import json
import re
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_STATUSES = {"possible", "recurring"}
ALLOWED_VISUAL_STATES = {"nebula", "constellation", "black_hole"}
ALLOWED_ROUTE_ACTIONS = {
    "NEW_PATTERN",
    "REINFORCE_EXISTING",
    "CONTRADICT_EXISTING",
    "PROPOSE_MERGE",
}


class PatternState:
    """Own deterministic pattern state and the append-only tool log."""

    def __init__(
        self,
        output_dir: Path,
        base_experiences: list[dict[str, str]],
        probe_experiences: list[dict[str, str]],
        *,
        persist_files: bool = True,
        initial_state: dict[str, Any] | None = None,
        initial_tool_log: list[dict[str, Any]] | None = None,
    ) -> None:
        self.output_dir = output_dir
        self.state_path = output_dir / "local_state.json"
        self.tool_log_path = output_dir / "agent_tool_log.json"
        self._lock = threading.RLock()
        self.persist_files = persist_files
        self.experiences = {
            item["experience_id"]: deepcopy(item)
            for item in [*base_experiences, *probe_experiences]
        }
        self.base_ids = {item["experience_id"] for item in base_experiences}
        self.probe_ids = {item["experience_id"] for item in probe_experiences}
        self.state: dict[str, Any] = deepcopy(initial_state) if initial_state else {
            "patterns": [],
            "merge_proposals": [],
            "probe_results": [],
        }
        self.tool_log: list[dict[str, Any]] = deepcopy(initial_tool_log or [])
        # Reapply evidence-derived invariants when restoring older persisted
        # sessions. A possible pattern may never retain a user meaning that is
        # reserved for established recurrence.
        for pattern in self.state["patterns"]:
            self._recompute(pattern)
        self._persist()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _write_json(self, path: Path, payload: Any) -> None:
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def _persist(self) -> None:
        if not self.persist_files:
            return
        self._write_json(self.state_path, self.state)
        self._write_json(self.tool_log_path, self.tool_log)

    def export_bundle(self) -> dict[str, Any]:
        """Return the complete serializable state used by the Firestore adapter."""
        with self._lock:
            return {
                "experiences": self.experience_rows(),
                "base_ids": sorted(self.base_ids),
                "probe_ids": sorted(self.probe_ids),
                "state": deepcopy(self.state),
                "tool_log": deepcopy(self.tool_log),
            }

    @classmethod
    def from_bundle(
        cls, output_dir: Path, bundle: dict[str, Any], *, persist_files: bool = False
    ) -> "PatternState":
        experiences = bundle.get("experiences", [])
        base_ids = set(bundle.get("base_ids", []))
        base = [row for row in experiences if row.get("experience_id") in base_ids]
        probes = [row for row in experiences if row.get("experience_id") not in base_ids]
        instance = cls(
            output_dir,
            base,
            probes,
            persist_files=persist_files,
            initial_state=bundle.get("state"),
            initial_tool_log=bundle.get("tool_log"),
        )
        instance.probe_ids = set(bundle.get("probe_ids", [])) or {
            row["experience_id"] for row in probes
        }
        return instance

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return deepcopy(self.state)

    def patterns(self) -> list[dict[str, Any]]:
        return self.snapshot()["patterns"]

    def probe_result_exists(self, experience_id: str) -> bool:
        return any(
            row["experience_id"] == experience_id
            for row in self.state["probe_results"]
        )

    def register_experience(self, experience: dict[str, str]) -> dict[str, str]:
        """Register one new UI-submitted experience so the existing tools can route it."""
        with self._lock:
            experience_id = experience.get("experience_id", "").strip()
            date = experience.get("date", "").strip()
            text = experience.get("text", "").strip()
            if not experience_id or not date or not text:
                raise ValueError("experience_id, date, and text are required")
            if experience_id in self.experiences:
                raise ValueError(f"Experience already exists: {experience_id}")
            row = deepcopy(experience)
            row.update({"experience_id": experience_id, "date": date, "text": text})
            self.experiences[experience_id] = row
            self.probe_ids.add(experience_id)
            return deepcopy(row)

    def experience_rows(self) -> list[dict[str, str]]:
        with self._lock:
            return sorted(
                (deepcopy(row) for row in self.experiences.values()),
                key=lambda row: (row["date"], row["experience_id"]),
            )

    def _normalize_pattern_id(self, pattern_id: str) -> str:
        """Accept harmless model formatting variants while keeping stored IDs stable."""
        slug = re.sub(r"[^a-z0-9]+", "-", pattern_id.strip().lower()).strip("-")
        if slug.startswith("pattern-"):
            slug = slug[len("pattern-") :]
        slug = slug[:48].strip("-")
        if not slug:
            raise ValueError("pattern_id must contain letters or numbers")
        return f"pattern-{slug}"

    def _pattern(self, pattern_id: str) -> dict[str, Any]:
        normalized_id = self._normalize_pattern_id(pattern_id)
        for pattern in self.state["patterns"]:
            if pattern["pattern_id"] == normalized_id:
                return pattern
        raise ValueError(f"Unknown pattern_id: {pattern_id}")

    def _experience(self, experience_id: str) -> dict[str, str]:
        try:
            return self.experiences[experience_id]
        except KeyError as exc:
            raise ValueError(f"Unknown experience_id: {experience_id}") from exc

    def _recompute(self, pattern: dict[str, Any]) -> None:
        supporting = list(dict.fromkeys(pattern["supporting_experience_ids"]))
        contradicting = list(dict.fromkeys(pattern["contradicting_experience_ids"]))
        pattern["supporting_experience_ids"] = supporting
        pattern["contradicting_experience_ids"] = contradicting
        pattern["evidence_count"] = len(supporting)
        dates = sorted({self._experience(item_id)["date"] for item_id in supporting})
        pattern["independent_dates"] = dates
        pattern["status"] = (
            "recurring" if len(supporting) >= 3 and len(dates) >= 3 else "possible"
        )
        if pattern["status"] != "recurring":
            pattern["visual_state"] = "nebula"
        assert pattern["status"] in ALLOWED_STATUSES

    def _record(self, tool: str, arguments: dict[str, Any], result: dict[str, Any]) -> None:
        self.tool_log.append(
            {
                "timestamp": self._now(),
                "tool": tool,
                "arguments": deepcopy(arguments),
                "result": deepcopy(result),
            }
        )
        self._persist()

    def create_pattern(self, pattern_id: str, name: str, hypothesis: str) -> dict[str, Any]:
        """Create one candidate pattern without attaching evidence."""
        with self._lock:
            requested_pattern_id = pattern_id
            pattern_id = self._normalize_pattern_id(pattern_id)
            if any(row["pattern_id"] == pattern_id for row in self.state["patterns"]):
                result = {"ok": True, "pattern_id": pattern_id, "already_exists": True}
                self._record(
                    "create_pattern",
                    {"pattern_id": requested_pattern_id, "name": name, "hypothesis": hypothesis},
                    result,
                )
                return result
            if not name.strip() or not hypothesis.strip():
                raise ValueError("Pattern name and hypothesis must be non-empty")
            pattern = {
                "pattern_id": pattern_id,
                "name": name.strip(),
                "hypothesis": hypothesis.strip(),
                "supporting_experience_ids": [],
                "contradicting_experience_ids": [],
                "evidence_count": 0,
                "independent_dates": [],
                "status": "possible",
                "visual_state": "nebula",
                "principle_draft": None,
            }
            self.state["patterns"].append(pattern)
            result = {"ok": True, "pattern_id": pattern_id, "status": "possible"}
            self._record(
                "create_pattern",
                {"pattern_id": requested_pattern_id, "name": name, "hypothesis": hypothesis},
                result,
            )
            return result

    def add_supporting_evidence(
        self, pattern_id: str, experience_id: str, reason: str
    ) -> dict[str, Any]:
        """Attach a real experience as supporting evidence and recompute status."""
        with self._lock:
            pattern = self._pattern(pattern_id)
            pattern_id = pattern["pattern_id"]
            self._experience(experience_id)
            if experience_id in pattern["contradicting_experience_ids"]:
                raise ValueError("An experience cannot support and contradict the same pattern")
            if experience_id not in pattern["supporting_experience_ids"]:
                pattern["supporting_experience_ids"].append(experience_id)
            self._recompute(pattern)
            result = {
                "ok": True,
                "pattern_id": pattern_id,
                "experience_id": experience_id,
                "evidence_count": pattern["evidence_count"],
                "independent_dates": pattern["independent_dates"],
                "status": pattern["status"],
            }
            self._record(
                "add_supporting_evidence",
                {"pattern_id": pattern_id, "experience_id": experience_id, "reason": reason},
                result,
            )
            return result

    def add_contradiction(
        self, pattern_id: str, experience_id: str, reason: str
    ) -> dict[str, Any]:
        """Attach a real experience that contradicts a pattern; never delete it."""
        with self._lock:
            pattern = self._pattern(pattern_id)
            pattern_id = pattern["pattern_id"]
            self._experience(experience_id)
            if experience_id in pattern["supporting_experience_ids"]:
                raise ValueError("An experience cannot support and contradict the same pattern")
            if experience_id not in pattern["contradicting_experience_ids"]:
                pattern["contradicting_experience_ids"].append(experience_id)
            self._recompute(pattern)
            result = {
                "ok": True,
                "pattern_id": pattern_id,
                "experience_id": experience_id,
                "contradiction_count": len(pattern["contradicting_experience_ids"]),
                "status": pattern["status"],
            }
            self._record(
                "add_contradiction",
                {"pattern_id": pattern_id, "experience_id": experience_id, "reason": reason},
                result,
            )
            return result

    def propose_merge(
        self, source_pattern_id: str, target_pattern_id: str, reason: str
    ) -> dict[str, Any]:
        """Record a merge proposal without applying it."""
        with self._lock:
            source_pattern_id = self._pattern(source_pattern_id)["pattern_id"]
            target_pattern_id = self._pattern(target_pattern_id)["pattern_id"]
            if source_pattern_id == target_pattern_id:
                raise ValueError("A pattern cannot merge with itself")
            proposal = {
                "source_pattern_id": source_pattern_id,
                "target_pattern_id": target_pattern_id,
                "reason": reason.strip(),
                "status": "proposed",
            }
            if proposal not in self.state["merge_proposals"]:
                self.state["merge_proposals"].append(proposal)
            result = {"ok": True, **proposal}
            self._record(
                "propose_merge",
                {
                    "source_pattern_id": source_pattern_id,
                    "target_pattern_id": target_pattern_id,
                    "reason": reason,
                },
                result,
            )
            return result

    def route_new_experience(
        self,
        action: str,
        experience_id: str,
        reason: str,
        target_pattern_id: str,
        cited_existing_evidence_ids: list[str],
        new_pattern_name: str,
        new_pattern_hypothesis: str,
    ) -> dict[str, Any]:
        """Record one exclusive routing decision and apply its deterministic state change."""
        with self._lock:
            if action not in ALLOWED_ROUTE_ACTIONS:
                raise ValueError(f"Unsupported route action: {action}")
            if experience_id not in self.probe_ids:
                raise ValueError("route_new_experience only accepts probe IDs")
            self._experience(experience_id)
            for cited_id in cited_existing_evidence_ids:
                if cited_id not in self.experiences or cited_id == experience_id:
                    raise ValueError(f"Cited evidence must be an older known ID: {cited_id}")
            if self.probe_result_exists(experience_id):
                raise ValueError(f"Probe already routed: {experience_id}")

            if action == "NEW_PATTERN":
                if target_pattern_id:
                    raise ValueError("NEW_PATTERN must not target an existing pattern")
                slug = re.sub(r"[^a-z0-9]+", "-", new_pattern_name.lower()).strip("-")
                generated_id = f"pattern-{slug[:36] or experience_id.lower()}"
                suffix = 2
                base_id = generated_id
                while any(p["pattern_id"] == generated_id for p in self.state["patterns"]):
                    generated_id = f"{base_id[:42]}-{suffix}"
                    suffix += 1
                self.create_pattern(generated_id, new_pattern_name, new_pattern_hypothesis)
                self.add_supporting_evidence(generated_id, experience_id, reason)
                state_target_pattern_id = generated_id
            elif action == "REINFORCE_EXISTING":
                target_pattern_id = self._pattern(target_pattern_id)["pattern_id"]
                self.add_supporting_evidence(target_pattern_id, experience_id, reason)
                state_target_pattern_id = target_pattern_id
            elif action == "CONTRADICT_EXISTING":
                target_pattern_id = self._pattern(target_pattern_id)["pattern_id"]
                self.add_contradiction(target_pattern_id, experience_id, reason)
                state_target_pattern_id = target_pattern_id
            else:
                target_pattern_id = self._pattern(target_pattern_id)["pattern_id"]
                if not new_pattern_name:
                    raise ValueError("PROPOSE_MERGE requires the other pattern ID in new_pattern_name")
                self.propose_merge(new_pattern_name, target_pattern_id, reason)
                state_target_pattern_id = target_pattern_id

            row = {
                "action": action,
                "target_pattern_id": None if action == "NEW_PATTERN" else state_target_pattern_id,
                "experience_id": experience_id,
                "reason": reason.strip(),
                "cited_existing_evidence_ids": list(dict.fromkeys(cited_existing_evidence_ids)),
            }
            self.state["probe_results"].append(row)
            self._record(
                "route_new_experience",
                {
                    "action": action,
                    "experience_id": experience_id,
                    "reason": reason,
                    "target_pattern_id": None if action == "NEW_PATTERN" else state_target_pattern_id,
                    "cited_existing_evidence_ids": cited_existing_evidence_ids,
                    "new_pattern_name": new_pattern_name,
                    "new_pattern_hypothesis": new_pattern_hypothesis,
                },
                {"ok": True, **row},
            )
            return {"ok": True, **row}

    def set_visual_state(self, pattern_id: str, visual_state: str) -> dict[str, Any]:
        """Apply an explicitly user-chosen visual meaning to a pattern."""
        with self._lock:
            if visual_state not in ALLOWED_VISUAL_STATES:
                raise ValueError(f"Unsupported visual_state: {visual_state}")
            pattern = self._pattern(pattern_id)
            if visual_state != "nebula" and pattern["status"] != "recurring":
                raise ValueError(
                    "Constellation and Black Hole require an established recurring pattern"
                )
            pattern["visual_state"] = visual_state
            result = {
                "ok": True,
                "pattern_id": pattern["pattern_id"],
                "visual_state": visual_state,
            }
            self._record(
                "set_visual_state",
                {"pattern_id": pattern_id, "visual_state": visual_state},
                result,
            )
            return result

    def set_principle_draft(self, pattern_id: str, principle: str) -> dict[str, Any]:
        """Store a locally generated, user-editable draft principle."""
        with self._lock:
            pattern = self._pattern(pattern_id)
            if pattern["status"] != "recurring":
                raise ValueError("Only a recurring pattern can become a draft principle")
            if not principle.strip():
                raise ValueError("Principle draft must be non-empty")
            pattern["principle_draft"] = principle.strip()
            result = {
                "ok": True,
                "pattern_id": pattern["pattern_id"],
                "principle_draft": pattern["principle_draft"],
            }
            self._record(
                "set_principle_draft",
                {"pattern_id": pattern_id},
                result,
            )
            return result
