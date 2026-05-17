# Campus Interface Schema

> Engineering reference for the 4 ANP-style campus interfaces.
> Purpose: Backend developers know what to implement.

---

## Overview

RE:FUDAN models campus social interactions as structured ANP interfaces. Each interface has:
- A typed request body (what the seeker's agent sends)
- A typed response containing JSON-LD semantic objects
- A `humanAuthorizationRequired` field on sensitive objects

These are NOT chat endpoints. They return structured, comparable, filterable objects.

---

## 1. Mentor Intro Interface

**Endpoint**: `POST /agents/campus/api/mentor-intro`

**Purpose**: Find path-similar mentors with explainable relevance.

**Request**:
```yaml
seekerDid: string       # did:wba identifier of the seeker
campus: string          # e.g. "fudan"
domain: string          # e.g. "summer_camp_application"
stage: string           # e.g. "preparing", "applying", "admitted"
goals: string[]         # e.g. ["interview_prep", "research_fit"]
constraints: object     # optional filters
topK: number            # max results (default 3)
```

**Response object**: `MentorConnection`
```yaml
mentorDid: string
mentorRole: string
domains: string[]
relevanceReasons: string    # WHY this mentor, not another
introductionMode: string    # "agent_pre_conversation" | "direct_intro"
humanAuthorizationRequired: boolean
availabilityNote: string
```

---

## 2. Research Interest Match Interface

**Endpoint**: `POST /agents/campus/api/research-interest-match`

**Purpose**: Map interests to executable research paths.

**Request**:
```yaml
seekerDid: string
campus: string
interests: string[]
background: string
targetStage: string     # e.g. "undergrad_research", "grad_admission"
constraints: object
topK: number
```

**Response object**: `ResearchPathOption`
```yaml
pathStage: string
recommendedLabOrGroup: string
relatedPeople: string[]
requiredPreparation: string[]
fitSignals: string[]        # why the system thinks this fits
nextActions: string[]       # what to do next
```

---

## 3. Lab Slot Search Interface

**Endpoint**: `POST /agents/campus/api/lab-slot-search`

**Purpose**: Surface structured opportunities from scattered campus networks.

**Request**:
```yaml
seekerDid: string
campus: string
domains: string[]
preferredMode: string   # "full_time" | "part_time" | "remote"
timeBudget: string
targetTerm: string      # e.g. "2026_fall"
topK: number
```

**Response object**: `LabOpportunity`
```yaml
hostOrganization: string
supervisorOrContact: string
opportunityType: string     # "RA" | "intern" | "reading_group" | "project"
requirements: string[]
applicationWindow: string
humanAuthorizationRequired: boolean
```

---

## 4. Alumni Referral Interface

**Endpoint**: `POST /agents/campus/api/alumni-referral`

**Purpose**: Navigate alumni connections with friction-aware boundaries.

**Request**:
```yaml
seekerDid: string
campus: string
targetDomain: string    # e.g. "quant_finance", "big_tech_swe"
requestType: string     # "advice" | "warm_intro" | "resume_forward" | "feedback"
materialsProvided: string[]
geography: string
topK: number
```

**Response object**: `AlumniReferralPath`
```yaml
alumniDid: string
organization: string
role: string
referralMode: string        # matches requestType
prerequisites: string[]     # what seeker must provide first
humanAuthorizationRequired: boolean
```

---

## Design Principles

1. **Objects, not chat**: Responses are structured entities, not natural language
2. **Explainability**: Every match includes `relevanceReasons` or `fitSignals`
3. **Consent boundaries**: `humanAuthorizationRequired` is a first-class field
4. **Friction-awareness**: Alumni referrals explicitly model prerequisites and social cost
5. **Composability**: Objects can be ranked, filtered, compared by downstream agents

---

## Source

Distilled from ANet protocol teardown research (协议拆解 06: hotel/weather → campus interface schema).
Interface YAMLs are in-repo at `packages/contracts/src/interfaces/`.
