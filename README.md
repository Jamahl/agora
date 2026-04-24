# Agora

Voice-AI company intelligence. Leadership admin-facing dashboard + employee-facing interview page, backed by Retell (voice) + OpenAI (LLM + embeddings) + Postgres/pgvector.

## Layout

```
apps/
  web/            Next.js 15 + TS + Tailwind — admin dashboard + /interview/[token]
  api/            FastAPI — REST + webhooks + synthesis pipeline + scheduler
packages/
  prompts/        interview-agent.md (Retell system prompt), synthesis.md
scripts/
  provision_retell_agent.py   one-off: creates the Retell LLM + agent from the prompt
  tunnel.sh                   cloudflared/ngrok tunnel for Retell webhooks
```

## Prerequisites

- Docker Desktop
- Node 22 + pnpm (only needed if you want to run the web app outside Docker)
- Python 3.12 + `uv` (only needed for running the provisioning script locally)
- Retell account + API key
- OpenAI API key
- Composio API key (optional, used for Notion indexing)
- Loops API key (optional, used for interview invite/reminder emails)
- `cloudflared` or `ngrok` for tunneling Retell webhooks into localhost

## First-time setup

```bash
cp .env.example .env           # then fill in real keys
docker compose up -d postgres  # db first so migrations can run
docker compose up --build      # api + web

# In another terminal:
# 1) expose the API publicly so Retell can post webhooks
./scripts/tunnel.sh            # copy the https URL it prints
# update .env:
#   RETELL_WEBHOOK_BASE_URL=https://<your-tunnel>.trycloudflare.com
# then restart the api container so the scheduler and provisioning pick it up
docker compose restart api

# 2) provision the Retell agent (first time only)
OPENAI_API_KEY=... RETELL_API_KEY=... RETELL_WEBHOOK_BASE_URL=https://... \
  python scripts/provision_retell_agent.py
# paste the printed RETELL_AGENT_ID into .env, then:
docker compose restart api
```

Open http://localhost:3010. First load kicks off the onboarding wizard.

## Stack at a glance

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router + TypeScript + Tailwind + recharts |
| Backend | FastAPI 3.12 + SQLAlchemy 2 + Alembic + APScheduler |
| DB | Postgres 16 with pgvector (3072-dim embeddings) |
| Voice | Retell Web Call SDK with a BYO OpenAI LLM |
| LLM | OpenAI gpt-4.1 + text-embedding-3-large |
| Research agent | OpenAI structured outputs (plan) → schedule interviews |
| Email | Loops transactional (invites, reminders, admin notifs) |
| Integrations | Composio for Notion indexing |
| Scheduler | APScheduler w/ Postgres job store (inside the FastAPI process) |

## Key flows

**Onboarding (single admin session, cookie-based).**
`/` → boots a session if none → `/onboarding` 6-step wizard → complete-onboarding triggers first cadence scan → admin lands on `/dashboard`.

**Interview cycle.**
Scheduler (daily at 03:00 UTC) picks next-free slots → writes `interview` rows with tokenized links → Loops sends invite + `.ics`. 15 min before: reminder. 30 min after a no-show: reschedule. After 2 consecutive no-shows: admin alert.

**Voice call.**
Employee clicks tokenized link → `/interview/[token]` validates the token, greets, starts a Retell web call with dynamic variables (name, company, OKRs, memory summary, research context if any). Retell posts to `/webhooks/retell` on events. Custom function calls route to `/webhooks/retell/functions/*` for sensitive-content handling, admin alerts, summary corrections.

**Synthesis.**
On `call_ended`, background task runs: cleaned transcript → typed insights → embeddings → OKR tagging via pgvector cosine → sentiment rating → memory summary rollup → progressive research report (if applicable).

**Dashboard.**
Home: this-week counts, top blockers, OKR health, sentiment trend, emerging themes. Drill-in: departments, OKR detail (AI summary), employee timeline, theme clusters, interview detail (transcript + insights + sentiment).

**Leadership chat.**
RAG over insights + Notion pages, scoped to the current view (OKR / department / employee / global). Classifier decides if a question needs research. If yes, a plan is drafted and the admin gets a link to approve/edit/reject; on approval, interviews are scheduled outside the regular cadence.

## Useful commands

```bash
# run migrations
docker compose exec api alembic upgrade head

# create a new migration (after editing models)
docker compose exec api alembic revision --autogenerate -m "describe change"

# shell into Postgres
docker compose exec postgres psql -U agora -d agora

# tail logs
docker compose logs -f api
```

## Notes

- Local-only MVP. No Sentry, no hosted deploy. Retell webhooks require the tunnel.
- Single company, single admin. Session is a signed cookie — no auth provider.
- Attribution (not anonymity) — every insight ties back to the speaker. This is intentional; see the PRD §4.7.
