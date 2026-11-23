import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Emit, FlightEvent } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const RECORDINGS = join(here, "..", "recordings");

/** Wrap an emit so every event is also appended to a golden-run file. */
export function recording(name: string, emit: Emit): Emit {
  const file = join(RECORDINGS, `${name}.jsonl`);
  let ready: Promise<unknown> = mkdir(RECORDINGS, { recursive: true });
  return async (e: FlightEvent) => {
    await ready;
    const line = JSON.stringify({ at: Date.now(), e }) + "\n";
    ready = appendFile(file, line);
    await emit(e);
  };
}

/** Replay a recorded run, preserving the original inter-event timing (capped). */
export async function replayFlight(name: string, emit: Emit): Promise<void> {
  const target = name === "latest" ? await latestRecording() : `${name}.jsonl`;
  if (!target) throw new Error("No recordings found. Run once with RECORD=1 first.");
  const raw = await readFile(join(RECORDINGS, target), "utf8");
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { at: number; e: FlightEvent });

  let prev = rows[0]?.at ?? 0;
  for (const row of rows) {
    const gap = Math.min(600, Math.max(0, row.at - prev));
    prev = row.at;
    if (gap) await new Promise((r) => setTimeout(r, gap));
    await emit(row.e);
  }
}

async function latestRecording(): Promise<string | null> {
  try {
    const files = (await readdir(RECORDINGS)).filter((f) => f.endsWith(".jsonl")).sort();
    return files.at(-1) ?? null;
  } catch {
    return null;
  }
}
