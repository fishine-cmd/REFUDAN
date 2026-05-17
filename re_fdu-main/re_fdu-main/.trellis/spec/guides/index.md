# Thinking Guides

> **Purpose**: Expand your thinking to catch things you might not have considered.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about what happens at layer boundaries -> cross-layer bugs
- Didn't think about code patterns repeating -> duplicated code everywhere
- Didn't think about edge cases -> runtime errors
- Didn't think about future maintainers -> unreadable code

These guides help you **ask the right questions before coding**.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [ANP Protocol Summary](./anp-protocol-summary.md) | How ANP works and how RE:FUDAN uses it | Before implementing agent identity, discovery, or interfaces |
| [Campus Interface Schema](./campus-interface-schema.md) | The 4 campus interfaces: request/response shapes | Before implementing backend matching or A2A endpoints |
| [Second Me Architecture](./second-me-architecture.md) | Identity scaffold concept and what we borrow vs skip | Before designing the onboarding or agent profile system |
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify patterns and reduce duplication | When you notice repeated patterns |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |
| [RE_FUDAN Product Brief](./re-fudan-product-brief.md) | Preserve the main product story and MVP boundaries | Before planning or building product features |
| [Source Documents and Distillation](./source-documents-and-distillation.md) | Keep `doc/` and Trellis artifacts from drifting | When converting source docs into task/spec context |
| [Repository Architecture](./repo-architecture.md) | Record the monorepo shape, stack choice, and shared contract boundary | When changing the repo layout or app split |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, Service, Component, Database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where to put some logic

-> Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] **You're modifying any constant or config**
- [ ] **You're creating a new utility/helper function** <- Search first!

-> Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When to Think About Product Scope

- [ ] The change adds a new user mode or side scenario
- [ ] The change does not obviously advance P0-P4
- [ ] The change touches privacy or human-handoff boundaries

-> Read [RE_FUDAN Product Brief](./re-fudan-product-brief.md)

### When to Think About Source Distillation

- [ ] You are creating a task from material in `doc/`
- [ ] You want to preserve original thinking but narrow execution scope
- [ ] A source PRD and Trellis task seem to disagree

-> Read [Source Documents and Distillation](./source-documents-and-distillation.md)
