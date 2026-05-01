# Agora — Project Overview & Handover

This document is the engineering handover. If you're taking over building Agora, read this before `AGORA_PRD.md`. It covers:

- [What Agora is](#what-agora-is)
- [Architecture](#architecture)
- [Tech stack and the decisions behind it](#tech-stack-and-the-decisions-behind-it)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [HTTP route map](#http-route-map)
- [State machines](#state-machines)
- [The interview lifecycle, end-to-end](#the-interview-lifecycle-end-to-end)
- [Local setup](#local-setup)
- [Operational gotchas learned while building](#operational-gotchas-learned-while-building)
- [Where to extend](#where-to-extend)
- [Known gaps, risks, and next work](#known-gaps-risks-and-next-work)

---

## What Agora is

A voice-AI company intelligence tool. An admin (CEO / department head) onboards employees and OKRs. Agora then:

1. Runs autonomous voice interviews on a recurring cadence (Retell web call, GPT‑4.1 behind the scenes).
2. Synthesises each transcript into typed **insights** (blocker / win / start_doing / stop_doing / tooling_gap / sentiment_note / other), attaches sentiment scores, and tags them to relevant OKRs via embedding similarity.
3. Surfaces the state of the business on a dashboard: top blockers, OKR health, sentiment trends, themes (HDBSCAN clustering), employee timelines.
4. Lets leadership chat against the memory (RAG over insights + Notion pages) and commission ad-hoc research rounds that schedule one-off interviews and produce progressive reports.

Full product rationale lives in [`AGORA_PRD.md`](./AGORA_PRD.md). This document assumes you've read at least §1–§4 of that.

## Critical demo/run checklist — Retell webhooks

**Do this before every local demo or live interview.** Retell must be able to call the local API after a voice interview ends. If the webhook URL is stale, calls complete in Retell but stay `in_progress` in Agora, so dashboards, Review, Alerts, sentiment, and insights do not update.

Quick check:

```bash
# 1) Is the local API up?
curl http://localhost:8010/health

# 2) Is the public tunnel up? Replace with the current tunnel URL.
curl https://<current-tunnel>.trycloudflare.com/health

# 3) Does Retell point at that same tunnel?
docker compose exec api python -c "from retell import Retell; from app.config import get_settings; rc=Retell(api_key=get_settings().retell_api_key); a=rc.agent.retrieve(get_settings().retell_agent_id); print(a.webhook_url, a.webhook_events)"
```

If the tunnel is missing/dead:

```bash
cloudflared tunnel --url http://localhost:8010 --protocol http2
# copy the printed https://*.trycloudflare.com URL, then:
docker compose exec api python -c "from retell import Retell; from app.config import get_settings; rc=Retell(api_key=get_settings().retell_api_key); rc.agent.update(get_settings().retell_agent_id, webhook_url='https://<current-tunnel>.trycloudflare.com/webhooks/retell', webhook_events=['call_started','call_ended','call_analyzed'])"
```

**Recommended permanent fix:** stop relying on quick `trycloudflare.com` tunnels for demos. Use either:

1. a **Cloudflare named tunnel** with a stable hostname, or
2. a hosted API URL for the demo environment.

Quick tunnels are random and ephemeral by design; they will break again whenever the process dies or a new tunnel is started. The backend has a 5-minute Retell polling recovery job as a safety net, but a stable webhook URL is the real fix.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Admin Dashboard  (Next.js 15)                │
│  /onboarding · /dashboard · /dashboard/<feature> · /interview/:t │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS/JSON  (cookie-signed admin session)
┌───────────────────────▼─────────────────────────────────────────┐
│                    FastAPI backend  (Python 3.12)               │
│                                                                 │
│  routers/   session · company · employees · okrs · interviews   │
│             · webhooks · dashboard · chat · research ·          │
│             integrations · review · alerts                      │
│                                                                 │
│  services/  synthesis  · themes (HDBSCAN) · rag ·               │
│             research_agent · research_report ·                  │
│             scheduler_service · slot_picker · ics_gen ·         │
│             summary_email · email_templates · notion_sync ·     │
│             okr_extract · embeddings · retell_service           │
│                                                                 │
│  clients/   openai_client · retell_client · composio_client ·   │
│             loops_client                                        │
│                                                                 │
│  scheduler  APScheduler (Postgres jobstore, runs in-process)    │
│             jobs: daily_cadence · reminder_noshow · themes      │
└──┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
   │          │          │          │          │
┌──▼──┐  ┌────▼────┐ ┌───▼───┐  ┌───▼────┐ ┌───▼────┐
│ PG  │  │ Retell  │ │OpenAI │  │Composio│ │ Loops  │
│ +pg │  │(voice+  │ │(LLM + │  │(Notion+│ │ (email │
│vec16│  │webhook) │ │embed) │  │Gmail)  │ │fallbk) │
└─────┘  └─────────┘ └───────┘  └────────┘ └────────┘
```

**Design shape is intentional:**

- Everything on one machine, one Postgres. No separate worker/queue service. APScheduler lives inside the FastAPI process, and synthesis runs in `BackgroundTasks` off the Retell webhook.
- The only true "agent" is the **research agent** (OpenAI Agents SDK with tools). Everything else is deterministic pipelines with structured-output LLM calls. Don't reach for LangGraph/CrewAI — it is deliberately not here.
- pgvector stores 3072-dim embeddings. No separate vector DB.

---

## Tech stack and the decisions behind it

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 App Router + TS + Tailwind + recharts | Server components for dashboard, client for chat dock + interview page. One framework, no router split. Chat UI is custom-built (`components/ChatDock.tsx`) — no third-party chat UI library. No Vercel AI SDK; all LLM calls live in the Python backend. |
| Backend | FastAPI 3.12 + SQLAlchemy 2 + Alembic | Best ergonomics for LLM pipelines, structured output, Pydantic everywhere. |
| DB | Postgres 16 + pgvector | Structured + vector in one store. Simpler to reason about than two systems. |
| Voice | Retell Web Call SDK, BYO OpenAI LLM | Purpose-built for browser voice, custom function calls, transcript webhooks. LLM cost stays controllable by BYO. |
| LLM | OpenAI GPT-4.1 + `text-embedding-3-large` (3072-dim) | Quality, structured output reliability, tool calls. Swap to gpt-5/6 when they land. |
| Scheduler | APScheduler w/ Postgres jobstore | Right-sized for 5–30 employees. Celery is negative value at this scale; migration path is ~1 day if we ever hit the ceiling. |
| Email | Composio → Gmail (primary), Loops (fallback) | Sending from the admin's own Gmail means invites don't look like spam and `.ics` attachments work. Loops is a fallback (set `LOOPS_API_KEY` and disconnect Gmail). |
| Calendar | `.ics` attachment | Works with every mail client. No need to create Google Calendar events directly. |
| Integrations | Composio MCP | One integration plane for Notion today, Jira/Linear/Slack tomorrow. |
| Tunnel | cloudflared `--protocol http2` | QUIC is blocked on many networks; HTTP/2 survives. |
| Deployment | Local only (Docker Compose) for MVP | Pilot is internal. Hosted deploy is v1.1. |
| Observability | stdout JSON via structlog | Ship Sentry/Sauron when we deploy. |
| Tests | pytest (unit; slot_picker covered). Smoke is manual. | Tight surface, fast iteration. Expand before scaling. |

### Rejected alternatives and why

- **Supermemory** — pgvector covers 100% of MVP needs. Adopt when there's a specific affordance we need (temporal memory graphs, multi-company federation).
- **LangGraph / CrewAI** — overkill for one agent. OpenAI Agents SDK for the research agent; plain Python pipelines elsewhere.
- **Vapi** — Retell's browser web-call SDK is more mature for tokenised-link use case.
- **Clerk/Auth.js** — single admin, signed cookie. Revisit at second user.
- **Hosted deploy on Vercel/Railway/Fly** — not MVP. Move after pilot.

---

## Repository layout

```
apps/
  api/                   FastAPI backend
    app/
      main.py            FastAPI app, CORS, router registration, startup hooks
      config.py          pydantic-settings (reads .env)
      db.py              SQLAlchemy engine + SessionLocal + Base
      models.py          All ORM models
      schemas.py         Shared Pydantic request/response types
      security.py        Cookie signing, get_current_company dependency
      scheduler.py       APScheduler init + job registration
      logging_conf.py    structlog JSON setup
      clients/
        openai_client.py LLM + embeddings + structured output
        retell_client.py Retell SDK wrapper
        composio_client.py Notion list/fetch + Gmail send
        loops_client.py  Fallback transactional email
      routers/
        session.py       /admin/session/*
        company.py       /admin/company/*  (+ email templates)
        employees.py     /employees/*      (CRUD, CSV import, pending-interviews, schedule-next, start-test-interview)
        okrs.py          /okrs/*           (CRUD + extract)
        interviews.py    /interviews/*     (public token + admin + send-invite/summary)
        webhooks.py      /webhooks/retell  (+ /functions/:name custom tool calls)
        dashboard.py     /dashboard/*      (home modules, dept/okr/employee/theme queries)
        chat.py          /chat             (Mode A RAG)
        research.py      /research/*       (draft, edit plan, approve/reject)
        integrations.py  /integrations/{notion,gmail}/*
        review.py        /review/*         (flagged insights approve/suppress)
        alerts.py        /alerts/*         (admin alerts)
      services/
        synthesis.py     Full pipeline: clean → extract → embed → OKR-tag → sentiment → memory → summary email
        themes.py        HDBSCAN nightly cluster + label
        rag.py           pgvector cosine over insights + notion_page
        research_agent.py  LLM plans which employees to interview
        research_report.py Progressive report update + notify
        scheduler_service.py  Slot + invite + reminder + no-show + admin notif
        slot_picker.py   Pure function: next free 20-min slot in window
        ics_gen.py       RFC 5545 .ics + base64
        email_templates.py  Defaults + {{var}} render + merge with company overrides
        summary_email.py Post-call recap to employee (2-5 bullets + next steps)
        notion_sync.py   Composio → list → pick → chunk → embed → store
        okr_extract.py   Paste-and-parse OKR doc → structured schema
        retell_service.py  Build dynamic vars + create_web_call
        embeddings.py    Helpers for OKR/insight/notion embed
    migrations/          Alembic — 0001 initial, 0002 gmail+notion cols, 0003 email templates + send-stamps
    tests/               slot_picker unit tests
  web/                   Next.js 15 + TS + Tailwind
    app/
      page.tsx           Boot; redirect to onboarding or dashboard
      layout.tsx         Root HTML + globals.css
      onboarding/page.tsx  6-step wizard
      dashboard/
        layout.tsx       Sidebar + ChatDock wrapper
        page.tsx         Home: hero + 4 modules (blockers, OKR health, sentiment, themes)
        employees/{page,[id]}.tsx
        departments/{page,[name]}.tsx
        okrs/{page,[id]}.tsx
        themes/{page,[id]}.tsx
        interviews/[id]/page.tsx   Transcript + insights + sentiment
        research/{page,[id]}.tsx   Plan approval + progressive report
        review/page.tsx            Flagged-insight queue
        alerts/page.tsx            All alerts tabs
        settings/page.tsx          Profile + cadence + integrations + email templates
      interview/[token]/page.tsx   Public employee-facing call start
    components/
      Sidebar.tsx  ChatDock.tsx  AlertsBanner.tsx  Logo.tsx  CallView.tsx
      modules/     HeroStrip · TopBlockers · OkrHealth · SentimentTrend · EmergingThemes
    lib/api.ts    Fetch helper (prepends /api on client, cookie-credential)
packages/
  prompts/
    interview-agent.md  Retell system prompt (source of truth for voice behaviour)
    synthesis.md        Mirror of extraction/sentiment/memory prompts (reference)
    retell.md composio.md loops.md  Third-party SDK cheatsheets used during build
scripts/
  provision_retell_agent.py  One-off: uploads prompt, creates LLM + agent
  tunnel.sh                  cloudflared/ngrok helper
  seed_demo.py               Insert a demo company + 3 employees + 1 OKR
  recover_interview.py       Pull call from Retell API + rerun synthesis (missed-webhook recovery)
docker-compose.yml .env.example .gitignore .dockerignore README.md
AGORA_PRD.md AGORA_TASKS.md PROJECT_OVERVIEW.md
```

---

## Data model

Postgres 16 with `vector` extension. Embeddings are 3072-dim (`text-embedding-3-large`). No ivfflat/hnsw indexes — at 3072 dims neither index type covers it, so cosine distance runs sequential scan. This is fine for MVP scale (<10k insight rows); when scaling, either switch to 1536-dim with `dimensions` param on the embed call, or run vector DB alongside.

```
company
  id  name  industry  description
  cadence_days  timezone  window_start_hour  window_end_hour  weekdays[]
  hr_contact  admin_email
  composio_connection_id (legacy, for old rows)
  gmail_connection_id    notion_connection_id
  okr_tag_threshold  email_templates(jsonb)
  onboarding_completed_at  created_at

admin_session
  id  company_id(fk)  cookie_token(unique)  created_at  last_seen_at

employee
  id  company_id(fk)  name  email  job_title  department  linkedin_url
  manager_id(self-fk, nullable, cannot equal own id)
  memory_summary(text)  status(active|archived)  created_at
  UNIQUE(company_id, email)

okr
  id  company_id(fk)  objective  status  embedding(vector(3072))  created_at
key_result
  id  okr_id(fk)  description  target_metric  current_value  status  embedding(vector(3072))

interview
  id  employee_id(fk)  company_id(fk)  scheduled_at  started_at  ended_at
  status(scheduled|in_progress|completed|no_show)
  link_token(unique)  retell_call_id(indexed)
  transcript_url  recording_url
  raw_transcript_json(jsonb)  cleaned_transcript_json(jsonb)  corrected_summary
  sensitive_omitted(text[])
  research_request_id(fk, nullable)
  reminder_sent_at  invite_sent_at  summary_sent_at  created_at

insight
  id  interview_id(fk)  employee_id(fk)  company_id(fk)
  type CHECK IN (blocker|win|start_doing|stop_doing|tooling_gap|sentiment_note|other)
  content  direct_quote  severity(INTEGER default 3, observed range 1–4)  confidence(0-1)
  review_state CHECK IN (live|needs_review|suppressed|omitted)
  embedding(vector(3072))  created_at

insight_okr_tag
  insight_id  okr_id  similarity   PRIMARY KEY(insight_id, okr_id)

interview_sentiment
  interview_id(pk, fk)  morale  energy  candor  urgency  notes
  (all scores 1-5 integers)

theme
  id  company_id(fk)  label  summary  member_insight_ids(int[])  created_at

admin_alert
  id  company_id(fk)  category  summary  interview_id(fk, nullable)
  status(unread|acknowledged)  created_at  acknowledged_at

notion_page
  id  company_id(fk)  notion_page_id  chunk_index  title  content
  embedding(vector(3072))  created_at
  UNIQUE(company_id, notion_page_id, chunk_index)

chat_message
  id  company_id(fk)  scope_type  scope_id  role(user|assistant|system)
  content  citations_json(jsonb)  created_at

research_request
  id  company_id(fk)  question  status(draft|approved|running|complete|rejected)
  plan_json(jsonb)  report_json(jsonb)
  notify_threshold(default 0.75)  notified_at
  created_at  approved_at
```

### Relationships at a glance

- `company` is the single-tenant root — every table cascades from it.
- `employee.manager_id` is a self-fk; circular/self constraints enforced by CHECK.
- `interview ← insight` via `interview_id`. `insight ↔ okr` many-to-many via `insight_okr_tag`.
- `research_request ← interview` via `interview.research_request_id`, optional. Progressive report is rebuilt on each research-linked synthesis completion.
- `admin_alert.interview_id` is optional (most alerts come from hard-escalation triggers during a call).

---

## HTTP route map

Grouped by concern. All admin routes require a valid signed `agora_admin` cookie. Public routes are explicitly marked.

**Session / bootstrap**
- `GET /admin/session/me` — has_session, onboarding_complete, company_id, company_name
- `POST /admin/session/bootstrap` — creates company + session cookie (first visit)

**Company**
- `GET /admin/company` · `PATCH /admin/company`
- `PATCH /admin/company/cadence`
- `POST /admin/company/complete-onboarding` — marks wizard done, kicks off first cadence scan
- `GET /admin/company/email-templates`
- `PATCH /admin/company/email-templates` — body `{templates:{kind:{subject,body_html}}}`
- `POST /admin/company/email-templates/{kind}/reset` — drop override, fall back to default

**Employees**
- `GET /employees?status_filter=active|archived|all`
- `POST /employees` — 409 w/ structured body `{code:"email_archived", employee_id, name}` if archived collision
- `PATCH /employees/{id}`
- `POST /employees/{id}/archive` · `POST /employees/{id}/restore`
- `POST /employees/import-csv` (multipart) — columns name,email,job_title,department,linkedin_url,manager_email
- `GET /employees/{id}/pending-interviews` — rows with invite_sent_at + research_label
- `POST /employees/{id}/schedule-next` — slot-picker + invite
- `POST /employees/{id}/start-test-interview` — scheduled_at=now, no email, for self-testing

**OKRs**
- `GET /okrs` · `POST /okrs` · `PATCH /okrs/{id}` · `POST /okrs/{id}/archive`
- `POST /okrs/extract` — paste-and-parse text into structured OKRs

**Interviews**
- `GET /interviews/by-token/{token}` — **public**, returns greeting metadata. 404/410/425 for unknown/expired/too-early
- `POST /interviews/by-token/{token}/start` — **public**, creates Retell web call, returns access_token + call_id
- `GET /interviews?employee_id=&status=&limit=`
- `GET /interviews/{id}` — transcript + insights + sentiment
- `POST /interviews/{id}/send-invite` — send/resend invite for that specific interview, stamps `invite_sent_at`
- `POST /interviews/{id}/send-summary` — re-send post-call summary

**Retell webhooks**
- `POST /webhooks/retell` — lifecycle events (call_started, call_ended, call_analyzed). Signature verified when `VERIFY_RETELL_WEBHOOK=true`; off by default in dev
- `POST /webhooks/retell/functions/{name}` — custom tool calls: `mark_sensitive_omit`, `mark_sensitive_flag_for_review`, `trigger_admin_alert`, `correct_summary`, `end_call`

**Dashboard queries**
- `GET /dashboard/home/summary` — last 7d counts
- `GET /dashboard/home/blockers?department=&limit=`
- `GET /dashboard/home/okr-health`
- `GET /dashboard/home/sentiment-trend?days=&department=`
- `GET /dashboard/departments` · `GET /dashboard/departments/{name}`
- `GET /dashboard/okrs/{id}` · `GET /dashboard/okrs/{id}/summary` (AI, 1h cache)
- `GET /dashboard/employees/{id}` — timeline + memory summary + top_insights (incl. review_state)
- `GET /dashboard/themes` · `GET /dashboard/themes/{id}`

**Chat**
- `GET /chat/history?scope_type=&scope_id=&limit=`
- `POST /chat` — body `{message, scope_type?, scope_id?}` → `{reply, citations, needs_research, proposed_research_request_id?}`

**Research**
- `GET /research` · `POST /research` · `GET /research/{id}`
- `PATCH /research/{id}/plan` — edit employees + eta_days while `status=draft`
- `POST /research/{id}/approve` — status→approved, schedules interviews, sends invites
- `POST /research/{id}/reject`

**Review queue**
- `GET /review` — `needs_review` insights
- `POST /review/{id}/approve` — → live + embed
- `POST /review/{id}/suppress` — → suppressed

**Alerts**
- `GET /alerts?status=unread|acknowledged`
- `POST /alerts/{id}/acknowledge`

**Integrations (Composio)**
- `GET /integrations/notion/status` · `POST /integrations/notion/connect` · `POST /integrations/notion/disconnect`
- `GET /integrations/notion/pages` · `POST /integrations/notion/sync` body `{page_ids:[str]}`
- `GET /integrations/gmail/status` · `POST /integrations/gmail/connect` · `POST /integrations/gmail/disconnect`

**Misc**
- `GET /health` — `{status:ok}`
- `GET /docs` · `GET /redoc` · `GET /openapi.json` — FastAPI auto

---

## State machines

### `interview.status`

```
           schedule_for_employee()
 (none) ─────────────────────────▶ scheduled
   ▲                                  │  reminder_job fires 15 min out
   │                                  │  employee opens link + Start
   │                                  ▼
   │                              in_progress
   │                                  │
   │                                  │ Retell call_ended webhook
   │                                  │  (or recover_interview.py)
   │                                  ▼
   │                              completed ──▶ synthesis runs
   │                                  │       (insights, sentiment,
   │                                  │        memory, summary email,
   │                                  │        research report if linked)
   │                                  │
   └── no_show ◀──── 30 min past scheduled_at, still scheduled
           (daily_cadence reschedules next morning; admin alerted after 2 consecutive)
           NOTE: do NOT reschedule immediately on no_show — causes invite email spam
```

### `insight.review_state`

```
extraction ──▶ live                    (default for non-sensitive)
            ▶ needs_review             (set by `mark_sensitive_flag_for_review` function call)
            ▶ omitted                  (sensitive-omit span; no insight ever created — `interview.sensitive_omitted[]`)

needs_review ──▶ live         (admin clicks Approve in /dashboard/review)
             ──▶ suppressed   (admin clicks Suppress)

Only `live` insights appear in dashboards, chat RAG, top blockers, OKR signal.
`needs_review` are rendered with urgent styling on the employee + interview detail pages.
```

### `research_request.status`

```
 ┌─ draft ──(PATCH plan)──▶ draft
 │   │
 │   │ approve  ─▶ approved ──▶ (scheduler writes N interviews) ──▶
 │   │                            each completion rebuilds report_json
 │   │                            at ≥ notify_threshold → admin email + notified_at
 │   │                            when completed == total → complete
 │   │
 │   └ reject   ─▶ rejected
 ▼
(stays approved while interviews in flight — `running` state is in the PRD
 but MVP uses approved until complete; left room to split later.)
```

### Cadence scheduling

```
daily_cadence_job  (APScheduler, 03:00 UTC)
  for each company with onboarding_completed_at:
    for each active employee:
      if needs_schedule(cadence_days since last ended_at):
        pick slot via slot_picker.next_free_slot(
          tz, weekdays, window, taken_times)
        create interview row, send invite

reminder_and_noshow_job  (every 5 min)
  for each scheduled interview with scheduled_at <= now+15m and reminder not yet sent:
    send reminder; stamp reminder_sent_at
  for each scheduled interview with scheduled_at < now-30m:
    mark no_show (do NOT reschedule immediately — daily_cadence handles it at 3am)
    if 2 consecutive no_shows → email admin

theme_cluster_job  (02:00 UTC)
  for each company, HDBSCAN over last-30d insight embeddings (min_cluster=3)
  label each cluster via GPT-4.1
  upsert theme rows, replace today's set
```

---

## The interview lifecycle, end-to-end

This is the single most important path. If you break it, the product doesn't exist.

1. **Schedule** — `schedule_for_employee()` picks a slot, writes `interview(status=scheduled, link_token=<urlsafe 32 bytes>)`, and calls `send_invite()`.

2. **Invite sent** — `send_invite()` builds the `.ics`, renders the `invite` email template, and posts via `_send_email()`:
   1. If `company.gmail_connection_id` is set, try Composio `GMAIL_SEND_EMAIL`.
   2. On Gmail error (or not connected), try Loops transactional.
   3. If neither is wired, log `{skipped: true}` — no crash.
   Then stamps `invite_sent_at`.

3. **Reminder** — `reminder_and_noshow_job` (every 5 min) picks up anything scheduled within next 15 min with no `reminder_sent_at`, sends via the same email pipeline, stamps.

4. **Employee joins** — visits `/interview/[token]`. Frontend calls `GET /interviews/by-token/:t` to render the greeting, then `POST /interviews/by-token/:t/start` which:
   - Builds dynamic variables (employee first name, company description, active OKRs, memory summary, research context if any)
   - Calls Retell `call.create_web_call(agent_id, retell_llm_dynamic_variables=…)`
   - Returns `access_token` + `call_id` to the browser
   - Frontend passes `access_token` to `retell-client-js-sdk`'s `RetellWebClient.startCall()`

5. **During the call** — Retell handles STT → LLM → TTS. The LLM (GPT-4.1) follows `packages/prompts/interview-agent.md`. Four custom function calls are available and POST to `/webhooks/retell/functions/{name}`:
   - `mark_sensitive_omit(label)` → appends to `interview.sensitive_omitted[]`
   - `mark_sensitive_flag_for_review(paraphrase)` → inserts an `Insight` with `review_state=needs_review`
   - `trigger_admin_alert(category, summary)` → inserts `admin_alert` (unread banner on dashboard)
   - `correct_summary(updated_summary)` → stored on interview
   - `end_call` → no-op server-side (Retell handles termination)

6. **Call ends** — Retell posts `call_ended` to `/webhooks/retell`. The handler:
   - Verifies signature if `VERIFY_RETELL_WEBHOOK=true`
   - Stamps `ended_at`, `status=completed`, stores `raw_transcript_json` + URLs
   - Enqueues synthesis via FastAPI `BackgroundTasks`

7. **Synthesis** (async, ~10–20 s):
   1. **Cleanup** — build `cleaned_transcript_json` with speaker/ts/text per segment
   2. **Extract** — GPT-4.1 structured output → list of typed insights (respects sensitive-omitted spans)
   3. **Embed** — `text-embedding-3-large` in one batch call
   4. **OKR-tag** — cosine similarity of insight embedding vs OKR embeddings, top-3 above `okr_tag_threshold` (default 0.55) → `insight_okr_tag` rows
   5. **Sentiment** — GPT-4.1 structured output → `InterviewSentiment` row (morale/energy/candor/urgency + notes)
   6. **Memory rollup** — GPT-4.1 generates a 2nd-person briefing from this + last two interviews → stored on `employee.memory_summary` (used in next interview's dynamic vars)
   7. **Research report** — if `research_request_id` is set, `rebuild_report()` regenerates `report_json` and fires admin notif at threshold
   8. **Post-call summary email** — LLM generates 3–5 bullets + 1–3 next steps (sensitive items get explicit handling in the prompt), email to employee, stamp `summary_sent_at`

8. **Dashboard** — everything above surfaces immediately in `/dashboard` home modules, employee timeline, OKR detail, etc.

9. **Nightly** — `theme_cluster_job` re-runs HDBSCAN across last 30d of `live` insights, replaces the day's `theme` rows.

### The sensitive content path deserves its own note

The Retell prompt defines **three routing outcomes** for sensitive content — the LLM makes the call, not our parser:

- `mark_sensitive_omit(label)` — employee opted out. Nothing insight-level is ever written. The label goes on `interview.sensitive_omitted[]` purely for the extractor's negative prompt ("don't turn this topic into an insight"). Synthesis sees the topic name, skips it.
- `mark_sensitive_flag_for_review(paraphrase)` — employee opted in. An `Insight` is created with `review_state=needs_review`. It is **invisible** to dashboards and chat RAG until an admin clicks Approve in `/dashboard/review`. The UI renders these with a red left-border, tinted background, bold text on the interview detail + employee pages.
- `trigger_admin_alert(category, summary)` — hard escalation (harassment / discrimination / self_harm / misconduct). Fires *regardless* of the employee's record/omit choice. Creates an `admin_alert` → red banner on dashboard, email to admin.

If you change any of the above, the interview-agent prompt in `packages/prompts/interview-agent.md` needs to match — it's the other half of this contract.

---

## Local setup

```bash
# 1. Get API keys and put them in .env
cp .env.example .env
# fill OPENAI_API_KEY, RETELL_API_KEY, COMPOSIO_API_KEY
# leave LOOPS_API_KEY blank unless you want it as fallback

# 2. Boot the stack (pgvector + FastAPI + Next.js)
docker compose up -d --build

# 3. Open a tunnel so Retell can post webhooks to localhost
brew install cloudflared
cloudflared tunnel --url http://localhost:8010 --protocol http2
# copy the trycloudflare.com URL → RETELL_WEBHOOK_BASE_URL in .env

# 4. Provision the Retell agent (one-off, or any time the prompt changes)
docker compose cp scripts/provision_retell_agent.py api:/tmp/provision.py
docker compose cp packages/prompts api:/prompts_copy
docker compose exec api bash -c '
  cp /prompts_copy/interview-agent.md /tmp/interview-agent.md && \
  python -c "
import pathlib, re
p=pathlib.Path(\"/tmp/provision.py\")
p.write_text(p.read_text().replace(
  \"ROOT / \\\"packages/prompts/interview-agent.md\\\"\",
  \"pathlib.Path(\\\"/tmp/interview-agent.md\\\")\"))
"
  RETELL_WEBHOOK_BASE_URL=... python /tmp/provision.py
'
# copy AGENT_ID → .env

# 5. IMPORTANT: recreate (not restart) to pick up new env
docker compose up -d --force-recreate api

# 6. Open the app
open http://localhost:3010
# Ports: web=3010  api=8010  postgres=5433
```

Env-file changes are only picked up on container *create*. `docker compose restart` reuses the existing container and silently ignores new env values — which has burned us twice. Always use `up -d --force-recreate api`.

To connect Gmail + Notion: Settings → Integrations → Connect → consent → Sync pages.

### Debugging authenticated endpoints from the terminal

The admin cookie is signed with `itsdangerous.URLSafeSerializer`. To call any admin endpoint manually:

```bash
# 1. Get the raw token from the DB
TOKEN=$(docker exec agora-postgres-1 psql -U agora -d agora -t -c \
  "SELECT cookie_token FROM admin_session ORDER BY last_seen_at DESC LIMIT 1;" | tr -d ' ')

# 2. Sign it
COOKIE=$(docker exec agora-api-1 python3 -c "
from itsdangerous import URLSafeSerializer
import os
s = URLSafeSerializer(os.environ['ADMIN_COOKIE_SECRET'], salt='admin-cookie')
print(s.dumps({'t': '$TOKEN'}))
")

# 3. Call any admin endpoint
curl -s http://localhost:8010/admin/company \
  -H "Cookie: agora_admin=$COOKIE" | python3 -m json.tool
```

The cookie name is `agora_admin`. The secret is `ADMIN_COOKIE_SECRET` in `.env`.

---

## Operational gotchas learned while building

1. **`docker compose restart` does not re-read `.env`.** Use `up -d --force-recreate <service>`.
2. **Cloudflare quick tunnels default to QUIC (UDP 443).** Many networks block it — output hangs with `failed to dial to edge with quic`. Add `--protocol http2`.
3. **Cloudflare `trycloudflare.com` tunnel URLs are ephemeral.** Every `cloudflared tunnel` run gets a new random subdomain. If Docker is stopped and restarted the tunnel URL changes — Retell will be posting webhooks to the old dead URL.
   - **Before any demo/interview:** run `cloudflared tunnel --url http://localhost:8010 --protocol http2`, verify `curl <tunnel>/health` returns `200`, and update the Retell agent `webhook_url` to `<tunnel>/webhooks/retell`.
   - **Check current Retell webhook:** `docker compose exec api python -c "from retell import Retell; from app.config import get_settings; rc=Retell(api_key=get_settings().retell_api_key); a=rc.agent.retrieve(get_settings().retell_agent_id); print(a.webhook_url, a.webhook_events)"`.
   - **Update Retell webhook:** `docker compose exec api python -c "from retell import Retell; from app.config import get_settings; rc=Retell(api_key=get_settings().retell_api_key); rc.agent.update(get_settings().retell_agent_id, webhook_url='<tunnel>/webhooks/retell', webhook_events=['call_started','call_ended','call_analyzed'])"`.
   - **Safety net:** `recover_ended_retell_calls_job` runs every 5 min and recovers stuck `in_progress` calls from Retell if the transcript is available.
   - **Manual recovery:** `docker compose exec api python /scripts/recover_interview.py <interview_id>` pulls the call from Retell API and runs synthesis in-process. Note: normal synthesis sends the post-call summary email; for demo-only recovery, monkeypatch `summary_email.send_post_call_summary` to skip email before calling `run_synthesis`.
   - **Why Review/Alerts won't catch this:** Review/Alerts depend on synthesis output. If a webhook is missed, the interview remains `in_progress` with no transcript, no insights, no sentiment, and no alert rows — so there is nothing for Review/Alerts to show yet.
4. **`insight.severity` is an integer (1–4), not a string.** The DB column is `INTEGER DEFAULT 3`. Any frontend code rendering severity must map it to a label (`1=low 2=medium 3=high 4=critical`) before string operations — calling `.toLowerCase()` or `.replace()` directly on the raw value throws a TypeError and crashes the component.
5. **Immediate no-show rescheduling causes invite spam.** The `reminder_and_noshow_job` must NOT call `schedule_for_employee()` directly — it runs every 5 min, so each no-show detection would fire a new invite. Let `daily_cadence_job` (3am) handle rescheduling; employees get at most one fresh invite per day.
6. **LOOPS_API_KEY is needed for email fallback.** Without it (and without a Gmail connection), `send_invite` and `send_reminder` will return `{skipped: true, reason: "no_loops_api_key"}` — no crash, but no email delivered. Set `LOOPS_API_KEY` in `.env` or connect Gmail via Settings → Integrations.
7. **Composio v1 requires an explicit toolkit version** for manual `tools.execute()`. `"latest"` is rejected. Client resolves latest per-toolkit at init time and passes via `toolkit_versions={...}`. If Composio bumps a tool breaking-ly, the ingest may change shape — the Notion list/fetch code has defensive unwrapping helpers (`_extract_page_items`, `_page_title`) for that reason.
8. **Retell webhook signature verify is finicky** — the bundled HMAC check was rejecting legitimate Retell payloads on 4.x of the SDK. `VERIFY_RETELL_WEBHOOK=false` is the MVP posture; re-enable in production once a diagnostic pass confirms body encoding. Missed webhooks can be recovered via `scripts/recover_interview.py <interview_id>` — pulls the call from Retell API and runs synthesis.
9. **pgvector's ivfflat/hnsw index cap is 2000 dims.** We use 3072-dim (`text-embedding-3-large`) for quality. Cosine searches are sequential-scan, which is fine below ~10k rows. Beyond that: drop to 1536 via `dimensions` param, or switch to a vector DB.
10. **OpenAI `responses.parse` vs `beta.chat.completions.parse`** — we use `responses.parse` which returns `output_parsed`. If the SDK renames or deprecates, swap in `beta.chat.completions.parse` — same structured-output ergonomics.
11. **APScheduler + psycopg3** — `SQLAlchemyJobStore` expects the full SQLA URL including `+psycopg`. An earlier version of scheduler.py stripped the driver suffix and pulled in psycopg2 as a fallback — removed, keep the URL intact.
12. **Next.js 15 + react 18.3** — the stack is fine. We pinned `retell-client-js-sdk@2.0.7` (2.0.8 doesn't exist on npm).
13. **Email HTML attachments** — Gmail via Composio currently accepts a single attachment via the `attachment` arg; we pass the `.ics` there. Multi-attach needs a wrapper.

---

## Where to extend

A few concrete entry points keyed to the most likely additions.

### Adding a new insight type
1. Add the string to the CHECK constraint in an Alembic migration + to `CK_insight_type`.
2. Add it to the `InsightType` literal in `schemas.py`.
3. Extend the `EXTRACT_SYSTEM` prompt in `services/synthesis.py` to describe the new type.
4. UI: add a badge colour in `insightBadgeClass()` in each page that renders insights (search for `insightBadgeClass`).

### Adding an integration (Jira, Linear, Slack)
1. Add `<slug>_connection_id` column on company (migration).
2. `clients/composio_client.py` — add `initiate_<slug>_connection()` + action wrappers.
3. `routers/integrations.py` — add `/integrations/<slug>/{status,connect,disconnect}`.
4. Settings UI: add a card matching the `GmailCard` / Notion card pattern.
5. If it's a context source (like Notion), add a sync service under `services/` that chunks + embeds into a new table and teach `services/rag.py` to join it.

### Adding a new email
1. Add a key to `DEFAULTS` in `services/email_templates.py` with subject + body_html.
2. Add the kind to the UI label map in `app/dashboard/settings/page.tsx` `TEMPLATE_LABELS`.
3. Wherever you send it, `_send_email(company=..., subject=render(tpl['subject'], vars), ...)` — see `send_invite` in scheduler_service for the pattern.

### Changing the interview agent behaviour
Edit `packages/prompts/interview-agent.md`, then **re-run** `scripts/provision_retell_agent.py` (or update the LLM via Retell SDK). This is the source of truth; the code just loads the file.

### Injecting Notion context into the interview agent
Notion pages are indexed (`notion_page` w/ embeddings) but only the chat RAG queries them today. The interview agent does **not** see them. Wiring it in (≈30 min):

1. In `apps/api/app/services/retell_service.py`, add a Notion top-K helper and include it in `build_dynamic_vars()`:

   ```python
   from app.clients.openai_client import embed
   from app.models import NotionPage

   def _notion_context(db, company_id, employee) -> str:
       seed = " ".join(filter(None, [
           employee.job_title, employee.department, employee.memory_summary or ""
       ]))
       if not seed.strip():
           return ""
       qemb = embed(seed)
       rows = db.execute(
           select(NotionPage)
           .where(NotionPage.company_id == company_id, NotionPage.embedding.is_not(None))
           .order_by(NotionPage.embedding.cosine_distance(qemb))
           .limit(3)
       ).scalars().all()
       return "\n\n".join(f"# {p.title}\n{p.content[:1200]}" for p in rows)
   ```

   Then add `"notion_context": _notion_context(db, company.id, employee)` to the returned dict.

2. **Update `packages/prompts/interview-agent.md`** to reference the new variable. The prompt currently has `{{memory_summary}}` and `{{research_context}}` blocks near the top — add a sibling `{{notion_context}}` block with explicit framing so the agent knows how to use it without reading it back at the employee:

   ```
   {{notion_context}}

   The above is quiet context from the company's Notion workspace — projects, people, handbook pages relevant to {{employee_name}}. Don't quote it back at them or pretend you read their docs. Use it only so when they reference "Project Zenith" or "the activation goal", you know what they mean.
   ```

3. **Re-run** `scripts/provision_retell_agent.py` so Retell loads the new template. Without this step the new variable is set but the prompt won't reference it — silent no-op.

Without step 2 the variable is unused; without step 3 the prompt doesn't pick up. Both halves of the contract have to move together.

### Per-research-request curated context (recommended after Notion-into-agent)
The cosine-top-K Notion injection above is a generic default keyed on the employee. The richer pattern: when leadership creates a research request, they hand-pick which Notion pages (and future integrations — Jira epics, Slack channels, Linear projects) the agent should treat as context for that round. Result: the agent asks smarter questions because it knows both (a) the research goal and (b) the curated source material.

**Schema** — new join table that's source-agnostic so non-Notion integrations slot in later:

```python
class ResearchContext(Base):
    __tablename__ = "research_context"
    id: Mapped[int] = mapped_column(primary_key=True)
    research_request_id: Mapped[int] = mapped_column(
        ForeignKey("research_request.id", ondelete="CASCADE")
    )
    source_type: Mapped[str] = mapped_column(String(32))   # 'notion' | 'jira' | 'slack' | ...
    source_id: Mapped[str] = mapped_column(String(200))    # notion page_id, jira issue key, etc.
    label: Mapped[str | None] = mapped_column(String(500)) # cached display title
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

Migration adds the table; nothing else changes shape.

**UI — research plan screen** (`/dashboard/research/{id}`, draft state):

Add a "Context for the agent" panel under the employees list. Tabs per available source:
- **Notion** — tree of synced pages (existing `/integrations/notion/pages`), checkboxes
- **(future)** Jira issues, Slack channels, etc. — same checkbox tree

Selections POST to `PATCH /research/{id}/context` body `{items:[{source_type, source_id, label}]}` — replaces the set. Surfaced in the plan panel as chips.

**Backend — context resolution** when a research-linked interview starts:

In `build_dynamic_vars()` (`apps/api/app/services/retell_service.py`), branch on `interview.research_request_id`:

```python
if interview.research_request_id:
    chunks = []
    ctx = db.execute(
        select(ResearchContext).where(
            ResearchContext.research_request_id == interview.research_request_id
        )
    ).scalars()
    for c in ctx:
        if c.source_type == "notion":
            pages = db.execute(
                select(NotionPage).where(
                    NotionPage.company_id == company.id,
                    NotionPage.notion_page_id == c.source_id,
                )
            ).scalars().all()
            for p in pages:
                chunks.append(f"# {p.title}\n{p.content[:1200]}")
        # elif c.source_type == 'jira': ... fetch via composio
    research_curated_context = "\n\n".join(chunks)
else:
    research_curated_context = ""
```

Two distinct dynamic vars now flow into the prompt:
- `notion_context` — generic top-K cosine (employee role/dept/memory) — always populated when Notion is connected
- `research_context_pages` — admin-curated for this research request — only populated for research-linked calls

**Prompt update** (`packages/prompts/interview-agent.md`) — must teach the agent both kinds and how they differ:

```
{{notion_context}}

{{research_context_pages}}

When research_context_pages is present, this is a focused interview. Leadership has hand-picked the documents above as the most relevant material for the question they're trying to answer ({{research_context}}). Use those pages to ground specific follow-ups — e.g. "the Q3 plan I'm looking at says X — does that match how it's actually playing out?". Don't quote pages verbatim; reference them naturally.

The notion_context block (if present) is broader background to help you understand references the employee makes — not a target for questions.
```

Re-run `scripts/provision_retell_agent.py` after editing the prompt.

**Why this composes well:**

- Source-agnostic table means adding Jira/Slack later is a one-line `elif` in the resolver, no schema change.
- Curated context is per-research-request, so the same employee gets different framing in their cadence call vs a research call vs a different research call — exactly what the PRD's Mode B agent design implies.
- The cosine top-K layer still runs underneath as a fallback for general context. Curated takes priority in the prompt.

### Adding auth / multi-admin
Today `admin_session` is single-admin by cookie. Replace `get_current_company` dependency in `security.py` with a real user→session mapping, add `user_id` FK on `admin_session`. Start with one user row for the existing cookie to keep compatibility.

### 001 improvements pass — operating context and evidence UX
This branch added the first connected-intelligence pass from `001-improvements.md`:

- **Chat sessions + explicit context mode** — `chat_session` stores lightweight threads with `context_mode` (`all|page|custom`) and optional scope. New threads stay blank until the first message, then the backend names the thread from that first prompt. `ChatDock` can switch between previous named threads, plus a "Previous conversation" legacy option for pre-session chat messages (`/chat/history?session_id=-1`), and only narrows to the current OKR/department/employee when the user chooses it.
- **Richer citations** — `services/rag.py` returns `source_label`, `source_category`, `source_url`, and `preview` for insight/Notion citations. The chat UI renders clickable, focusable source pills and distinguishes employee signal from company documents.
- **Research briefs** — `research_request.plan_json` now carries brief fields (`goal`, `research_type`, `audience_mode`, `selected_employees`, `sample_questions`, `timeline`, `readout_threshold`) while preserving the legacy `employees`/`eta_days` shape for compatibility.
- **Research style affects interview framing** — when a research-linked interview starts, `retell_service.build_dynamic_vars()` includes the brief's `goal`, `research_type`, and `sample_questions` in `research_context`, so the Retell agent can adapt follow-ups to root-cause, pulse-check, decision-support, idea-discovery, or follow-up work.
- **OKR scope + KR signal** — `okr.scope_type/scope_id` support company vs department OKRs. `insight_key_result_tag` stores high-confidence KR-level links created during synthesis at a higher threshold than objective-level OKR tags.
- **Leadership-managed context** — `company_context` blocks are editable from Settings and injected into Retell dynamic vars as `leadership_context` for the next interview call. The prompt references this block and tells the agent to use it for probing, not recite it.
- **Alert/sensitive flow** — global dashboard alert banners were removed; alerts live in the Alerts nav with an unread sidebar badge. Interview pages now show sensitive handling context, linked alerts, omitted topics, and reviewed/pending status.
- **Employee leadership summary** — employee detail now returns aggregate stats (`completed_interviews`, `pending_interviews`, `average_sentiment`, `last_sentiment`) and the UI leads with status plus a concise manager-facing overview. Interview history only shows completed interviews with actual signal; scheduled/empty interviews stay in Pending interviews or out of history. The pending-interview card clarifies that `schedule-next` both schedules the cadence slot and sends the invite immediately.
- **Plain-language email templates** — Settings stores templates as HTML for sending, but admins edit plain email text. The UI converts paragraphs, bullets, and links on save/render, uses cream-highlighted variable chips consistently, and highlights detected `{{variables}}` in subject/body previews so placeholders are easy to spot.
- **Settings navigation** — Settings uses top anchor pills for Profile, Cadence, Context, Research, Integrations, and Email templates so admins can jump directly to the right configuration area without scanning a long page.
- **Research style visibility** — Settings includes a Research styles card explaining the five per-brief styles (`root_cause`, `pulse_check`, `decision_support`, `idea_discovery`, `follow_up`) and links admins to create or edit briefs. Styles are not global config; they are stored on each research request and passed into Retell as `research_context` when that round's interviews start.
- **Retell webhook recovery safety net** — `recover_ended_retell_calls_job` runs every 5 minutes. If a call is stuck `in_progress` because the local tunnel missed Retell's end webhook, it retrieves the Retell call, marks the interview completed, saves transcript/recording URLs, and runs synthesis once a transcript is available. This prevents demo/local tunnel misses from hiding completed interviews forever.

### Multi-tenant (multi-company)
The DB is already company-scoped — every table carries `company_id`. The session layer assumes one company; replace `get_current_company` to resolve from the cookie→user→company chain.

---

## Known gaps, risks, and next work

These aren't bugs — they're conscious omissions or things we punted on.

- **Next priority before the next demo: replace quick Cloudflare tunnel with a stable webhook URL.** Set up either a Cloudflare named tunnel with a fixed hostname or deploy the API to a stable demo environment, then update Retell's `webhook_url` permanently. Quick `trycloudflare.com` tunnels are random/ephemeral and will break again if used for demos.
- **Retell webhook signature verification is disabled by default** (`VERIFY_RETELL_WEBHOOK=false`). Acceptable for local pilot over a cloudflared tunnel where only Retell knows the URL. Must be flipped on before any hosted deploy.
- **HDBSCAN theme clustering needs ≥5 insights in a 30-day window** to produce anything. First two weeks of a pilot won't have themes. UI shows a friendly empty state.
- **Research request `status` skips the `running` state** the PRD defines — we use `approved` throughout the run and go straight to `complete` when all interviews land. Add `running` if admins need a distinction between "approved, nothing yet" and "in flight".
- **No idempotency keys on email sends.** Rate a re-queued send → possible duplicate. Add if scale bites.
- **Notion indexing is all-or-nothing** — reselecting pages deletes and re-syncs. Add diff-based sync if page counts grow.
- **Interview agent does not see Notion context.** Indexed pages are queried only by the leadership chat RAG. Wiring Notion into the interview's dynamic vars also requires a matching update to `packages/prompts/interview-agent.md` so the agent knows the context is there and how to handle it (don't read it back at the employee, use it only to disambiguate references). Recipe in *Where to extend → Injecting Notion context into the interview agent*.
- **No per-research-request curated context.** Leadership can't currently pick which docs the agent should treat as the source material for a given research round — context is either absent (today) or generic-top-K (after Notion-into-agent recipe). The richer pattern lets a manager tag specific Notion pages (and later Jira issues, Slack channels, etc.) per research request so the agent asks sharper questions grounded in those exact documents. Schema is source-agnostic so non-Notion integrations drop in cleanly. Recipe in *Where to extend → Per-research-request curated context*.
- **Voice (ElevenLabs) needs pilot tuning.** Currently `11labs-Adrian` — a placeholder. Swap per §voice-choice in the interview-agent prompt's maintainer notes.
- **No rate limiting on public `/interview/by-token/*` endpoints.** Tokens are long + scoped + expire, so risk is low, but add a reasonable per-IP limit before going public.
- **pytest coverage is skeletal** — only `slot_picker` has unit tests. Synthesis should have fixture-based tests once prompt behaviour is stable.
- **No structured error tracking.** stdout JSON + `docker compose logs` for now. Plug Sentry on hosted deploy.

---

*Last updated: 2026-05-01. Owner: Jamahl McMurran (BetterLabs). If something drifts from the code, the code wins — update this file in the same PR.*
