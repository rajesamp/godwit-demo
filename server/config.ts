import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 8787);
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? "";
export const GCP_REGION = process.env.GCP_REGION ?? "global";

export type EngineSource = "live" | "mock" | "replay";
export const DEFAULT_SOURCE: EngineSource =
  (process.env.ENGINE_SOURCE as EngineSource) ?? "mock";

// Claude Sonnet 5 pricing, $/1M tokens. Intro rates ($2 in / $10 out) run
// through 2026-08-31; standard is $3 / $15. We keep both and pick by date so the
// live cost gauge is honest.
const SONNET5_INTRO = { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 };
const SONNET5_STD = { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };

export function priceTable(nowIso: string) {
  const introEndsExclusive = "2026-09-01";
  return nowIso < introEndsExclusive ? SONNET5_INTRO : SONNET5_STD;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

/** Incremental $ for one turn's usage, given a price table ($/1M). */
export function turnCost(u: Usage, p: ReturnType<typeof priceTable>): number {
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheCreateTokens * p.cacheWrite) /
    1_000_000
  );
}
