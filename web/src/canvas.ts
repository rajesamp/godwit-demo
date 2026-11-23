import type { BirdMode, FlightState } from "./types.js";

const COLORS: Record<BirdMode, string> = { naive: "#f4a63a", godwit: "#2ec4b6" };

interface BirdView {
  cur: FlightState;
  tgt: FlightState;
  trail: { x: number; y: number }[];
  ditched: boolean;
  landed: boolean;
}

/** Alaska (top-left) -> New Zealand (bottom-right) as a bowed bezier. */
function pathPoint(t: number, w: number, h: number) {
  const p0 = { x: w * 0.1, y: h * 0.22 };
  const p1 = { x: w * 0.5, y: h * 0.05 }; // control — bow the great-circle arc
  const p2 = { x: w * 0.9, y: h * 0.8 };
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

export class FlightCanvas {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private birds: Record<BirdMode, BirdView>;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.birds = { naive: this.fresh(), godwit: this.fresh() };
    this.resize();
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame(() => this.loop());
  }

  private fresh(): BirdView {
    return {
      cur: { progress: 0, altitude: 0.9, range: 1 },
      tgt: { progress: 0, altitude: 0.9, range: 1 },
      trail: [],
      ditched: false,
      landed: false,
    };
  }

  reset() {
    this.birds = { naive: this.fresh(), godwit: this.fresh() };
  }

  setTarget(bird: BirdMode, s: FlightState) {
    // Snap position from the event, don't wait for RAF to converge — some
    // browsers (and background tabs) throttle requestAnimationFrame hard, which
    // would leave the birds stuck near the start. The 260ms leg cadence + trail
    // carry the motion; RAF only redraws.
    const b = this.birds[bird];
    b.tgt = s;
    b.cur = { ...s };
  }

  setVerdict(bird: BirdMode, landed: boolean) {
    this.birds[bird][landed ? "landed" : "ditched"] = true;
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop() {
    this.step();
    this.draw();
    requestAnimationFrame(() => this.loop());
  }

  private step() {
    for (const m of ["naive", "godwit"] as BirdMode[]) {
      const b = this.birds[m];
      b.cur.progress += (b.tgt.progress - b.cur.progress) * 0.08;
      b.cur.altitude += (b.tgt.altitude - b.cur.altitude) * 0.08;
      b.cur.range += (b.tgt.range - b.cur.range) * 0.08;
    }
  }

  private draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // sky -> ocean
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1f2a");
    g.addColorStop(0.55, "#0e2b3a");
    g.addColorStop(1, "#08313f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // ocean shimmer band (lower third)
    ctx.fillStyle = "rgba(20,80,100,0.25)";
    ctx.fillRect(0, h * 0.66, w, h * 0.34);

    // route
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const p = pathPoint(t, w, h);
      t === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // endpoints
    this.marker(pathPoint(0, w, h), "Alaska");
    this.marker(pathPoint(1, w, h), "New Zealand");

    for (const m of ["godwit", "naive"] as BirdMode[]) this.drawBird(m);
  }

  private marker(p: { x: number; y: number }, label: string) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(label, p.x + 8, p.y + 4);
  }

  private drawBird(m: BirdMode) {
    const { ctx, w, h } = this;
    const b = this.birds[m];
    const on = pathPoint(b.cur.progress, w, h);
    const ahead = pathPoint(Math.min(1, b.cur.progress + 0.01), w, h);
    const angle = Math.atan2(ahead.y - on.y, ahead.x - on.x);

    // altitude lifts the bird above the route; a ditch sinks it into the ocean band.
    const lift = (b.cur.altitude - 0.5) * 46;
    const x = on.x;
    const y = on.y - lift;

    // trail
    b.trail.push({ x, y });
    if (b.trail.length > 40) b.trail.shift();
    ctx.strokeStyle = COLORS[m] + "66";
    ctx.lineWidth = 2;
    ctx.beginPath();
    b.trail.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.stroke();

    // bird as a chevron
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = b.ditched ? "#7a3b3b" : COLORS[m];
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // label + range pip
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = COLORS[m];
    const tag = b.ditched ? `${m} ✖ ditched` : b.landed ? `${m} ✔ landed` : m;
    ctx.fillText(tag, x + 12, y - 8);
  }
}
