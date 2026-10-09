import { EtchLine, EtchPath } from "./laser-etch-engine.js?v=8c972897";
import { growTree, treeStrokes } from "./tree-growth.js?v=8c972897";

const TAU = 2 * Math.PI;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const clamp01 = (value) => clamp(value, 0, 1);
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const between = (random, [low, high]) => lerp(low, high, random());

const settings = {
  shape: {
    step: 0.018, // between the points of a limb
    bend: 0.55, // radians a limb may curve over its length
    wiggle: 0.05, // radians of wander at each step
    lean: 0.08, // radians the trunk may lean
    limbTurns: [-0.98, -0.12, 0.88], // the big limbs, in radians off upright
    limbReach: 0.32, // a big limb's first stretch, as a share of the room it has in the crown
    mainTurn: [0.08, 0.26], // the radians a fork's main branch turns off its limb
    sideTurn: [0.4, 0.7], // and its side branch
    mainLength: [0.7, 0.82], // their lengths, as shares of the limb they grow from
    sideLength: [0.56, 0.72],
    threeWay: 0.1, // the chance a fork splits three ways
    maxOrder: 6, // forks from the trunk to the finest twig
    minLength: 0.017, // a branch shorter than this is a twig end
    spurFrom: 1, // short side twigs grow off limbs from this many forks out
    spurChance: 0.09,
    leafySpurChance: 0.22, // and this chance of an extra leafy twig, which leaves the branches as they are
    leafySeed: 7,
    spurTurn: [0.55, 1.05],
    spurLength: [0.22, 0.42],
    dome: 0.4, // how much narrower the crown is at the top than across its middle
    lumps: [[3, 0.08], [5, 0.06], [8, 0.045]], // the crown's soft lumps: [waves around, size]
    twigWidth: 1,
    tries: 8, // trees grown to choose the most even from
  },
  crown: {
    height: 0.75, // of the free space above the ground
    widthToHeight: 1.3, // how broad it may be, at most
    trunkInCrown: 0.17, // how far the trunk carries on up into the crown, as a share of its height
    margin: 14, // page pixels kept clear at the screen's sides, at least
    marginShare: 0.1, // or this share of the screen's width, if more: a phone keeps its crown off the edges
    leafSize: 0.032, // a leaf's length, as a share of the tree's height
    leafLeast: 11, // page pixels, at the smallest
    leafMost: 20, // and the largest
  },
  look: {
    perSpan: 6, // smooth points between each pair of skeleton points
    forkFlare: 0.9, // how much wider a limb is where it leaves its parent, as a share of its width
    forkReach: 2.2, // how far along it that widening reaches, in its own widths
    rootFlare: 0.6, // how much wider the trunk is where it meets the ground, as a share of its width
    rootReach: 0.045, // how high the flare reaches, as a share of the tree's height
    slowest: 270, // page pixels a second, the trunk's edges
    fastest: 7000, // the finest twigs
    canopyPace: 2.6, // every limb above the trunk is cut this many times faster than its width alone says
    speedCurve: 1.15, // how fast speed rises as wood thins
    leafSpeed: 7000, // page pixels a second around the leaves
    leafFillFade: 260, // ms for a leaf to fill in once it is drawn
    leafyWidth: 7, // limbs thicker than this carry leaves only near their end
    leafSize: [0.72, 1.25], // as shares of the leaf length
    leafWidth: [0.25, 0.35], // half width, as a share of a leaf's length
    leafSpacing: [0.42, 0.66], // between leaves along a twig, as shares of the leaf length
    leafSplay: [0.45, 0.9], // radians a leaf turns off its twig
    leafyShare: 0.88, // how much of a twig carries leaves, at most
    leafyLength: 9, // and in leaf lengths, at most
    crowding: 0.8, // leaves closer than this many leaf lengths count as crowding each other
    crowdMost: 4, // a leaf is left off where this many already crowd it
    pairedEnds: 0.7, // the chance a twig ends in two leaves, not one
    fallers: 7, // leaves that fall when the lasers stop
    bullets: 2, // leaves a side that come off early, for a page that asks for them (layout.bullets)
  },
  lasers: {
    rankWeight: 170, // ms: how much sooner a laser takes thicker wood over a closer twig
    leafSweep: 520, // ms: how much sooner it takes a lower leaf, from the ground to the top
    idleLimit: 120, // ms a laser may wait for wood before it starts on leaves instead
    borrowCost: 90, // ms: how much less a laser likes taking a stroke from a neighbour's share
    startMargin: 25, // ms a branch waits after the line it grows from has passed
  },
  fall: {
    firstAfter: 1800, // ms after the lasers stop that the first leaf lets go
    spacing: [1500, 2900], // ms between one leaf letting go and the next: one at a time, never a burst
    tremble: 420, // ms a leaf shakes on its twig before it goes
    shakePeriod: 120, // ms, one shake
    shake: 0.14, // radians
    speed: [88, 128], // page pixels a second, falling
    breeze: 9, // page pixels a second, a gentle drift to the right
    wander: 70, // page pixels of drift either way, at random
    sway: [12, 28], // page pixels a leaf swings from side to side
    swayPeriod: [1500, 2300], // ms, one full swing
    rock: 0.5, // radians a leaf tips into each swing
    spin: [0.25, 0.8], // radians a second it slowly turns
    flipPeriod: [1600, 2800], // ms to turn over once
    restSquash: [0.32, 0.48], // how flat it looks lying on the ground
    hold: 900, // ms after the last leaf lands before the scene fades
  },
  wind: {
    handover: 950,
    rise: 2400, // ms for the wind to rise from still, easing in
    sway: 0.34, // radians a leaf swings at a wave's crest
    period: 3400, // ms between one wave and the next
    wavelength: 0.8, // a wave's length, as a share of the crown's width
    gusts: 7600, // ms, the slow rise and fall of the wind's strength
    flutter: 0.09, // radians of quicker tremble on top
    flutterPeriod: 480, // ms, one tremble
    turn: 0.45, // how far a leaf turns edge-on at a wave's crest, showing less of its face
    shine: 0.45, // how much a leaf's outline brightens toward white as a wave passes it
  },
  fade: {
    leaves: { start: [0, 260], length: 460 }, // leaves on the tree go first
    wood: { start: 200, span: 680, length: 520 }, // then the wood, twigs first, the trunk last
  },
};

export const scene = {
  desktopLasersStop: 4310, // ms its lasers take on a 1440 × 900 screen; smaller screens slow to match
  gapAboveLetters: 0.3,
  seed: 31,
  hideLasers: true, // the tree draws itself in the same order and time, with no beams to be seen
  timing: {
    laserStagger: 90, // ms between each laser powering on
    aimBase: 14, // ms for the shortest swing between targets
    aimPerRadian: 60, // and this much more per radian it turns
    cutSpeed: 2400, // page pixels a second, for anything that does not set its own speed
    cutMin: 16, // ms, the least time for any cut
    cool: 380, // ms for a fresh cut to cool from white to violet
    fillFade: 1, // nothing here is filled
    beamFade: 220, // ms for a beam to power on and off
    sweepSamples: 8, // the swept area is the beam at this many earlier moments
    sweepStep: 16, // ms between them
  },

  build(layout, palette) {
    const frame = frameFor(layout);
    if (!frame) return null;
    const { random } = layout;
    const shape = {
      ...settings.shape,
      step: settings.shape.step * frame.height,
      minLength: settings.shape.minLength * frame.height,
      trunkWidth: frame.trunkWidth,
    };
    const look = { ...settings.look, trunkWidth: frame.trunkWidth, leafLength: frame.leafLength, groundY: frame.groundY,
      bullets: layout.bullets ? settings.look.bullets : 0,
      rootReach: settings.look.rootReach * frame.height, fallerSpacing: frame.crown.rx * 0.16 };
    const root = evenTree(frame, shape, random);
    const tree = treeStrokes(root, look, random);
    if (palette.leaf) for (const stroke of tree.strokes) if (stroke.shape.leaves) stroke.shape.tint = palette.leaf;
    const [o0, o1, o2] = layout.origins;
    const origins = layout.extraOrigins?.length === 2 ? [layout.extraOrigins[0], o0, layout.extraOrigins[1], o1, o2] : layout.origins;
    const plan = planLasers(tree.strokes, origins, this.timing, frame);
    setFades(tree.strokes, random);

    const falling = [...tree.falling];
    for (let i = falling.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [falling[i], falling[j]] = [falling[j], falling[i]];
    }
    let liftAt = settings.fall.firstAfter;
    for (const faller of falling) {
      faller.liftAt = liftAt;
      liftAt += between(random, settings.fall.spacing);
    }
    const ground = groundFor(frame);
    const forever = Boolean(layout.forever);
    const falls = fallingLeaves({ falling, palette, ground, random, fade: forever ? { start: Infinity, length: 1 } : lastFade() });
    const drawnAt = new Map(plan.lasers.flatMap((laser) => laser.shapes).map((shape, index) => [shape, index]));
    const runs = tree.strokes.filter((stroke) => stroke.kind === "leaves");
    const onTree = [
      ...runs.map((run) => ({ shape: run.shape, sways: true })),
      ...falling.map((faller) => ({ shape: faller.stroke.shape, sways: false, until: faller.liftAt })),
    ].sort((a, b) => (drawnAt.get(a.shape) ?? 0) - (drawnAt.get(b.shape) ?? 0));
    for (const { shape } of onTree) shape.lift = { at: settings.wind.handover };
    const wind = leavesInWind({ onTree, palette, random, crown: frame.crown, duration: forever ? Infinity : falls.duration });
    const overlay = (context, clock, options) => { wind(context, clock, options); falls(context, clock, options); };
    overlay.duration = falls.duration;
    overlay.drawsThroughFade = true;
    const points = tree.strokes.flatMap((stroke) => stroke.shape.points ?? []);
    const above = tree.strokes.filter((stroke) => stroke.kind !== "trunk" && stroke.shape.length >= 1)
      .flatMap((stroke) => stroke.shape.points ?? []);
    const extent = {
      groundY: frame.groundY,
      topY: Math.min(...points.map((q) => q.y)),
      centerX: frame.baseX,
      trunkHalf: frame.trunkWidth / 2, // half the trunk's width, above its flare at the ground
      crownBottomY: Math.max(...above.map((q) => q.y)), // the lowest branch or leaf: the bare trunk is below it
      canopy: {
        left: Math.min(...above.map((q) => q.x)), right: Math.max(...above.map((q) => q.x)),
        top: Math.min(...above.map((q) => q.y)), bottom: Math.max(...above.map((q) => q.y)),
        middle: {
          x: above.reduce((sum, q) => sum + q.x, 0) / (above.length || 1),
          y: above.reduce((sum, q) => sum + q.y, 0) / (above.length || 1),
        },
      },
      halfWidthAt(y, band = 14) {
        let reach = 0;
        for (const q of points) if (Math.abs(q.y - y) <= band) reach = Math.max(reach, Math.abs(q.x - frame.baseX));
        return reach;
      },
    };
    const bullets = tree.bullets.map(({ leaf, stroke, side }) => ({
      shape: stroke.shape, side, angle: leaf.angle, length: leaf.length,
      x: leaf.base.x + (Math.cos(leaf.angle) * leaf.length) / 2,
      y: leaf.base.y + (Math.sin(leaf.angle) * leaf.length) / 2,
    }));
    return { lasers: plan.lasers, scenery: [ground.line], overlay, overlayLength: overlay.duration, extent, bullets };
  },
};

function evenTree(frame, shape, random) {
  let best = null;
  for (let attempt = 0; attempt < settings.shape.tries; attempt++) {
    const root = growTree(frame, shape, seededFrom(random));
    const tips = [];
    const walk = (node) => { if (node.tip && !node.leafy) tips.push(node); node.children.forEach(walk); };
    walk(root);
    const left = tips.filter((n) => n.x < frame.baseX - frame.crown.rx * 0.08).length;
    const right = tips.filter((n) => n.x > frame.baseX + frame.crown.rx * 0.08).length;
    const sectors = new Array(8).fill(0);
    for (const n of tips) {
      const angle = Math.atan2(n.y - frame.crown.y, (n.x - frame.crown.x) * (frame.crown.ry / frame.crown.rx));
      sectors[Math.floor(((angle + Math.PI) / TAU) * 8) % 8] += 1;
    }
    const upper = [sectors[0], sectors[1], sectors[2], sectors[3]];
    const mean = upper.reduce((s, v) => s + v, 0) / 4 || 1;
    const spread = Math.sqrt(upper.reduce((s, v) => s + (v - mean) ** 2, 0) / 4) / mean;
    const score = Math.abs(left - right) / Math.max(left + right, 1) + 0.5 * spread;
    if (!best || score < best.score) best = { root, score };
  }
  return best.root;
}

function seededFrom(random) {
  let state = Math.floor(random() * 4294967296) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}


function frameFor(layout) {
  const groundY = layout.bottom;
  const height = groundY - layout.top;
  if (height < 160) return null;
  const baseX = (layout.text.left + layout.text.right) / 2;
  const crownHeight = height * settings.crown.height - 12;
  const margin = Math.max(settings.crown.margin, layout.screen.width * settings.crown.marginShare);
  const room = layout.crownRoom ?? Math.min(baseX, layout.screen.width - baseX) - margin - settings.crown.leafMost;
  const ry = crownHeight / 2;
  const rx = Math.min(room, crownHeight * settings.crown.widthToHeight);
  const leafLength = clamp(height * settings.crown.leafSize * (rx / ry) ** 0.25, settings.crown.leafLeast, settings.crown.leafMost);
  const crown = { x: baseX, y: layout.top + 12 + ry, rx, ry };
  const trunkLength = groundY - (crown.y + ry) + crownHeight * settings.crown.trunkInCrown;
  const trunkWidth = clamp(height * 0.048, 12, 28);
  return { baseX, groundY, height, crown, trunkLength, trunkWidth, leafLength, screenWidth: layout.screen.width };
}

function groundFor(frame) {
  const half = Math.min(frame.crown.rx * 1.25, frame.screenWidth / 2 - 4);
  const from = frame.baseX - half;
  const to = frame.baseX + half;
  const line = new EtchLine({ x: from, y: frame.groundY }, { x: to, y: frame.groundY });
  line.fadeEnds = half * 0.55;
  return { line, y: frame.groundY, from: frame.baseX - half * 0.6, to: frame.baseX + half * 0.6 };
}


function planLasers(strokes, origins, timing, frame) {
  const { rankWeight, leafSweep, idleLimit, startMargin, borrowCost } = settings.lasers;
  const centre = {
    x: origins.reduce((sum, o) => sum + o.x, 0) / origins.length,
    y: origins.reduce((sum, o) => sum + o.y, 0) / origins.length,
  };
  const cutTime = (shape) => Math.max(shape.minTime ?? timing.cutMin, (shape.length / (shape.speed ?? timing.cutSpeed)) * 1000);
  const angleOf = (stroke) => {
    const p = stroke.shape.pointAt(0);
    return Math.atan2(p.y - centre.y, p.x - centre.x);
  };
  for (const phase of [0, 1]) {
    const these = strokes.filter((s) => s.phase === phase).sort((a, b) => angleOf(a) - angleOf(b));
    const total = these.reduce((sum, s) => sum + cutTime(s.shape) + timing.aimBase * 2, 0);
    let sum = 0;
    for (const stroke of these) {
      const share = (sum + (cutTime(stroke.shape) + timing.aimBase * 2) / 2) / total;
      stroke.laser = Math.min(origins.length - 1, Math.floor(share * origins.length));
      sum += cutTime(stroke.shape) + timing.aimBase * 2;
    }
  }
  for (const stroke of strokes) if (stroke.kind === "trunk") stroke.laser = Math.floor(origins.length / 2);

  const lasers = origins.map((origin, index) => ({
    origin, shapes: [], clock: index * timing.laserStagger, tip: { x: origin.x, y: origin.y - 1 },
  }));
  const cuts = new Map();
  const aimTime = (laser, point) => {
    const turn = Math.abs(Math.atan2(point.y - laser.origin.y, point.x - laser.origin.x)
      - Math.atan2(laser.tip.y - laser.origin.y, laser.tip.x - laser.origin.x));
    return timing.aimBase + timing.aimPerRadian * Math.min(turn, Math.PI);
  };
  const releaseOf = (stroke) => {
    let release = 0;
    for (const after of [stroke.after ?? []].flat()) {
      const cut = cuts.get(after.stroke);
      if (!cut) return null;
      const share = after.distance / (after.stroke.shape.length || 1);
      release = Math.max(release, cut.start + share * (cut.end - cut.start) + startMargin);
    }
    return release;
  };
  const score = (o) => (o.stroke.phase === 0
    ? o.start + o.stroke.rank * rankWeight
    : o.start + ((frame.groundY - o.stroke.shape.pointAt(0).y) / frame.height) * leafSweep) + (o.borrowed ? borrowCost : 0);
  const optionsFor = (laser, list, borrowed) => {
    const options = [];
    for (const stroke of list) {
      const release = releaseOf(stroke);
      if (release === null) continue;
      const aim = aimTime(laser, stroke.shape.pointAt(0));
      options.push({ stroke, aim, start: Math.max(laser.clock + aim, release), borrowed });
    }
    return options;
  };
  const best = (options) => (options.length ? options.reduce((b, o) => (score(o) < score(b) ? o : b)) : null);
  const choose = (laser, index) => {
    const mine = optionsFor(laser, remaining.filter((s) => s.laser === index), false);
    const near = optionsFor(laser, remaining.filter((s) => Math.abs(s.laser - index) === 1), true);
    const soon = (o) => o.start - laser.clock - o.aim <= idleLimit;
    const wood = (o) => o.stroke.phase === 0;
    const pools = [
      mine.filter((o) => wood(o) && soon(o)), near.filter((o) => wood(o) && soon(o)),
      mine.filter((o) => !wood(o) && soon(o)), near.filter((o) => !wood(o) && soon(o)),
      mine.filter(wood), mine, near,
    ];
    for (const pool of pools) if (pool.length) return best(pool);
    return null;
  };

  let remaining = [...strokes];
  while (remaining.length) {
    let next = null;
    for (const [index, laser] of lasers.entries()) {
      const choice = choose(laser, index);
      if (choice && (!next || laser.clock < next.laser.clock)) next = { laser, choice };
    }
    if (!next) throw new Error("tree scene: no stroke can be etched next");
    const { laser, choice } = next;
    const { stroke } = choice;
    const first = stroke.shape.pointAt(0);
    let start = laser.clock + choice.aim;
    if (choice.start > start) {
      const rest = new EtchPath([first, { ...first }]);
      rest.minTime = Math.max(1, choice.start - start);
      laser.shapes.push(rest);
      laser.clock = start + rest.minTime;
      laser.tip = first;
      start = laser.clock + aimTime(laser, first);
    }
    const end = start + cutTime(stroke.shape);
    cuts.set(stroke, { start, end });
    stroke.cut = { start, end };
    laser.shapes.push(stroke.shape);
    laser.clock = end;
    laser.tip = stroke.shape.pointAt(stroke.shape.length);
    stroke.laser = lasers.indexOf(laser);
    remaining = remaining.filter((s) => s !== stroke);
  }
  return {
    lasers: lasers.map(({ origin, shapes }) => ({ origin, shapes })),
    lasersStop: Math.max(...lasers.map((laser) => laser.clock)),
  };
}

function setFades(strokes, random) {
  const { leaves, wood } = settings.fade;
  const deepest = Math.max(...strokes.filter((s) => s.phase === 0).map((s) => s.rank));
  for (const stroke of strokes) {
    stroke.shape.fade = stroke.phase === 1
      ? { start: between(random, leaves.start), length: leaves.length }
      : { start: wood.start + (1 - clamp01(stroke.rank / deepest)) * wood.span, length: wood.length };
  }
}

function lastFade() {
  const { wood } = settings.fade;
  return { start: wood.start + wood.span, length: wood.length };
}


export function leafInWind(since, x, phase, wavelength) {
  const wind = settings.wind;
  const strength = smoothstep(clamp01(since / wind.rise)) * (0.72 + 0.28 * Math.sin((TAU * since) / wind.gusts));
  const wave = Math.sin(TAU * (since / wind.period) - (TAU * x) / wavelength + phase * 0.35);
  const flutter = Math.sin(TAU * (since / wind.flutterPeriod) + phase);
  return {
    swing: strength * (wind.sway * wave + wind.flutter * flutter),
    narrow: 1 - wind.turn * strength * Math.max(0, wave) * (0.8 + 0.2 * flutter),
    crest: strength * Math.max(0, wave),
  };
}

export const leafMotion = { fall: settings.fall, shine: settings.wind.shine };

function leavesInWind({ onTree, palette, random, crown, duration }) {
  const wind = settings.wind;
  const left = crown.x - crown.rx;
  const wavelength = crown.rx * 2 * wind.wavelength;
  const leaves = onTree.map((group) => ({ ...group, leaves: group.shape.leaves.map((leaf) => ({ leaf, phase: random() * TAU })) }));
  const [vr, vg, vb] = palette.leaf ?? palette.violet; // the leaves' own colour, if the page gives one
  const [gr, gg, gb] = palette.ground ?? [0, 0, 0];
  const tint = palette.coverTint ?? 0.3;
  const outline = (alpha, lift = 0) =>
    `rgb(${Math.round(lerp(vr, 255, lift))} ${Math.round(lerp(vg, 255, lift))} ${Math.round(lerp(vb, 255, lift))} / ${alpha})`;
  const cover = (alpha) => `rgb(${Math.round(lerp(gr, vr, tint))} ${Math.round(lerp(gg, vg, tint))} ${Math.round(lerp(gb, vb, tint))} / ${alpha})`;

  return (context, clock) => {
    const since = clock - wind.handover;
    if (since < 0) return;
    context.lineWidth = palette.lineWidth;
    context.lineJoin = "round";
    for (const { shape, sways, until, leaves: these } of leaves) {
      if (until !== undefined && clock >= until) continue; // it has let go: the fall draws it now
      const fade = shape.fade;
      const shown = clock < duration || !fade ? 1 : 1 - clamp01((clock - duration - fade.start) / fade.length);
      if (shown <= 0) continue;
      const path = new Path2D();
      const outlinePath = new Path2D();
      for (const twig of shape.connectors ?? []) {
        twig.forEach((point, k) => { if (k) outlinePath.lineTo(point.x, point.y); else outlinePath.moveTo(point.x, point.y); });
      }
      let crest = 0;
      for (const { leaf, phase } of these) {
        const moved = leafInWind(since, leaf.base.x - left, phase, wavelength);
        const swing = sways ? moved.swing : 0;
        const narrow = sways ? moved.narrow : 1;
        if (sways) crest += moved.crest;
        const a = leaf.angle;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const cb = Math.cos(a + swing);
        const sb = Math.sin(a + swing);
        const { x: bx, y: by } = leaf.base;
        leaf.points.forEach((point, k) => {
          const dx = point.x - bx;
          const dy = point.y - by;
          const u = dx * ca + dy * sa;
          const v = (dy * ca - dx * sa) * narrow;
          const x = bx + u * cb - v * sb;
          const y = by + u * sb + v * cb;
          if (k) path.lineTo(x, y); else path.moveTo(x, y);
        });
        path.closePath();
      }
      outlinePath.addPath(path);
      context.fillStyle = cover(shown);
      context.fill(path);
      context.strokeStyle = outline(palette.lineAlpha * shown, wind.shine * (crest / these.length));
      context.stroke(outlinePath);
    }
    context.lineJoin = "miter";
  };
}

function fallingLeaves({ falling, palette, ground, random, fade }) {
  const fall = settings.fall;
  const plans = falling.map(({ leaf, liftAt }) => {
    const { base, angle, length } = leaf;
    const outline = leaf.outline.map(({ u, v }) => ({ u: u - length / 2, v }));
    const centre = { x: base.x + Math.cos(angle) * length / 2, y: base.y + Math.sin(angle) * length / 2 };
    const fallStart = liftAt + fall.tremble;
    const spin = (random() < 0.5 ? -1 : 1) * between(random, fall.spin);
    const sway = { width: between(random, fall.sway), period: between(random, fall.swayPeriod), phase: random() * TAU };
    const flipPeriod = between(random, fall.flipPeriod);
    const speed = between(random, fall.speed);
    const restSquash = between(random, fall.restSquash);
    const tilt = (random() - 0.5) * 0.24;
    const roughDrop = ground.y - centre.y;
    const roughLength = (roughDrop / speed) * 1000;
    const turned = angle + spin * (roughLength / 1000);
    const restAngle = tilt + Math.PI * Math.round((turned - tilt) / Math.PI);
    const lowest = Math.max(...outline.map(({ u, v }) => u * Math.sin(restAngle) + v * restSquash * Math.cos(restAngle)));
    const rest = { y: ground.y - 0.9 - lowest };
    const drop = rest.y - centre.y;
    const fallLength = (drop / speed) * 1000;
    const wanted = centre.x + (fall.breeze * fallLength) / 1000 + (random() - 0.5) * fall.wander;
    rest.x = clamp(wanted, ground.from + length, ground.to - length);
    return { base, angle, length, outline, centre, liftAt, fallStart, fallLength, spin, sway, flipPeriod, restSquash, restAngle, rest };
  });
  const duration = Math.max(0, ...plans.map((p) => p.fallStart + p.fallLength)) + fall.hold;

  const pose = (plan, clock) => {
    const shaking = clock - plan.liftAt;
    if (clock < plan.fallStart) {
      const angle = plan.angle + Math.sin((shaking / fall.shakePeriod) * TAU) * fall.shake * smoothstep(clamp01(shaking / fall.tremble));
      return { x: plan.base.x + Math.cos(angle) * plan.length / 2, y: plan.base.y + Math.sin(angle) * plan.length / 2, angle, squash: 1 };
    }
    const time = clock - plan.fallStart;
    const p = clamp01(time / plan.fallLength);
    if (p >= 1) return { x: plan.rest.x, y: plan.rest.y, angle: plan.restAngle, squash: plan.restSquash };
    const swayIn = smoothstep(clamp01(p / 0.18)) * (1 - smoothstep(clamp01((p - 0.76) / 0.24)));
    const settle = smoothstep(clamp01((p - 0.7) / 0.3));
    const along = lerp(p, smoothstep(p), 0.65);
    const swing = TAU * (time / plan.sway.period) + plan.sway.phase;
    const x = lerp(plan.centre.x, plan.rest.x, along) + plan.sway.width * (Math.sin(swing) - Math.sin(plan.sway.phase)) * swayIn;
    const y = lerp(plan.centre.y, plan.rest.y, along) - 3 * Math.abs(Math.sin(swing)) * swayIn;
    const turning = plan.angle + plan.spin * (time / 1000) * smoothstep(clamp01(p / 0.25)) + fall.rock * Math.cos(swing) * swayIn;
    const angle = lerp(turning, plan.restAngle, settle);
    const flip = Math.cos(TAU * (time / plan.flipPeriod));
    const squash = lerp(lerp(1, flip, smoothstep(clamp01(p / 0.3))), plan.restSquash, settle);
    return { x, y, angle, squash };
  };

  const [hr, hg, hb] = palette.hot;
  const [vr, vg, vb] = palette.leaf ?? palette.violet; // the leaves' own colour, if the page gives one
  const colour = (heat, alpha) =>
    `rgb(${Math.round(lerp(vr, hr, heat))} ${Math.round(lerp(vg, hg, heat))} ${Math.round(lerp(vb, hb, heat))} / ${alpha})`;
  const [gr, gg, gb] = palette.ground ?? [0, 0, 0];
  const tint = palette.coverTint ?? 0.3;
  const cover = (alpha) => `rgb(${Math.round(lerp(gr, vr, tint))} ${Math.round(lerp(gg, vg, tint))} ${Math.round(lerp(gb, vb, tint))} / ${alpha})`;

  const draw = (context, clock) => {
    const left = clock < duration ? 1 : 1 - clamp01((clock - duration - fade.start) / fade.length);
    if (left <= 0) return;
    context.lineWidth = palette.lineWidth;
    context.lineJoin = "round";
    for (const plan of plans) {
      if (clock < plan.liftAt) continue;
      const { x, y, angle, squash } = pose(plan, clock);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      context.beginPath();
      plan.outline.forEach(({ u, v }, k) => {
        const w = v * squash;
        const px = x + u * cos - w * sin;
        const py = y + u * sin + w * cos;
        if (k) context.lineTo(px, py); else context.moveTo(px, py);
      });
      context.closePath();
      context.fillStyle = cover(left);
      context.fill();
      const since = clock - plan.liftAt;
      const heat = 0.5 * (since < fall.tremble ? smoothstep(since / fall.tremble) : (1 - clamp01((since - fall.tremble) / 700)) ** 2);
      context.strokeStyle = colour(heat, palette.lineAlpha * left);
      context.stroke();
      if (heat > 0.02) {
        context.globalCompositeOperation = "lighter";
        context.lineWidth = palette.lineWidth * 4;
        context.strokeStyle = colour(heat, 0.14 * heat * left);
        context.stroke();
        context.lineWidth = palette.lineWidth;
        context.globalCompositeOperation = "source-over";
      }
    }
    context.lineJoin = "miter";
  };
  draw.duration = duration;
  draw.drawsThroughFade = true;
  return draw;
}
