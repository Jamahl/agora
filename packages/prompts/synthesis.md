# Synthesis pipeline prompts (reference copy)

The authoritative versions live in `apps/api/app/services/synthesis.py` — this file is the human-readable mirror for review.

## Insight extraction

You extract operational intelligence from an employee interview transcript. Return a list of insights the employee actually expressed in this interview.

Types:
- `blocker` — active obstacle
- `win` — something working
- `start_doing` — what we should start
- `stop_doing` — what we should stop
- `tooling_gap` — missing tools, info, access, or context
- `sentiment_note` — important mood or attitude signal
- `other`

Rules:
- `content` = 1–2 sentence neutral paraphrase in third person
- `direct_quote` optional verbatim ≤ 200 chars
- `severity` 1 (trivial) → 5 (business-critical)
- `confidence` reflects how clearly the employee stated it
- Extract only from employee/user turns, not from the agent's questions, summaries, or prior-memory recaps
- If the agent mentions a previous interview topic, include it only if the employee explicitly confirms, updates, denies, or expands on it in this interview
- Exclude anything flagged as sensitive-omitted
- Do not invent signals

## OKR / KR relevance

Embeddings are used for candidate recall, not final truth. For each extracted insight, shortlist active objectives and key results by cosine similarity, then ask a strict structured classifier whether the insight materially affects each candidate.

Rules:
- Tag only blockers, risks, wins, opportunities, behaviors, or operational conditions that directly affect progress toward the objective/KR
- Allow business-language matches where the connection is concrete, e.g. deal closure, due diligence, pipeline, review speed, or investment process can affect acquisition/investment KRs
- The pipeline stores at most one KR tag per insight: the highest-similarity judge-approved KR
- Do not tag generic morale, unrelated interpersonal issues, broad productivity notes, or prior-memory topics unless the insight itself says the employee stated it in this interview
- Return only candidate IDs that were supplied
- Keep match reasons concise and specific

## Sentiment

Rate an interview on morale, energy, candor, urgency — each 1–5.

- **morale** — how they feel about their work / company
- **energy** — how energized they sound
- **candor** — how openly they speak (1 guarded, 5 fully candid)
- **urgency** — how much pressure they're under
- **notes** — one short sentence of color

## Memory rollup

Summarize the last 2–3 interviews into a briefing the interviewer will read before the next call. Cover open threads, prior wins, recurring frustrations. Max ~120 words. Use second person.
