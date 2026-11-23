// Mirror of server/types.ts — keep in sync. (A shared package is overkill for a demo.)
export type BirdMode = "naive" | "godwit";

export interface Levers {
  curate: boolean;
  protectIntent: boolean;
  harden: boolean;
  rotate: boolean;
  observe: boolean;
}

export interface FlightState {
  progress: number;
  altitude: number;
  range: number;
}

export type FlightEvent =
  | { t: "run_start"; runId: string; config: unknown; at: number }
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
      contextTokens: number;
      costUsd: number;
    }
  | { t: "flight"; bird: BirdMode; leg: number; state: FlightState }
  | { t: "curate"; bird: BirdMode; leg: number; clearedBlocks: number; freedTokens: number }
  | { t: "rotate"; bird: BirdMode; leg: number; summaryTokens: number; replacedTokens: number }
  | { t: "assistant"; bird: BirdMode; leg: number; text: string }
  | { t: "recall"; bird: BirdMode; asked: string; answer: string; correct: boolean; needle: string }
  | { t: "verdict"; bird: BirdMode; landed: boolean; reason: string }
  | { t: "error"; bird?: BirdMode; message: string }
  | { t: "run_end"; runId: string };
