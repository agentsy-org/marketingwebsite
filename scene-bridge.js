import { schedule, EtchLine, EtchPath } from "./laser-etch-engine.js?v=8c972897";
import { bridgeTraffic } from "./bridge-traffic.js?v=8c972897";

const settings = {
  inset: 0.04, // how far the land line stops short of each screen edge, as a share of the width
  scale: 0.82, // on a wide screen, the whole scene's size against the full width; centred
  fadeEnds: 0.06, // and how much of each end fades in from nothing
  approach: 0.1, // the level road on each side, as a share of the land line's width
  floorDepth: 0.27, // the valley floor below the road, as a share of the free space
  dropRound: 0.035, // the radius of the land's curves, as a share of the width
  wallSlope: 0.22, // how far each valley wall leans out, against its height: steep banks
  groundGlow: 0.2, // how strongly the ground under the land line is filled with violet, 0 to 1
  glowBeyond: 0.22, // how far the glow carries on past each end of the line, as a share of the width
  sag: 0.32,
  sagNarrow: 0.5, // deeper on a narrow screen, so the bridge keeps some height
  narrow: 640, // page pixels: screens narrower than this are narrow
  hang: 1.1, // how much the curve leans toward a hanging chain's shape (0 is a parabola)
  cableLow: 0.12, // the gap between a main span's cable and the deck, as a share of its sag
  tallest: 0.62, // and no main tower taller than this share of the free space
  middleTaller: 1.12, // the middle tower against the other two
  shortTower: 0.42, // the towers at the ends of the road, against a main tower
  towerWidth: 0.012, // a tower's width, as a share of the width
  towerSpots: [0.17, 0.5, 0.83], // where the main towers stand along the bridge
  crown: 0.035, // how far the deck rises at mid-bridge, as a share of the bridge's length
  crownEnds: 0.55, // the deck's end curves' radius against its main curve's
  anchorAt: 0.32, // where the cable is anchored in each road, from the edge (0) to the end tower (1)
  strings: 6, // strings in the cable, each one laser pass: two each, so each laser ends where it began
  stringGap: 0.00085, // between one string and the next, as a share of the width
  stringSpeed: 9000, // page pixels a second along a string
  hangerGap: 0.021, // between hanger pairs, as a share of the width
  hangerPair: 0.22, // between the two lines of a pair, as a share of a tower's width
  hangerFade: 12, // page pixels over which a hanger fades out at its top, under the cable
  deckDepth: 3, // page pixels between the deck's top and bottom lines
  traffic: {
    crossing: 1700, // ms for a light to cross the whole road
    window: 20000, // ms during which new lights set off, before the bridge fades and is built again
    gapLeast: 180, // ms between lights in one direction, at least
    gapMost: 620, // and at most
    speedSpread: 0.3, // how much their speeds differ
    size: 13, // page pixels long
    laneLift: 1.3, // page pixels above the road for the near lane
  },
};

export const scene = {
  desktopLasersStop: 2981, // ms its lasers take on a 1440 × 900 screen; smaller screens slow to match
  missionWith: 3, // the mission line starts its wipe as this stage, the road, starts to draw
  gapAboveLetters: 0.18,
  placesMission: false, // true seats the mission line on the road at the middle of the bridge
  timing: {
    laserStagger: 100,
    aimBase: 22,
    aimPerRadian: 60,
    cutSpeed: 2000,
    cutMin: 35,
    cool: 420,
    fillFade: 0,
    beamFade: 200,
    sweepSamples: 8,
    sweepStep: 16,
  },

  build(layout) {
    const free = layout.bottom - layout.top;
    if (free < 80) return null;
    const narrow = layout.screen.width < settings.narrow;
    const scale = narrow ? 1 : settings.scale;
    const width = (layout.screen.width - 2 * Math.max(16, layout.screen.width * settings.inset)) * scale;
    const left = (layout.screen.width - width) / 2;
    const right = left + width;
    const floorDepth = free * settings.floorDepth * scale;
    const sagShare = narrow ? settings.sagNarrow : settings.sag;
    const g = Math.max(6, width * settings.towerWidth);
    const flare = g * 0.5;
    const dropR = Math.min(width * settings.dropRound, floorDepth / 2);
    const startX = left + width * settings.approach;
    const endX = right - width * settings.approach;
    const edgeL = startX + g / 2 + flare + 2;
    const edgeR = endX - g / 2 - flare - 2;

    const ground = (road) => {
      const floor = road + floorDepth;
      const lean = floorDepth * settings.wallSlope;
      const land = new EtchPath(rounded([
        { x: left, y: road }, { x: edgeL + dropR, y: road }, { x: edgeL + dropR + lean, y: floor },
        { x: edgeR - dropR - lean, y: floor }, { x: edgeR - dropR, y: road }, { x: right, y: road },
      ], [0, dropR * 1.2, dropR * 2.2, dropR * 2.2, dropR * 1.2, 0]));
      const groundAt = (x) => {
        const points = land.points.filter((q) => q.y > road + 0.5);
        for (let k = 1; k < points.length; k++) {
          const [a, b] = [points[k - 1], points[k]];
          if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
        }
        return floor;
      };
      const crossing = (depth, points) => {
        const k = points.findIndex((q) => q.y > road + depth);
        const [a, b] = [points[k - 1], points[k]];
        return a.x + ((b.x - a.x) * (road + depth - a.y)) / (b.y - a.y);
      };
      const firstBelow = (depth) => crossing(depth, land.points);
      const lastBelow = (depth) => crossing(depth, [...land.points].reverse());
      const deckL = firstBelow(0.01);
      const deckR = lastBelow(0.01);
      const deck = crownedRoad(deckL, deckR, road, (deckR - deckL) * settings.crown);
      return { floor, land, groundAt, deckL, deckR, deck, underL: firstBelow(settings.deckDepth), underR: lastBelow(settings.deckDepth) };
    };

    const spots = settings.towerSpots.map((share) => startX + (endX - startX) * share);
    const sizing = ground(0);
    const mainSag = (spots[1] - spots[0]) * sagShare;
    const deckAtMiddle = -sizing.deck.yAt((spots[0] + spots[1]) / 2);
    const tall = Math.min(free * settings.tallest,
      (mainSag * (1 + settings.cableLow) + deckAtMiddle) / ((1 + settings.middleTaller) / 2));
    const short = tall * settings.shortTower;
    const heights = [tall, tall * settings.middleTaller, tall];

    const road = (layout.top + layout.bottom) / 2 + (heights[1] - floorDepth) / 2;
    const { floor, land, groundAt, deckL, deckR, deck, underL, underR } = ground(road);
    land.fadeEnds = width * settings.fadeEnds;
    const glow = groundGlowLayer(land.points, left, right, road, floor, layout.screen.height, width);
    land.paintBelow = (context) => glow(context);

    const towers = spots.map((x, k) => tower(x, road - heights[k], groundAt, g, heights[k], deck.yAt(x), flare));
    const level = () => road;
    const scenery = [land, ...tower(startX, road - short, level, g, short, road, flare), ...tower(endX, road - short, level, g, short, road, flare)];

    const stringGap = Math.max(0.9, width * settings.stringGap);
    const thickness = stringGap * (settings.strings - 1);
    const rest = (x, y) => ({ x, y: y - thickness * 0.5 });
    const anchorL = { x: left + (startX - left) * settings.anchorAt, y: road };
    const anchorR = { x: right - (right - endX) * settings.anchorAt, y: road };
    const tops = [rest(startX, road - short), ...spots.map((x, k) => rest(x, road - heights[k])), rest(endX, road - short)];
    const spans = tops.slice(1).map((to, k) => hanging(tops[k], to, sagShare));
    const cable = spunCable([backstay(anchorL, tops[0]), ...spans.map((s) => s.points), backstay(anchorR, tops.at(-1)).reverse()], g * 1.6);
    const hangers = spans.flatMap((s) => hangersUnder(s, deck, g, width * settings.hangerGap, thickness));

    const lasers = layout.origins.map((origin) => ({ origin, shapes: [] }));
    const add = (laser, stage, shapes, fadeAt) => {
      for (const shape of shapes) {
        shape.phase = stage;
        shape.fade = fadeAt(shape);
        lasers[laser].shapes.push(shape);
      }
    };
    towers.forEach((parts, k) => add(k, 0, parts, () => ({ start: 1000, length: 450 })));
    for (let n = 0; n < settings.strings; n++) {
      const offset = (n - (settings.strings - 1) / 2) * stringGap;
      const laser = n % 3;
      const pass = Math.floor(n / 3);
      const string = offsetPath(cable, offset, pass % 2 === (laser === 2 ? 0 : 1), (startX - anchorL.x) * 0.8);
      string.speed = settings.stringSpeed;
      string.lineWidth = stringGap * 0.5;
      add(laser, 1, [string], () => ({ start: 700, length: 450 }));
    }
    const third = Math.ceil(hangers.length / 3);
    const span = deckR - deckL;
    const ends = [anchorL, anchorL, anchorR];
    lasers.forEach((_, k) => {
      const mine = shuffled(hangers.slice(k * third, (k + 1) * third), layout.random);
      const nearest = mine.reduce((best, h, n) => (Math.abs(h.x - ends[k].x) < Math.abs(mine[best].x - ends[k].x) ? n : best), 0);
      mine.unshift(...mine.splice(nearest, 1));
      add(k, 2, mine.map((h) => (layout.random() < 0.5 ? h.up : h.down)), (shape) => ({
        start: 250 + ((shape.x - deckL) / span) * 350, length: 300,
      }));
    });
    const thirds = [deckL, deckL + span / 3, deckL + (2 * span) / 3, deckR];
    lasers.forEach((_, k) => {
      const top = deck.path(thirds[k], thirds[k + 1], 0);
      const under = deck.path(Math.max(thirds[k], underL), Math.min(thirds[k + 1], underR), settings.deckDepth);
      const pieces = k === 2 ? [reversed(top), under] : [top, reversed(under)];
      add(k, 3, pieces, () => ({ start: 0, length: 420 }));
    });

    keepInStep(lasers, this.timing);

    const roadY = (x) => (x > deckL && x < deckR ? deck.yAt(x) : road);
    const overlay = bridgeTraffic({
      roadY, from: left, to: right, fadeLength: width * settings.fadeEnds,
      random: layout.random, timing: { ...settings.traffic, size: settings.traffic.size * Math.min(1, width / 1000) },
    });
    const middleX = (left + right) / 2;
    return { lasers, scenery, overlay, overlayLength: overlay.duration, missionSpot: { x: middleX, y: deck.yAt(middleX) }, top: road - heights[1] };
  },
};

function tower(x, topY, ground, g, height, deckTop, flare) {
  const l = x - g / 2;
  const r = x + g / 2;
  const capDepth = g * 0.7;
  const over = g * 0.35;
  const soft = g * 0.22;
  const outline = new EtchPath(rounded([
    { x: l - flare, y: ground(l - flare) }, { x: l, y: ground(l) }, { x: l, y: topY + capDepth },
    { x: l - over, y: topY + capDepth }, { x: l - over, y: topY }, { x: r + over, y: topY },
    { x: r + over, y: topY + capDepth }, { x: r, y: topY + capDepth }, { x: r, y: ground(r) }, { x: r + flare, y: ground(r + flare) },
  ], [0, g * 0.45, soft, soft, soft, soft, soft, soft, g * 0.45, 0]));
  const footY = Math.min(ground(l), ground(r));
  const inset = g * 0.24;
  const w = g - 2 * inset;
  const slot = (top, bottom) => new EtchPath(rounded([
    { x: l + inset, y: top }, { x: r - inset, y: top }, { x: r - inset, y: bottom }, { x: l + inset, y: bottom },
  ], w / 2, { closed: true }));
  const parts = [outline];
  const add = (top, bottom) => { if (bottom - top > w * 2) parts.push(slot(top, bottom)); };
  const below = footY - deckTop;
  if (below > g * 4) add(deckTop + g * 1.2 + below * 0.12, footY - below * 0.3);
  add(topY + height * 0.42, deckTop - g * 1.1);
  add(topY + capDepth + g * 0.5, topY + height * 0.32);
  return parts;
}

function rounded(corners, radius, { closed = false } = {}) {
  const count = corners.length;
  const at = (i) => corners[(i + count) % count];
  const radiusAt = (i) => (Array.isArray(radius) ? radius[i] : radius);
  const out = closed ? [] : [corners[0]];
  for (let i = closed ? 0 : 1; i <= (closed ? count - 1 : count - 2); i++) {
    const [p, c, q] = [at(i - 1), at(i), at(i + 1)];
    const lengthIn = Math.hypot(c.x - p.x, c.y - p.y);
    const lengthOut = Math.hypot(q.x - c.x, q.y - c.y);
    const u1 = { x: (c.x - p.x) / lengthIn, y: (c.y - p.y) / lengthIn };
    const u2 = { x: (q.x - c.x) / lengthOut, y: (q.y - c.y) / lengthOut };
    const turn = Math.acos(Math.min(Math.max(u1.x * u2.x + u1.y * u2.y, -1), 1));
    const side = u1.x * u2.y - u1.y * u2.x;
    if (turn < 1e-3 || radiusAt(i) <= 0) { out.push(c); continue; }
    const reach = Math.min(radiusAt(i) * Math.tan(turn / 2), lengthIn / 2, lengthOut / 2);
    const r = reach / Math.tan(turn / 2);
    const enter = { x: c.x - u1.x * reach, y: c.y - u1.y * reach };
    const normal = side > 0 ? { x: -u1.y, y: u1.x } : { x: u1.y, y: -u1.x };
    const centre = { x: enter.x + normal.x * r, y: enter.y + normal.y * r };
    const start = Math.atan2(enter.y - centre.y, enter.x - centre.x);
    const sense = side > 0 ? 1 : -1;
    const steps = Math.max(4, Math.ceil(turn / (Math.PI / 48)));
    for (let k = 0; k <= steps; k++) {
      const angle = start + (sense * turn * k) / steps;
      out.push({ x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) });
    }
  }
  out.push(closed ? out[0] : corners[count - 1]);
  return out;
}

function crownedRoad(startX, endX, road, rise) {
  const half = (endX - startX) / 2;
  const middleX = startX + half;
  const turn = 2 * Math.atan2(rise, half);
  const together = half / Math.sin(turn);
  const main = together / (1 + settings.crownEnds);
  const end = main * settings.crownEnds;
  const endReach = end * Math.sin(turn);
  const clampUnit = (v) => Math.max(-1, Math.min(1, v));
  const yAt = (x) => {
    const fromStart = x - startX;
    const fromEnd = endX - x;
    if (fromStart < endReach) return road - end * (1 - Math.cos(Math.asin(clampUnit(fromStart / end))));
    if (fromEnd < endReach) return road - end * (1 - Math.cos(Math.asin(clampUnit(fromEnd / end))));
    return road - rise + main * (1 - Math.cos(Math.asin(clampUnit((x - middleX) / main))));
  };
  return {
    yAt,
    path(fromX, toX, drop) {
      const points = [];
      const steps = Math.max(8, Math.ceil(Math.abs(toX - fromX) / 4));
      for (let k = 0; k <= steps; k++) {
        const x = fromX + ((toX - fromX) * k) / steps;
        points.push({ x, y: yAt(x) + drop });
      }
      return new EtchPath(points);
    },
  };
}

function hanging(from, to, share) {
  const depth = Math.abs(to.x - from.x) * share;
  const k = settings.hang;
  const dip = (t) => (Math.cosh(k) - Math.cosh(k * (2 * t - 1))) / (Math.cosh(k) - 1);
  const yAt = (x) => {
    const t = (x - from.x) / (to.x - from.x);
    return from.y + (to.y - from.y) * t + depth * dip(t);
  };
  const points = [];
  const steps = Math.max(12, Math.ceil(Math.abs(to.x - from.x) / 4));
  for (let n = 0; n <= steps; n++) {
    const x = from.x + ((to.x - from.x) * n) / steps;
    points.push({ x, y: yAt(x) });
  }
  return { from, to, yAt, points };
}

function backstay(anchor, top) {
  const control = { x: anchor.x + (top.x - anchor.x) * 0.3, y: anchor.y };
  const points = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const u = 1 - t;
    points.push({ x: u * u * anchor.x + 2 * u * t * control.x + t * t * top.x, y: u * u * anchor.y + 2 * u * t * control.y + t * t * top.y });
  }
  return points;
}

function spunCable(pieces, saddle) {
  let points = [...pieces[0]];
  for (const piece of pieces.slice(1)) {
    const joint = points.at(-1);
    const before = points.filter((p) => Math.hypot(p.x - joint.x, p.y - joint.y) > saddle);
    const after = piece.filter((p) => Math.hypot(p.x - joint.x, p.y - joint.y) > saddle);
    const a = before.at(-1);
    const b = after[0];
    const curve = [];
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const u = 1 - t;
      curve.push({ x: u * u * a.x + 2 * u * t * joint.x + t * t * b.x, y: u * u * a.y + 2 * u * t * joint.y + t * t * b.y });
    }
    points = [...before, ...curve, ...after];
  }
  return points;
}

function offsetPath(points, offset, backwards, gather) {
  const along = [0];
  for (let k = 1; k < points.length; k++) along.push(along[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y));
  const total = along.at(-1);
  const smooth = (v) => v * v * (3 - 2 * v);
  const moved = points.map((p, k) => {
    const prev = points[Math.max(k - 1, 0)];
    const next = points[Math.min(k + 1, points.length - 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    const spread = offset * smooth(Math.min(1, along[k] / gather, (total - along[k]) / gather));
    return { x: p.x - (dy / length) * spread, y: p.y + (dx / length) * spread };
  });
  return new EtchPath(backwards ? moved.reverse() : moved);
}

function hangersUnder(span, deck, g, gap, thickness) {
  const lo = Math.min(span.from.x, span.to.x) + g * 1.2 + gap * 0.5;
  const hi = Math.max(span.from.x, span.to.x) - g * 1.2 - gap * 0.5;
  const count = Math.max(0, Math.floor((hi - lo) / gap));
  const pair = Math.max(1.6, g * settings.hangerPair);
  const list = [];
  for (let k = 0; k <= count; k++) {
    const middle = lo + ((hi - lo) * k) / Math.max(count, 1);
    for (const x of [middle - pair / 2, middle + pair / 2]) {
      const top = { x, y: span.yAt(x) + thickness / 2 };
      const bottom = { x, y: deck.yAt(x) };
      if (bottom.y - top.y < settings.hangerFade + 4) continue;
      const fade = settings.hangerFade;
      const paint = (context, colour, alpha) => {
        const gradient = context.createLinearGradient(0, top.y, 0, top.y + fade);
        gradient.addColorStop(0, colour(0));
        gradient.addColorStop(1, colour(alpha));
        return gradient;
      };
      const down = new EtchLine(top, bottom);
      const up = new EtchLine(bottom, top);
      down.x = up.x = x;
      down.paint = up.paint = paint;
      list.push({ down, up, x });
    }
  }
  return list;
}

function shuffled(list, random) {
  const copy = [...list];
  for (let k = copy.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    [copy[k], copy[j]] = [copy[j], copy[k]];
  }
  return copy;
}

function groundGlowLayer(points, left, right, road, floor, screenHeight, width) {
  const shrink = 12;
  let layer = null;
  return (context) => {
    const target = context.canvas;
    const wide = Math.ceil(target.width / shrink);
    const high = Math.ceil(target.height / shrink);
    if (!layer || layer.width !== wide || layer.height !== high) {
      layer = document.createElement("canvas");
      layer.width = wide;
      layer.height = high;
      const paint = layer.getContext("2d");
      const transform = context.getTransform();
      paint.setTransform(transform.a / shrink, 0, 0, transform.d / shrink, 0, 0);
      const hex = getComputedStyle(document.documentElement).getPropertyValue("--color-violet").trim().replace("#", "") || "9e6bf2";
      const violet = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(" ");
      const strength = settings.groundGlow;
      const beyond = width * settings.glowBeyond;
      paint.beginPath();
      paint.moveTo(points[0].x - beyond, screenHeight);
      paint.lineTo(points[0].x - beyond, road);
      for (const p of points) paint.lineTo(p.x, p.y);
      paint.lineTo(points.at(-1).x + beyond, road);
      paint.lineTo(points.at(-1).x + beyond, screenHeight);
      paint.closePath();
      const down = paint.createLinearGradient(0, road, 0, screenHeight);
      down.addColorStop(0, `rgb(${violet} / ${strength})`);
      down.addColorStop(Math.min(0.9, (floor - road) / (screenHeight - road || 1)), `rgb(${violet} / ${strength * 0.7})`);
      down.addColorStop(1, `rgb(${violet} / 0)`);
      paint.fillStyle = down;
      paint.fill();
      paint.globalCompositeOperation = "destination-out";
      for (const [from, to] of [[left - beyond, left + beyond * 0.15], [right + beyond, right - beyond * 0.15]]) {
        const wipe = paint.createLinearGradient(from, 0, to, 0);
        wipe.addColorStop(0, "rgb(0 0 0 / 1)");
        wipe.addColorStop(1, "rgb(0 0 0 / 0)");
        paint.fillStyle = wipe;
        paint.fillRect(Math.min(from, to) - 2, 0, Math.abs(to - from) + 4, screenHeight);
      }
    }
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(layer, 0, 0, target.width, target.height);
    context.restore();
  };
}

function reversed(path) {
  return new EtchPath([...path.points].reverse());
}

function keepInStep(lasers, timing) {
  const stages = Math.max(...lasers.flatMap((l) => l.shapes.map((s) => s.phase))) + 1;
  for (let stage = 0; stage < stages; stage++) {
    const plan = schedule(lasers, timing);
    const ends = lasers.map((laser) => {
      const last = laser.shapes.filter((s) => s.phase === stage).at(-1);
      const cut = plan.cuts.find((c) => c.shape === last);
      return { last, end: cut ? cut.end + (last.pauseAfter ?? 0) : 0 };
    });
    const latest = Math.max(...ends.map((e) => e.end));
    for (const { last, end } of ends) if (last) last.pauseAfter = (last.pauseAfter ?? 0) + (latest - end);
  }
}
