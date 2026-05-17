# Quality Guidelines

> Backend tasks must preserve product trust, not just make the happy path run.

---

## Forbidden Patterns

- hard-coding hidden data into mock responses without privacy labels
- coupling feature logic directly to a specific third-party platform adapter
- writing matching logic that returns a score without an explanation
- skipping the human-handoff boundary in order to "complete" a referral flow

---

## Required Patterns

- keep privacy filtering server-side
- model domain entities explicitly in shared contracts
- keep demo mode and live mode swappable behind adapters
- preserve evidence links for generated summaries and A2A trace outputs

---

## Testing Requirements

Every backend feature should cover, at minimum:

- allowed vs denied privacy reads
- empty / partial profile behavior
- deterministic matching explanation payloads
- A2A turn ordering and final handoff boundary
- adapter fallback behavior when external calls fail

---

## Review Checklist

- Does the feature move the core P0-P4 flow forward?
- Are hidden fields impossible to leak through logs, errors, or summaries?
- Can demo mode run without production infrastructure?
- Are outputs explainable enough for a judge or teammate to understand?
