# Submission readiness — 2026-08-29

Official sources checked: [Rules](https://allthingsagentichackathon.devpost.com/rules) and [FAQ](https://allthingsagentichackathon.devpost.com/details/faqs).

## PASS

- Deadline verified: August 31, 2026 at 5:00 PM Pacific Time.
- Eligibility page does not list mainland China among excluded resident locations.
- Uses required Gemini 3.5+ model: Vertex AI `gemini-3.7-flash`.
- Uses a permitted Google agent framework: Google ADK `2.8.0`.
- Uses Google Cloud infrastructure: Cloud Run and Cloud Firestore.
- Public hosted demo is live and needs no login: https://pattern-cosmos-946174509894.us-central1.run.app
- Public smoke test passed: load sanitized demo, inspect evidence, real ADK/Gemini route, refresh, Firestore state retained.
- Dated `.md` / `.txt` import passed against the public service with stable IDs and duplicate safety.
- Architecture diagram exists at `docs/architecture.svg`.
- English description, technology disclosure, privacy note, local setup, and cloud spin-up instructions exist in `README.md`.
- Sanitized demo data only; private diary spike folders and credentials are excluded from Git and Cloud Build.
- Video storyboard fits 3:55 and includes proof-of-action plus Google Cloud proof.
- Project was created during the official submission period; pre-existing standard tools and the attributed NASA/JPL asset are disclosed.

## MISSING

- Public GitHub/GitLab/Bitbucket repository URL has not been created or submitted.
- Final demo video has not been recorded or uploaded publicly to YouTube/Vimeo.
- Devpost submission form still needs the final category selection, project description, hosted URL, repository URL, architecture diagram, and video URL.
- Optional bonus content/social post/additional Google model integrations are intentionally not done.

## BLOCKED

- GitHub publication is blocked by the locally configured `gh` account token being invalid. Re-login to the intended GitHub account, then create/push the prepared repository.

## Required submission facts

- Proposed category: **Taskmaster** (complete evidence-curation workflow, not a chatbot).
- Hosted project: public URL strongly encouraged; provided.
- Code repository: public or private. If private, grant access to `testing@devpost.com` and `cloudhackathons@google.com`.
- Architecture diagram: required; provided.
- Demo video: public YouTube/Vimeo, English or English subtitles, no more than 4 minutes. Only the first 4 minutes may be evaluated.
- Video must visibly prove the backend runs on Google Cloud and show an unedited live agent action.
- Submission cannot be edited after the deadline; keep demo, repo, and live service unchanged during judging.
