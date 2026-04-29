# 001 Improvements

## Purpose

This document captures the next MVP improvements after reviewing:

- `AGORA_PRD.md`
- `PROJECT_OVERVIEW.md`
- Current web and API implementation

The product goal is unchanged: Agora should feel like a connected company-intelligence layer, not a set of disconnected dashboard pages. Every improvement below should increase leadership's ability to understand what is happening, why it matters, where it relates to goals, and what to do next.

## Product principles for this pass

- **Keep the MVP tight:** improve the existing surfaces before adding new systems.
- **Make context explicit:** leadership should always understand what data Agora is using.
- **Make sources navigable:** every claim should lead back to interviews, insights, OKRs, departments, or research.
- **Prefer connected objects over new abstractions:** OKRs, insights, interviews, alerts, research, and chat should reinforce each other.
- **Do not overbuild:** use simple UI state, existing tables, and targeted schema additions only where the current model cannot express the product need.

---

## 1. Research request UX — turn plans into launchable research briefs

### Current issue

The research flow currently feels like an approval workflow around a generated plan. That is operationally accurate, but less magical than the product should feel.

Leadership should not feel like they are configuring interviews. They should feel like they are asking Agora to investigate an important business question.

### Desired UX

Start from a single prompt:

- **What do you want to learn?**

Primary CTA:

- **Research this**

Secondary CTA:

- **Ask Agora first**

After submission, Agora generates an editable **research brief**, not a "plan".

The brief should include:

- **Question:** what leadership asked.
- **Goal:** what decision this should help with.
- **Audience:** recommended departments/groups first, named employees second.
- **Research style:** root cause, pulse check, decision support, idea discovery, or follow-up.
- **Expected output:** what the final report will answer.
- **Timeline:** when leadership can expect enough signal.

Primary CTA:

- **Launch research**

Secondary actions:

- **Edit brief**
- **Cancel**

### Implementation guidance

#### Research list page

Replace the current form-first planning language with:

- One-box input.
- Short reassurance that nothing is sent until launch.
- Optional "Ask Agora first" path.

#### Research detail page

Reframe the page as a research brief.

Recommended sections:

- Question
- Goal
- Who we'll talk to
- Research style
- Timeline

Remove separate "Approve" and "Approve with edits" language. If edits are made, they should save implicitly when the user clicks **Launch research**.

#### Data model direction

Expand `research_request.plan_json` first before adding columns. Use columns only once fields need filtering/reporting.

Plan shape should support:

- `goal`
- `research_type`
- `audience_mode`
- `selected_departments`
- `recommended_employees`
- `selected_employees`
- `sample_questions`
- `timeline`
- `readout_threshold`

### Copy guidance

Prefer:

- Research brief
- Who we'll talk to
- Launch research
- What decision should this help you make?

Avoid:

- Interviewees
- Approve with edits
- Plan

---

## 2. Chat dock — make scope powerful, visible, and user-controlled

### Current issue

`ChatDock` currently derives scope from the route and stores messages by `scope_type` / `scope_id`. This is a good MVP base, but it creates two product problems:

- By default, users often expect Agora to use all company context.
- Sometimes users want narrow context only: this OKR, this department, this employee, or a specific research request.

The current implementation silently scopes to the current page, which can make answers feel artificially limited.

### Desired UX

The chat dock should have a small context control above the input:

- **All company context** default
- **This page only**
- **Custom context**

When on a detail page, Agora can suggest the local scope, but it should not silently restrict context.

Example:

- On an OKR page: default remains **All company context**, with a visible chip: "Suggested: this OKR".
- User can click the chip to narrow the chat to that OKR.

### Chat sessions

Add lightweight topic sessions so leadership can keep separate threads:

- **Company health**
- **OKR questions**
- **Department deep dives**
- **Research planning**
- **Custom named thread**

This does not need a complex workspace model. For MVP, add a `chat_session` concept with:

- Title
- Context mode
- Optional scope type/id
- Last message timestamp

Messages should belong to a session. The current route-derived history can be migrated into an implicit session per scope.

### Implementation guidance

#### Frontend

Update `apps/web/components/ChatDock.tsx`:

- Show context mode explicitly.
- Default new messages to all company context unless the user chooses a narrower scope.
- Add a small session switcher at the top of the dock.
- Keep the existing compact dock; do not make chat a full separate product yet.

#### Backend

Extend `/chat` to accept:

- `session_id`
- `context_mode`: `all | page | custom`
- Optional `scope_type`
- Optional `scope_id`

Keep existing `scope_type` / `scope_id` support for compatibility.

### Acceptance

- A user can ask a company-wide question from any page without leaving the page.
- A user can narrow the answer to the current OKR/department/employee.
- A user can switch between at least two chat sessions without losing history.
- The UI always tells the user what context Agora is using.

---

## 3. Chat citations — make source pills useful, previewable, and clickable

### Current issue

Chat citations render as inactive pills in `ChatDock`. The backend already returns source-like citation data, but the UI does not turn it into useful navigation.

This weakens trust. If Agora says something important, leadership should be one click away from the supporting evidence.

### Desired UX

Citation pills should:

- Link to the source when clicked.
- Preview the source on hover/focus.
- Clearly label source type: interview, insight, employee, OKR, or Notion page.

### MVP preview behavior

Use a simple hover/focus card:

- **Interview citation:** employee name, date, short excerpt, link to interview.
- **Insight citation:** insight type, severity, employee, excerpt, link to interview.
- **Notion citation:** title and first lines of content.

Do not build a heavy popover framework unless already present. A small accessible CSS/React hover card is enough.

### Implementation guidance

Update citation rendering in `apps/web/components/ChatDock.tsx`:

- Replace `<span>` pills with `Link` where a URL can be derived.
- Derive URLs from existing fields:
  - `interview_id` → `/dashboard/interviews/:id`
  - `type === "notion"` → non-clickable preview unless a Notion URL is stored later
  - Future OKR/employee citations → their detail routes
- Add keyboard accessibility via focus-visible preview.

If the backend citation payload is too thin, extend `services/rag.py` to include:

- `source_url`
- `preview`
- `source_label`

### Acceptance

- Clicking an interview citation opens the relevant interview.
- Hovering or focusing a citation shows enough context to understand why it was cited.
- Citations are still compact enough not to dominate the chat answer.

---

## 4. Alerts — move global alerts into the Alerts nav item, keep urgent interview context local

### Current issue

Unread alerts currently render globally through `AlertsBanner` in `dashboard/layout.tsx`, which means alert cards can appear at the top of every dashboard page. There is also already a dedicated `/dashboard/alerts` page.

This makes alerts feel noisy instead of intentional.

### Desired UX

Alerts should live primarily in the **Alerts** menu item.

The sidebar should show an unread count badge:

- `Alerts 3`

Global alert banners should be removed from every page.

Exception:

- Interview-specific alert context can remain visible at the top of the relevant interview page, where the user is already looking at the source material.

### Implementation guidance

#### Frontend

Update:

- `apps/web/app/dashboard/layout.tsx`
- `apps/web/components/Sidebar.tsx`
- `apps/web/components/AlertsBanner.tsx`
- `apps/web/app/dashboard/alerts/page.tsx`
- `apps/web/app/dashboard/interviews/[id]/page.tsx`

Tasks:

- Remove global `AlertsBanner` from the dashboard layout.
- Add unread alert count fetch to `Sidebar`.
- Render a small count badge next to Alerts.
- Keep `/dashboard/alerts` as the main inbox with unread/acknowledged tabs.
- Add interview-specific alert summary only on the interview detail page if alerts exist for that interview.

### Acceptance

- No alert banner appears on every dashboard page.
- Sidebar shows the number of unread alerts.
- Alerts page remains the place to triage outstanding alerts.
- Interview page can show alerts related to that interview only.

---

## 5. OKRs — make goals a first-class intelligence surface, not just a list

### Current issue

The PRD says leadership wants to know whether OKRs are actually progressing based on ground-truth signal. The current model tags insights to OKRs, but the UI is still mostly a list of OKRs and a detail page with insights.

The product should more directly answer:

- What feedback relates to this Objective?
- What feedback relates to this Key Result?
- Which departments are contributing signal?
- Are there company-level OKRs and department-level OKRs?
- Is an OKR unsupported by real feedback?

### Desired product behavior

The OKR tab should let the user:

1. Set multiple OKRs by scope:
   - Company OKRs
   - Department OKRs
2. View feedback notes per Objective.
3. View feedback notes per Key Result when there is a relationship.
4. See when Agora is unsure about a relationship.
5. Ask Agora: "What is blocking this KR?" and land in a scoped chat with the right context.

### Elegant MVP implementation

#### Data model

Add scope to OKRs:

- `okr.scope_type`: `company | department`
- `okr.scope_id`: nullable department name/id for department OKRs

Add optional KR-level tagging without replacing OKR-level tagging:

- `insight_key_result_tag`
  - `insight_id`
  - `key_result_id`
  - `similarity`
  - `match_reason`

Keep `insight_okr_tag` as the broad objective-level link.

#### Synthesis / tagging

Current synthesis embeds and tags insights to OKRs. Extend this in the smallest useful way:

- Continue tagging to OKRs.
- Also compare insight embeddings to individual key result embeddings.
- Only show KR-level links above a higher threshold than OKR-level links.
- If confidence is below threshold, keep the insight on the Objective but do not force it onto a KR.

This prevents false precision.

#### OKR UI

Update the OKR list page:

- Group by Company and Department.
- Show signal summary per OKR:
  - blockers
  - wins
  - sentiment direction
  - number of linked insights

Update the OKR detail page:

- Keep AI summary.
- Show Objective-level insight stream.
- Add each Key Result as a card with:
  - linked feedback notes
  - severity distribution
  - departments/employees contributing signal
  - empty state: "No direct feedback linked to this KR yet"

### Acceptance

- User can create or view company-level and department-level OKRs.
- User can see feedback linked to an Objective.
- User can see feedback linked to a Key Result only when the relationship is strong enough.
- User can identify OKRs/KRs with no feedback signal.
- Chat can be launched with OKR or KR context.

---

## 6. Review queue — fix severity type error and harden flagged insight display

### Current issue

The review page can fail with:

- `severity.toLowerCase is not a function`

Root cause from code review:

- API returns `severity` as a number from `Insight.severity`.
- `apps/web/app/dashboard/review/page.tsx` types `severity` as `string` and calls string formatting helpers on it.

### Fix

Update the review page frontend type and formatting:

- `severity: number`
- `severityTone(severity: number)`
- `labelizeSeverity(severity: number)` returning labels such as:
  - `Low`
  - `Medium`
  - `High`
  - `Critical`

Suggested mapping:

- `1–2`: Low
- `3`: Medium
- `4`: High
- `5`: Critical

### Extra hardening

- Keep `type` as string and defensive.
- Use interview `scheduled_at` defensively in case null data ever appears.
- Consider showing direct source metadata: employee, interview, flagged time, and current review state.

### Acceptance

- `/dashboard/review` loads when pending insights have numeric severity.
- Severity badges render correctly.
- Approve and Suppress still remove the item from the queue.

---

## 7. Connect alerts, review, and source interviews into one sensitive-content flow

### Current issue

The product has three related concepts:

- Review queue for sensitive-but-approved paraphrases.
- Alerts for hard escalations.
- Interview detail pages as the source of truth.

They exist, but the user flow should be tighter.

### Desired UX

When leadership receives an alert or reviews a flagged insight, they should understand:

- What happened.
- Who said it.
- What the AI did with it.
- Whether anything is currently blocked from dashboards.
- What action leadership can take.

### MVP implementation

- On interview detail pages, add a compact "Sensitive handling" panel when relevant.
- Show:
  - omitted topics count/labels if present
  - pending review items
  - approved/suppressed status
  - linked alerts
- From an alert, link to the interview and highlight the relevant panel.
- From review queue, link to the interview source.

### Alert acknowledgement state on interview pages

If an alert linked to an interview has been acknowledged, that state should be reflected wherever the interview currently shows sensitive-status pills.

Current issue:

- The employee/interview section can still show a pill like **Sensitive — pending review** after the alert has been acknowledged.
- This makes it look like leadership still needs to take action even after they have handled it.

Desired behavior:

- Pending sensitive item: **Sensitive — pending review** with urgent styling.
- Acknowledged alert: **Sensitive — reviewed** with a calmer distinct color, such as purple, to signal "handled but important" rather than "active danger".
- Suppressed insight: **Sensitive — suppressed** with neutral styling.
- Approved sensitive insight: **Sensitive — approved** with a clear but non-alarming style.

Hover/focus metadata should show:

- who acknowledged it, if the system has an admin identity available
- when it was acknowledged
- whether it came from an alert, review queue item, or both
- link to the source alert/review item where relevant

MVP data note:

- `admin_alert` currently stores `acknowledged_at` but not `acknowledged_by`.
- In the single-admin MVP, showing `Acknowledged by admin` is acceptable.
- If/when multi-admin is added, extend `admin_alert` with `acknowledged_by_admin_id` or equivalent.

### Acceptance

- Alerts and review items no longer feel like separate systems.
- Leadership can trace every sensitive signal back to the interview source.
- Suppressed insights stay invisible to dashboard/chat intelligence.
- Acknowledged alerts no longer render as pending review on interview/employee sensitive-status pills.
- Hovering or focusing a reviewed sensitive pill explains who acknowledged it and when, where available.

---

## 8. Make the dashboard feel more like an operating system for the company

### Observation

Agora's differentiator is not "a dashboard with AI summaries." It is that every piece of employee feedback becomes connected operational intelligence.

The current implementation has the right primitives:

- Employees
- Interviews
- Insights
- Sentiment
- OKR tags
- Themes
- Alerts
- Chat
- Research

The opportunity is to connect these surfaces more tightly without adding much scope.

### Suggested MVP improvements

#### Add "Why this matters" snippets

On blocker, theme, OKR, and department cards, add one sentence explaining why Agora surfaced it.

Examples:

- "Surfaced by 3 people in Product and Engineering over 9 days."
- "High severity and linked to the Q3 retention OKR."
- "Repeated by the same employee across two interviews."

This can be deterministic from existing data.

#### Add "Ask about this" entry points

On major cards, add a small CTA:

- **Ask Agora about this**

This opens chat with the relevant context selected.

Use it on:

- OKR cards
- Theme cards
- Top blocker cards
- Department summary panels
- Employee timeline items

#### Add "No signal yet" as meaningful state

For OKRs, departments, and themes, an empty state should not just say there is no data. It should explain what happens next.

Examples:

- "No direct feedback linked to this KR yet. Agora will watch for related signals in upcoming interviews."
- "Themes appear after enough repeated signal. You need roughly 5+ related insights."

#### Add lightweight recency indicators

Leadership needs to know whether signal is fresh.

Use simple labels:

- New this week
- Repeated
- Cooling down
- No recent signal

No complex scoring needed for MVP.

### Acceptance

- Dashboard cards explain why they are present.
- Leadership can ask follow-up questions directly from important objects.
- Empty states teach the user how Agora works.

---

## 9. Improve Notion/context transparency in chat

### Current issue

The PRD includes Notion as context for chat and interview agent behavior. The current RAG path can include `notion_page`, but the chat UI does not clearly tell the user when Notion context was used.

### Desired UX

When Agora uses Notion context:

- Cite it separately from interview-derived insight.
- Preview the document title and excerpt.
- Make it clear that Notion is background context, not employee feedback.

### Acceptance

- Chat answers visually distinguish employee signal from Notion/company context.
- User can tell whether an answer is based on interviews, docs, or both.

---

## 10. Fix duplicate React keys in repeated variable/name lists

### Current issue

The app can show React warnings like:

- `Encountered two children with the same key, employee_name`
- The same class of warning also appears for values such as `company_name` and similar repeated dynamic variable names.

This means at least one rendered list is using a non-unique field name as the React `key`. React keys must be unique among siblings, otherwise rows can be duplicated, omitted, or keep stale component state after updates.

### Likely cause

Some UI is probably rendering dynamic variables, template variables, prompt fields, or integration payload fields with a key like:

- `key={name}`
- `key={field}`
- `key={variable.name}`

That is unsafe when the same variable name appears in multiple groups, sections, templates, or payloads.

### Fix

Audit frontend `.map()` calls that render variable-like rows, especially around:

- onboarding/company profile fields
- email template variables
- Retell dynamic variables
- integration/settings debug lists
- interview metadata rows

Replace non-unique keys with stable composite keys or backend IDs.

Examples:

- Use `key={`${section}-${variable.name}`}` when the same name can appear in multiple sections.
- Use `key={`${templateKind}-${variable.name}`}` for email template variables.
- Use `key={row.id}` when the backend provides a stable ID.
- Use array index only as a last resort for static, non-reorderable display-only lists.

### Acceptance

- The duplicate key warning no longer appears for `employee_name`, `company_name`, or related dynamic variables.
- Lists still update correctly after editing company profile, employee data, templates, or dynamic variable previews.
- No rendered list uses a plain variable name as key unless uniqueness is guaranteed in that sibling list.

---

## 11. Settings — leadership-managed context for the interview agent

### Problem

Agent context is fixed at deploy time. The dynamic variables injected into every Retell call are: company name, company description, active OKRs, employee memory summary, and (optionally) a research question. Leadership cannot inject current priorities, recent announcements, cultural values, or org changes without touching code or the Retell agent directly.

This means the agent can be out of date within days of a reorg, a strategy shift, or a major announcement.

### Feature

A **Context** section inside Settings — a set of named text blocks that leadership manages through the UI. Each block has a label, content, scope, and an active toggle. Active blocks are fetched at call time and injected as a `leadership_context` dynamic variable so the agent can use them to inform how it probes.

### Data model

New table: `company_context`

```
company_context
  id            serial PK
  company_id    fk → company (cascade delete)
  label         text          -- e.g. "Q2 priorities", "Recent reorg", "Culture values"
  content       text          -- free-form prose leadership writes
  scope_type    enum(company|department)
  scope_id      text nullable -- department name if scope_type = department
  is_active     bool default true
  created_at    timestamptz
  updated_at    timestamptz
```

### Backend

CRUD at `/admin/company/context`:

- `GET /admin/company/context` — list all blocks for the company
- `POST /admin/company/context` — create a block
- `PATCH /admin/company/context/{id}` — update label/content/scope/is_active
- `DELETE /admin/company/context/{id}` — remove a block

In `services/retell_service.py`, at call time:

1. Fetch all `is_active=true` blocks for the company where `scope_type=company` OR (`scope_type=department` AND `scope_id` matches the employee's department).
2. Concatenate as labeled sections: `## {label}\n{content}`.
3. Inject as `leadership_context` dynamic variable.
4. If no active blocks exist, inject an empty string (not null).

### Prompt update

Update `packages/prompts/interview-agent.md` to reference `{{leadership_context}}`:

- Place it in the context section alongside OKRs and memory summary.
- Instruct the agent to use it to inform the direction and depth of probing — not to recite it verbatim to the employee.
- Example framing in the prompt: *"Leadership context: current priorities and recent company updates. Use this to inform the areas you explore and the follow-up questions you ask."*

### Settings UI

Add a **Context** card in `apps/web/app/dashboard/settings/page.tsx`:

- List of existing blocks with label, scope badge, active toggle, edit, and delete.
- "Add context block" opens an inline form: label, content (textarea), scope selector (company-wide or specific department).
- Toggling `is_active` takes effect on the next interview call — no restart needed.

### Why it matters

OKRs change quarterly. Reorgs happen monthly. Priorities shift weekly. The interview agent needs to reflect what leadership actually cares about right now — not what was hardcoded at last deploy. This gives leadership self-serve control to keep the agent current without needing a developer.

### Acceptance

- Leadership can create, edit, toggle, and delete context blocks from Settings.
- Active company-wide blocks appear in every call's dynamic variables.
- Active department-scoped blocks appear only for employees in that department.
- The agent uses the context to probe relevant topics without reciting it directly.
- Removing or deactivating a block takes effect immediately on the next call.

---

## 12. Suggested execution order

### Quick fixes

1. Fix review page numeric severity bug.
2. Fix duplicate React keys for dynamic variable/name lists.
3. Make chat citation pills clickable.
4. Remove global alerts banner and add sidebar unread count.

### High-value MVP improvements

5. Add explicit chat context control.
6. Improve OKR view with objective-level signal and KR-level feedback links.
7. Reframe research plan UI as a launchable research brief.
8. Add leadership-managed context blocks in Settings (feeds agent dynamic variables).

### Product polish

9. Add "Why this matters" snippets.
10. Add "Ask Agora about this" CTAs.
11. Add sensitive-content panel on interview detail pages.
12. Add lightweight chat sessions.

## Outcome target

The leadership experience should feel like:

- I ask what I want to know.
- Agora shows me what it knows and what it does not know.
- Every answer is connected to evidence.
- Every alert, OKR, theme, and research request fits into one coherent operating picture.
- I can act faster because the product shows relationships I would otherwise miss.
