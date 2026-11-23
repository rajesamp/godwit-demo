// The canonical long task. An early "needle" fact must survive to the final
// recall turn. The naive bird buries it under leg-telemetry noise; the godwit
// bird keeps the intent pinned and prunes the noise, so it still recalls.

/** Small deterministic PRNG (mulberry32) so every run is reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Scenario {
  id: string;
  /** The intent/why the agent must hold across the whole flight. */
  intent: string;
  /** The planted fact recalled at the end. */
  needle: { key: string; value: string };
  /** The recall question asked on the final leg. */
  recallQuestion: string;
  legs: number;
  /** Distractor facts that compete with the needle (drive genuine rot). */
  distractors: string[];
}

export const SCENARIO: Scenario = {
  id: "trans-pacific-manifest",
  intent:
    "Fly a single nonstop leg from Alaska to New Zealand and deliver the sealed cargo. " +
    "The manifest ID is the only thing that lets the destination accept the cargo — do not lose it.",
  needle: { key: "manifest ID", value: "GODWIT-7743-KAKA" },
  recallQuestion:
    "You have arrived. Ground control asks for the manifest ID to accept the cargo. " +
    "Reply with ONLY the manifest ID, nothing else.",
  legs: 10,
  distractors: [
    "GODWIT-1180-TERN",
    "GODWIT-9902-SKUA",
    "GODWIT-4471-GULL",
    "GODWIT-3067-PLVR",
    "GODWIT-8815-ALBA",
  ],
};

/** A big, low-signal telemetry blob for one leg — the "noisy soup". */
export function legTelemetry(scn: Scenario, leg: number, rand: () => number): string {
  const lines: string[] = [];
  lines.push(`--- LEG ${leg} TELEMETRY DUMP (auto-generated, low signal) ---`);
  for (let i = 0; i < 24; i++) {
    const alt = 8000 + Math.floor(rand() * 4000);
    const hdg = Math.floor(rand() * 360);
    const wind = Math.floor(rand() * 90);
    const temp = -40 + Math.floor(rand() * 20);
    // Sprinkle distractor IDs into the noise so recall is a real needle search.
    const distractor =
      rand() < 0.15
        ? ` note=stale-manifest-ref:${scn.distractors[Math.floor(rand() * scn.distractors.length)]}`
        : "";
    lines.push(
      `t+${leg}.${i.toString().padStart(2, "0")} alt=${alt}ft hdg=${hdg} wind=${wind}kt oat=${temp}C batt=ok gps=lock${distractor}`
    );
  }
  lines.push(`--- END LEG ${leg} ---`);
  return lines.join("\n");
}

/** Rough token estimate for the mock engine (≈ chars / 4). Live engine uses real usage. */
export function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
