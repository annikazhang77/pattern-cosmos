# Pattern Cosmos

Pattern Cosmos is an evidence-linked personal pattern curator. It turns dated experiences into
careful hypotheses about recurring **trigger → response → outcome** pathways, keeps supporting and
contradicting moments attached, and renders each pattern as an explorable photographic nebula.

**Live demo:** https://pattern-cosmos-946174509894.us-central1.run.app

## The problem

Journals preserve moments, but recurring mechanisms remain hard to see across months of notes.
Ordinary AI summaries flatten history into themes or personality claims. Pattern Cosmos instead
treats every insight as a hypothesis that must earn evidence from independent dates.

## Why it is agentic

`PatternCurator` is a Google ADK agent, not a chat wrapper. Given a new experience, it inspects the
existing pattern state, cites older evidence, and calls a state-changing tool to choose exactly one
action:

- `NEW_PATTERN`
- `REINFORCE_EXISTING`
- `CONTRADICT_EXISTING`
- `PROPOSE_MERGE`

For a bounded Markdown/TXT import, it autonomously discovers only mechanisms supported by at least
three dates and writes the pattern/evidence graph through tools. Deterministic Python code—not the
model—computes evidence counts, independent dates, and recurring status. Black Hole status is always
a user decision.

## User flow

1. Load the sanitized demo or import a small UTF-8 `.md` / `.txt` file with explicit dates.
2. PatternCurator discovers evidence-backed recurring patterns.
3. Explore the resulting Pattern Cosmos; click a nebula to inspect exact evidence and contradiction.
4. Mark a pattern as Nebula, Constellation, or Black Hole.
5. Add one new experience and watch the agent route it into the existing evidence lifecycle.
6. Refresh: the anonymous demo session remains in Firestore.

Supported import boundaries are intentionally conservative:

```markdown
# 2026-01-12
A concrete event...

# 2026-02-18
Another concrete event...
```

Plain `YYYY-MM-DD` lines and a single Markdown frontmatter `date:` are also accepted. Entries without
a reliable date are skipped rather than guessed. Stable IDs are SHA-256-derived from source name,
date, and original text, so importing the same entry twice is idempotent.

## Google technologies

- **Vertex AI:** `gemini-3.7-flash`
- **Google Agent Development Kit:** ADK `2.8.0`
- **Cloud Run:** public React + FastAPI service in `us-central1`
- **Cloud Firestore:** anonymous-session state, experiences, patterns, evidence links, principles,
  and agent run logs

## Architecture

![Pattern Cosmos architecture](docs/architecture.svg)

The React/Three.js client talks to a FastAPI service on Cloud Run. FastAPI invokes the Google ADK
PatternCurator, which uses Gemini on Vertex AI and deterministic evidence tools. Firestore persists
the state independently of Cloud Run's ephemeral filesystem.

## Evidence and contradiction philosophy

- One event can create a **possible** hypothesis, never a recurring identity claim.
- A pattern becomes **recurring** only after 3+ supporting experiences on 3+ independent dates.
- Similar surface topics are not enough; the trigger-response-outcome mechanism must match.
- Contradiction is preserved alongside support rather than silently discarded.
- The UI says what the evidence supports, not what kind of person the user “is.”

## Local setup

Requirements: Python 3.11+, Node.js 20+, a Google Cloud project with Vertex AI access, and Application
Default Credentials.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
cd web
npm ci
npm run build
cd ..
$env:GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
$env:GOOGLE_CLOUD_LOCATION="global"
$env:GOOGLE_GENAI_USE_VERTEXAI="TRUE"
.\.venv\Scripts\python.exe -m uvicorn web_api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. Local mode uses local JSON. To test Firestore, create a native Firestore
database and set `$env:STATE_BACKEND="firestore"` before starting the server.

## Deployment

```powershell
gcloud services enable aiplatform.googleapis.com run.googleapis.com `
  firestore.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy pattern-cosmos --source . --region us-central1 `
  --allow-unauthenticated --concurrency 1 --timeout 900 --memory 1Gi `
  --set-env-vars "STATE_BACKEND=firestore,GOOGLE_CLOUD_LOCATION=global,PATTERN_AGENT_MODEL=gemini-3.7-flash"
```

The Cloud Run runtime service account needs `Vertex AI User` and `Cloud Datastore User` roles.

## Privacy and demo data

The deployed app and repository contain only synthetic/sanitized experiences. Private diary
experiments, credentials, local state, screenshots, and absolute local paths are excluded from both
Git and Cloud Build. Uploaded text is stored only in the importer's anonymous Firestore session;
there is no account system. Do not upload confidential records to the public demo.

The photographic renderer uses NASA/JPL-Caltech image `PIA14728` under the linked JPL image-use
policy. Attribution metadata is stored beside the asset in
`web/public/assets/nasa-lagoon-nebula-pia14728.source.json`.

## Repository map

- `web/` — React, TypeScript, React Three Fiber, frozen D Photographic Hybrid Cosmos
- `web_api.py` — FastAPI public API and anonymous session orchestration
- `pattern_agent/agent.py` — Google ADK PatternCurator and tool definitions
- `pattern_agent/state.py` — deterministic evidence lifecycle
- `pattern_agent/importer.py` — conservative dated Markdown/TXT parser
- `pattern_agent/firestore_store.py` — Firestore persistence adapter
- `docs/architecture.svg` — submission architecture diagram

## Future work (outside this hackathon MVP)

Full Obsidian sync, a complete journal editor, mobile apps, calendar/time-tracker integrations,
what-if simulations, astrology/birth-sky personalization, music generation, multi-user accounts, and
additional visual experiments are intentionally out of scope.

## Disclosure

The project was created during the hackathon submission period. Standard open-source frameworks,
AI coding assistance, and the attributed NASA/JPL image were used. The submitted product logic,
evidence model, agent tools, integration, and experience design were built for this entry.
