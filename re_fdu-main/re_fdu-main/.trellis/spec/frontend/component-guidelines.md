# Component Guidelines

> Components should make the product's agent logic legible, not hide it behind generic UI.

---

## Overview

The first demo succeeds when a viewer can quickly understand:

- what data was ingested
- why a match exists
- what the agents are saying to each other
- what information is hidden or revealed at each step
- when the system stops and asks a human to decide

Components should therefore favor explicit states and evidence over visual
abstraction for its own sake.

---

## Component Structure

- Keep feature containers thin and data-aware.
- Push pure presentation into reusable child components only after a second use.
- Treat the following as first-class product components, not one-off views:
  `PrivacyBadge`, `MatchReasonPanel`, `A2ATracePanel`, `AgentSummaryCard`,
  `HumanHandoffCard`.

---

## Props Conventions

- Prefer explicit domain props over catch-all blobs.
- Pass both score and reason data to matching UI; never show a bare number.
- Pass privacy level and visibility state to any component that renders user
  knowledge, profile fields, or dialogue evidence.

---

## Styling and Interaction

- The A2A trace should feel protocol-like and inspectable.
- Loading states should reinforce the "agent is working" story, especially
  during profile generation and inter-agent negotiation.
- Human-handoff components must clearly mark that AI authority has ended.

---

## Accessibility

- Privacy state changes must be readable by text, not color alone.
- Trace logs and summary panels should remain navigable by keyboard.
- Any generated explanation shown visually should also exist as text.

---

## Common Mistakes to Avoid

- Hiding important product logic inside decorative cards.
- Treating A2A dialogue as ordinary chat and dropping protocol metadata.
- Rendering private knowledge snippets without their visibility label.
