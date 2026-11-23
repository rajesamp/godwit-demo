// Shared event contract between the engine, the SSE endpoint, and the browser.
// The web/ side keeps a mirror of this file (web/src/types.ts) — keep them in sync.

export type BirdMode = "naive" | "godwit";

export interface Levers {
  /** Prune low-value tokens (context editing / manual drop). */
  curate: boolean;
  /** Keep the "why" pinned so it survives pruning. */
  protectIntent: boolean;
  /** Pin + surface model provenance (id, region). */
  harden: boolean;
  /** Periodically rebuild context from a trusted summary (compaction). */
  rotate: boolean;
  /** Log every prune/rotate/version decision on screen. */
  observe: boolean;
}

export interface RunConfig {
  taskId: string;
  legs: number;
  model: string;
  source: "live" | "mock" | "replay";
  /** Levers apply to the godwit bird; the naive bird always flies with all off. */
  levers: Levers;
}

/** One point on the flight: progress along the route, and how much range is left. */
export interface FlightState {
  progress: number; // 0..1 along Alaska -> New Zealand
  altitude: number; // 0..1 (drops toward 0 when range runs out = ditching)
  range: number; // 0..1 remaining range, inversely tied to context weight
}

export type FlightEvent =
  | { t: "run_start"; runId: string; config: RunConfig; at: number }
  | { t: "model_info"; bird: BirdMode; model: string; region: string }
  | { t: "leg"; bird: BirdMode; leg: number; totalLegs: number; label: string }
  | {
      t: "usage";
      bird: BirdMode;
      leg: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreateTokens: number;
      contextTokens: number; // running weight the model must carry this turn
      costUsd: number; // cumulative
    }
  | { t: "flight"; bird: BirdMode; leg: number; state: FlightState }
  | { t: "curate"; bird: BirdMode; leg: number; clearedBlocks: number; freedTokens: number }
  | { t: "rotate"; bird: BirdMode; leg: number; summaryTokens: number; replacedTokens: number }
  | { t: "assistant"; bird: BirdMode; leg: number; text: string }
  | { t: "recall"; bird: BirdMode; asked: string; answer: string; correct: boolean; needle: string }
  | { t: "verdict"; bird: BirdMode; landed: boolean; reason: string }
  | { t: "error"; bird?: BirdMode; message: string }
  | { t: "run_end"; runId: string };

export type Emit = (e: FlightEvent) => void | Promise<void>;
