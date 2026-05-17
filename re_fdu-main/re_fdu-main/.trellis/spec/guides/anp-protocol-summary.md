# ANP Protocol Summary for RE:FUDAN

> Engineering reference distilled from ANet protocol teardowns (01-06).
> Purpose: Any developer can understand what ANP is and how RE:FUDAN uses it.

---

## What ANP Is

Agent Network Protocol (ANP) is an open protocol that makes AI agents addressable, discoverable, and callable as network objects. It does NOT require blockchain or custom infrastructure — it runs on standard HTTPS + DNS.

Core thesis: an agent enters a network when it satisfies three conditions:
1. Others can find it via a stable identity endpoint
2. Others can resolve its service entry from that identity
3. Others can discover its capabilities and decide whether to interact

---

## Identity: did:wba

ANP uses `did:wba` (Web-Based Agent DID) — a decentralized identifier that resolves to a JSON document hosted at a predictable HTTPS URL.

Format:
```
did:wba:<domain>[:<path>]
```

Resolution:
```
did:wba:example.com           → https://example.com/.well-known/did.json
did:wba:example.com:user:alice → https://example.com/user/alice/did.json
```

A minimal DID document contains:
- `id` — the DID itself
- `verificationMethod` — public key for auth
- `authentication` — reference to the verification method
- `service` — array of service endpoints (including ANPMessageService)

**RE:FUDAN implication**: Student agents can be hosted per-department, per-lab, or per-individual domain. The system doesn't require a single central platform — it needs a discovery layer that can resolve DIDs across hosting boundaries.

---

## Service Entry: ANPMessageService

The DID document's `service` array exposes an `ANPMessageService` endpoint:

```json
{
  "id": "did:wba:example.com:user:alice#messaging",
  "type": "ANPMessageService",
  "serviceEndpoint": "https://example.com/agents/alice/message"
}
```

This is the unified entry point for all agent-to-agent communication. Callers POST structured messages here after DID-based authentication.

---

## Discovery: .well-known/agent-descriptions

Agents advertise themselves via:
```
https://<domain>/.well-known/agent-descriptions
```

This returns a list of agent description URLs (`ad.json` files) hosted on that domain.

---

## Agent Description (ad.json)

The `ad.json` file is the capability contract. It contains:

- **Identity**: DID reference, name, description
- **Security**: authentication requirements, supported auth methods
- **Interfaces**: array of structured and natural-language interfaces

```json
{
  "ad:identity": { "did": "did:wba:...", "name": "...", "description": "..." },
  "ad:security": { ... },
  "ad:interfaces": [
    { "type": "structured", "url": "/api/mentor-intro", "schema": "..." },
    { "type": "natural_language", "url": "/api/nl", "description": "..." }
  ]
}
```

---

## Interface Calling Convention

Structured interfaces follow OpenAPI 3.0 format:
- Request: JSON body with typed fields
- Response: `jsonldUrls` or `jsonldData` — semantic JSON-LD objects

The response objects are not chat messages. They are structured, typed entities that other agents can process programmatically.

---

## Auth Chain

1. Caller resolves target DID → gets DID document
2. Caller reads `verificationMethod` to understand target's key
3. Caller signs request with its own DID key
4. Target verifies caller's signature against caller's DID document
5. Target checks authorization rules (is this caller allowed to call this interface?)

---

## How RE:FUDAN Uses ANP (MVP scope)

RE:FUDAN does NOT deploy full ANP infrastructure for the hackathon. Instead:

- **Borrows the object model**: agents are described as network objects with identity, capabilities, and consent boundaries
- **Borrows the interface pattern**: campus interactions are modeled as structured interfaces (mentor-intro, research-match, etc.) with typed request/response
- **Borrows the discovery concept**: matching is "find relevant agent objects" not "browse a feed"
- **Defers**: real did:wba deployment, real .well-known hosting, real cross-domain auth

The protocol thinking shapes the product architecture even when the protocol itself is mocked.

---

## Source

Distilled from:
- `ANet 源码 / 协议拆解 04` (did:wba, ANPMessageService, discovery)
- `ANet 源码 / 协议拆解 05` (ad:interfaces, auth chain, Agent Description)
- `ANet 与校园 agent-native 社交` (why network > in-app agents)
- ANP GitHub: https://github.com/agent-network-protocol/AgentNetworkProtocol
