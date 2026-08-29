from __future__ import annotations

from pydantic import BaseModel, Field


class AlternativeResponse(BaseModel):
    alternative_id: str = Field(min_length=3, max_length=48)
    response: str = Field(min_length=12, max_length=320)
    what_changed: str = Field(min_length=12, max_length=420)
    what_stayed_the_same: str = Field(min_length=8, max_length=320)
    likely_short_term_effect: str = Field(min_length=12, max_length=420)
    likely_long_term_compounding_effect: str = Field(min_length=12, max_length=520)


class DefaultFutureProjection(BaseModel):
    current_pattern: str = Field(min_length=4, max_length=240)
    repeated_trigger: str = Field(min_length=8, max_length=420)
    repeated_response: str = Field(min_length=8, max_length=420)
    observed_outcome: str = Field(min_length=8, max_length=520)
    one_year_default_trajectory: str = Field(min_length=12, max_length=620)
    three_year_default_trajectory: str = Field(min_length=12, max_length=620)
    likely_compounding_effect: str = Field(min_length=12, max_length=620)
    uncertainty_evidence_caveat: str = Field(min_length=12, max_length=520)
    evidence_ids: list[str] = Field(min_length=1, max_length=12)
    alternatives: list[AlternativeResponse] = Field(min_length=2, max_length=3)


class FutureChoicePosition(BaseModel):
    x: float = Field(ge=-8, le=8)
    y: float = Field(ge=-6, le=6)
    z: float = Field(ge=-4, le=4)


class ChangedOrbitInput(BaseModel):
    alternative_id: str = Field(min_length=3, max_length=48)
    future_choice_position: FutureChoicePosition
