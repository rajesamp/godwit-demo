import express from "express";
import { DEFAULT_SOURCE, MODEL, PORT, type EngineSource } from "./config.js";
import { runFlight } from "./engine.js";
import { recording, replayFlight } from "./replay.js";
import type { Emit, FlightEvent, Levers, RunConfig } from "./types.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, defaultSource: DEFAULT_SOURCE });
});

const DEFAULT_LEVERS: Levers = {
  curate: true,
  protectIntent: true,
  harden: true,
  rotate: true,
  observe: true,
};

// Stream a full flight as Server-Sent Events. POST so the browser can send the
// run config (levers, source) in the body; the browser reads the stream with a
// fetch ReadableStream (EventSource is GET-only).
app.post("/run", async (req, res) => {
  const body = (req.body ?? {}) as Partial<RunConfig> & { replayName?: string; record?: boolean };
  const source: EngineSource = (body.source as EngineSource) ?? DEFAULT_SOURCE;

  const config: RunConfig = {
    taskId: body.taskId ?? "trans-pacific-manifest",
    legs: Math.min(20, Math.max(3, body.legs ?? 10)),
    model: body.model ?? MODEL,
    source,
    levers: { ...DEFAULT_LEVERS, ...(body.levers ?? {}) },
  };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Use res "close" (client/connection gone), NOT req "close" — for a POST, req
  // emits "close" as soon as Express finishes reading the body, which would
  // suppress every event after the first and skip res.end().
  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  const write: Emit = (e: FlightEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  };

  try {
    if (source === "replay") {
      await replayFlight(body.replayName ?? "latest", write);
    } else {
      const emit = body.record ? recording(`${config.taskId}_${Date.now()}`, write) : write;
      await runFlight(config, emit);
    }
  } catch (err) {
    write({ t: "error", message: (err as Error).message });
  } finally {
    if (!closed) res.end();
  }
});

app.listen(PORT, () => {
  console.log(`godwit-demo backend on http://localhost:${PORT}  (source=${DEFAULT_SOURCE}, model=${MODEL})`);
});
