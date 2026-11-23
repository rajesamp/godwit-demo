# Godwit Context Flight

A live demo of LLM context management, told through the bar-tailed godwit's nonstop migration.
Two agents run the same long task across a map: the **naive** bird resends the whole noisy
context every turn, bloats, loses an early "needle" fact, and ditches mid-Pacific. The
**godwit** bird curates, rotates, and pins its intent — stays lean and lands in New Zealand.

Companion to the article *Godwit's Tremendous Journey — How a Bird Teaches LLM Context
Management*. Design rationale and trade-offs: [ADR-001](./ADR-001-godwit-context-flight.md).

## Stack

- **Frontend** — Vanilla TypeScript + Canvas (Vite). Map, two flight paths, live gauges,
  five principle levers, an Observe decision log.
- **Backend** — thin TS/Express proxy. Holds the credential boundary; streams the flight as SSE.
- **Model** — Claude Sonnet 5 (`claude-sonnet-5`) on **Google Vertex AI**. Auth is GCP ADC /
  Workload Identity Federation — no Anthropic API key.
- **Engines** — `mock` (deterministic, no creds), `live` (Vertex), `replay` (golden run).

## Run it

```bash
cd godwit-demo
npm install
npm run dev
```

Open http://localhost:5173. It starts in **mock** mode — no credentials needed — so the whole
UI works today. Press **Fly**.

## Go live on Vertex

```bash
cp .env.example .env
# set GCP_PROJECT_ID and GCP_REGION in .env
gcloud auth application-default login
# then pick "live · Vertex" in the Source dropdown, or set ENGINE_SOURCE=live
```

> Confirm context-editing / compaction / prompt-caching beta availability for Claude on Vertex
> in your region before relying on them live (ADR Action Item #1). The live engine guards the
> betas and degrades to an error event rather than crashing.

## The five levers = the article's five principles

| Lever | Principle | Real API feature it drives |
|---|---|---|
| Curate | prune low-value tokens | context editing / manual prune |
| Protect intent | keep the why | pinned cached system prefix |
| Harden | verify provenance | pinned model id + region, surfaced |
| Rotate | rebuild from trusted source | compaction beta |
| Observe | log decisions + versions | on-screen decision log |

Turn the godwit's levers **off** and watch it ditch too — the demo's whole point.

## Record a golden run (stage safety net)

Send `{"record": true}` with a run (or wire a button) to append the event stream to
`recordings/<id>.jsonl`, then choose **replay** as the source to play it back byte-for-byte if
the network dies on stage.

## Layout

```
server/   thin proxy: engine (mock+live), scenario, Vertex client, replay, SSE endpoint
web/      Vanilla TS + Canvas frontend
```
