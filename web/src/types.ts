export type VisualState = "nebula" | "constellation" | "black_hole";

export interface Experience {
  experience_id: string;
  source_id?: string;
  source_file?: string;
  source_line?: number;
  date: string;
  text: string;
  original_text?: string;
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
  model: string;
  model_calls: number;
}

export interface AppState {
  loaded: boolean;
  patterns: Pattern[];
  experiences: Experience[];
  merge_proposals: Array<Record<string, string>>;
  last_routing: RoutingResult | null;
  agent_call_count: number;
  model: string;
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
