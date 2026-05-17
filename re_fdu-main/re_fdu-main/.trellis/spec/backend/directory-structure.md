# Directory Structure

> Default backend organization for the first implementation wave.

---

## Overview

Treat RE_FUDAN as a monorepo with backend-adjacent server logic living inside
`apps/app`, not as a separate service layer.

Backend code should be feature-sliced around the product flow, not around
abstract layers.

---

## Bootstrap Layout

```text
apps/
└── app/
    └── src/
        ├── app/
        │   ├── api/
        │   ├── onboarding/
        │   ├── matching/
        │   ├── dialogue/
        │   └── referral/
        ├── server/
        │   ├── profile/
        │   ├── matching/
        │   ├── dialogue/
        │   ├── referral/
        │   ├── privacy/
        │   ├── adapters/
        │   └── shared/
        └── mocks/

packages/
└── contracts/
```

Use the folders as follows:

- `app/api/`: route handlers for future external or internal APIs
- `server/profile/`: ingestion normalization, persona assembly, public/private views
- `server/matching/`: path similarity, recommendation reasons, ranking inputs
- `server/dialogue/`: A2A turn orchestration, trace formatting, handshake rules
- `server/referral/`: human handoff, acceptance / rejection decisions
- `server/privacy/`: shared privacy policy, filters, release guards
- `server/adapters/`: external systems such as SecondMe, vector stores, scraping/import
- `server/shared/`: framework-independent helpers used by multiple backend features
- `packages/contracts/`: shared request/response/domain schemas used by UI and backend
- `mocks/`: seeded fixtures for demo mode and tests

---

## Organization Rules

- Put business rules in feature folders, not in route handlers.
- Keep framework entrypoints thin; they should validate input, call feature
  services, and map results to transport responses.
- Put external API or model calls behind `adapters/` so demo logic can swap
  mock/live behavior without rewriting product logic.

---

## Naming Conventions

- Feature folders use lower-case singular nouns: `profile`, `matching`.
- Shared schemas use explicit domain names: `profile-schema`, `a2a-turn-schema`.
- Mock files should mirror the feature they support: `matching/mock-candidates`.
