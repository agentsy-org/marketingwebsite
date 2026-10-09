import { palette } from "./hero-graphic.js?v=8c972897";
import { canvasRatio } from "./canvas-ratio.js?v=8c972897";

const TAU = 2 * Math.PI;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;

const settings = {
  studs: 7,
  nails: 8,
  raise: 300, // ms for the frame's timbers to go up, one after another
  stagger: 55, // ms between one timber and the next
  nailsIn: 500, // ms for the row of nails to appear, once the frame is up
  move: 380, // ms for the hammer to go from one nail to the next
  swing: 150, // ms, a blow coming down
  lift: 250, // ms, lifting for the next blow
  rest: 110, // ms the hammer rests on a nail after a blow
  hold: 1600, // ms the wall stands finished before the nails ease back out
  reset: 700, // ms for the nails to ease back out
  raised: 0.9, // radians the hammer is drawn back, ready to strike
  sticksOut: 0.72, // how much of a nail sticks out before it is hit, as a share of its length
};

const holder = document.querySelector("[data-builders]");
if (holder) document.fonts.ready.then(() => start(holder));

function start(holder) {
  const canvas = holder.querySelector("canvas");
  const paint = canvas.getContext("2d");
  const colours = palette();
  const [vr, vg, vb] = colours.violet;
  const [gr, gg, gb] = colours.ground;
  const violet = (alpha) => `rgb(${vr} ${vg} ${vb} / ${alpha})`;
  const hot = (heat, alpha) => `rgb(${Math.round(lerp(vr, 255, heat))} ${Math.round(lerp(vg, 255, heat))} ${Math.round(lerp(vb, 255, heat))} / ${alpha})`;
  const cover = `rgb(${Math.round(lerp(gr, vr, 0.18))} ${Math.round(lerp(gg, vg, 0.18))} ${Math.round(lerp(gb, vb, 0.18))})`;
  const hammerHead = `rgb(${Math.round(lerp(vr, 255, 0.55))} ${Math.round(lerp(vg, 255, 0.55))} ${Math.round(lerp(vb, 255, 0.55))})`;
  const hammerHandle = `rgb(${vr} ${vg} ${vb})`;
  const hammerGrip = `rgb(${Math.round(lerp(gr, vr, 0.45))} ${Math.round(lerp(gg, vg, 0.45))} ${Math.round(lerp(gb, vb, 0.45))})`;
  const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
  let shape = null;
  let ratioNow = 1;
  let visible = false;
  let frame = 0;
  let clock = 0;
  let last = 0;

  function measure() {
    const box = holder.getBoundingClientRect();
    const ratio = canvasRatio(box.width, box.height);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    ratioNow = ratio;
    const W = box.width;
    const H = box.height;
    const h = Math.min(W / 3.9, H / 2.28);
    const t = h * 0.065; // a timber's thickness
    const ww = h * 2.5; // the wall's width
    const left = (W - h * 3.9) / 2 + h * 0.7; // room each side for the hammer at the end walls
    const right = left + ww;
    const wallTop = (H - h * 2.28) / 2 + h * 1.24; // room above the ridge for the hammer's swing
    const bottom = wallTop + h;
    const yT = wallTop + t; // inside the wall, under the top plate
    const yB = bottom - t; // and over the bottom plate
    const inside = yB - yT;
    const into = t * 0.5; // how far a piece runs into the one it meets
    const timbers = [];
    const rect = (layer, x, y, w, hh) => timbers.push({ kind: "rect", layer, x, y, w, h: hh });
    const beam = (layer, a, b, w, past = 0) => timbers.push({ kind: "beam", layer, a, b, w, past });

    rect(4, left, bottom - t, ww, t); // bottom plate
    const studs = 10;
    const xs = Array.from({ length: studs }, (_, k) => lerp(left, right - t, k / (studs - 1)));
    const windowFrom = 2; // the window sits between these two studs, the one between them cut short
    const windowTo = 4;
    const lintelTop = yT + inside * 0.1;
    const lintelBottom = lintelTop + t * 1.7;
    const sill = yT + inside * 0.62;
    xs.forEach((x, k) => {
      if (k === windowFrom + 1) {
        rect(0, x, yT - into, t, lintelTop - yT + 2 * into); // cripple over the lintel
        rect(0, x, sill + t - into, t, yB - sill - t + 2 * into); // cripple under the sill
      } else rect(0, x, yT - into, t, inside + 2 * into);
      if (k === windowFrom) rect(0, x + t - into, lintelBottom - into, t + into, yB - lintelBottom + 2 * into); // jack studs under the lintel
      if (k === windowTo) rect(0, x - t, lintelBottom - into, t + into, yB - lintelBottom + 2 * into);
    });
    rect(2, xs[windowFrom] + t - into, lintelTop, xs[windowTo] - xs[windowFrom] - t + 2 * into, lintelBottom - lintelTop); // lintel
    rect(2, xs[windowFrom] + 2 * t - into, sill, xs[windowTo] - xs[windowFrom] - 3 * t + 2 * into, t); // sill
    const nogging = yT + inside * 0.5 - t / 2;
    for (let k = 0; k < studs - 1; k++) {
      if (k >= windowFrom && k < windowTo) continue;
      rect(1, xs[k] + t - into, nogging, xs[k + 1] - xs[k] - t + 2 * into, t);
    }
    rect(4, left, wallTop, ww, t); // the top plate, which the truss sits on as its bottom chord

    const pitch = Math.tan((24 * Math.PI) / 180);
    const over = h * 0.16; // how far the eaves run past the wall
    const heel = wallTop + t / 2;
    const apex = { x: left + ww / 2, y: heel - (ww / 2) * pitch };
    const heelL = { x: left, y: heel };
    const heelR = { x: right, y: heel };
    const thirdL = { x: left + ww / 3, y: heel };
    const thirdR = { x: left + (2 * ww) / 3, y: heel };
    const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    beam(5, middle(heelL, apex), thirdL, t * 0.75);
    beam(5, thirdL, apex, t * 0.75);
    beam(5, apex, thirdR, t * 0.75);
    beam(5, thirdR, middle(heelR, apex), t * 0.75);
    const rafter = t * 1.1;
    const tailL = { x: left - over, y: heel + over * pitch };
    const tailR = { x: right + over, y: heel + over * pitch };
    beam(7, tailL, apex, rafter, t * 0.3); // rafters
    beam(7, tailR, apex, rafter, t * 0.3);

    const direction = (a, b) => { const long = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / long, y: (b.y - a.y) / long }; };
    const upL = direction(tailL, apex);
    const upR = direction(tailR, apex);
    const outL = { x: upL.y, y: -upL.x }; // up and out from the left rafter
    const outR = { x: -upR.y, y: upR.x };
    const onTop = (p, up, out, by, hand) => ({
      x: p.x + up.x * by + (out.x * rafter) / 2, y: p.y + up.y * by + (out.y * rafter) / 2, angle: Math.atan2(out.y, out.x), hand,
    });
    const wallNail = nogging + t / 2;
    const nails = [
      { x: left, y: wallNail, angle: -Math.PI, hand: -1 },
      onTop({ x: left + t / 2, y: heel - (t / 2) * pitch }, upL, outL, 0, -1),
      onTop(middle(heelL, apex), upL, outL, 0, -1),
      onTop(apex, upL, outL, -t * 1.9, -1),
      onTop(apex, upR, outR, -t * 1.9, 1),
      onTop(middle(heelR, apex), upR, outR, 0, 1),
      onTop({ x: right - t / 2, y: heel - (t / 2) * pitch }, upR, outR, 0, 1),
      { x: right, y: wallNail, angle: 0, hand: 1 },
    ];
    shape = {
      W, H, t, base: bottom, length: h * 0.16, nails,
      timbers: timbers.map((timber, step) => ({ ...timber, step })).sort((a, b) => a.layer - b.layer),
      head: { half: h * 0.12, tall: h * 0.08 }, // the hammer's head, half its length and its height
      handle: h * 0.055, // the handle's thickness
      reach: h * 0.42, // from the hand to the middle of the head
    };
  }

  const timeline = () => {
    const up = settings.raise + shape.timbers.length * settings.stagger;
    const perBlow = settings.swing + settings.rest + settings.lift;
    const perNail = settings.move + 2 * perBlow;
    const nailsFrom = up + settings.nailsIn;
    const done = nailsFrom + settings.nails * perNail;
    return { up, nailsFrom, perBlow, perNail, done, end: done + settings.hold + settings.reset };
  };

  function state(time) {
    const line = timeline();
    const still = time === Infinity;
    const out = shape.nails.map(() => (still ? 0 : 1));
    let hammer = null;
    if (!still && time >= line.nailsFrom && time < line.done + settings.hold) {
      const t = time - line.nailsFrom;
      const k = Math.min(settings.nails - 1, Math.floor(t / line.perNail));
      for (let j = 0; j < k; j++) out[j] = 0;
      const into = t - k * line.perNail;
      let from = k - 1 < 0 ? -0.6 : k - 1; // where it comes from: above the first nail at the start
      let at = k;
      let back = settings.raised;
      let impact = 0;
      if (into < settings.move) {
        at = lerp(from, k, ease(into / settings.move));
      } else {
        const blowTime = into - settings.move;
        const blow = Math.min(1, Math.floor(blowTime / line.perBlow));
        const inBlow = blowTime - blow * line.perBlow;
        const after = (blow + 1) * 0.5; // a nail's depth after this blow lands: half, then home
        const before = blow * 0.5;
        if (inBlow < settings.swing) {
          back = settings.raised * (1 - easeIn(inBlow / settings.swing));
          out[k] = 1 - before;
        } else if (inBlow < settings.swing + settings.rest) {
          back = 0;
          const since = inBlow - settings.swing;
          out[k] = 1 - lerp(before, after, easeOut(clamp01(since / 60)));
          impact = 1 - since / settings.rest;
        } else {
          back = settings.raised * ease((inBlow - settings.swing - settings.rest) / settings.lift);
          out[k] = 1 - after;
        }
        if (blowTime >= 2 * line.perBlow) out[k] = 0;
      }
      if (t >= settings.nails * line.perNail) {
        const gone = clamp01((t - settings.nails * line.perNail) / 500);
        at = settings.nails - 1;
        back = settings.raised + gone * 0.6;
        hammer = { at, back, impact: 0, alpha: 1 - gone };
      } else {
        hammer = { at, back, impact, alpha: clamp01((time - line.nailsFrom) / 250) };
      }
    } else if (!still && time >= line.done + settings.hold) {
      const t = time - line.done - settings.hold;
      shape.nails.forEach((_, k) => { out[k] = ease(clamp01((t - k * 60) / (settings.reset - 300))); });
    }
    return { out, hammer, line };
  }

  function draw(time) {
    const { W, H, t, timbers, length, nails, head, handle, reach } = shape;
    paint.clearRect(0, 0, W, H);
    const { out, hammer, line } = state(time);
    const still = time === Infinity;
    paint.lineJoin = "round";
    paint.lineCap = "round";
    paint.lineWidth = 1.2;
    const round = t * 0.32;
    const shown = timbers.map((timber) => (still ? 1 : ease(clamp01((time - timber.step * settings.stagger) / settings.raise))));
    const outline = (timber, k) => {
      paint.beginPath();
      if (timber.kind === "rect") {
        const lift = (1 - shown[k]) * t * 1.5;
        paint.roundRect(timber.x, timber.y - lift, timber.w, timber.h, Math.min(round, timber.w / 2, timber.h / 2));
      } else {
        const dx = timber.b.x - timber.a.x;
        const dy = timber.b.y - timber.a.y;
        const c = Math.cos(Math.atan2(dy, dx));
        const s = Math.sin(Math.atan2(dy, dx));
        paint.setTransform(c * ratioNow, s * ratioNow, -s * ratioNow, c * ratioNow, timber.a.x * ratioNow, timber.a.y * ratioNow);
        paint.roundRect(0, -timber.w / 2, Math.hypot(dx, dy) + timber.past, timber.w, Math.min(round, timber.w / 2));
        paint.setTransform(ratioNow, 0, 0, ratioNow, 0, 0);
      }
    };
    paint.lineWidth = 2.4;
    paint.strokeStyle = violet(1);
    timbers.forEach((timber, k) => {
      if (shown[k] <= 0) return;
      paint.globalAlpha = shown[k];
      outline(timber, k);
      paint.stroke();
    });
    paint.fillStyle = cover;
    timbers.forEach((timber, k) => {
      if (shown[k] <= 0) return;
      paint.globalAlpha = shown[k];
      outline(timber, k);
      paint.fill();
    });
    paint.globalAlpha = 1;
    const headOf = (k) => {
      const nail = nails[k];
      const stick = Math.max(0, out[k]) * settings.sticksOut * length;
      return { x: nail.x + Math.cos(nail.angle) * stick, y: nail.y + Math.sin(nail.angle) * stick, angle: nail.angle, hand: nail.hand };
    };
    const nailsShown = still ? 1 : ease(clamp01((time - line.up) / settings.nailsIn));
    if (nailsShown > 0) {
      paint.globalAlpha = nailsShown;
      paint.strokeStyle = hot(0.55, 1);
      nails.forEach((nail, k) => {
        const tip = headOf(k);
        const across = { x: -Math.sin(nail.angle) * t * 0.38, y: Math.cos(nail.angle) * t * 0.38 };
        paint.lineWidth = 1.6;
        paint.beginPath();
        paint.moveTo(nail.x, nail.y);
        paint.lineTo(tip.x, tip.y);
        paint.stroke();
        paint.lineWidth = 2.4;
        paint.beginPath();
        paint.moveTo(tip.x - across.x, tip.y - across.y);
        paint.lineTo(tip.x + across.x, tip.y + across.y);
        paint.stroke();
      });
      paint.globalAlpha = 1;
    }
    if (hammer && hammer.alpha > 0) {
      const at = Math.max(0, hammer.at);
      const from = headOf(Math.floor(at));
      const to = headOf(Math.min(nails.length - 1, Math.ceil(at)));
      const share = at - Math.floor(at);
      const face = { x: lerp(from.x, to.x, share), y: lerp(from.y, to.y, share) };
      const angle = lerp(from.angle, to.angle, share);
      const outward = { x: Math.cos(angle), y: Math.sin(angle) };
      const handAt = (n) => ({ x: -Math.sin(n.angle) * n.hand, y: Math.cos(n.angle) * n.hand });
      const handFrom = handAt(from);
      const handTo = handAt(to);
      const along = { x: lerp(handFrom.x, handTo.x, share), y: lerp(handFrom.y, handTo.y, share) };
      const pivot = { x: face.x + outward.x * head.half + along.x * reach, y: face.y + outward.y * head.half + along.y * reach };
      paint.save();
      paint.globalAlpha = hammer.alpha;
      paint.setTransform(outward.x * ratioNow, outward.y * ratioNow, along.x * ratioNow, along.y * ratioNow, pivot.x * ratioNow, pivot.y * ratioNow);
      paint.rotate(hammer.back);
      paint.lineWidth = 1.4;
      paint.strokeStyle = hot(0.35, 1);
      paint.beginPath();
      paint.roundRect(-handle / 2, -reach, handle, reach + handle * 1.6, handle / 2);
      paint.fillStyle = hammerHandle;
      paint.fill();
      paint.stroke();
      paint.beginPath();
      paint.roundRect(-handle * 0.62, -reach * 0.28, handle * 1.24, reach * 0.28 + handle * 1.6, handle * 0.6);
      paint.fillStyle = hammerGrip;
      paint.fill();
      paint.stroke();
      const top = -reach - head.tall / 2;
      paint.beginPath();
      paint.roundRect(-head.half, top, head.half * 1.1, head.tall, head.tall * 0.28);
      paint.moveTo(head.half * 0.05, top + head.tall * 0.12);
      paint.quadraticCurveTo(head.half * 0.9, top - head.tall * 0.05, head.half * 1.3, top + head.tall * 0.85);
      paint.quadraticCurveTo(head.half * 1.32, top + head.tall * 1.05, head.half * 1.18, top + head.tall * 0.98);
      paint.quadraticCurveTo(head.half * 0.75, top + head.tall * 0.55, head.half * 0.05, top + head.tall * 0.88);
      paint.closePath();
      paint.fillStyle = hammerHead;
      paint.fill();
      paint.strokeStyle = hot(0.5 + hammer.impact * 0.5, 1);
      paint.stroke();
      paint.restore();
      if (hammer.impact > 0) {
        const at = face;
        const glow = paint.createRadialGradient(at.x, at.y, 0, at.x, at.y, t * 2.2);
        glow.addColorStop(0, `rgb(255 255 255 / ${0.9 * hammer.impact})`);
        glow.addColorStop(1, "rgb(255 255 255 / 0)");
        paint.fillStyle = glow;
        paint.beginPath();
        paint.arc(at.x, at.y, t * 2.2, 0, TAU);
        paint.fill();
      }
    }
  }

  function tick(now) {
    const step = last ? Math.min(now - last, 64) : 0;
    last = now;
    clock += step;
    if (clock >= timeline().end) clock = timeline().nailsFrom; // the frame stays up, the nails are out again: go again
    draw(clock);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  const wide = window.matchMedia("(min-width: 64rem)");
  const words = holder.parentElement.querySelector(".subpage-lede > :last-child");
  let shift = 0;
  function standOnTheWords() {
    if (!wide.matches || !words) { shift = 0; holder.style.removeProperty("translate"); return; }
    const range = document.createRange();
    range.selectNodeContents(words);
    const lines = [...range.getClientRects()].filter((r) => r.width > 1);
    const size = parseFloat(getComputedStyle(words).fontSize);
    const baseline = lines.at(-1).bottom - size * 0.22;
    const foot = holder.getBoundingClientRect().top - shift + shape.base;
    shift = Math.round(baseline - foot);
    holder.style.translate = `0 calc(-50% + ${shift}px)`;
  }

  measure();
  standOnTheWords();
  draw(moving ? 0 : Infinity);
  new ResizeObserver(() => requestAnimationFrame(() => { measure(); standOnTheWords(); draw(moving ? clock : Infinity); })).observe(holder.parentElement);
  if (!moving) return;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) { last = 0; frame = requestAnimationFrame(tick); }
  }).observe(holder);
}
