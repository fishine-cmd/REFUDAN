# RE_FUDAN Repository Architecture

> Durable stack and repo-shape rules for the demo-first build.

---

## Summary

RE_FUDAN is a single monorepo with two Next.js apps and one shared contracts
package:

- `apps/site` for the public landing experience
- `apps/app` for the product walkthrough shell
- `packages/contracts` for shared domain types, flow states, and demo payloads

The repo keeps `doc/` as source/archive and preserves `landing/` as the legacy
static prototype reference.

---

## Stack Choice

- TypeScript everywhere
- Bun for workspace scripts and local development
- Next.js App Router for both apps
- Server-first rendering by default; client islands only where interaction is
  needed
- Mock / JSON demo payloads before any real database dependency

---

## Repo Rules

- Cross-app data should flow through `packages/contracts`, not ad-hoc duplicated
  literals.
- Shared demo payloads should be checked in and deterministic.
- Public-site polish may be stronger than the product shell, but both apps must
  share the same product vocabulary and contract names.
- Keep cross-app URLs behind environment variables so landing and product can be
  deployed separately later.

