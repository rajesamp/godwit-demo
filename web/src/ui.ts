import type { BirdMode, Levers } from "./types.js";

const LEVER_DEFS: { key: keyof Levers; label: string; hint: string }[] = [
  { key: "curate", label: "Curate", hint: "prune low-value tokens" },
  { key: "protectIntent", label: "Protect intent", hint: "keep the why pinned" },
  { key: "harden", label: "Harden", hint: "pin + show provenance" },
  { key: "rotate", label: "Rotate", hint: "rebuild from a trusted summary" },
  { key: "observe", label: "Observe", hint: "log every decision" },
];

export function buildLevers(root: HTMLElement, initial: Levers): () => Levers {
  const state: Levers = { ...initial };
  for (const def of LEVER_DEFS) {
    const el = document.createElement("label");
    el.className = "lever";
    el.innerHTML = `<input type="checkbox" ${state[def.key] ? "checked" : ""}/>
      <span class="lever-label">${def.label}</span>
      <span class="lever-hint">${def.hint}</span>`;
    const box = el.querySelector("input")!;
    box.addEventListener("change", () => (state[def.key] = box.checked));
    root.appendChild(el);
  }
  return () => ({ ...state });
}

interface Panel {
  chip: HTMLElement;
  ctx: HTMLElement;
  cost: HTMLElement;
  cache: HTMLElement;
  input: HTMLElement;
  rangeFill: HTMLElement;
  prov: HTMLElement;
}

export class Gauges {
  private panels: Record<BirdMode, Panel>;

  constructor(root: HTMLElement) {
    root.innerHTML = "";
    this.panels = {
      naive: this.panel(root, "naive", "Naive agent", "no curation · resends the noisy soup"),
      godwit: this.panel(root, "godwit", "Godwit agent", "lean · curated · intent pinned"),
    };
  }

  private panel(root: HTMLElement, bird: BirdMode, title: string, sub: string): Panel {
    const el = document.createElement("div");
    el.className = `panel ${bird}`;
    el.innerHTML = `
      <div class="panel-head">
        <div><h3>${title}</h3><p>${sub}</p></div>
        <span class="chip" data-chip>in flight</span>
      </div>
      <div class="metric"><span>context weight</span><b data-ctx>—</b></div>
      <div class="metric"><span>cumulative cost</span><b data-cost>$0.0000</b></div>
      <div class="metric"><span>cache read tok</span><b data-cache>0</b></div>
      <div class="metric"><span>input tok / leg</span><b data-input>0</b></div>
      <div class="range"><div class="range-fill" data-range></div></div>
      <div class="prov" data-prov>model —</div>`;
    root.appendChild(el);
    return {
      chip: el.querySelector("[data-chip]")!,
      ctx: el.querySelector("[data-ctx]")!,
      cost: el.querySelector("[data-cost]")!,
      cache: el.querySelector("[data-cache]")!,
      input: el.querySelector("[data-input]")!,
      rangeFill: el.querySelector("[data-range]")!,
      prov: el.querySelector("[data-prov]")!,
    };
  }

  reset() {
    for (const bird of ["naive", "godwit"] as BirdMode[]) {
      const p = this.panels[bird];
      p.chip.textContent = "in flight";
      p.chip.className = "chip";
      p.ctx.textContent = "—";
      p.cost.textContent = "$0.0000";
      p.cache.textContent = "0";
      p.input.textContent = "0";
      p.rangeFill.style.width = "100%";
    }
  }

  usage(bird: BirdMode, ctxTok: number, cost: number, cache: number, input: number) {
    const p = this.panels[bird];
    p.ctx.textContent = ctxTok.toLocaleString();
    p.cost.textContent = "$" + cost.toFixed(4);
    p.cache.textContent = cache.toLocaleString();
    p.input.textContent = input.toLocaleString();
  }

  range(bird: BirdMode, range: number) {
    const p = this.panels[bird];
    p.rangeFill.style.width = Math.round(range * 100) + "%";
    p.rangeFill.classList.toggle("low", range < 0.25);
  }

  provenance(bird: BirdMode, model: string, region: string) {
    this.panels[bird].prov.textContent = `model ${model} · ${region}`;
  }

  verdict(bird: BirdMode, landed: boolean) {
    const p = this.panels[bird];
    p.chip.textContent = landed ? "✔ landed" : "✖ ditched";
    p.chip.className = "chip " + (landed ? "ok" : "bad");
  }
}

type LogKind = "info" | "curate" | "rotate" | "ok" | "bad";
export function makeLog(el: HTMLElement) {
  return (msg: string, kind: LogKind = "info") => {
    const row = document.createElement("div");
    row.className = `logrow ${kind}`;
    row.textContent = msg;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  };
}
