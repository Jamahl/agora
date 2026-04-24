# Agora — Engineering Task List (MVP)

**Source:** `AGORA_PRD.md` v0.1, `interview-agent.md` v0.1
**Last updated:** 2026-04-24
**Owner:** Jamahl McMurran
**Repo:** https://github.com/Jamahl/agora
**Hosting:** Local only (Docker Compose). Retell webhooks reach localhost via a tunnel (ngrok / Cloudflare Tunnel). No Sentry, no Sauron, no Vercel, no Railway/Fly in MVP.

## How to read this

Each task covers **one concern**. Tasks are ordered by dependency, grouped by PRD §8 phase. Every task has:

- **Concern** — what this task is about (one sentence)
- **Actions** — what the engineer does
- **Acceptance** — how we verify it's done (must be demonstrable)
- **Depends on** — prior task IDs required before starting

Where a task would sprawl, it's split. Prefer many small PRs over a few large ones.

---

## Phase 0 — Project setup

### T-001 — Monorepo scaffold
- **Concern:** One repo layout that holds the Next.js app, the FastAPI backend, the shared prompts, and the infra config.
- **Actions:**
  - Create `apps/web` (Next.js 15 + TS + App Router).
  - Create `apps/api` (FastAPI + Python 3.12, `uv` or `poetry` for deps).
  - Create `packages/prompts/` and move `interview-agent.md` into it.
  - Root `README.md` documents layout and how to boot each service.
- **Acceptance:**
  - `apps/web` boots via `pnpm dev` and shows a placeholder page at `http://localhost:3000`.
  - `apps/api` boots via `uvicorn app.main:app --reload` and returns `{"status":"ok"}` at `GET /health`.
  - `packages/prompts/interview-agent.md` exists and matches the current `interview-agent.md`.
- **Depends on:** —

### T-002 — Docker Compose for local dev
- **Concern:** One command to bring up Postgres 16 + pgvector + the two apps.
- **Actions:**
  - `docker-compose.yml` with services: `postgres`, `api`, `web`.
  - Use `pgvector/pgvector:pg16` image.
  - Volume-mount source for hot reload.
  - `.env.example` with all required env vars; `.env` git-ignored.
- **Acceptance:**
  - `docker compose up` from a clean checkout brings the stack up.
  - `psql` into Postgres and `CREATE EXTENSION vector;` succeeds.
  - `apps/web` can hit `apps/api` at `http://api:8000/health` from inside the compose network.
- **Depends on:** T-001

### T-003 — Env and secrets loading
- **Concern:** Every service reads its config from env vars; no hardcoded secrets.
- **Actions:**
  - Backend uses `pydantic-settings` for typed config.
  - Frontend uses `NEXT_PUBLIC_*` for client vars, server-only for secrets.
  - Document every env var in `.env.example` with a one-line description.
  - Add required vars: `OPENAI_API_KEY`, `RETELL_API_KEY`, `COMPOSIO_API_KEY`, `DATABASE_URL`, `ADMIN_COOKIE_SECRET`.
- **Acceptance:**
  - Missing required env var causes the API to fail boot with a clear error naming the variable.
  - `.env.example` lines up 1:1 with the `Settings` class.
- **Depends on:** T-001

### T-004 — CI (lint + type + test)
- **Concern:** Every PR runs lint/type/test on both apps.
- **Actions:**
  - GitHub Actions workflow: `pnpm lint`, `pnpm typecheck`, `pnpm test` for web; `ruff`, `mypy`, `pytest` for api.
  - Fail the job on any non-zero exit.
- **Acceptance:**
  - A PR with an obvious type error in `apps/api` fails the `api-typecheck` job.
  - A green CI run on `main` is visible in the Actions tab.
- **Depends on:** T-001

---

## Phase 1 — Data model

### T-010 — Alembic init
- **Concern:** Schema migrations are versioned in git and run on boot.
- **Actions:**
  - `alembic init migrations` in `apps/api`.
  - Configure `env.py` to read `DATABASE_URL` from settings.
  - Add `alembic upgrade head` to the API boot script for dev.
- **Acceptance:**
  - `alembic upgrade head` against an empty DB creates the `alembic_version` table.
  - `alembic downgrade base` drops it cleanly.
- **Depends on:** T-002, T-003

### T-011 — Migration: `company` + `admin_session`
- **Concern:** Persist the single-company MVP profile and the crude session cookie.
- **Actions:**
  - `company`: `id`, `name`, `industry`, `description`, `cadence_days` (default 14), `timezone`, `window_start_hour`, `window_end_hour`, `weekdays`, `hr_contact`, `composio_connection_id`, `onboarding_completed_at`, `created_at`.
  - `admin_session`: `id`, `company_id`, `cookie_token` (unique), `created_at`, `last_seen_at`.
  - Foreign key `admin_session.company_id → company.id`.
- **Acceptance:**
  - Migration applies cleanly up and down.
  - Raw SQL `INSERT` into both tables succeeds.
- **Depends on:** T-010

### T-012 — Migration: `employee`
- **Concern:** Employee roster with manager hierarchy.
- **Actions:**
  - Columns per §5: `id`, `company_id`, `name`, `email`, `job_title`, `department`, `linkedin_url`, `manager_id` (self-fk nullable), `memory_summary`, `status` (`active|archived`), `created_at`.
  - Unique index on `(company_id, email)`.
- **Acceptance:**
  - Inserting two employees with the same email in the same company fails.
  - Setting `manager_id` to another employee's id succeeds; setting it to own id fails (CHECK constraint).
- **Depends on:** T-011

### T-013 — Migration: `okr` + `key_result` with vector columns
- **Concern:** OKRs with pgvector embeddings for similarity tagging.
- **Actions:**
  - `okr`: `id`, `company_id`, `objective`, `status`, `created_at`, `embedding vector(3072)`.
  - `key_result`: `id`, `okr_id`, `description`, `target_metric`, `current_value`, `status`, `embedding vector(3072)`.
  - IVFFlat or HNSW index on both `embedding` columns.
- **Acceptance:**
  - `CREATE EXTENSION vector` is present (from T-002); migration uses `vector(3072)` without error.
  - `ORDER BY embedding <=> '[...]'::vector` returns rows.
- **Depends on:** T-011

### T-014 — Migration: `interview` + `insight` + `interview_sentiment`
- **Concern:** Per-interview records plus extracted insights and sentiment.
- **Actions:**
  - `interview` per §5: fk `employee_id`, `scheduled_at`, `started_at`, `ended_at`, `status`, `link_token`, `retell_call_id`, `transcript_url`, `recording_url`, `raw_transcript_json`, `cleaned_transcript_json`, `corrected_summary`, `sensitive_omitted`, `research_request_id` (nullable fk, created in T-017).
  - `insight`: fk `interview_id`, `employee_id`, `type` (enum of taxonomy), `content`, `direct_quote`, `severity`, `confidence`, `created_at`, `embedding vector(3072)`, plus `review_state` (`live|needs_review|suppressed|omitted`).
  - `interview_sentiment`: `interview_id` (pk), `morale`, `energy`, `candor`, `urgency`, `notes`.
- **Acceptance:**
  - Enum for `insight.type` enforces the PRD taxonomy (§4.4 Stage 2).
  - Sentiment row cannot exist without a matching interview (fk).
- **Depends on:** T-012

### T-015 — Migration: `insight_okr_tag`
- **Concern:** Many-to-many insight↔OKR with similarity score.
- **Actions:**
  - Columns: `insight_id` (fk), `okr_id` (fk), `similarity float`.
  - Primary key `(insight_id, okr_id)`.
- **Acceptance:**
  - Composite PK prevents duplicate tags.
  - Deleting an insight cascades its tags.
- **Depends on:** T-013, T-014

### T-016 — Migration: `theme`
- **Concern:** Output of nightly clustering.
- **Actions:**
  - `theme`: `id`, `label`, `summary`, `member_insight_ids` (`int[]` or a join table), `created_at`.
- **Acceptance:**
  - Inserting a theme referencing valid insight ids succeeds.
  - Orphan insight ids are allowed (clustering is not fk-strict).
- **Depends on:** T-014

### T-017 — Migration: `research_request`
- **Concern:** Store research-request plans and progressive reports.
- **Actions:**
  - Columns: `id`, `question`, `status` (`draft|approved|running|complete|rejected`), `plan_json jsonb`, `report_json jsonb`, `created_at`, `approved_at`.
  - Add the `research_request_id` fk on `interview` now that the table exists.
- **Acceptance:**
  - Status enum rejects unknown values.
  - An `interview` row can reference a `research_request`.
- **Depends on:** T-014

### T-018 — Migration: `admin_alert` + `notion_page` + `chat_message`
- **Concern:** Admin alerts, Notion-indexed context, and leadership chat history.
- **Actions:**
  - `admin_alert`: `id`, `company_id`, `category`, `summary`, `status` (`unread|acknowledged`), `created_at`, `acknowledged_at`.
  - `notion_page`: `id`, `company_id`, `notion_page_id`, `chunk_index`, `title`, `content`, `embedding vector(3072)`.
  - `chat_message`: `id`, `company_id`, `role` (`user|assistant|system`), `content`, `citations_json jsonb`, `created_at`.
  - Unique constraint on `notion_page (company_id, notion_page_id, chunk_index)`.
- **Acceptance:**
  - Unread alerts can be inserted and later updated to `acknowledged`.
  - Unique constraint blocks duplicate Notion chunks per company.
  - `citations_json` accepts an array and can be queried via `jsonb` operators.
- **Depends on:** T-011

---

## Phase 2 — Admin session and onboarding

### T-020 — Admin session cookie middleware
- **Concern:** First visit writes a cookie that identifies the admin; later requests are bound to the company.
- **Actions:**
  - FastAPI dependency that reads `agora_admin` cookie; if missing, 401.
  - `POST /admin/session/bootstrap` creates `company` + `admin_session` if no cookie exists, sets httpOnly signed cookie.
  - Next.js middleware that redirects unauthenticated requests to the onboarding wizard.
- **Acceptance:**
  - Fresh browser visit lands on the onboarding wizard.
  - After bootstrapping, reload preserves the session; dev tools show an httpOnly cookie.
  - Clearing the cookie and reloading returns the user to onboarding.
- **Depends on:** T-011

### T-021 — Onboarding step 1: company profile
- **Concern:** Capture name, industry, and one-paragraph description.
- **Actions:**
  - `POST /admin/company` validates required fields.
  - Wizard UI step 1 with form; Next → persists, moves to step 2.
- **Acceptance:**
  - Submitting blank name shows a field-level validation error.
  - Valid submit creates one `company` row and advances the wizard.
- **Depends on:** T-020

### T-022 — Employee CRUD API
- **Concern:** Server-side add/edit/archive for employees.
- **Actions:**
  - `GET /employees`, `POST /employees`, `PATCH /employees/:id`, `POST /employees/:id/archive`.
  - Validate email format; unique within company.
  - Filter `GET` by `status`.
- **Acceptance:**
  - Duplicate email returns 409 with a clear message.
  - Archive sets `status=archived` but does not delete.
  - Integration test: create 3, archive 1, list active returns 2.
- **Depends on:** T-012, T-020

### T-023 — Employee roster UI
- **Concern:** Admin can view, add, edit, archive employees in the dashboard.
- **Actions:**
  - Table with inline actions.
  - Modal for add/edit.
  - Confirmation dialog for archive.
- **Acceptance:**
  - Manual test: add a new employee, it appears in the table without reload.
  - Archive removes from the default view; a "Show archived" toggle reveals them.
- **Depends on:** T-022

### T-024 — CSV import for employees
- **Concern:** Bulk-add employees from a CSV.
- **Actions:**
  - Upload widget accepts CSV with headers `name,email,job_title,department,linkedin_url,manager_email`.
  - Parser maps `manager_email` → `manager_id` by lookup; unresolved managers surface as warnings, not errors.
  - Preview table before commit.
- **Acceptance:**
  - A 20-row CSV imports in one click; all rows visible in the roster.
  - A row with invalid email is rejected with row-level error; valid rows still import.
- **Depends on:** T-023

---

## Phase 3 — OKRs

### T-030 — OKR CRUD API
- **Concern:** Persist objectives + key results with embeddings.
- **Actions:**
  - `POST /okrs`, `PATCH /okrs/:id`, `GET /okrs`, `POST /okrs/:id/key-results`.
  - On write, compute embedding of `objective + "\n" + key_results.join("\n")` with `text-embedding-3-large`, store on `okr` row. Also embed each key result separately.
  - Embedding is written in a background task; row is persisted immediately.
- **Acceptance:**
  - Creating an OKR returns 201 and persists immediately.
  - Within ~2s, the row has a non-null `embedding` column.
  - Re-saving changed text re-embeds.
- **Depends on:** T-013, T-020

### T-031 — OKR "paste and parse" extractor
- **Concern:** Admin pastes an OKR doc; LLM parses it into the structured form.
- **Actions:**
  - `POST /okrs/extract` accepts raw text, returns `{ objectives: [{ objective, key_results: [{ description, target_metric? }] }] }`.
  - Uses GPT-4.1 with structured output schema.
  - Temperature 0; no hallucinated KRs.
- **Acceptance:**
  - Pasting a doc with 3 objectives returns exactly 3 objectives.
  - Admin confirms/edits before commit; commit writes via T-030.
  - Unit test: a fixture doc returns the expected structured output.
- **Depends on:** T-030

### T-032 — Onboarding step 2: OKRs UI
- **Concern:** Wizard step for OKR entry with paste-and-parse.
- **Actions:**
  - Textarea + "Parse" button (calls T-031).
  - Editable preview list.
  - "Save and continue" commits via T-030.
- **Acceptance:**
  - End-to-end: paste → parse → edit one KR → save → OKRs visible on a settings page.
- **Depends on:** T-031

### T-033 — Onboarding step 5: cadence + time window
- **Concern:** Capture global cadence and interview time window.
- **Actions:**
  - Form fields: `cadence_days` (select 7/14/21/28), `timezone`, `window_start_hour`, `window_end_hour`, `weekdays` (multi-select).
  - Persist to `company`.
- **Acceptance:**
  - Defaults match PRD (14 days, Mon–Fri, 9–17, company tz).
  - Saved values round-trip through the settings page.
- **Depends on:** T-021

### T-034 — Onboarding step 6: go-live confirmation
- **Concern:** Final review before the first round schedules.
- **Actions:**
  - Summary screen showing company, N OKRs, N employees, cadence.
  - "Go live" button triggers the first scheduling run (T-062).
- **Acceptance:**
  - Clicking Go Live marks the wizard complete; subsequent visits skip it.
  - The scheduler creates `interview` rows and Google draft-ready invite payloads for each active employee within 1 minute.
- **Depends on:** T-022, T-032, T-033, T-062

---

## Phase 4 — Interview loop

### T-040 — Retell agent provisioning
- **Concern:** Create the Retell agent with our system prompt and dynamic variables.
- **Actions:**
  - One-off script `scripts/provision_retell_agent.py` uploads the prompt from `packages/prompts/interview-agent.md`.
  - Store resulting `retell_agent_id` in env config.
  - Document re-provisioning on prompt changes (and wire a CI check later).
- **Acceptance:**
  - Running the script prints a Retell `agent_id`.
  - The agent dashboard in Retell shows our prompt text.
- **Depends on:** T-001, T-003

### T-041 — Interview token generator
- **Concern:** Each scheduled interview has a unique unguessable URL.
- **Actions:**
  - When an `interview` row is created, generate a 32-byte random `link_token` and store on the row.
  - Endpoint `GET /interviews/by-token/:token` returns minimal interview metadata if token is valid and not expired.
  - Expiry: token valid from `scheduled_at - 1h` to `scheduled_at + 24h`.
- **Acceptance:**
  - Unknown token returns 404.
  - Expired token returns 410.
  - Valid token returns employee first name, company name, scheduled time.
- **Depends on:** T-014

### T-042 — `/interview/[token]` page
- **Concern:** The single page an employee lands on.
- **Actions:**
  - SSR fetch via T-041 to show the greeting.
  - "Start" button that triggers T-043.
  - Final state after call end: "Done. Next check-in: [date]."
- **Acceptance:**
  - Visiting a valid link shows the greeting with the employee's first name.
  - Visiting an expired link shows a clear expired message.
  - Mic permission prompt appears on Start.
- **Depends on:** T-041

### T-043 — Retell web call creation
- **Concern:** Backend builds dynamic variables and creates a Retell web call session.
- **Actions:**
  - `POST /interviews/:id/start` builds:
    - `employee_name`, `company_name`, `company_description`, `is_first_interview`, `memory_summary` (see T-050), `active_okrs` (joined text), `hr_contact` (from company settings), `research_context` (if linked to a research request).
  - Calls Retell Web Call API to create the call; returns `call_id` and the Retell web-call access token to the frontend.
  - Writes `retell_call_id` and `started_at` onto the interview row.
- **Acceptance:**
  - Starting a call returns within ~1s.
  - Retell dashboard shows the call with dynamic vars populated.
- **Depends on:** T-040, T-042

### T-044 — Retell webhook receiver with signature verification
- **Concern:** Only Retell can post to us; transcripts land reliably.
- **Actions:**
  - `POST /webhooks/retell`.
  - Verify signature per Retell docs; reject on mismatch.
  - Idempotent by `retell_call_id`.
  - On `call_ended`, store raw transcript JSON + cleaned transcript JSON + recording URL on the interview row, enqueue synthesis via FastAPI `BackgroundTasks`.
- **Acceptance:**
  - A request without a valid signature returns 401.
  - A replayed webhook does not create duplicate rows.
  - After a real call, the interview row has `ended_at`, `transcript_url`, and `status=completed`.
- **Depends on:** T-043

### T-045 — Interview function-call handlers
- **Concern:** The agent's tool calls (mark_sensitive_*, trigger_admin_alert, correct_summary, end_call) are handled.
- **Actions:**
  - Register functions with Retell per their custom function docs.
  - Backend endpoints:
    - `mark_sensitive_omit(label)` → writes a span marker on the interview with `sensitive_omitted=true`.
    - `mark_sensitive_flag_for_review(paraphrase)` → inserts an insight with `review_state=needs_review`.
    - `trigger_admin_alert(category, summary)` → creates an alert row and prepares an admin email draft in the connected Google account.
    - `correct_summary(updated_summary)` → stores on the interview row for synthesis to pick up.
    - `end_call` → no-op server-side; Retell handles termination.
- **Acceptance:**
  - Simulating each function call via Retell's test harness hits the right endpoint and writes the expected row.
  - Unit tests for each handler.
- **Depends on:** T-044

### T-046 — Synthesis stage 1: transcript cleanup
- **Concern:** Store raw + a cleaned, speaker-tagged transcript.
- **Actions:**
  - Worker pulls the diarized transcript from Retell.
  - Store raw JSON; produce `cleaned_transcript` with speaker labels and timestamps, filler words optionally removed.
- **Acceptance:**
  - `interview.raw_transcript_url` and `interview.cleaned_transcript` are both populated.
  - Cleaned transcript has `speaker` and `ts` on every segment.
- **Depends on:** T-044

### T-047 — Synthesis stage 2: insight extraction
- **Concern:** One LLM call extracts a typed list of insights.
- **Actions:**
  - GPT-4.1 with structured output; schema per PRD §4.4 Stage 2.
  - Persist each insight row with `review_state=live` unless flagged by T-045.
  - Use a fixed prompt stored in `packages/prompts/synthesis.md`.
- **Acceptance:**
  - A fixture transcript produces a deterministic insight list.
  - Every inserted insight has non-null `type`, `content`, `severity`, `confidence`.
- **Depends on:** T-046

### T-048 — Synthesis stage 3: OKR tagging via cosine similarity
- **Concern:** Tag each insight with relevant OKRs.
- **Actions:**
  - Embed each insight's `content`.
  - Query top-K OKRs by cosine distance in pgvector.
  - Insert `insight_okr_tag` rows where `similarity >= 0.55`.
  - Threshold configurable in company settings.
- **Acceptance:**
  - An insight clearly about "payments migration" gets tagged to an OKR about payments and not to unrelated OKRs.
  - Zero matches is allowed and leaves no tag rows.
- **Depends on:** T-030, T-047

### T-049 — Synthesis stage 4: sentiment scoring
- **Concern:** Interview-level morale/energy/candor/urgency.
- **Actions:**
  - GPT-4.1 call over the cleaned transcript, structured output with 4 integer fields 1–5 + `notes`.
  - Insert one `interview_sentiment` row.
- **Acceptance:**
  - One row per completed interview.
  - All 4 scores within 1–5.
- **Depends on:** T-046

### T-050 — Synthesis stage 5: memory write + per-employee rollup
- **Concern:** Produce the `memory_summary` used on next interview's opening.
- **Actions:**
  - Job (or inline at end of synthesis) builds a structured summary from the last 2–3 interviews: open threads, prior wins, recurring frustrations.
  - Stored on `employee.memory_summary` and versioned.
- **Acceptance:**
  - After an interview completes, `employee.memory_summary` is non-empty and references that interview's key points.
  - T-043 uses this value for `{{memory_summary}}` on the next call.
- **Depends on:** T-047, T-049

### T-051 — Admin review queue for flagged insights
- **Concern:** Insights with `review_state=needs_review` must be admin-approved before surfacing.
- **Actions:**
  - Dashboard page `/review` lists pending insights with the paraphrase, employee, interview link, and 2 buttons: **Approve** (→ `live`), **Suppress** (→ `suppressed`).
  - Only `live` insights show in dashboards and chat RAG.
- **Acceptance:**
  - An insight flagged via T-045 shows up in `/review` and nowhere else.
  - Approving it makes it visible on the employee timeline and OKR view.
  - Suppressing it removes it from the queue without deletion.
- **Depends on:** T-045, T-047

### T-052 — Hard-escalation admin alert
- **Concern:** Harassment/discrimination/self-harm/misconduct trigger an out-of-band alert.
- **Actions:**
  - Handler for `trigger_admin_alert` (T-045) prepares a Gmail draft in the admin's connected Google account and shows an in-app alert banner.
  - Dashboard banner component shows unread alerts until acknowledged.
- **Acceptance:**
  - Calling the tool creates an admin email draft within 30s.
  - Banner appears on next dashboard load; clicking "Acknowledge" marks it read.
- **Depends on:** T-045

---

## Phase 5 — Scheduling

### T-060 — APScheduler boot with Postgres jobstore
- **Concern:** Scheduler runs inside the FastAPI process and survives restarts.
- **Actions:**
  - `apscheduler` with `SQLAlchemyJobStore` pointed at `DATABASE_URL`.
  - Start on API boot; expose `/admin/scheduler/status` to check health.
- **Acceptance:**
  - Restarting the API does not duplicate jobs.
  - `/admin/scheduler/status` returns next run times.
- **Depends on:** T-002

### T-061 — Slot picker
- **Concern:** Given an employee and a window, choose a non-conflicting interview slot.
- **Actions:**
  - Pure function: inputs (timezone, allowed weekdays, hour window, existing `scheduled_at` rows); output (next free 20-minute slot ≥ now + 1h).
  - Avoid collisions with the same employee's other interviews.
- **Acceptance:**
  - Unit tests cover: empty calendar, full day, weekend skip, timezone conversion across DST.
- **Depends on:** —

### T-062 — Daily cadence scan job
- **Concern:** Once a day, schedule interviews for anyone whose last completed interview was > `cadence_days` ago.
- **Actions:**
  - APScheduler job, default `03:00` company tz.
  - For each active employee, pick slot via T-061, write `interview` row with `status=scheduled`, generate token (T-041), enqueue draft preparation (T-063).
- **Acceptance:**
  - On a seeded DB (10 employees, last interview 20 days ago), one run creates 10 scheduled rows.
  - Running again within 24h is a no-op (idempotent via last-scheduled check).
- **Depends on:** T-041, T-060, T-061

### T-063 — `.ics` generation + manual Google email draft preparation
- **Concern:** Scheduled interviews are prepared as real calendar-ready emails from the admin's Google account.
- **Actions:**
  - Build an RFC 5545 `.ics` with `METHOD:REQUEST`, unique `UID` per interview, organizer = the company admin, attendee = employee.
  - Subject: "Quick check-in with Agora"; description includes the tokenized link.
  - Create a Gmail draft via the connected Google account with the `.ics` attached; the admin reviews and sends it manually.
- **Acceptance:**
  - Gmail draft is created with the correct subject, body, and `.ics` attachment.
  - After manual send, the email lands in a Gmail inbox and shows a native calendar prompt on click.
  - The event, when accepted, shows on the employee's Google/Outlook calendar at the right time.
- **Depends on:** T-062

### T-064 — No-show handling
- **Concern:** Employees miss calls; the system recovers automatically.
- **Actions:**
  - Reminder draft is prepared 15 minutes before `scheduled_at` in the connected Google account.
  - If `status=scheduled` 30 minutes after `scheduled_at`, mark `no_show`, prepare a "let's reschedule" draft with a self-serve reschedule link (picks next free slot).
  - After 2 consecutive no-shows, notify the admin.
- **Acceptance:**
  - Simulated no-show creates the reschedule draft.
  - Admin receives a notification after two no-shows.
- **Depends on:** T-062, T-063

---

## Phase 6 — Dashboard

### T-070 — Dashboard shell + navigation
- **Concern:** Shared layout with sidebar (Home, Departments, OKRs, Employees, Themes, Research, Settings) and chat dock.
- **Actions:**
  - App Router layout at `/dashboard`.
  - Placeholder pages for each nav entry.
  - Active-state styling.
- **Acceptance:**
  - Every nav item routes to its placeholder.
  - Layout does not re-mount on navigation (client components stay alive).
- **Depends on:** T-020

### T-071 — Home: this-week hero strip
- **Concern:** Top-of-page counters for interviews, blockers, wins.
- **Actions:**
  - `GET /dashboard/home/summary` returns the 3 counts for the last 7 days.
  - Component renders three tiles.
- **Acceptance:**
  - With seeded data, counts match a hand-counted SQL query.
- **Depends on:** T-047

### T-072 — Home: top blockers module
- **Concern:** Ranked list of active blockers.
- **Actions:**
  - Ranking = `severity × frequency × recency_decay`; recency_decay is `exp(-age_days / 14)`.
  - Group by similar `content` via embedding cosine ≥ 0.8 to dedupe close duplicates.
  - Show top 5 with employee attribution and severity badge.
- **Acceptance:**
  - A seeded dataset with a known ranking returns the expected order.
  - Clicking a blocker links to the source interview.
- **Depends on:** T-047

### T-073 — Home: OKR health module
- **Concern:** Per-OKR signal score.
- **Actions:**
  - Signal score: combine `insight volume (last 14d) × average severity` and `sentiment trend for insights tagged to the OKR`.
  - Render one row per OKR with traffic-light color.
- **Acceptance:**
  - An OKR with many high-severity blockers shows red; one with none shows green.
- **Depends on:** T-048, T-049

### T-074 — Home: sentiment trend module
- **Concern:** Company-wide morale/energy/candor over 90 days.
- **Actions:**
  - Line chart (recharts), three series.
  - Source: aggregated `interview_sentiment`.
- **Acceptance:**
  - Hover on a point shows the date and value.
  - Empty state when fewer than 3 interviews exist.
- **Depends on:** T-049

### T-075 — Home: emerging themes stub
- **Concern:** Wire a slot for themes now; real data arrives in T-081.
- **Actions:**
  - Placeholder component that reads from T-081 when themes exist.
- **Acceptance:**
  - Empty state "Themes show up after your second week of interviews."
- **Depends on:** T-070

### T-076 — Department view
- **Concern:** Same modules as Home, filtered to a department.
- **Actions:**
  - Route `/dashboard/departments/:dept`.
  - Reuse T-072, T-073, T-074 with a `department` filter.
  - Add "Upcoming interviews" panel for that department.
- **Acceptance:**
  - Switching departments updates all modules.
  - Upcoming list shows the next 10 scheduled interviews for the department.
- **Depends on:** T-072, T-073, T-074

### T-077 — OKR view
- **Concern:** Everything tagged to a single OKR.
- **Actions:**
  - Route `/dashboard/okrs/:id`.
  - Sections: insights (ranked by severity), signal sentiment, attribution list, AI summary.
  - AI summary: one GPT-4.1 call, "biggest risk based on N interviews", cached 1h.
- **Acceptance:**
  - Clicking an insight opens the source transcript excerpt.
  - Refreshing re-uses the cache until TTL expires.
- **Depends on:** T-048

### T-078 — Employee view
- **Concern:** Per-person timeline of interviews and recurring themes.
- **Actions:**
  - Route `/dashboard/employees/:id`.
  - Cards for each interview: date, sentiment, key insights, collapsed transcript.
  - "Recurring themes" = clusters with ≥ 3 insights from this employee.
- **Acceptance:**
  - Expanding a card reveals the full cleaned transcript.
  - Recurring themes are empty when the employee has only one interview.
- **Depends on:** T-046, T-049

### T-079 — Archived employees list
- **Concern:** Keep historical data for archived employees visible.
- **Actions:**
  - `/dashboard/employees?show=archived` renders the list.
  - Timeline still works for archived employees.
- **Acceptance:**
  - Archiving removes them from the primary list but preserves their timeline.
- **Depends on:** T-078

### T-080 — Themes view
- **Concern:** Browse emergent theme clusters.
- **Actions:**
  - Route `/dashboard/themes`.
  - List clusters with label, member count, date range; drill-in shows member insights.
- **Acceptance:**
  - Empty state when no clustering has run.
  - Labels make sense (sanity-check against fixture data).
- **Depends on:** T-081

### T-081 — Nightly theme clustering job
- **Concern:** Cluster the last 30 days of insights into themes.
- **Actions:**
  - APScheduler job at `02:00`.
  - Run HDBSCAN on insight embeddings.
  - For each cluster, GPT-4.1 generates a short `label` and `summary`.
  - Upsert into `theme` replacing the previous day's output.
- **Acceptance:**
  - After seeding 30 days of insights, the job produces ≥ 1 theme.
  - Re-running is idempotent for the same day.
- **Depends on:** T-016, T-047

---

## Phase 7 — Leadership chat and research

### T-090 — Chat dock UI
- **Concern:** Persistent sidebar on every dashboard page.
- **Actions:**
  - Collapsible right-side panel with message list + input.
  - Scope indicator: "Asking about: Home" / "Asking about: OKR X".
  - Store conversation in `chat_message`.
- **Acceptance:**
  - Messages survive page navigation within the dashboard.
  - Scope changes as the route changes.
- **Depends on:** T-018, T-070

### T-091 — Chat Mode A: RAG over insights and transcripts
- **Concern:** Answer from memory by default.
- **Actions:**
  - Embed user question, top-K search over `insight.embedding` and `notion_page.embedding` (when present), also join to `interview` for excerpts.
  - Apply scope filter (OKR id, department, employee id) from T-090.
  - GPT-4.1 generates the answer with inline citations.
- **Acceptance:**
  - "What are the biggest blockers this week?" returns a paragraph with at least 2 cited insights.
  - Citations are clickable and link to the source interview/insight.
- **Depends on:** T-047, T-090

### T-092 — Chat escalation to Mode B
- **Concern:** Detect when memory can't answer; offer research.
- **Actions:**
  - Classifier pass decides "can answer from memory" vs "needs research".
  - If research: response includes a proposed plan (T-094).
- **Acceptance:**
  - Seeded test: a question that requires unrecorded info returns a research plan, not a bogus answer.
- **Depends on:** T-091

### T-093 — Research agent with OpenAI Agents SDK
- **Concern:** The one real agent that plans, runs, and reports.
- **Actions:**
  - Tools: `list_employees`, `schedule_interview`, `read_interview_results`.
  - Plan prompt: produce the plan object (question, selected employees with reasoning, ETA).
- **Acceptance:**
  - Unit test: given a question and a seeded roster, the agent picks a plausible subset with reasoning.
  - Agent cannot call `schedule_interview` before approval (permission guard).
- **Depends on:** T-022

### T-094 — Research plan approval UI
- **Concern:** Admin reviews the proposed plan before anyone is interviewed.
- **Actions:**
  - Page at `/dashboard/research/:id`.
  - Show plan with editable list; buttons: **Approve**, **Approve with edits**, **Reject**.
- **Acceptance:**
  - Approve changes status to `approved` and triggers T-095.
  - Reject records reason.
- **Depends on:** T-017, T-093

### T-095 — One-off research interview scheduling
- **Concern:** Approved plans schedule tailored interviews outside normal cadence.
- **Actions:**
  - For each selected employee, create `interview` row with `research_request_id` set.
  - `research_context` dynamic variable flows into the Retell prompt (see §4.3 in prompt).
  - Still uses the same `.ics` + manual Google draft pipeline.
- **Acceptance:**
  - An approved plan creates N interviews within 1 minute.
  - Those interviews do not count against or bump the regular cadence cycle.
- **Depends on:** T-043, T-063

### T-096 — Progressive research report builder
- **Concern:** Report updates as interviews complete.
- **Actions:**
  - On synthesis completion for an interview tied to a research request, regenerate the report JSON: exec summary, findings by theme, recommended actions, supporting quotes, interview links.
  - Store in `research_request.report_json`.
- **Acceptance:**
  - After 2 of 5 interviews, the report reflects 2 sources; after 5, all 5.
  - Report cites interview URLs.
- **Depends on:** T-047, T-095

### T-097 — Research completion notification
- **Concern:** Tell the admin when the report is "ready enough to read".
- **Actions:**
  - Threshold (default 75%) configurable per research request.
  - On threshold, create a Gmail draft in the connected Google account and create an in-app banner.
- **Acceptance:**
  - Hitting the threshold creates exactly one draft per request.
  - Further completions update the report but do not re-notify.
- **Depends on:** T-096

---

## Phase 8 — Composio integrations

### T-100 — Composio OAuth flow
- **Concern:** Admin can connect Google Workspace and Notion via Composio during onboarding/settings.
- **Actions:**
  - Onboarding/settings integration UI with "Connect Google Workspace" and "Connect Notion" actions.
  - Server starts the Composio OAuth flow(s), receives callback, stores connection metadata on `company`.
- **Acceptance:**
  - Clicking Connect Google Workspace → consent screen → callback lands on the app with "Connected" status.
  - Clicking Connect Notion → consent screen → callback lands on the app with "Connected" status.
  - Revoke/disconnect state is surfaced in the UI for both integrations.
- **Depends on:** T-003, T-020

### T-101 — Notion page selector
- **Concern:** Admin picks which pages become context.
- **Actions:**
  - Tree view of accessible Notion pages via Composio.
  - Checkbox to "Use as context"; save writes selected pages into `notion_page`.
- **Acceptance:**
  - Selecting 3 pages creates 3 rows with titles and content.
  - Unselecting removes them (and their embeddings).
- **Depends on:** T-018, T-100

### T-102 — Notion page indexing + embeddings
- **Concern:** Fetch content, chunk if needed, embed, store.
- **Actions:**
  - On selection, pull page content via Composio.
  - Chunk at ~1000 tokens; embed each chunk with `text-embedding-3-large`.
  - Store one row per chunk in `notion_page` using `chunk_index`.
- **Acceptance:**
  - Selected pages appear in the chat RAG within 60s.
  - Re-running is idempotent.
- **Depends on:** T-101

### T-103 — Inject Notion context into the interview agent
- **Concern:** Interview dynamic vars get relevant context.
- **Actions:**
  - Before T-043 builds dynamic vars, fetch top-3 Notion chunks by similarity to the employee's role/department/last summary.
  - Pass as an extra dynamic variable (e.g. `context_snippets`) — update the prompt to reference it.
- **Acceptance:**
  - An employee whose profile references "Project Zenith" receives a call whose dynamic vars include the Zenith Notion page.
- **Depends on:** T-043, T-102

### T-104 — Inject Notion context into chat RAG
- **Concern:** Leadership chat answers use Notion content alongside interview insights.
- **Actions:**
  - T-091 already queries `notion_page.embedding` — verify the join and scoring balance.
  - Add a "Sources" section distinguishing interview vs Notion citations.
- **Acceptance:**
  - A question whose answer lives in a Notion handbook returns the handbook as a citation.
- **Depends on:** T-091, T-102

### T-105 — Google email draft flow via Composio
- **Concern:** The connected Google account is usable for manual invite/reminder drafts.
- **Actions:**
  - Wire the Google Workspace Composio connection into T-063/T-064 draft creation.
  - Verify draft creation supports subject, body, recipients, and `.ics` attachment metadata.
- **Acceptance:**
  - A connected Google account can create a draft for a scheduled interview without leaving the app.
  - Draft creation failures are surfaced clearly to the admin.
- **Depends on:** T-063, T-100

---

## Phase 9 — Polish and pilot

### T-110 — Empty states across the dashboard
- **Concern:** Every view has a coherent zero/low-data state.
- **Actions:**
  - Explicit empty states for: Home (pre-first-interview), Department, OKR, Employee, Themes, Research.
  - Each empty state explains what produces the content and links to the relevant action.
- **Acceptance:**
  - Manual review: loading the app with zero interviews never shows a broken chart or blank table.
- **Depends on:** T-070

### T-111 — Error and loading states
- **Concern:** No spinner-forever or white-screen-on-error.
- **Actions:**
  - Shared `<Loading />` and `<ErrorBoundary />` components.
  - Each data-fetching route uses them.
- **Acceptance:**
  - Killing the API mid-request on the Home page shows an error with a Retry.
  - Slow endpoints show a skeleton for ≤ 500ms then content.
- **Depends on:** T-070

### T-112 — Admin settings page
- **Concern:** Change cadence, company profile, manage Google/Notion integrations, re-sync Notion, set HR contact.
- **Actions:**
  - `/dashboard/settings` with sections: profile, cadence, integrations, HR contact.
  - HR contact flows into the interview prompt's `{{hr_contact}}`.
- **Acceptance:**
  - Editing any field persists and is reflected on the next interview invite or interview call.
- **Depends on:** T-033, T-100

### T-113 — Structured stdout logging
- **Concern:** Without external observability, make local logs legible.
- **Actions:**
  - JSON log format for the API (timestamp, level, event, call_id, interview_id where present).
  - Log entry for every Retell webhook (received, verified, synthesized).
  - Log entry for each synthesis stage with duration.
- **Acceptance:**
  - `docker compose logs api | jq .` parses cleanly.
  - A completed interview produces a traceable chain of log events keyed by `call_id`.
- **Depends on:** T-044, T-047

### T-114 — Local webhook tunnel for Retell
- **Concern:** Retell needs a public URL to post webhooks to; we host locally.
- **Actions:**
  - Document using ngrok or Cloudflare Tunnel in the README.
  - Script `scripts/tunnel.sh` that starts the tunnel and prints the public URL.
  - Register the URL in the Retell agent's webhook config (manual step, documented).
- **Acceptance:**
  - Running `scripts/tunnel.sh` prints a `https://...` URL reachable from the public internet.
  - A real Retell call's webhook lands on the local API via the tunnel.
- **Depends on:** T-044

### T-115 — Local run playbook in README
- **Concern:** A new engineer can clone and get a working local stack in one sitting.
- **Actions:**
  - `README.md` sections: prerequisites, clone, copy `.env.example` → `.env`, fill keys, `docker compose up`, `alembic upgrade head`, `scripts/provision_retell_agent.py`, `scripts/tunnel.sh`, connect Google Workspace + Notion via Composio, open http://localhost:3000.
- **Acceptance:**
  - Fresh macOS machine with Docker installed can follow the README and reach the onboarding wizard in < 30 minutes.
- **Depends on:** T-002, T-003, T-040, T-114

### T-116 — Transcript retention and deletion
- **Concern:** Hold to the proposed policy; let employees request deletion.
- **Actions:**
  - Cron job at midnight deletes audio recordings older than 30 days (keep transcripts).
  - `DELETE /employees/:id/transcripts` admin endpoint for employee-initiated deletion requests.
- **Acceptance:**
  - A day-31 recording is gone from storage; the transcript remains.
  - Calling the delete endpoint removes transcripts and associated insights.
- **Depends on:** T-044, T-047

### T-117 — End-to-end smoke test
- **Concern:** One scripted run covers onboarding → schedule → interview → synthesis → dashboard.
- **Actions:**
  - Playwright test that: bootstraps a company, adds 1 employee, adds 1 OKR, runs scheduler manually, opens the interview page, mocks a Retell call, posts a fixture webhook, waits for synthesis, asserts the insight appears on Home.
- **Acceptance:**
  - Test passes in CI against a fresh DB.
- **Depends on:** T-022, T-030, T-044, T-047, T-071, T-072

### T-118 — Pilot run with BetterLabs (local host)
- **Concern:** Real humans. First two rounds. Stack runs on the builder's laptop; tunnel stays up during interview windows.
- **Actions:**
  - Ensure the laptop is awake and on mains power during scheduled interview windows.
  - Keep `docker compose` and `scripts/tunnel.sh` running during the window.
  - Run onboarding against BetterLabs reality.
  - Watch first round live; collect feedback from each interviewee.
  - Run second round two weeks later.
- **Acceptance (success criteria per PRD §10):**
  - Every employee is interviewed ≥ 2 times.
  - Admin answers the 3 "leadership questions" from the dashboard without external lookups.
  - One research request is run end-to-end.
  - ≥ 1 employee says unprompted the interview was useful.
- **Depends on:** T-115, everything above

---

## Open items to resolve before build starts

These block or shape specific tasks above. Decide before the referenced task begins.

| Item (PRD §9) | Blocks | Default to ship unless decided |
|---|---|---|
| BetterLabs headcount | T-061, T-118 sizing | Assume ≤ 30 |
| Employee sees own past insights | T-042 | No |
| No-show retry policy | T-064 | Reminder 15m, reschedule on no-show, notify admin after 2 |
| Transcript retention | T-116 | Audio 30d, transcripts indefinite, opt-out endpoint |
| Interview length cap | T-040 prompt, T-044 timeout | Soft 12, wrap 10, hard 18 |
| OKR lifecycle | v1.1 (deferred) | No archive in MVP |
