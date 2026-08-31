import type {
  AppState,
  ChangedOrbit,
  DefaultFutureProjection,
  FutureChoicePosition,
  RoutingResult,
  VisualState,
} from "./types";

const query = new URLSearchParams(window.location.search);
export const productMode = {
  seededDemo: query.get("demo") === "1",
  genesisDemo: query.get("genesis-demo") === "1",
  isolatedFresh: query.get("new") === "1",
};
const sessionKey = productMode.seededDemo
  ? "pattern-cosmos-seeded-demo-session"
  : productMode.genesisDemo
    ? "pattern-cosmos-genesis-demo-session"
    : productMode.isolatedFresh
      ? null
      : "pattern-cosmos-anonymous-session";
const storedSessionId = sessionKey ? window.localStorage.getItem(sessionKey) : null;
const sessionId = storedSessionId ?? `cosmos-${crypto.randomUUID().replaceAll("-", "")}`;
if (sessionKey && !storedSessionId) window.localStorage.setItem(sessionKey, sessionId);

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(hasBody && !(options?.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      "X-Cosmos-Session": sessionId,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(payload.detail ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export const api = {
  state: () => request<AppState>("/api/state"),
  startGenesis: () => request<AppState>("/api/genesis/start", { method: "POST" }),
  loadDemo: () => request<AppState>("/api/demo/load", { method: "POST" }),
  importFile: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ import_result: AppState["last_import"]; state: AppState }>("/api/import", {
      method: "POST",
      body,
    });
  },
  addExperience: (date: string, text: string) =>
    request<{ routing: RoutingResult; state: AppState }>("/api/experiences", {
      method: "POST",
      body: JSON.stringify({ date, text }),
    }),
  setVisualState: (patternId: string, visualState: VisualState) =>
    request<AppState>(`/api/patterns/${patternId}/visual-state`, {
      method: "POST",
      body: JSON.stringify({ visual_state: visualState }),
    }),
  createPrinciple: (patternId: string) =>
    request<{ state: AppState }>(`/api/patterns/${patternId}/principle`, {
      method: "POST",
    }),
  createProjection: (patternId: string) =>
    request<{ projection: DefaultFutureProjection; state: AppState; cached: boolean }>(
      `/api/patterns/${patternId}/projection`,
      { method: "POST" },
    ),
  confirmChangedOrbit: (
    patternId: string,
    alternativeId: string,
    futureChoicePosition: FutureChoicePosition,
    customResponse?: string,
  ) => request<{ changed_orbit: ChangedOrbit; state: AppState }>(
    `/api/patterns/${patternId}/changed-orbit`,
    {
      method: "POST",
      body: JSON.stringify({
        alternative_id: alternativeId,
        custom_response: customResponse,
        future_choice_position: futureChoicePosition,
      }),
    },
  ),
};
