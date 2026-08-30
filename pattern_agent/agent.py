from __future__ import annotations

from google.adk.agents import Agent
from google.adk.models import Gemini
from google.genai import types

from pattern_agent.projection import DefaultFutureProjection
from pattern_agent.state import PatternState


_STATE: PatternState | None = None


def configure_tools(state: PatternState) -> None:
    """Bind ADK function tools to the current experiment state."""
    global _STATE
    _STATE = state


def _state() -> PatternState:
    if _STATE is None:
        raise RuntimeError("Pattern tools were not configured")
    return _STATE


def create_pattern(pattern_id: str, name: str, hypothesis: str) -> dict:
    """Create one non-diagnostic behavior-pattern hypothesis. Use a stable pattern-short-slug ID."""
    return _state().create_pattern(pattern_id, name, hypothesis)


def add_supporting_evidence(pattern_id: str, experience_id: str, reason: str) -> dict:
    """Attach one supplied experience that directly supports an existing pattern hypothesis."""
    return _state().add_supporting_evidence(pattern_id, experience_id, reason)


def add_contradiction(pattern_id: str, experience_id: str, reason: str) -> dict:
    """Attach one supplied experience that directly contradicts an existing pattern hypothesis."""
    return _state().add_contradiction(pattern_id, experience_id, reason)


def propose_merge(source_pattern_id: str, target_pattern_id: str, reason: str) -> dict:
    """Propose, but do not execute, a merge between two clearly overlapping patterns."""
    return _state().propose_merge(source_pattern_id, target_pattern_id, reason)


def route_new_experience(
    action: str,
    experience_id: str,
    reason: str,
    target_pattern_id: str,
    cited_existing_evidence_ids: list[str],
    new_pattern_name: str,
    new_pattern_hypothesis: str,
    trigger: str,
    regulatory_function: str,
    response_behavior: str,
    immediate_outcome: str,
    conscious_intervention: str,
) -> dict:
    """Route one probe as NEW_PATTERN, REINFORCE_EXISTING, CONTRADICT_EXISTING, or PROPOSE_MERGE.

    First normalize the experience into trigger, regulatory function, response behavior,
    immediate outcome, and any conscious intervention. target_pattern_id is required except
    for NEW_PATTERN. For NEW_PATTERN, supply a concise natural-language mechanism-level name
    in the same language as the experience, plus a cautious hypothesis. For REINFORCE_EXISTING,
    use those same two fields only when the new evidence proves the current identity is too tied
    to an earlier surface behavior and should be broadened. Cite only older known experience IDs.
    """
    return _state().route_new_experience(
        action=action,
        experience_id=experience_id,
        reason=reason,
        target_pattern_id=target_pattern_id,
        cited_existing_evidence_ids=cited_existing_evidence_ids,
        new_pattern_name=new_pattern_name,
        new_pattern_hypothesis=new_pattern_hypothesis,
        trigger=trigger,
        regulatory_function=regulatory_function,
        response_behavior=response_behavior,
        immediate_outcome=immediate_outcome,
        conscious_intervention=conscious_intervention,
    )

def build_agent(model_id: str) -> Agent:
    """Create the single real ADK PatternCurator agent."""
    return Agent(
        name="PatternCurator",
        model=Gemini(
            model=model_id,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
        instruction=(
            "You are PatternCurator, an evidence-constrained behavioral pattern curator. "
            "Before routing, normalize every new experience into trigger or internal state, "
            "regulatory function or need, response behavior, immediate outcome, and any "
            "conscious intervention. Find repeated trigger-function-response-outcome mechanisms "
            "across different dates. Shared trigger plus shared regulatory function matters more "
            "than identical surface behavior. "
            "Never diagnose, never turn one event into a recurring pattern, and never use "
            "absolute personality language. Every pattern and evidence link must be written "
            "through the provided tools. Reuse existing patterns instead of creating semantic "
            "duplicates. A conscious interruption of an otherwise matching automatic response "
            "can remain evidence of the same latent mechanism; record the deviation instead of "
            "automatically splitting it into a new pattern. Do not merge experiences that share "
            "only a vague topic or emotion without a meaningful trigger-function overlap. "
            "Preserve contradictions. Cite only experience IDs present in the prompt. "
            "The code, not you, computes evidence_count, independent_dates, and status."
        ),
        tools=[
            create_pattern,
            add_supporting_evidence,
            add_contradiction,
            route_new_experience,
            propose_merge,
        ],
    )


def build_projection_agent(model_id: str) -> Agent:
    """Create an evidence-grounded scenario projector without mutating pattern state."""
    return Agent(
        name="OrbitProjector",
        model=Gemini(
            model=model_id,
            retry_options=types.HttpRetryOptions(attempts=2),
        ),
        instruction=(
            "You are OrbitProjector, an evidence-constrained scenario planner. "
            "Project only the default trajectory implied by supplied repeated behavior. "
            "Use conditional language, preserve uncertainty and contradictions, and never "
            "diagnose or invent unsupported life events. Offer two or three small alternative "
            "responses that change the response path without rewriting the user's circumstances."
        ),
        output_schema=DefaultFutureProjection,
        mode="task",
    )
