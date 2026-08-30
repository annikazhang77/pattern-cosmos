export type VisualState = "nebula" | "constellation" | "black_hole";

export interface Experience {
  experience_id: string;
  source_id?: string;
  source_file?: string;
  source_line?: number;
  date: string;
  text: string;
  original_text?: string;
  mechanism?: ExperienceMechanism;
}

export interface ExperienceMechanism {
  trigger: string;
  regulatory_function: string;
  response_behavior: string;
  immediate_outcome: string;
  conscious_intervention: string;
}

export interface GenesisBirth {
  birth_id: string;
  sequence: number;
  phase: "birthing" | "routing" | "settling";
}

export interface Pattern {
  pattern_id: string;
  name: string;
  hypothesis: string;
  supporting_experience_ids: string[];
  contradicting_experience_ids: string[];
  evidence_count: number;
  independent_dates: string[];
  status: "possible" | "recurring";
  visual_state: VisualState;
  principle_draft: string | null;
}

export type RoutingAction =
  | "NEW_PATTERN"
  | "REINFORCE_EXISTING"
  | "CONTRADICT_EXISTING"
  | "PROPOSE_MERGE";

export interface RoutingResult {
  action: RoutingAction;
  target_pattern_id: string | null;
  experience_id: string;
  reason: string;
  cited_existing_evidence_ids: string[];
  mechanism: ExperienceMechanism;
  model: string;
  model_calls: number;
}

export interface AlternativeResponse {
  alternative_id: string;
  response: string;
  what_changed: string;
  what_stayed_the_same: string;
  likely_short_term_effect: string;
  likely_long_term_compounding_effect: string;
}

export interface DefaultFutureProjection {
  pattern_id: string;
  current_pattern: string;
  repeated_trigger: string;
  repeated_response: string;
  observed_outcome: string;
  one_year_default_trajectory: string;
  three_year_default_trajectory: string;
  likely_compounding_effect: string;
  uncertainty_evidence_caveat: string;
  evidence_ids: string[];
  alternatives: AlternativeResponse[];
  model: string;
  model_calls: number;
  generated_at: string;
}

export interface FutureChoicePosition {
  x: number;
  y: number;
  z: number;
}

export interface ChangedOrbit {
  pattern_id: string;
  alternative_id: string;
  future_choice_position: FutureChoicePosition;
  current_orbit: {
    trigger: string;
    response: string;
    observed_outcome: string;
  };
  changed_orbit: AlternativeResponse;
  confirmed_at: string;
}

export type InteractionMode = "READ_MODE" | "ORACLE_SEQUENCE" | "COSMIC_EVENT_MODE";
export type FortuneState = "unread" | "one_year" | "three_year";
export type OrbitState = "hidden" | "current" | "changed";

export interface OracleOrigin {
  x: number;
  y: number;
  size: number;
}

export interface OracleSequenceState {
  patternId: string;
  phase: "GATHER" | "OPENING" | "MIST" | "REVEAL";
  origin: OracleOrigin;
}

export interface CosmicEventState {
  kind: "BLACK_HOLE" | "CHANGE_ORBIT" | "CONSTELLATION";
  phase: "PREFRAME" | "PLAYING" | "SETTLED";
  patternId: string;
}

export interface AppState {
  loaded: boolean;
  patterns: Pattern[];
  experiences: Experience[];
  merge_proposals: Array<Record<string, string>>;
  last_routing: RoutingResult | null;
  agent_call_count: number;
  model: string;
  trajectory_projections: Record<string, DefaultFutureProjection>;
  changed_orbits: Record<string, ChangedOrbit>;
  persistence?: "firestore" | "local-json";
  last_import?: {
    source_file: string;
    parsed: number;
    imported: number;
    duplicates: number;
    skipped: Array<Record<string, string>>;
    actions: Array<Record<string, unknown>>;
  } | null;
}
