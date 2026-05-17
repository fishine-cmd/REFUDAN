## Quick Start for Collaborators

If you are new to Trellis, start here:

1. Trellis project page: https://github.com/mindfold-ai/Trellis
2. Install the CLI if you do not have it yet:
   ```bash
   npm install -g @mindfoldhq/trellis
   ```
3. This repo is already initialized. After cloning it, register your local developer identity from the repo root:
   ```bash
   python3 ./.trellis/scripts/init_developer.py "<your-name>"
   ```
4. If you need to sync Trellis-managed files later, use:
   ```bash
   trellis update
   ```
5. If you use Codex, make sure hooks are enabled in `~/.codex/config.toml`:
   ```toml
   [features]
   hooks = true
   ```
6. In Codex, open the project and approve the Trellis hook once with `/hooks`.
7. Treat `doc/` as source/archive. Put durable rules in `.trellis/spec/` and task work in `.trellis/tasks/`.
8. Repo shape: `apps/site` is the public landing app, `apps/app` is the product walkthrough app, and `packages/contracts` holds shared demo payloads and domain types.
9. `apps/site` is the canonical landing implementation. Do not add new landing work to `landing/`; it is archived reference only.
10. The landing page design system is derived from Hermes Agent (Nous Research). All tokens and font files are already in `apps/site/`. See `.trellis/spec/frontend/design-system.md` for the architecture.
11. For `apps/site`, use the semantic Tailwind/token layer from `src/styles/tokens.css` and `tailwind.config.ts`; do not reintroduce the old `cool/warm` theme model.

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
