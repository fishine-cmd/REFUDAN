# Source Documents and Distillation

> How to keep preserved source docs, durable specs, and task-local PRDs aligned.

---

## Layering Rules

Use these layers on purpose:

- `doc/`: source and archive material; preserve original thinking and notes
- `.trellis/spec/`: durable project rules that survive across tasks
- `.trellis/tasks/*/prd.md`: task-local executable distillation
- `.trellis/tasks/*/info.md` or `research/`: optional supporting context

---

## What Not to Do

- Do not delete or overwrite source PRDs in `doc/` just because a task has a
  cleaner distilled PRD.
- Do not paste the entire source document into every task PRD.
- Do not let task-local experimentation silently redefine durable project rules.

---

## Distillation Process

When creating or updating a task from source docs:

1. keep the original source files intact
2. extract only the parts relevant to the task into `prd.md`
3. move cross-task decisions into `.trellis/spec/`
4. list the exact spec/source files needed in `implement.jsonl` and `check.jsonl`

---

## Precedence

When artifacts disagree, use this order:

1. explicit user instruction in the current conversation
2. active task `prd.md` for task-local execution details
3. `.trellis/spec/` for durable project-wide defaults
4. `doc/` source materials for original intent and context

If a task repeatedly overrides a durable rule, update the durable spec instead
of keeping the discrepancy hidden inside task-local files.
