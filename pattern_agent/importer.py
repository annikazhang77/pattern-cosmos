from __future__ import annotations

import hashlib
import re
from datetime import date
from pathlib import Path
from typing import Any


DATE_LINE = re.compile(r"^\s{0,3}(?:#{1,6}\s*)?(\d{4}-\d{2}-\d{2})\s*:?[ \t]*$")
FRONTMATTER_DATE = re.compile(r"^date:\s*[\"']?(\d{4}-\d{2}-\d{2})[\"']?\s*$", re.I)


def _valid_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _stable_id(source_name: str, entry_date: str, text: str) -> str:
    digest = hashlib.sha256(f"{source_name}\n{entry_date}\n{text}".encode("utf-8")).hexdigest()
    return f"IMP-{digest[:14].upper()}"


def parse_dated_text(source_name: str, content: str) -> dict[str, Any]:
    """Parse conservative YYYY-MM-DD entries without guessing missing dates."""
    if Path(source_name).suffix.lower() not in {".md", ".txt"}:
        return {"experiences": [], "skipped": [{"reason": "Only .md and .txt are supported"}]}

    normalized = content.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    lines = normalized.split("\n")
    entries: list[tuple[str, list[str]]] = []
    skipped: list[dict[str, str]] = []

    # Single-note Markdown frontmatter.
    if lines and lines[0].strip() == "---":
        closing = next((i for i, line in enumerate(lines[1:], 1) if line.strip() == "---"), None)
        if closing is not None:
            front_date = next(
                (m.group(1) for line in lines[1:closing] if (m := FRONTMATTER_DATE.match(line))),
                None,
            )
            if front_date and _valid_date(front_date):
                body = [line for line in lines[closing + 1 :] if line.strip()]
                if body:
                    entries.append((front_date, body))
            elif front_date:
                skipped.append({"reason": f"Invalid frontmatter date: {front_date}"})

    if not entries:
        current_date: str | None = None
        current_lines: list[str] = []
        for line in lines:
            match = DATE_LINE.match(line)
            if match:
                if current_date and any(item.strip() for item in current_lines):
                    entries.append((current_date, current_lines))
                proposed = match.group(1)
                current_date = proposed if _valid_date(proposed) else None
                current_lines = []
                if current_date is None:
                    skipped.append({"reason": f"Invalid date heading: {proposed}"})
            elif current_date:
                current_lines.append(line)
        if current_date and any(item.strip() for item in current_lines):
            entries.append((current_date, current_lines))

    experiences: list[dict[str, Any]] = []
    source_id = hashlib.sha256(source_name.encode("utf-8")).hexdigest()[:16]
    for entry_date, body_lines in entries:
        text = "\n".join(body_lines).strip()
        if len(text) < 8:
            skipped.append({"date": entry_date, "reason": "Entry is too short"})
            continue
        experiences.append(
            {
                "experience_id": _stable_id(source_name, entry_date, text),
                "source_id": source_id,
                "source_file": Path(source_name).name,
                "date": entry_date,
                "text": text,
                "original_text": text,
            }
        )

    if not experiences and not skipped:
        skipped.append({"reason": "No reliable YYYY-MM-DD entry boundary found"})
    return {"experiences": experiences, "skipped": skipped}
