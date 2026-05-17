# Error Handling

> Error behavior must protect privacy and keep the demo understandable.

---

## Overview

Errors in this product are not only technical failures. They can also be
privacy denials, missing evidence, incomplete profile state, or human-handoff
requirements.

Treat those as first-class typed outcomes instead of ad-hoc strings.

---

## Error Categories

- `validation_error`: malformed upload, unsupported input, missing required field
- `privacy_denied`: caller requested data above the current privacy tier
- `not_ready`: profile or knowledge base lacks enough material to answer
- `match_unavailable`: no candidate satisfies current filter or quality bar
- `handoff_required`: the system reached the human approval boundary
- `integration_error`: external model, API, or adapter failure

---

## Handling Rules

- Fail closed on privacy-sensitive reads.
- Preserve machine-readable error codes so UI and agents can branch cleanly.
- Surface next-step guidance in user-visible errors when possible.
- Never leak hidden field names, raw resume text, or contact info inside
  error messages.

---

## Response Shape

Keep error responses consistent across transports:

- `code`: stable programmatic identifier
- `message`: safe human-readable summary
- `details`: optional non-sensitive metadata
- `next_action`: optional hint such as `upload_more_context` or
  `request_human_approval`

---

## Common Mistakes to Avoid

- Returning generic 500-style failures for privacy denials.
- Logging raw exception payloads from third-party services without scrubbing.
- Treating "no match" and "match hidden by privacy" as the same condition.
