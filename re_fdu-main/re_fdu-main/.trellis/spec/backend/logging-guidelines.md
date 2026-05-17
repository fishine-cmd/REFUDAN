# Logging Guidelines

> Log enough to debug product flow, never enough to reconstruct a student's private life.

---

## Overview

This product handles resumes, application goals, interpersonal matching, and
private contact boundaries. Logging must optimize for flow debugging and audit
signals, not payload capture.

---

## What to Log

- profile creation / update events with stable ids
- matching requests, scoring completion, and explanation generation
- privacy gate decisions with tier and resource type
- A2A session creation, turn counts, and terminal state
- referral request acceptance / rejection outcomes
- adapter failures and retry results

---

## What NOT to Log

- raw resume text or uploaded documents
- real names, emails, phone numbers, or social ids
- private knowledge items above the current visibility tier
- model prompts that contain user-private content unless explicitly scrubbed
- auth tokens, cookies, scraping credentials, or third-party API secrets

---

## Structured Fields

Prefer structured logs with:

- `event`
- `entity_type`
- `entity_id`
- `privacy_level`
- `session_id`
- `task_id` when running from a Trellis task

---

## Severity

- `info`: normal lifecycle milestones
- `warn`: degraded behavior, privacy denial, partial adapter fallback
- `error`: failed request, broken contract, corrupted session state

Debug logging is acceptable in local demo work but must still respect privacy
scrubbing rules.
