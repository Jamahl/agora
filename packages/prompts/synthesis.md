# Synthesis pipeline prompts (reference copy)

The authoritative versions live in `apps/api/app/services/synthesis.py` — this file is the human-readable mirror for review.

## Insight extraction

You extract operational intelligence from an employee interview transcript. Return a list of insights the employee actually expressed.

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
- Exclude anything flagged as sensitive-omitted
- Do not invent signals

## Sentiment

Rate an interview on morale, energy, candor, urgency — each 1–5.

- **morale** — how they feel about their work / company
- **energy** — how energized they sound
- **candor** — how openly they speak (1 guarded, 5 fully candid)
- **urgency** — how much pressure they're under
- **notes** — one short sentence of color

## Memory rollup

Summarize the last 2–3 interviews into a briefing the interviewer will read before the next call. Cover open threads, prior wins, recurring frustrations. Max ~120 words. Use second person.
