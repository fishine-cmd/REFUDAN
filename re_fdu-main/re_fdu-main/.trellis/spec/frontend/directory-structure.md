# Directory Structure

> Default frontend layout for the first playable demo.

---

## Overview

Use app boundaries aligned to the product journey, not generic page buckets.
The initial build should optimize for the P0-P4 walkthrough described in the
PRD.

---

## Bootstrap Layout

```text
apps/
├── site/
│   └── src/
│       ├── app/
│       ├── components/
│       └── styles/
└── app/
    └── src/
        ├── app/
        ├── components/
        └── styles/

packages/
└── contracts/
    └── src/

landing/
doc/
```

Use the folders as follows:

- `apps/site/`: public landing page, hero, flow teaser, and repo story
- `apps/app/`: route shells for onboarding, matching, dialogue, and referral
- `packages/contracts/`: UI-visible domain types, flow states, and demo payloads
- `landing/`: preserved static prototype and visual source material
- `doc/`: preserved source/archive docs and research notes

---

## Naming Conventions

- Use app-first folders and explicit names: `onboarding`, `matching`, `dialogue`.
- Reserve generic names like `Card` or `Modal` for reusable UI primitives only.
- Keep demo scripts and fixtures close to the route or contract they explain.
