import { MODEL, priceTable, turnCost, type Usage } from "./config.js";
import { REGION, vertex } from "./vertex.js";
import {
  SCENARIO,
  estTokens,
  legTelemetry,
  rng,
  type Scenario,
} from "./scenario.js";
import type { BirdMode, Emit, FlightState, Levers, RunConfig } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const todayIso = () => new Date().toISOString().slice(0, 10);

const NAIVE_LEVERS: Levers = {
  curate: false,
  protectIntent: false,
  harden: false,
  rotate: false,
  observe: true, // we still log; the naive bird just has nothing good to log
};

/** Range remaining as a function of context weight; altitude follows range. */
function flightState(progress: number, weight: number, base: number, ceiling: number): FlightState {
  const span = Math.max(1, ceiling - base);
  const range = Math.min(1, Math.max(0.02, 1 - (weight - base) / span));
  return { progress, altitude: range, range };
}

// ----------------------------------------------------------------------------
// Public entry
// ----------------------------------------------------------------------------

export async function runFlight(config: RunConfig, emit: Emit): Promise<void> {
  const runId = `run_${todayIso()}_${config.taskId}`;
  await emit({ t: "run_start", runId, config, at: Date.now() });
  await emit({ t: "model_info", bird: "naive", model: config.model, region: "unpinned" });
  await emit({
    t: "model_info",
    bird: "godwit",
    model: config.model,
    region: config.levers.harden ? REGION : "unpinned",
  });

  const runner = config.source === "live" ? runBirdLive : runBirdMock;
  await Promise.all([
    runner("naive", { ...config, levers: NAIVE_LEVERS }, emit),
    runner("godwit", config, emit),
  ]);

  await emit({ t: "run_end", runId });
}

// ----------------------------------------------------------------------------
// Mock engine — deterministic, no credentials. This is also the shape a
// recorded golden run replays, so the stage story never depends on the network.
// ----------------------------------------------------------------------------

async function runBirdMock(bird: BirdMode, config: RunConfig, emit: Emit): Promise<void> {
  const scn = SCENARIO;
  const rand = rng(bird === "naive" ? 11 : 23);
  const price = priceTable(todayIso());

  const BASE = 500; // intent + scaffolding
  const telPerLeg = estTokens(legTelemetry(scn, 1, rng(1)));
  const CEILING = BASE + telPerLeg * config.legs;

  const lev = config.levers;
  const godwit = bird === "godwit";
  // The godwit only stays lean if it actually curates or rotates.
  const keepsLean = godwit && (lev.curate || lev.rotate);

  let cumCost = 0;
  let weight = BASE;

  for (let leg = 1; leg <= config.legs; leg++) {
    await sleep(260);
    await emit({ t: "leg", bird, leg, totalLegs: config.legs, label: `Leg ${leg}` });

    // Weight: naive accumulates every leg's telemetry; a lean godwit keeps ~1 leg.
    weight = keepsLean ? BASE + telPerLeg : BASE + telPerLeg * leg;

    // Curate / rotate decisions (godwit only) — the Observe panel narrates these.
    if (godwit && lev.curate && leg > 1) {
      await emit({ t: "curate", bird, leg, clearedBlocks: 1, freedTokens: telPerLeg });
    }
    if (godwit && lev.rotate && leg % 4 === 0) {
      await emit({
        t: "rotate",
        bird,
        leg,
        summaryTokens: Math.round(telPerLeg * 0.3),
        replacedTokens: telPerLeg * 3,
      });
    }

    // Usage: naive resends the whole noisy soup each turn; the godwit reuses the
    // cached intent and only pays for the new leg.
    const u: Usage = keepsLean
      ? { inputTokens: telPerLeg, outputTokens: 50, cacheReadTokens: BASE, cacheCreateTokens: leg === 1 ? BASE : 0 }
      : { inputTokens: weight, outputTokens: 50, cacheReadTokens: 0, cacheCreateTokens: 0 };
    cumCost += turnCost(u, price);

    await emit({
      t: "usage",
      bird,
      leg,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheCreateTokens: u.cacheCreateTokens,
      contextTokens: weight,
      costUsd: cumCost,
    });

    await emit({
      t: "flight",
      bird,
      leg,
      state: flightState(leg / config.legs, weight, BASE, CEILING),
    });
  }

  // Recall: does the bird still hold the needle?
  const correct = godwit ? lev.protectIntent && (lev.curate || lev.rotate) : false;
  const answer = correct ? scn.needle.value : scn.distractors[0]!;
  await sleep(300);
  await emit({
    t: "recall",
    bird,
    asked: scn.recallQuestion,
    answer,
    correct,
    needle: scn.needle.value,
  });

  if (correct) {
    await emit({ t: "flight", bird, leg: config.legs, state: { progress: 1, altitude: 0.7, range: 0.7 } });
    await emit({ t: "verdict", bird, landed: true, reason: "Held the manifest ID. Cargo accepted — landed in New Zealand." });
  } else {
    await emit({ t: "flight", bird, leg: config.legs, state: { progress: 0.82, altitude: 0.02, range: 0.05 } });
    await emit({
      t: "verdict",
      bird,
      landed: false,
      reason: "Lost the manifest ID in the noise — recalled a stale distractor. Ditched mid-Pacific.",
    });
  }
}

// ----------------------------------------------------------------------------
// Live engine — Claude on Vertex. Best-effort real calls; degrades to an error
// event instead of crashing so a talk can fall back to mock/replay.
// NOTE: context-editing / compaction beta availability on Vertex is Action Item
// #1 in the ADR — the betas are guarded and fall back on rejection.
// ----------------------------------------------------------------------------

async function runBirdLive(bird: BirdMode, config: RunConfig, emit: Emit): Promise<void> {
  const scn = SCENARIO;
  const price = priceTable(todayIso());
  const lev = config.levers;
  const godwit = bird === "godwit";

  let client: ReturnType<typeof vertex>;
  try {
    client = vertex();
  } catch (err) {
    await emit({ t: "error", bird, message: (err as Error).message });
    return;
  }

  const system: any = [{ type: "text", text: scn.intent, ...(godwit && lev.protectIntent ? { cache_control: { type: "ephemeral" } } : {}) }];
  // We own the whole message array so we can do context surgery per bird.
  const messages: any[] = [];
  let cumCost = 0;
  let weight = estTokens(scn.intent);

  for (let leg = 1; leg <= config.legs; leg++) {
    await emit({ t: "leg", bird, leg, totalLegs: config.legs, label: `Leg ${leg}` });

    const noise = legTelemetry(scn, leg, rng(leg * (godwit ? 7 : 13)));
    messages.push({ role: "user", content: `Leg ${leg}. Telemetry follows; acknowledge in <=8 words.\n\n${noise}` });

    // Curate: a lean godwit drops old low-signal turns before sending.
    if (godwit && lev.curate && messages.length > 3) {
      const before = messages.length;
      messages.splice(0, messages.length - 3); // keep only the last few turns
      await emit({ t: "curate", bird, leg, clearedBlocks: before - messages.length, freedTokens: estTokens(noise) });
    }

    try {
      const req: any = { model: config.model || MODEL, max_tokens: 128, system, messages, output_config: { effort: "low" } };
      // Rotate: periodically rebuild context from a trusted summary (compaction beta).
      const useCompaction = godwit && lev.rotate && leg % 4 === 0;
      const resp = useCompaction
        ? await client.beta.messages.create({ ...req, betas: ["compact-2026-01-12"], context_management: { edits: [{ type: "compact_20260112" }] } } as any)
        : await client.messages.create(req);

      messages.push({ role: "assistant", content: (resp as any).content });
      const usage = (resp as any).usage ?? {};
      const u: Usage = {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
      };
      weight = u.inputTokens + u.cacheReadTokens;
      cumCost += turnCost(u, price);
      if (useCompaction) await emit({ t: "rotate", bird, leg, summaryTokens: u.inputTokens, replacedTokens: weight });

      await emit({
        t: "usage",
        bird,
        leg,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        cacheCreateTokens: u.cacheCreateTokens,
        contextTokens: weight,
        costUsd: cumCost,
      });
      await emit({ t: "flight", bird, leg, state: flightState(leg / config.legs, weight, 500, 500 + estTokens(noise) * config.legs) });
    } catch (err) {
      await emit({ t: "error", bird, message: `Leg ${leg}: ${(err as Error).message}` });
      return;
    }
  }

  // Recall turn.
  try {
    messages.push({ role: "user", content: scn.recallQuestion });
    const resp = await client.messages.create({ model: config.model || MODEL, max_tokens: 64, system, messages });
    const text = ((resp as any).content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join(" ")
      .trim();
    const correct = text.includes(scn.needle.value);
    await emit({ t: "recall", bird, asked: scn.recallQuestion, answer: text, correct, needle: scn.needle.value });
    await emit(
      correct
        ? { t: "flight", bird, leg: config.legs, state: { progress: 1, altitude: 0.7, range: 0.7 } }
        : { t: "flight", bird, leg: config.legs, state: { progress: 0.82, altitude: 0.02, range: 0.05 } }
    );
    await emit({
      t: "verdict",
      bird,
      landed: correct,
      reason: correct ? "Held the manifest ID. Landed in New Zealand." : "Lost the manifest ID in the noise. Ditched mid-Pacific.",
    });
  } catch (err) {
    await emit({ t: "error", bird, message: `Recall: ${(err as Error).message}` });
  }
}
