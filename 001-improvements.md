# 001 Improvements

## Agreed product decisions

- Entry model: start with one input box
- Audience model: default to departments/groups, with specific people as optional edits
- Question design model: leadership chooses a research style, Agora generates the actual interview questions

## Recommended UX

### 1. One-box start

Start with a single prompt:

- What do you want to learn?

Example CTA:

- Research this

Secondary option:

- Ask Agora first

## 2. Draft a research brief, not a plan

After the leader submits a question, Agora should generate a short editable brief with:

- Question
- Goal
- Audience
- Research style
- Expected output
- Timeline

Primary CTA:

- Launch research

Secondary actions:

- Edit brief
- Cancel

## 3. Audience editing

Default audience flow:

- Recommended audience from Agora
- Department/group selection first
- Named employee edits second

Do not make named employee selection the default starting point.

## 4. Research style

Expose simple choices instead of raw question configuration:

- Root cause
- Pulse check
- Decision support
- Idea discovery
- Follow-up

Agora should generate the interview prompts from the chosen style.

## UX principles

- Start at the decision level, not the operational level
- Hide complexity until needed
- Make the primary action obvious
- Use plain language instead of internal system language
- Default to AI recommendation, then allow lightweight edits

## Minimal implementation guidance

### Research list page

Replace the current form-first planning language with:

- One-box input
- Short reassurance that nothing is sent until launch
- Optional "Ask Agora first" path

### Research detail page

Reframe the page as a research brief, not an approval workflow.

Recommended sections:

- Question
- Goal
- Who we’ll talk to
- Research style
- Timeline

Primary action:

- Launch research

Remove the need for separate actions like:

- Approve
- Approve with edits

If edits are made, they should save implicitly on launch.

### Data model direction

Expand the research request / plan shape to support:

- goal
- research_type
- audience_mode
- selected_departments
- recommended_employees
- selected_employees
- sample_questions
- timeline
- readout_threshold

## Copy guidance

Prefer:

- Research brief
- Who we’ll talk to
- Launch research
- What decision should this help you make?

Avoid:

- Interviewees
- Approve with edits
- Plan

## Outcome target

The leadership experience should feel like:

- I say what I want to learn
- Agora turns it into a smart brief
- I sanity-check it
- I click go
