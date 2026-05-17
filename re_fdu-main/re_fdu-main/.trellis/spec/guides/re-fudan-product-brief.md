# RE_FUDAN Product Brief

> Durable product context distilled from the source PRD.

---

## Product Promise

RE_FUDAN is a campus-focused "agent finds agent" product. Each student has a
personal AI representative that understands their path, goals, and sharable
knowledge, then helps filter information, match relevant seniors or peers, and
stage a human handoff only after a high-quality pre-conversation.

---

## First-Build Scope

The first build is demo-first and should optimize for the main walkthrough:

1. `P0` identity landing / role split
2. `P1` persona construction from uploads + privacy tagging
3. `P2` path-based matching and recommendation explanation
4. `P3` A2A dialogue center with trace and privacy switching
5. `P4` human referral / acceptance decision

If a feature does not move one of those steps, treat it as secondary unless the
task explicitly says otherwise.

---

## Core Domain Objects

- student or user profile
- distilled agent profile
- knowledge item with visibility level
- match candidate with explanation
- A2A session and ordered turns
- human handoff or referral decision

---

## Product Rules

- Matching is path-based and reason-bearing, not raw social browsing.
- Privacy is tiered: public, handshake-gated, owner-approved.
- A2A is a social filter, not a replacement for the final human decision.
- The final step must preserve human agency: AI can recommend and summarize,
  but not auto-reveal contact or auto-accept a referral.

---

## Explicit Non-Goals for Bootstrap

Do not treat these as required in the first implementation wave:

- real integrations with every social or content platform
- production-grade graph DB or vector DB infrastructure
- all optional modes such as dating, gaming, clubs, or second-hand trading
- full marketplace or leaderboard economics

Those can become later tasks after the main flow is convincing.
