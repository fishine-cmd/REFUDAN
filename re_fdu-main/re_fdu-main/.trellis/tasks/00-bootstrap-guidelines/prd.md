# Bootstrap Task: Distill RE_FUDAN Source Docs into Trellis

**You (the AI) are running this task. The developer does not read this file.**

The project has just been initialized with Trellis, but the repo is still
docs-first. The durable knowledge currently lives in:

- `doc/README.md`
- `doc/用户需求PRD_latest.md`

Your job is to convert that source material into durable Trellis context
without overwriting the source docs.

---

## Outputs Required

- fill `.trellis/spec/` with bootstrap rules that future agents can follow
- preserve `doc/` as source/archive
- curate `implement.jsonl` and `check.jsonl` for this task
- leave the project ready for both Claude Code and Codex sessions

---

## Product Distillation Rules

Use these product truths unless a later task explicitly changes them:

- the main build target is the `P0 -> P4` demo flow
- matching must be path-based and explainable
- privacy must be first-class and tiered
- A2A dialogue is a filter before human contact, not a replacement for it
- human approval is the final boundary before contact exchange

Optional modes such as clubs, dating, games, trading, and leaderboard growth
ideas should remain secondary until the main flow is convincing.

---

## Source-Handling Rules

- never delete or overwrite files in `doc/`
- move durable cross-task decisions into `.trellis/spec/`
- keep task-local execution detail in this task directory
- if a source doc is ambiguous, prefer the narrowest demo-first reading

---

## Completion Criteria

- frontend and backend spec placeholders are replaced with project-specific
  bootstrap rules
- source/archive handling is explicitly documented
- this task has valid `implement.jsonl` and `check.jsonl`
- `task.py validate 00-bootstrap-guidelines` passes
