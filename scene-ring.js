import { schedule, EtchCircle } from "./laser-etch-engine.js?v=8c972897";
import { traceShape } from "./hero-network.js?v=8c972897";

const TAU = 2 * Math.PI;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

const settings = {
  margin: 0.075, // clear space between the words and the band, as a share of the screen's width
  marginMost: 64, // page pixels, at most
  edge: 14, // page pixels the band keeps from the screen's edges
  headerClear: 76, // and from the top, below the pinned header
  narrow: 640, // page pixels: on screens narrower than this the ring may run off the sides
  spacing: 74, // page pixels between circles round the inner ring, about
  rhythm: 4, // the number of circles in the rhythm: every this many inner circles is a hub
  depth: 42, // page pixels between the inner ring and the outer
  sizes: { hub: 12, inner: 7, outer: 5 }, // circle radii, page pixels
  phone: { margin: 0.035, spacing: 52, depth: 28, sizes: { hub: 8, inner: 5, outer: 3.5 } },
  pulse: {
    lights: 2, // lights going round, spaced evenly: two sit on opposite sides
    speed: 180, // page pixels a second round the band: unhurried
    drift: 0.2, // how much its pace eases up and down, as a share of its speed
    driftPeriod: 9000, // ms, one ease up and down
    trail: 150, // page pixels of fading light behind it
    glow: 260, // page pixels behind it over which a circle it has passed stays lit
    rise: 1600, // ms for the pulse to appear after the band is drawn
    leave: 300, // ms for the lights to fade as the band starts to undraw
  },
};

export const scene = {
  desktopLasersStop: 6178, // ms its lasers take on a 1440 × 900 screen; smaller screens slow to match
  around: true, // drawn round the words, not below them
  hideLasers: true,
  seed: 23,
  timing: {
    laserStagger: 0,
    aimBase: 30,
    aimPerRadian: 20,
    cutSpeed: 1150, // page pixels a second along a shape: unhurried
    cutMin: 85,
    cool: 600,
    fillFade: 700,
    beamFade: 200,
    sweepSamples: 0,
    sweepStep: 16,
  },
  lineMin: 70,
  undraw: { length: 1100, each: 320 }, // ms the whole band takes to undraw, and each part of it

  build(layout, palette) {
    const box = layout.words;
    if (!box) return null;
    const circles = placeBand(box, layout.screen);
    if (circles.length < 8) return null;
    const edges = linkBand(circles);
    const lasers = assignToLasers(circles, edges, layout.origins, this.timing, this.lineMin);
    const { overlay, overlayLength } = pulseRound(circles, edges, palette);
    return { lasers, overlay, overlayLength };
  },
};

function placeBand(box, screen) {
  const look = screen.width < settings.narrow ? { ...settings, ...settings.phone } : settings;
  const margin = Math.min(screen.width * look.margin, look.marginMost);
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const { hub } = look.sizes;
  const outerClear = look.edge + look.depth + hub;
  const need = Math.hypot((box.right - box.left) / 2, (box.bottom - box.top) / 2) + margin;
  let inner = Math.min(need, Math.min(cy - settings.headerClear + settings.edge, screen.height - cy) - outerClear);
  if (screen.width >= settings.narrow) inner = Math.min(inner, Math.min(cx, screen.width - cx) - outerClear);
  const outer = inner + look.depth;
  const step = look.rhythm;
  const count = Math.max(step * 3, Math.round((TAU * inner) / look.spacing / step) * step);
  const circles = [];
  for (let k = 0; k < count; k++) {
    const a = -Math.PI / 2 + (k / count) * TAU;
    const b = -Math.PI / 2 + ((k + 0.5) / count) * TAU;
    circles.push({ x: cx + inner * Math.cos(a), y: cy + inner * Math.sin(a), radius: k % step === 0 ? hub : look.sizes.inner });
    circles.push({ x: cx + outer * Math.cos(b), y: cy + outer * Math.sin(b), radius: look.sizes.outer });
  }
  return circles;
}

function linkBand(circles) {
  const count = circles.length;
  const edges = [];
  const link = (a, b, round) => {
    const p = circles[a];
    const q = circles[b];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    edges.push({
      a, b, round,
      curve: [{ x: p.x, y: p.y }, { x: p.x + dx / 3, y: p.y + dy / 3 }, { x: p.x + (2 * dx) / 3, y: p.y + (2 * dy) / 3 }, { x: q.x, y: q.y }],
    });
  };
  for (let i = 0; i < count; i++) {
    link(i, (i + 1) % count, true);
    link(i, (i + 2) % count, false);
  }
  return edges;
}

function assignToLasers(circles, edges, origins, timing, lineMin) {
  const third = Math.ceil(circles.length / 3);
  const orders = origins.map((_, laser) => circles.map((_, i) => i).slice(laser * third, (laser + 1) * third));
  const circleShape = (index, origin) => {
    const c = circles[index];
    return new EtchCircle(c.x, c.y, c.radius, Math.atan2(origin.y - c.y, origin.x - c.x));
  };
  const rough = schedule(orders.map((order, laser) => ({
    origin: origins[laser], shapes: order.map((index) => circleShape(index, origins[laser])),
  })), timing);
  const finishedAt = circles.map(() => 0);
  rough.runs.forEach((run, laser) => run.steps.filter((s) => s.kind === "cut")
    .forEach((step, k) => { finishedAt[orders[laser][k]] = step.end; }));
  const after = circles.map(() => []);
  for (const edge of edges) after[finishedAt[edge.a] >= finishedAt[edge.b] ? edge.a : edge.b].push(edge);
  return orders.map((order, laser) => {
    const origin = origins[laser];
    const shapes = [];
    for (const index of order) {
      shapes.push(circleShape(index, origin));
      for (const edge of after[index]) {
        const trace = traceShape(edge, index, circles);
        trace.minTime = lineMin;
        shapes.push(trace);
      }
    }
    return { origin, shapes };
  });
}

function pulseRound(circles, edges, palette) {
  const pulse = settings.pulse;
  const count = circles.length;
  const round = new Map(edges.filter((e) => e.round).map((e) => [e.a, e]));
  const points = [];
  for (let i = 0; i < count; i++) {
    const edge = round.get(i);
    const path = traceShape(edge, i, circles).points;
    for (const point of path) points.push(point);
  }
  points.push(points[0]);
  const distances = [0];
  for (let k = 1; k < points.length; k++) distances.push(distances[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
  const length = distances.at(-1);
  const pointAt = (d) => {
    const at = ((d % length) + length) % length;
    let low = 0;
    let high = distances.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (distances[mid] <= at) low = mid; else high = mid; }
    const t = (at - distances[low]) / (distances[high] - distances[low] || 1);
    return { x: lerp(points[low].x, points[high].x, t), y: lerp(points[low].y, points[high].y, t) };
  };
  const placeOf = circles.map((c) => {
    let best = 0;
    let bestGap = Infinity;
    for (let k = 0; k < points.length; k += 2) {
      const gap = Math.hypot(points[k].x - c.x, points[k].y - c.y);
      if (gap < bestGap) { bestGap = gap; best = distances[k]; }
    }
    return best;
  });

  const [hr, hg, hb] = palette.hot;
  const [vr, vg, vb] = palette.violet;
  const colour = (heat, alpha) =>
    `rgb(${Math.round(lerp(vr, hr, heat))} ${Math.round(lerp(vg, hg, heat))} ${Math.round(lerp(vb, hb, heat))} / ${alpha})`;

  const sprites = new Map();
  const glowSprite = (heat) => {
    const level = Math.round(heat * 8);
    if (!sprites.has(level)) {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const paint = canvas.getContext("2d");
      const glow = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      glow.addColorStop(0, colour(level / 8, 1));
      glow.addColorStop(1, colour(level / 8, 0));
      paint.fillStyle = glow;
      paint.fillRect(0, 0, size, size);
      sprites.set(level, canvas);
    }
    return sprites.get(level);
  };

  const lap = pulse.rise + ((length / pulse.lights) / pulse.speed) * 1000;
  const draw = (context, clock, options = {}) => {
    if (options.still) return;
    const shown = smoothstep(clamp01(clock / pulse.rise)) * (1 - smoothstep(clamp01((clock - lap) / pulse.leave)));
    if (shown <= 0) return;
    const seconds = clock / 1000;
    const head = pulse.speed * seconds
      + pulse.speed * pulse.drift * (pulse.driftPeriod / 1000 / TAU) * Math.sin((TAU * clock) / pulse.driftPeriod);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";

    const heads = Array.from({ length: pulse.lights }, (_, n) => head + (n * length) / pulse.lights);
    for (const lead of heads) {
      const spacing = 2.5;
      const dots = Math.ceil(pulse.trail / spacing);
      for (let k = 0; k <= dots; k++) {
        const share = k / dots; // 0 at the tail, 1 at the head
        const point = pointAt(lead - pulse.trail + pulse.trail * share);
        const heat = share ** 1.8;
        const size = (1.2 + 2.6 * share) * 2.4;
        context.globalAlpha = 0.32 * heat * shown;
        context.drawImage(glowSprite(heat), point.x - size, point.y - size, size * 2, size * 2);
      }
      context.globalAlpha = 1;
      const tip = pointAt(lead);
      const spark = context.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 16);
      spark.addColorStop(0, colour(1, 0.95 * shown));
      spark.addColorStop(0.35, colour(0.8, 0.35 * shown));
      spark.addColorStop(1, colour(0, 0));
      context.fillStyle = spark;
      context.beginPath();
      context.arc(tip.x, tip.y, 16, 0, TAU);
      context.fill();
    }

    const places = heads.map((lead) => ((lead % length) + length) % length);
    circles.forEach((c, i) => {
      let nearest = Infinity;
      for (const at of places) {
        let behind = at - placeOf[i];
        if (behind < -pulse.trail) behind += length;
        if (behind >= -8 && behind < nearest) nearest = behind;
      }
      const behind = nearest;
      if (behind > pulse.glow) return;
      const heat = (1 - clamp01(behind / pulse.glow)) ** 2 * shown;
      const halo = context.createRadialGradient(c.x, c.y, c.radius * 0.5, c.x, c.y, c.radius + 10);
      halo.addColorStop(0, colour(0.8, 0.45 * heat));
      halo.addColorStop(1, colour(0, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(c.x, c.y, c.radius + 10, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(c.x, c.y, c.radius, 0, TAU);
      context.lineWidth = palette.lineWidth * 1.5;
      context.strokeStyle = colour(heat, heat);
      context.stroke();
    });
    context.restore();
  };
  draw.drawsThroughFade = true;
  return { overlay: draw, overlayLength: lap };
}
