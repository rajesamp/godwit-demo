# ADR-001: "Godwit Context Flight" — a live demo of LLM context management

**Status:** Proposed
**Date:** 2026-08-22
**Deciders:** Rajeshkumar Sampathrajan
**Companion article:** *Godwit's Tremendous Journey — How a Bird Teaches LLM Context Management*

---

## Context

The article uses the bar-tailed godwit's 8,000-mile nonstop migration as a metaphor for lean LLM context management: the bird crosses hemispheres on a minimal, highly-tuned navigation system and carries no baggage, whereas long LLM conversations rot into "a noisy soup of logs, outdated goals, tool outputs" that buries the signal and degrades inference. The piece closes with five design principles and a supply-chain-security warning (tampered weights = a corrupted sense of direction).

We want a **demoable webapp** that makes this thesis *visible and undeniable* to a technical audience.

### Constraints (locked)

| Constraint | Value | Consequence for design |
|---|---|---|
| Audience | Engineering talk / internal, presenter-driven | Desktop-first, dense gauges, technical depth over hand-holding |
| Fidelity | **Fully live LLM** — every run hits a real model | Needs a backend that holds credentials; needs a reliability net for stage use |
| Provider | **Claude on Google Vertex AI** (presenter's GCP project) | `AnthropicVertex` client, GCP ADC / service-account auth, **no Anthropic API keys** |
| Frontend stack | **Vanilla TypeScript + Canvas** | Minimal deps, tiny bundle, map/flight animation in Canvas/SVG |

### Forces at play

- A browser cannot safely hold cloud credentials → a client-only SPA is **off the table** the moment we go "fully live."
- A live talk cannot depend on flaky network / rate limits / cold latency → we need a **record-replay fallback**.
- The demo's credibility rests on *honesty*: every on-screen number must be a real API field, not a decorative animation.

---

## Decision

Build **"Godwit Context Flight"**: a split-screen simulator where two agents run the *same* long multi-turn task across a map (Alaska → New Zealand).

- **Naive bird** — appends full history every turn, no caching, no curation. Tokens, cost, and latency climb; injected noise buries an early critical fact; at recall time it answers wrong → **ditches mid-Pacific**.
- **Godwit bird** — prompt caching on a stable prefix, context editing clears stale blocks, compaction rotates history at a threshold, a pinned intent survives pruning. Tokens stay flat, cost flat, recall stays correct → **lands in New Zealand**.

Five principle levers (Curate / Protect Intent / Harden / Rotate / Observe) let the presenter *break the good bird* or *rescue the bad one* live. Every gauge is wired to a real Vertex/Claude response field.

### Architecture

```
┌────────────────────────────┐     SSE stream      ┌─────────────────────────┐     Vertex AI      ┌──────────────┐
│  Vanilla TS + Canvas SPA    │ ◄──────────────────► │  Thin TS/Node proxy      │ ◄────────────────► │  Claude on   │
│  - map + two flight paths   │   POST /run (task)   │  - holds GCP creds (ADC) │  AnthropicVertex   │  Vertex AI   │
│  - gauges (tokens/cost/S:N) │                      │  - runs both agent loops │  (project + region)│              │
│  - 5 principle levers       │                      │  - record/replay cache   │                    │              │
│  - observability log panel  │                      │  - streams events to UI  │                    │              │
└────────────────────────────┘                      └─────────────────────────┘                    └──────────────┘
```

The proxy is the **credential boundary**: GCP auth stays server-side (ADC locally via `gcloud auth application-default login`; Workload Identity Federation or a service account in deploy). The browser never sees a token. This is the smallest surface that satisfies "fully live" — no session store, no DB, one endpoint.

### Article principles → real API features (the heart of the demo)

| # | Principle | What the lever actually does |
|---|---|---|
| 1 | **Curate** — prune low-value tokens | Context editing beta `context-management-2025-06-27`: `clear_tool_uses_20250919` / `clear_thinking_20251015` clears stale blocks before the model sees them |
| 2 | **Protect intent** — keep the "why" | Pinned intent as a cached system prefix + mid-conversation `{role:"system"}` operator message that survives pruning |
| 3 | **Harden** — verify provenance | Pin `model` id + Vertex `region`; surface `response.model` and served-by info in the log; contrast with an unpinned run |
| 4 | **Rotate** — rebuild from trusted source | Compaction beta `compact-2026-01-12`: `compact_20260112` summarizes earlier context; show the compaction block replacing history |
| 5 | **Observe** — log decisions + versions | On-screen log of every prune/rotate/cache event + token deltas + model version = the demo eats its own dogfood |

Supporting instrumentation: `messages.countTokens` for the honest token gauge; `usage.cache_read_input_tokens` vs `usage.input_tokens` for the KV-cache-reuse story.

---

## Options Considered

### Option A: Client-only SPA, user pastes a key

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | None to host |
| Scalability | N/A |
| Security | **Fails** — no safe way to hold a Vertex/GCP credential in a browser; ADC/WIF is server-only |

**Pros:** zero backend, deploys as static files.
**Cons:** incompatible with "use my Google project" — Vertex auth is GCP ADC, not a pasteable key. Non-starter.

### Option B: Vanilla TS + Canvas SPA ↔ thin TS proxy ↔ Vertex (**chosen**)

| Dimension | Assessment |
|---|---|
| Complexity | Low–Medium (one endpoint + SSE) |
| Cost | One small container; Vertex tokens per run |
| Scalability | Fine for a demo; horizontally trivial if ever needed |
| Security | Strong — creds stay server-side, no keys in client, region-pinned model |

**Pros:** satisfies every locked constraint; end-to-end TypeScript; record/replay lives naturally in the proxy; smallest surface that can be "fully live."
**Cons:** a backend to run during the talk (mitigated by local `gcloud` ADC + replay cache).

### Option C: Managed Agents / full backend framework

| Dimension | Assessment |
|---|---|
| Complexity | High |
| Cost | Higher |
| Scalability | Overkill |
| Security | Fine |

**Pros:** batteries-included agent loop, hosted sandbox.
**Cons:** we need *tight control* over context to stage rot vs. curation deterministically — a managed loop hides exactly the mechanics we want to expose. Wrong tool for a teaching demo.

---

## Trade-off Analysis

- **Live vs. reliable:** "fully live" is the presenter's call and it maximizes credibility, but a talk cannot hang on a 429. Resolve with **record/replay in the proxy**: the first clean run is captured to a golden transcript; if the network dies on stage, the same event stream replays byte-identical. Live by default, deterministic on failure.
- **Honesty vs. spectacle:** the bird animation is the hook, but it must be *driven by* real gauges (a heavier context literally shortens range). No decorative physics that contradict the numbers.
- **Model tier is a teaching dial, not a default:** a smaller/faster model rots sooner and costs less on stage — comparing rot *across* tiers is itself a strong talk moment. Default `claude-opus-5`; expose model as a config knob (see open decision).
- **Two real agent loops vs. one scripted:** running two *genuine* loops (naive vs. curated) is the whole point — the contrast must come from real token/cost/recall differences, not a hard-coded outcome.

---

## Consequences

**Easier**
- One-screen, self-driving narrative for the talk; every claim is backed by a live API field.
- Reuses the presenter's existing GCP/IaC posture (ADC/WIF, region pin) — nothing new to secure.
- The five levers double as the article's five principles — the demo *is* the article.

**Harder**
- A backend must be running during the talk (mitigated: local ADC + replay cache; can also pre-warm).
- Vertex feature availability must be confirmed for context-editing / compaction / prompt-caching betas in the presenter's region before relying on them live (see Action Items).
- Cost per run is real — bounded by capping turns and using caching on the godwit side.

**Revisit later**
- Public LinkedIn version would swap live Vertex calls for the replay transcript (no creds, static hosting).
- Optional: a "supply-chain" scene that swaps a "tampered" system prompt to show confident-but-wrong drift (principle 3, deeper).

---

## Design principles for the build

1. **Metaphor-first, honest-second** — the bird is the hook; every pixel maps to a real mechanism (tokens, cache, S:N). Heavier context ⇒ visibly shorter range.
2. **Show the failure** — the naive bird ditching is the payoff. Design the crash as carefully as the landing.
3. **Live by default, deterministic on failure** — record/replay net so the story never depends on the network.
4. **One screen, 60-second read** — self-explanatory; progressive disclosure for depth (click a gauge → raw API payload).
5. **Credential boundary is the backend** — no secret ever reaches the client; region-pinned model; ADC/WIF only.
6. **Eat the dogfood** — the Observe panel logs the demo's own prune/rotate/version decisions = principle #5 made literal.
7. **Two genuine loops** — the contrast is earned from real API responses, never hard-coded.

---

## Action Items

1. [ ] Confirm the target **GCP project id + region**, and that context-editing / compaction / prompt-caching betas are available for Claude on Vertex in that region.
2. [ ] Decide the **demo model tier** (default `claude-opus-5`, or a faster tier to make rot vivid on stage — open decision below).
3. [ ] Scaffold the thin TS proxy: `AnthropicVertex` client, `POST /run` + SSE, record/replay cache.
4. [ ] Define the **canonical long task** with a planted "needle" fact the naive bird will lose and the godwit will keep.
5. [ ] Build the Canvas frontend: map, two flight paths, gauges, five levers, Observe log.
6. [ ] Wire each lever to its real API feature (table above); verify gauges against `usage` / `countTokens`.
7. [ ] Capture a golden replay transcript; rehearse the failure path (kill the network, confirm identical replay).
