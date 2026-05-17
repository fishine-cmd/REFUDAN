# Landing Page Implementation Roadmap v2

> Status: ready for implementation (Codex handoff)
> Updated: 2026-05-17

---

## Context

Hermes reverse assets remain the source of truth for tokens, font stack, and
structural cues. RE:FUDAN's actual landing imagery comes from the project-owned
files in `apps/site/public/images/`.

- dark theme image: `/images/bg-dark.png`
- light theme image: `/images/bg-light.png`

The landing page should stay Hermes-like in structure and cadence, but not in
its background-image source.

---

## Confirmed Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default theme | **Dark** | Matches the existing brand direction |
| Token system | **Hermes-derived semantic tokens** | Keep the current structure and typography system |
| Font roles | **As already implemented** | Collapse, Rules, Mondwest, Courier Prime |
| Background image source | **Project-owned images** | Use `bg-dark.png` / `bg-light.png` as the canonical landing imagery |
| Reverse pack usage | **Reference only** | Hermes assets inform the system, but not the landing artwork |

---

## Implementation Steps

1. Bind `--bg-image` and `--bg-overlay` in `tokens.css` for both themes.
2. Remove any runtime reference to `/assets/hero-bg.webp`.
3. Use the theme-owned image in the hero background and the demo right panel.
4. Keep the existing header grid, typography hierarchy, and section structure.
5. Update repo docs so future contributors treat `apps/site/public/images/` as
   the canonical landing image source.

---

## Test Plan

- `hero-bg.webp` is no longer referenced by runtime code.
- Dark theme shows `bg-dark.png`; light theme shows `bg-light.png`.
- Hero and demo right panel switch together when the theme changes.
- `apps/site` still typechecks and builds.

---

## Assumptions

- `apps/site/public/images/bg-dark.png` and `bg-light.png` are the only landing
  image assets we should use at runtime.
- Hermes reverse assets remain useful for non-image design reference.
