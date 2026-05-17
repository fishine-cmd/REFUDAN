# Type Safety

> Shared product contracts matter more here than framework-specific typing tricks.

---

## Core Domain Types

Define and share explicit contracts in `packages/contracts` for:

- `PrivacyLevel`
- `UserProfile`
- `AgentProfile`
- `KnowledgeItem`
- `MatchCandidate`
- `MatchReason`
- `A2ASession`
- `A2ATurn`
- `ReferralDecision`

These types should exist in one shared contracts layer and be imported by both
apps.

---

## Validation

- Validate at boundaries: uploads, API inputs, adapter outputs.
- Keep raw-source shape separate from normalized app shape.
- When a task introduces runtime validation, prefer schemas that can power both
  parsing and inferred types.

---

## Preferred Patterns

- discriminated unions for flow states such as `loading / ready / denied / handoff_required`
- explicit enums or string unions for privacy and referral states
- typed trace entries for A2A protocol turns

---

## Forbidden Patterns

- `any` for shared domain objects
- unlabelled `Record<string, unknown>` payloads passed across layers
- type assertions used to skip privacy or adapter validation
