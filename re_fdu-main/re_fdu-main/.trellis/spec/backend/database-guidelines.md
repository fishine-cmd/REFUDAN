# Database Guidelines

> Persistence rules for a privacy-sensitive, demo-first product.

---

## Overview

The storage engine is not selected yet. Until a stack-selection task lands,
keep persistence behind adapters and design around domain entities, not vendor
features.

The first implementation wave should be able to run in mock or lightweight
local persistence mode. Do not make vector DB, graph DB, or multi-platform
ingestion a hard dependency for the first demo.

---

## Canonical Entities

Design storage around these canonical records:

- `user_profile`: the user's editable base profile
- `agent_profile`: distilled public/private agent-facing representation
- `knowledge_item`: uploaded notes, resume snippets, Q&A, memory fragments
- `match_candidate`: computed or cached recommendation outputs
- `a2a_session`: one dialogue between two agents
- `a2a_turn`: ordered protocol turns inside a session
- `referral_decision`: final human approval / rejection outcome

Privacy level must be attached at the field or item level, not only at the
whole-profile level.

---

## Query Patterns

- Read through privacy filters before serializing to UI or peer agents.
- Separate raw source records from normalized display records.
- Matching queries must return both a score and an explanation payload.
- Dialogue queries must preserve turn order and referenced evidence.

---

## Persistence Defaults

- Prefer append-only history for A2A turns; do not overwrite prior turns.
- Keep source-document imports traceable to their origin and timestamp.
- If a task only needs a demo, prefer checked-in fixtures or local seed data
  over premature infrastructure setup.

---

## Common Mistakes to Avoid

- Storing only the rendered profile and losing original evidence.
- Mixing public and owner-approved data in the same serialized response.
- Encoding privacy rules only in the frontend.
