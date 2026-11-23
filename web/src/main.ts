import { FlightCanvas } from "./canvas.js";
import { runStream } from "./sse.js";
import { Gauges, buildLevers, makeLog } from "./ui.js";
import type { FlightEvent, Levers } from "./types.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = new FlightCanvas($<HTMLCanvasElement>("map"));
const gauges = new Gauges($("gauges"));
const log = makeLog($("log"));

const DEFAULT_LEVERS: Levers = {
  curate: true,
  protectIntent: true,
  harden: true,
  rotate: true,
  observe: true,
};
const getLevers = buildLevers($("levers"), DEFAULT_LEVERS);

const legs = $<HTMLInputElement>("legs");
const legsVal = $("legsVal");
legs.addEventListener("input", () => (legsVal.textContent = legs.value));

const runBtn = $<HTMLButtonElement>("run");
const source = $<HTMLSelectElement>("source");

let abort: AbortController | null = null;

runBtn.addEventListener("click", async () => {
  abort?.abort();
  abort = new AbortController();

  const levers = getLevers();
  const observe = levers.observe;
  const body = {
    taskId: "trans-pacific-manifest",
    legs: Number(legs.value),
    source: source.value,
    levers,
  };

  canvas.reset();
  gauges.reset();
  $("log").innerHTML = "";
  log(`Fly · source=${body.source} · legs=${body.legs}`, "info");
  runBtn.disabled = true;
  runBtn.textContent = "…flying";

  try {
    await runStream(body, (e: FlightEvent) => dispatch(e, observe), abort.signal);
  } catch (err) {
    log("⚠ " + (err as Error).message, "bad");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "▶ Fly";
  }
});

function dispatch(e: FlightEvent, observe: boolean) {
  switch (e.t) {
    case "model_info":
      gauges.provenance(e.bird, e.model, e.region);
      break;
    case "leg":
      if (observe) log(`${e.bird} · ${e.label}/${e.totalLegs}`, "info");
      break;
    case "usage":
      gauges.usage(e.bird, e.contextTokens, e.costUsd, e.cacheReadTokens, e.inputTokens);
      break;
    case "flight":
      canvas.setTarget(e.bird, e.state);
      gauges.range(e.bird, e.state.range);
      break;
    case "curate":
      if (observe) log(`${e.bird} · curate leg ${e.leg}: cleared ${e.clearedBlocks} block, freed ~${e.freedTokens} tok`, "curate");
      break;
    case "rotate":
      if (observe) log(`${e.bird} · rotate leg ${e.leg}: ${e.replacedTokens}→${e.summaryTokens} tok summary`, "rotate");
      break;
    case "recall":
      log(`${e.bird} · recall → "${e.answer}" ${e.correct ? "✔" : "✖ (wanted " + e.needle + ")"}`, e.correct ? "ok" : "bad");
      break;
    case "verdict":
      canvas.setVerdict(e.bird, e.landed);
      gauges.verdict(e.bird, e.landed);
      log(`${e.bird} · ${e.reason}`, e.landed ? "ok" : "bad");
      break;
    case "error":
      log(`⚠ ${e.bird ?? ""} ${e.message}`.trim(), "bad");
      break;
    case "run_end":
      log("— run complete —", "info");
      break;
  }
}
