# Hook Guidelines

> Hooks should capture journey logic and derived product state, not become hidden controllers.

---

## Custom Hook Patterns

Good hook candidates in this project:

- onboarding state derived from uploaded sources and profile completeness
- match filtering / ranking controls
- A2A session playback, turn grouping, and derived summaries
- privacy-tier switching and gated field projection
- handoff readiness and summary-card generation

Prefer one hook per product concern. If a hook starts coordinating multiple
unrelated features, move shared logic into feature services or shared utilities.

---

## Data Fetching

- Keep fetching strategy replaceable between mock and live adapters.
- Normalize fetched data before it reaches components.
- Separate "request status" from "domain meaning"; for example, "no match"
  should not be encoded only as an empty array and guessed in the UI.

---

## Naming Conventions

- Use explicit domain names: `useProfileDraft`, `useMatchCandidates`,
  `useA2ASession`, `usePrivacyProjection`.
- Avoid overly generic hooks such as `useAgentData` unless the domain is
  truly shared and stable.

---

## Common Mistakes to Avoid

- Storing canonical product state only inside component-local hooks.
- Returning untyped `any` payloads from hooks.
- Mixing demo script timing logic with actual domain derivation in the same hook.
