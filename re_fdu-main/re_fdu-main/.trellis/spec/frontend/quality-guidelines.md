# Quality Guidelines

> Frontend quality is judged by clarity of product logic, not just visual polish.

---

## Forbidden Patterns

- UI that hides why a match, answer, or referral outcome happened
- mock content presented as real integration without a visible cue in the code
  or UI state
- generic dashboard layouts that flatten the distinct P0-P4 flow
- privacy toggles that only recolor UI but do not change the underlying data

---

## Required Patterns

- every recommended match must show a reason
- every A2A conversation view must expose inspectable trace or evidence
- every privacy-sensitive view must show the active privacy level
- every referral flow must stop at an explicit human-decision surface

---

## Testing Requirements

At minimum, test:

- onboarding flow state transitions
- privacy toggle changing visible content
- matching cards rendering score plus explanation
- A2A trace ordering and summary generation
- handoff screen showing clear accept / reject outcomes

---

## Review Checklist

- Can a new viewer understand the product story in under 90 seconds?
- Is the UI centered on the main demo flow instead of optional side modes?
- Does every trust-sensitive state have visible explanation and boundaries?
