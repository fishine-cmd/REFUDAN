# State Management

> Keep state simple, inspectable, and aligned to the demo journey.

---

## State Categories

- local state: form drafts, hover/open UI state, step-local filters
- shared workflow state: active profile draft, selected candidate, current A2A
  session, active privacy level, referral decision draft
- server or adapter state: persisted profile, match results, dialogue turns,
  referral outcome
- URL state: only use when the state should survive refresh/share and helps
  demo navigation

---

## Default Rule

Start local. Promote to shared state only when:

- multiple features need the same domain object
- step-to-step continuity matters across P0-P4
- the state must stay consistent with a backend or adapter response

---

## Derived State

Prefer derived selectors for:

- profile completeness
- match explanation summaries
- visible vs hidden knowledge items under a privacy tier
- dialogue progress and handoff readiness

Do not duplicate these as manually synchronized booleans in several components.

---

## Common Mistakes to Avoid

- Mixing mock transport state with canonical product state.
- Making the privacy tier a purely visual toggle instead of a data projection.
- Spreading the active candidate / active A2A session across unrelated components.
