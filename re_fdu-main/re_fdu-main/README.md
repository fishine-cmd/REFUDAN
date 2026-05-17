# RE_FUDAN

Monorepo for the RE_FUDAN demo.

## Layout

- `apps/site` - canonical public landing experience
- `apps/app` - product walkthrough shell
- `packages/contracts` - shared domain types and demo payloads
- `doc/` - preserved source/archive material
- `landing/` - archived static prototype, reference only

## Landing Canon

- `apps/site` is the only active landing runtime.
- `landing/` is preserved for historical reference and should not receive new
  product work.
- Hermes reverse assets are for token, font, and structure reference only.
- Owned landing imagery comes from `apps/site/public/images/`.
- Design system tokens and font files are already integrated into `apps/site/`.
- See `.trellis/spec/frontend/design-system.md` for the token architecture.

## Stack

- TypeScript
- Bun for workspace scripts
- Next.js App Router
- Tailwind CSS v3 for `apps/site`
- Mock-first contracts, no mandatory database for MVP

## Local Run

- `bun install`
- `bun --cwd apps/site run dev`
- `bun --cwd apps/app run dev`

Set `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` if you deploy the two apps
to different origins later.
