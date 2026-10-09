
export class EtchCircle {
  constructor(x, y, radius, startAngle = 0) {
    Object.assign(this, { x, y, radius, startAngle });
    this.length = 2 * Math.PI * radius;
    this.fillable = true;
  }
  pointAt(distance) {
    const angle = this.startAngle + distance / this.radius;
    return { x: this.x + this.radius * Math.cos(angle), y: this.y + this.radius * Math.sin(angle) };
  }
  addPiece(context, from, to) {
    const begin = this.pointAt(from);
    context.moveTo(begin.x, begin.y);
    context.arc(this.x, this.y, this.radius, this.startAngle + from / this.radius, this.startAngle + to / this.radius);
  }
  addWhole(context) {
    context.moveTo(this.x + this.radius, this.y);
    context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
  }
}

export class EtchLine {
  constructor(from, to) {
    Object.assign(this, { from, to });
    this.length = Math.hypot(to.x - from.x, to.y - from.y);
    this.fillable = false;
  }
  pointAt(distance) {
    const t = this.length ? distance / this.length : 0;
    return { x: this.from.x + (this.to.x - this.from.x) * t, y: this.from.y + (this.to.y - this.from.y) * t };
  }
  addPiece(context, from, to) {
    const begin = this.pointAt(from);
    const end = this.pointAt(to);
    context.moveTo(begin.x, begin.y);
    context.lineTo(end.x, end.y);
  }
}

export class EtchPath {
  constructor(points) {
    this.points = points;
    this.fillable = false;
    this.distances = [0];
    for (let k = 1; k < points.length; k++) {
      this.distances.push(this.distances[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
    }
    this.length = this.distances.at(-1);
  }
  pointAt(distance) {
    const d = Math.min(Math.max(distance, 0), this.length);
    let low = 0;
    let high = this.distances.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.distances[middle] <= d) low = middle; else high = middle;
    }
    const span = this.distances[high] - this.distances[low] || 1;
    const t = (d - this.distances[low]) / span;
    const [p, q] = [this.points[low], this.points[high]];
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  }
  addPiece(context, from, to) {
    const begin = this.pointAt(from);
    context.moveTo(begin.x, begin.y);
    for (let k = 1; k < this.points.length - 1; k++) {
      if (this.distances[k] <= from) continue;
      if (this.distances[k] >= to) break;
      context.lineTo(this.points[k].x, this.points[k].y);
    }
    const end = this.pointAt(to);
    context.lineTo(end.x, end.y);
  }
}

export class EtchBody extends EtchPath {
  constructor(points, widths) {
    super(points);
    this.widths = widths;
    this.body = true;
  }
}

const clamp = (value) => Math.min(Math.max(value, 0), 1);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const mix = (a, b, t) => a + (b - a) * t;

function swing(origin, from, to, t) {
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) };
}

export function schedule(lasers, timing) {
  const cuts = [];
  const runs = lasers.map((laser, index) => {
    const steps = [];
    let clock = index * timing.laserStagger;
    let tip = { x: laser.origin.x, y: laser.origin.y - 1 };
    const powerOn = clock;
    const dark = [];
    for (const shape of laser.shapes) {
      const waitFrom = clock;
      const start = shape.pointAt(0);
      const turn = Math.abs(Math.atan2(start.y - laser.origin.y, start.x - laser.origin.x)
        - Math.atan2(tip.y - laser.origin.y, tip.x - laser.origin.x));
      const aimLength = timing.aimBase + timing.aimPerRadian * Math.min(turn, Math.PI);
      steps.push({ kind: "aim", start: clock, end: clock + aimLength, from: tip, to: start });
      clock += aimLength;
      const cutLength = Math.max(shape.minTime ?? timing.cutMin, (shape.length / (shape.speed ?? timing.cutSpeed)) * 1000);
      const cut = { shape, start: clock, end: clock + cutLength };
      steps.push({ kind: "cut", ...cut });
      cuts.push(cut);
      clock += cutLength;
      tip = shape.pointAt(shape.length);
      if (shape.pauseAfter) clock += shape.pauseAfter;
      if (shape.length < 1) {
        const last = dark.at(-1);
        if (last && last[1] >= waitFrom - 1) last[1] = clock; else dark.push([waitFrom, clock]);
      }
    }
    return { origin: laser.origin, steps, powerOn, powerOff: clock, lastTip: tip, dark, retract: timing.retract ?? 320 };
  });
  const lasersStop = Math.max(...runs.map((run) => run.powerOff));
  const ending = lasersStop + Math.max(timing.beamFade, timing.retract ?? 320) + timing.fillFade + timing.cool;
  return { runs, cuts, lasersStop, ending };
}

function tipAt(run, time, home = run.origin) {
  let resting = null; // where the beam rests while it waits between steps
  for (const step of run.steps) {
    if (time > step.end) {
      resting = step.kind === "aim" ? step.to : step.shape.pointAt(step.shape.length);
      continue;
    }
    if (time < step.start) return resting;
    const t = clamp((time - step.start) / (step.end - step.start));
    if (step.kind === "aim") return swing(run.origin, step.from, step.to, easeInOut(t));
    return step.shape.pointAt(t * step.shape.length);
  }
  if (time <= run.powerOff) return run.lastTip;
  if (time > run.powerOff + run.retract) return null;
  const back = easeInOut(clamp((time - run.powerOff) / run.retract));
  return { x: mix(run.lastTip.x, home.x, back), y: mix(run.lastTip.y, home.y, back) };
}

export function runLaserEtch({
  canvas, lasers, palette, timing, overlay = null, overlayLength = Infinity, onFinished = null,
  originShift = () => ({ x: 0, y: 0 }), watch: watched = canvas, scenery = [], onLasersStop = null, onTick = null,
  hideLasers = false, undraw = null,
}) {
  const context = canvas.getContext("2d");
  const plan = schedule(lasers, timing);
  const lifting = plan.cuts.filter(({ shape }) => shape.lift);
  const drawOrder = [...plan.cuts].sort((a, b) => (a.shape.layer ?? 0) - (b.shape.layer ?? 0));
  const bodyGroups = [...drawOrder.filter(({ shape }) => shape.body).reduce((groups, cut) => {
    const floor = cut.shape.floor ?? Infinity;
    if (!groups.has(floor)) groups.set(floor, []);
    groups.get(floor).push(cut);
    return groups;
  }, new Map()).values()];
  const lifted = (shape, time) => time >= plan.lasersStop + shape.lift.at;
  const outroStart = plan.lasersStop + overlayLength;
  const undrawOf = new Map();
  if (undraw) {
    const backwards = [...plan.cuts].sort((a, b) => b.end - a.end);
    const spread = Math.max(0, undraw.length - undraw.each);
    backwards.forEach((cut, k) => undrawOf.set(cut, { start: backwards.length > 1 ? (k / (backwards.length - 1)) * spread : 0, length: undraw.each }));
  }
  const outroLength = Math.max(undraw ? undraw.length : 0, ...plan.cuts.map(({ shape }) => (shape.fade ? shape.fade.start + shape.fade.length : 0)));
  const cycleEnd = outroStart + outroLength;
  const [hr, hg, hb] = palette.hot;
  const [vr, vg, vb] = palette.violet;
  const colour = (heat, alpha) =>
    `rgb(${Math.round(mix(vr, hr, heat))} ${Math.round(mix(vg, hg, heat))} ${Math.round(mix(vb, hb, heat))} / ${alpha})`;
  let frame = 0;
  let clock = 0;
  let rate = 1;
  let target = 1;
  let pace = 1; // a steady multiplier on the whole clock: a smaller screen's drawing runs slower, to take as long as on a desktop
  let realTime = 0; // real ms since this cycle started, for the slow start
  let sceneryAge = 0;

  const remaining = (shape, time) => (shape.fade && time >= outroStart
    ? 1 - clamp((time - outroStart - shape.fade.start) / shape.fade.length) : 1);
  const kept = (cut, time) => {
    const back = undrawOf.get(cut);
    return back && time >= outroStart ? 1 - easeOut(clamp((time - outroStart - back.start) / back.length)) : 1;
  };

  const [gr, gg, gb] = palette.ground ?? [0, 0, 0];
  const tint = palette.coverTint ?? 0.3;
  const coverColour = (alpha) =>
    `rgb(${Math.round(mix(gr, vr, tint))} ${Math.round(mix(gg, vg, tint))} ${Math.round(mix(gb, vb, tint))} / ${alpha})`;

  const outlineWidth = (w, line) => (w >= 2 ? w + 2 * line : mix(line * 1.3, 2 + 2 * line, w / 2));
  const insideWidth = (w) => (w >= 2 ? w : Math.max(0, (w - 1) * 2));
  function drawBodies(cuts, time) {
    const outlines = new Map();
    const insides = new Map();
    const hot = [];
    const add = (paths, width, left, a, b) => {
      if (width <= 0.05) return;
      const key = `${Math.round(width * 4)}:${Math.round(left * 20)}`;
      if (!paths.has(key)) paths.set(key, { width: Math.round(width * 4) / 4, left: Math.round(left * 20) / 20, path: new Path2D() });
      const { path } = paths.get(key);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    };
    for (const cut of cuts) {
      const { shape } = cut;
      const left = remaining(shape, time);
      if (left <= 0) continue;
      const span = cut.end - cut.start;
      const drawn = clamp((time - cut.start) / span) * shape.length * kept(cut, time);
      if (drawn <= 0) continue;
      const { points, distances, widths } = shape;
      const line = shape.lineWidth ?? palette.lineWidth;
      for (let i = 0; i < points.length - 1 && distances[i] < drawn; i++) {
        const a = points[i];
        const b = distances[i + 1] <= drawn ? points[i + 1] : shape.pointAt(drawn);
        const width = (widths[i] + widths[i + 1]) / 2;
        add(outlines, outlineWidth(width, line), left, a, b);
        add(insides, insideWidth(width), left, a, b);
        const heat = 1 - clamp((time - (cut.start + (Math.min(distances[i + 1], drawn) / shape.length) * span)) / timing.cool);
        if (heat > 0) hot.push({ a, b, width, heat });
      }
    }
    const floor = Math.min(...cuts.map(({ shape }) => shape.floor ?? Infinity));
    context.save();
    if (Number.isFinite(floor)) {
      context.beginPath();
      context.rect(-1e5, -1e5, 2e5, floor + 1e5);
      context.clip();
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const { width, left, path } of outlines.values()) {
      context.lineWidth = width;
      context.strokeStyle = colour(0, palette.lineAlpha * left);
      context.stroke(path);
    }
    context.globalCompositeOperation = "destination-out";
    for (const { width, left, path } of insides.values()) {
      context.lineWidth = width;
      context.strokeStyle = `rgb(0 0 0 / ${left})`;
      context.stroke(path);
    }
    context.globalCompositeOperation = "source-over";
    context.globalCompositeOperation = "lighter";
    for (const { a, b, width, heat } of hot) {
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineWidth = Math.min(width, 6) + 4;
      context.strokeStyle = colour(heat, 0.18 * heat);
      context.stroke();
      context.lineWidth = Math.min(width, 3) + 1;
      context.strokeStyle = colour(heat, 0.85 * heat);
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
    context.restore();
  }

  const tinted = new Map();
  function coloursFor(own) {
    if (!own) return { line: colour, cover: coverColour };
    const key = own.join();
    if (!tinted.has(key)) {
      const [tr, tg, tb] = own;
      tinted.set(key, {
        line: (heat, alpha) => `rgb(${Math.round(mix(tr, hr, heat))} ${Math.round(mix(tg, hg, heat))} ${Math.round(mix(tb, hb, heat))} / ${alpha})`,
        cover: (alpha) => `rgb(${Math.round(mix(gr, tr, tint))} ${Math.round(mix(gg, tg, tint))} ${Math.round(mix(gb, tb, tint))} / ${alpha})`,
      });
    }
    return tinted.get(key);
  }

  function drawCut(cut, time) {
    const { shape } = cut;
    const { line: colour, cover: coverColour } = coloursFor(shape.tint);
    const left = remaining(shape, time);
    if (left <= 0) return;
    const span = cut.end - cut.start;
    const drawn = clamp((time - cut.start) / span) * shape.length * kept(cut, time);
    if (drawn <= 0) return;
    const cutAt = (distance) => cut.start + (distance / shape.length) * span;
    const coolEdge = Math.min(drawn, Math.max(0, ((time - timing.cool - cut.start) / span) * shape.length));
    const lineWidth = shape.lineWidth ?? palette.lineWidth; // a shape may be finer, like a cable's strings

    if (shape.fillable && time > cut.end) {
      const grown = easeOut(clamp((time - cut.end) / (shape.fillFade ?? timing.fillFade)));
      context.beginPath();
      shape.addWhole(context);
      const filled = grown * left * kept(cut, time);
      context.fillStyle = shape.cover ? coverColour(filled) : colour(0, filled * palette.fillAlpha);
      context.fill();
    }
    if (coolEdge > 0) {
      context.beginPath();
      shape.addPiece(context, 0, coolEdge);
      context.lineWidth = lineWidth;
      context.strokeStyle = shape.paint
        ? shape.paint(context, (alpha) => colour(0, alpha), palette.lineAlpha * left)
        : colour(0, palette.lineAlpha * left);
      context.stroke();
    }
    const hotLength = drawn - coolEdge;
    if (hotLength <= 0) return;
    const pieces = Math.max(2, Math.ceil(hotLength / 14));
    context.globalCompositeOperation = "lighter";
    for (let i = 0; i < pieces; i++) {
      const from = coolEdge + (hotLength * i) / pieces;
      const to = coolEdge + (hotLength * (i + 1)) / pieces;
      const heat = 1 - clamp((time - cutAt(to)) / timing.cool);
      context.beginPath();
      shape.addPiece(context, from, to);
      context.lineWidth = lineWidth * 5;
      context.strokeStyle = colour(heat, 0.16 * heat);
      context.stroke();
      context.lineWidth = lineWidth * 1.4;
      context.strokeStyle = colour(heat, mix(palette.lineAlpha, 1, heat));
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
  }

  const shifted = (run) => {
    const shift = originShift();
    return { x: run.origin.x + shift.x, y: run.origin.y + shift.y };
  };

  function drawSweep(run, time) {
    const lit = litThroughWaits(run, time);
    if (lit <= 0) return;
    const origin = shifted(run);
    const samples = [];
    for (let k = 0; k <= timing.sweepSamples; k++) {
      const tip = tipAt(run, time - k * timing.sweepStep, origin);
      if (!tip) break;
      samples.push(tip);
    }
    if (samples.length < 2) return;
    context.globalCompositeOperation = "lighter";
    for (let k = 0; k < samples.length - 1; k++) {
      const age = k / timing.sweepSamples;
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(samples[k].x, samples[k].y);
      context.lineTo(samples[k + 1].x, samples[k + 1].y);
      context.closePath();
      context.fillStyle = colour(0.5 * (1 - age), palette.sweepAlpha * (1 - age) * lit);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
  }

  function litThroughWaits(run, time) {
    let lit = 1;
    for (const [from, to] of run.dark ?? []) {
      if (time <= from || time >= to) continue;
      const out = from <= run.powerOn ? Infinity : time - from;
      lit = Math.min(lit, 1 - clamp(Math.min(out, to - time) / timing.beamFade));
    }
    return lit;
  }

  function drawBeam(run, time) {
    const origin = shifted(run);
    const tip = tipAt(run, time, origin);
    if (!tip) return;
    const firstWork = (run.dark?.[0]?.[0] ?? Infinity) <= run.powerOn ? run.dark[0][1] : run.powerOn;
    const fadeIn = clamp((time - firstWork) / timing.beamFade);
    const fadeOut = 1 - clamp((time - run.powerOff) / run.retract);
    const strength = Math.min(fadeIn, fadeOut) * litThroughWaits(run, time);
    if (strength <= 0) return;
    context.globalCompositeOperation = "lighter";

    const soft = context.createLinearGradient(origin.x, origin.y, tip.x, tip.y);
    soft.addColorStop(0, colour(0.6, 0.0));
    soft.addColorStop(0.06, colour(0.6, 0.22 * strength));
    soft.addColorStop(0.35, colour(0.3, 0.08 * strength));
    soft.addColorStop(1, colour(0.3, 0.05 * strength));
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(tip.x, tip.y);
    context.lineCap = "round";
    context.lineWidth = 9;
    context.strokeStyle = soft;
    context.stroke();

    const sharp = context.createLinearGradient(origin.x, origin.y, tip.x, tip.y);
    sharp.addColorStop(0, colour(1, 0));
    sharp.addColorStop(0.14, colour(1, 0));
    sharp.addColorStop(0.32, colour(1, 0.95 * strength));
    sharp.addColorStop(1, colour(1, 0.95 * strength));
    context.lineWidth = 1.2;
    context.strokeStyle = sharp;
    context.stroke();

    const spark = context.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14);
    spark.addColorStop(0, colour(1, 0.9 * strength));
    spark.addColorStop(0.25, colour(0.8, 0.35 * strength));
    spark.addColorStop(1, colour(0, 0));
    context.fillStyle = spark;
    context.fillRect(tip.x - 14, tip.y - 14, 28, 28);
    context.globalCompositeOperation = "source-over";
    context.lineCap = "butt";
  }

  function drawScenery() {
    if (!scenery.length) return;
    const shown = timing.sceneryFade ? easeOut(clamp(sceneryAge / timing.sceneryFade)) : 1;
    if (shown <= 0) return;
    context.save();
    context.globalAlpha = shown;
    for (const shape of scenery) shape.paintBelow?.(context);
    context.lineWidth = palette.lineWidth;
    for (const shape of scenery) {
      context.beginPath();
      shape.addPiece(context, 0, shape.length);
      if (shape.fadeEnds) {
        const xs = (shape.points ?? [shape.pointAt(0), shape.pointAt(shape.length)]).map((p) => p.x);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const share = Math.min(shape.fadeEnds / (right - left || 1), 0.5);
        const fade = context.createLinearGradient(left, 0, right, 0);
        fade.addColorStop(0, colour(0, 0));
        fade.addColorStop(share, colour(0, palette.lineAlpha));
        fade.addColorStop(1 - share, colour(0, palette.lineAlpha));
        fade.addColorStop(1, colour(0, 0));
        context.strokeStyle = fade;
      } else {
        context.strokeStyle = colour(0, palette.lineAlpha);
      }
      context.stroke();
    }
    context.restore();
  }

  function draw(time, { withLifting = true } = {}) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawScenery();
    for (const group of bodyGroups) drawBodies(group, time);
    for (const cut of drawOrder) {
      if (cut.shape.body) continue;
      if (cut.shape.lift && (!withLifting || lifted(cut.shape, time))) continue;
      drawCut(cut, time);
    }
    if (!hideLasers) {
      for (const run of plan.runs) drawSweep(run, time);
      for (const run of plan.runs) drawBeam(run, time);
    }
  }

  const settled = document.createElement("canvas");
  let settledReady = false;
  let visible = true;
  let running = false;

  function settle() {
    draw(plan.ending, { withLifting: false });
    settled.width = canvas.width;
    settled.height = canvas.height;
    settled.getContext("2d").drawImage(canvas, 0, 0);
    settledReady = true;
    for (const cut of lifting) drawCut(cut, plan.ending);
  }

  function drawSettled() {
    const transform = context.getTransform();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(settled, 0, 0);
    context.setTransform(transform);
  }

  let lastNow = 0;
  function tick(now) {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    const step = lastNow ? Math.min(now - lastNow, 64) : 0;
    lastNow = now;
    if (!visible) return;
    rate += (target - rate) * Math.min(1, step / (timing.rateEase ?? 350));
    realTime += step;
    sceneryAge += step;
    const ramp = timing.rampTime ? Math.min(1, realTime / timing.rampTime) : 1;
    const from = timing.rampFrom ?? 1;
    const warm = from + (1 - from) * ramp;
    const before = clock;
    clock += step * rate * warm * pace;
    const time = clock;
    if (before < plan.lasersStop && time >= plan.lasersStop) onLasersStop?.();
    onTick?.(time);
    if (time >= cycleEnd) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawScenery();
      running = false;
      cancelAnimationFrame(frame);
      onFinished?.();
      return;
    }
    if (time >= outroStart) {
      draw(time);
      if (overlay?.drawsThroughFade) overlay(context, time - plan.lasersStop);
      return;
    }
    if (time < plan.ending) {
      draw(time);
    } else {
      if (!settledReady) settle();
      if (!overlay && overlayLength === Infinity) { running = false; cancelAnimationFrame(frame); return; }
      drawSettled();
      for (const cut of lifting) if (!lifted(cut.shape, time)) drawCut(cut, time);
    }
    if (overlay && time >= plan.lasersStop) overlay(context, time - plan.lasersStop);
  }

  const watch = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  watch.observe(watched);

  return {
    duration: plan.ending,
    cuts: plan.cuts,
    beamsOn: plan.runs.map((run) => ((run.dark?.[0]?.[0] ?? Infinity) <= run.powerOn ? run.dark[0][1] : run.powerOn)),
    outroStart,
    lasersStop: plan.lasersStop,
    start() { cancelAnimationFrame(frame); clock = 0; realTime = 0; lastNow = 0; running = true; frame = requestAnimationFrame(tick); },
    finish({ still = false } = {}) {
      cancelAnimationFrame(frame);
      sceneryAge = Infinity;
      settle();
      if (still || !overlay) { running = false; return; }
      clock = plan.ending;
      realTime = timing.rampTime ?? 0;
      lastNow = 0;
      running = true;
      frame = requestAnimationFrame(tick);
    },
    stop() { running = false; cancelAnimationFrame(frame); watch.disconnect(); },
    redraw() { if (!running) draw(plan.ending); },
    setRate(next) { target = next; },
    setPace(next) { pace = next; },
  };
}
