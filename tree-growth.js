import { EtchPath, EtchBody } from "./laser-etch-engine.js?v=8c972897";

const TAU = 2 * Math.PI;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const between = (random, [low, high]) => lerp(low, high, random());
const gap = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);


export function growTree(frame, shape, random) {
  const treeRandom = random;
  const nodes = [];
  const add = (x, y, parent, leafy = false) => {
    const node = { x, y, parent, children: [], tip: false, leafy };
    if (parent) parent.children.push(node);
    nodes.push(node);
    return node;
  };
  const { crown } = frame;
  const lumps = shape.lumps.map(([wave, size]) => ({ wave, size, phase: random() * TAU }));
  const edge = (angle) => 1 + lumps.reduce((sum, lump) => sum + lump.size * Math.sin(lump.wave * angle + lump.phase), 0);
  const inside = (x, y) => {
    const dy = (y - crown.y) / crown.ry;
    const dx = ((x - crown.x) / crown.rx) * (1 + shape.dome * Math.max(0, -dy));
    return Math.hypot(dx, dy) <= edge(Math.atan2(dy, dx));
  };
  const room = (from, angle) => {
    const reach = 2 * (crown.rx + crown.ry);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let entered = false;
    for (let d = 0; d < reach; d += 3) {
      if (inside(from.x + cos * d, from.y + sin * d)) entered = true;
      else if (entered) return d;
    }
    return 0;
  };
  const leafyRandom = seededRandom(shape.leafySeed ?? 1);
  const grow = (from, angle, length, order, random = treeRandom, leafy = false) => {
    const steps = Math.max(2, Math.round(length / shape.step));
    const stepLength = length / steps;
    const bend = (random() - 0.5) * shape.bend * (order === 0 ? 0.25 : 1);
    let at = from;
    for (let k = 1; k <= steps; k++) {
      angle += bend / steps + (random() - 0.5) * shape.wiggle;
      at = add(at.x + Math.cos(angle) * stepLength, at.y + Math.sin(angle) * stepLength, at, leafy);
      if (order >= shape.spurFrom && order < shape.maxOrder && k < steps) {
        const chance = random();
        if (chance < shape.spurChance) spur(at, angle, length, random, leafy);
        else if (!leafy && chance < shape.spurChance + (shape.leafySpurChance ?? 0)) spur(at, angle, length, leafyRandom, true);
      }
    }
    fork(at, angle, length, order, random, leafy);
  };

  const spur = (node, angle, parentLength, random, leafy) => {
    const turn = (random() < 0.5 ? -1 : 1) * between(random, shape.spurTurn);
    const length = Math.min(parentLength * between(random, shape.spurLength), room(node, angle + turn) * 0.9);
    if (length >= shape.minLength * 0.7) grow(node, angle + turn, length, shape.maxOrder, random, leafy);
  };

  const fork = (node, angle, length, order, random, leafy) => {
    if (order >= shape.maxOrder || length < shape.minLength) { node.tip = true; return; }
    let turns;
    if (order === 0) {
      turns = shape.limbTurns.map((turn) => turn + (random() - 0.5) * 0.2);
    } else if (random() < shape.threeWay) {
      turns = [-1, 0, 1].map((k) => k * between(random, [0.38, 0.56]) + (random() - 0.5) * 0.12);
    } else {
      const side = random() < 0.5 ? -1 : 1;
      turns = [side * between(random, shape.mainTurn), -side * between(random, shape.sideTurn)];
    }
    let grown = 0;
    for (const turn of turns) {
      const childAngle = order === 0 ? -Math.PI / 2 + turn : angle + turn;
      const fits = room(node, childAngle);
      const wanted = order === 0
        ? fits * shape.limbReach
        : length * between(random, Math.abs(turn) < 0.3 ? shape.mainLength : shape.sideLength);
      const childLength = Math.min(wanted, fits * between(random, [0.82, 0.96]));
      if (childLength < shape.minLength) continue;
      grow(node, childAngle, childLength, order + 1, random, leafy);
      grown += 1;
    }
    if (!grown) node.tip = true;
  };

  const root = add(frame.baseX, frame.groundY, null);
  grow(root, -Math.PI / 2 + (random() - 0.5) * shape.lean, frame.trunkLength, 0);

  for (let k = nodes.length - 1; k >= 0; k--) {
    const node = nodes[k];
    node.tips = (node.tip ? 1 : 0) + node.children.reduce((sum, child) => sum + (child.leafy && !node.leafy ? 0 : child.tips), 0);
  }
  for (const node of nodes) node.width = Math.max(shape.twigWidth, shape.trunkWidth * Math.sqrt(node.tips / root.tips));
  return root;
}


function limbsOf(root) {
  const limbs = [];
  const queue = [{ start: root, parent: null, at: 0 }];
  while (queue.length) {
    const { start, parent, at } = queue.shift();
    const limb = { nodes: start.parent ? [start.parent, start] : [start], parent, at, order: parent ? parent.order + 1 : 0 };
    limbs.push(limb);
    let node = start;
    while (node.children.length) {
      const [main, ...others] = [...node.children].sort((a, b) => (a.leafy - b.leafy) || (b.tips - a.tips));
      for (const other of others) queue.push({ start: other, parent: limb, at: limb.nodes.length - 1 });
      node = main;
      limb.nodes.push(node);
    }
  }
  return limbs;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

const mirror = (p, q) => ({ x: 2 * p.x - q.x, y: 2 * p.y - q.y });

function shapeLimb(limb, look) {
  const { nodes } = limb;
  const per = look.perSpan;
  const widthOf = (k) => (k === 0 && limb.parent ? nodes[Math.min(1, nodes.length - 1)].width : nodes[k].width);
  const points = [];
  let widths = [];
  for (let k = 0; k < nodes.length - 1; k++) {
    const p1 = nodes[k];
    const p2 = nodes[k + 1];
    const p0 = nodes[k - 1] && k > 0 ? nodes[k - 1] : mirror(p1, p2);
    const p3 = nodes[k + 2] ?? mirror(p2, p1);
    for (let j = 0; j < per; j++) {
      points.push(catmull(p0, p1, p2, p3, j / per));
      widths.push(lerp(widthOf(k), widthOf(k + 1), j / per));
    }
  }
  points.push({ x: nodes.at(-1).x, y: nodes.at(-1).y });
  widths.push(widthOf(nodes.length - 1));
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + gap(points[i - 1], points[i]));

  const reach = per * 2;
  widths = widths.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - reach); j <= Math.min(widths.length - 1, i + reach); j++) { sum += widths[j]; count += 1; }
    return sum / count;
  });
  if (!limb.parent) {
    widths = widths.map((w, i) => w + look.trunkWidth * look.rootFlare * Math.exp(-along[i] / look.rootReach));
  } else {
    const start = widths[0];
    const parentWidth = limb.parent.widths?.[Math.min(limb.at * per, limb.parent.widths.length - 1)] ?? start;
    const flare = Math.min(start * look.forkFlare, parentWidth * 0.5);
    widths = widths.map((w, i) => w + flare * Math.exp(-along[i] / Math.max(start * look.forkReach, 2)));
  }
  Object.assign(limb, { points, widths, along, place: new Map() });
}

function placeOn(limb, index) {
  const i = Math.max(0, Math.min(Math.round(index), limb.points.length - 1));
  return limb.place.get(i) ?? null;
}

function strokeBuilder() {
  const points = [];
  return {
    points,
    add(point) {
      const last = points.at(-1);
      if (last && gap(last, point) < 0.05) return;
      points.push(point);
    },
  };
}

function limbStroke(limb, look) {
  const shape = new EtchBody(limb.points, limb.widths);
  shape.floor = look.groundY;
  const base = limb.widths[Math.min(limb.widths.length - 1, look.perSpan)];
  const pace = limb.parent ? look.canopyPace : 1; // the trunk keeps its own steady pace
  shape.speed = Math.min(look.fastest, look.slowest * pace * Math.max(1, look.trunkWidth / Math.max(base, 0.5)) ** look.speedCurve);
  const stroke = {
    shape, limb, kind: limb.parent ? "limb" : "trunk", phase: 0,
    rank: Math.max(0, Math.log2(look.trunkWidth / Math.max(base, 0.5))),
    after: limb.parent ? placeOn(limb.parent, limb.at * look.perSpan) : null,
  };
  limb.points.forEach((_, i) => limb.place.set(i, { stroke, distance: limb.along[i] }));
  return stroke;
}


function leafOutline(length, halfWidth) {
  const profile = (t) => Math.sin(Math.PI * t) ** 0.85 * (1.15 - 0.4 * t);
  const points = [];
  const steps = 14;
  for (let k = 0; k <= steps; k++) points.push({ u: (length * k) / steps, v: halfWidth * profile(k / steps) });
  for (let k = steps - 1; k >= 0; k--) points.push({ u: (length * k) / steps, v: -halfWidth * profile(k / steps) });
  return points;
}

function placeLeaf(base, angle, look, random) {
  const length = look.leafLength * between(random, look.leafSize);
  const halfWidth = length * between(random, look.leafWidth);
  const outline = leafOutline(length, halfWidth);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = outline.map(({ u, v }) => ({ x: base.x + u * cos - v * sin, y: base.y + u * sin + v * cos }));
  return { base, angle, length, halfWidth, outline, points };
}

function leavesOn(limb, look, random) {
  const total = limb.along.at(-1);
  const first = limb.widths[0] > look.leafyWidth ? limb.along.at(-1) * 0.6 : 2;
  const leafy = Math.min(total * look.leafyShare, look.leafLength * look.leafyLength);
  const pointAt = (distance) => {
    let i = 1;
    while (i < limb.along.length - 1 && limb.along[i] < distance) i += 1;
    const t = clamp01((distance - limb.along[i - 1]) / (limb.along[i] - limb.along[i - 1] || 1));
    const p = limb.points[i - 1];
    const q = limb.points[i];
    return { point: { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) }, angle: Math.atan2(q.y - p.y, q.x - p.x) };
  };
  const leaves = [];
  let side = random() < 0.5 ? -1 : 1;
  for (let d = Math.max(first, total - leafy); d < total - look.leafLength * 0.45; d += look.leafLength * between(random, look.leafSpacing)) {
    const { point, angle } = pointAt(d);
    leaves.push({ ...placeLeaf(point, angle + side * between(random, look.leafSplay), look, random), limb, distance: d });
    side = -side;
  }
  if (total > first) {
    const { point, angle } = pointAt(total);
    leaves.push({ ...placeLeaf(point, angle + (random() - 0.5) * 0.5, look, random), limb, distance: total });
    if (random() < look.pairedEnds) {
      leaves.push({ ...placeLeaf(point, angle + side * between(random, [0.5, 0.8]), look, random), limb, distance: total });
    }
  }
  return leaves;
}

function leafRun(limb, leaves) {
  const build = strokeBuilder();
  const connectors = [];
  let index = limb.points.findIndex((_, i) => limb.along[i] > leaves[0].distance);
  let last = null;
  for (const leaf of leaves) {
    const twig = last ? [last] : [];
    while (index >= 0 && index < limb.points.length && limb.along[index] < leaf.distance) {
      build.add(limb.points[index]);
      twig.push(limb.points[index++]);
    }
    if (twig.length) connectors.push([...twig, leaf.points[0]]);
    for (const point of leaf.points) build.add(point);
    last = leaf.points.at(-1);
  }
  return { points: build.points, connectors };
}

function spreadEvenly(leaves, look) {
  const reach = look.leafLength * look.crowding;
  const cells = new Map();
  const key = (x, y) => `${Math.floor(x / reach)},${Math.floor(y / reach)}`;
  const middle = (leaf) => ({ x: leaf.base.x + Math.cos(leaf.angle) * leaf.length / 2, y: leaf.base.y + Math.sin(leaf.angle) * leaf.length / 2 });
  const atEnd = (leaf) => leaf.distance >= leaf.limb.along.at(-1);
  const kept = new Set();
  for (const leaf of [...leaves.filter(atEnd), ...leaves.filter((one) => !atEnd(one))]) {
    const m = middle(leaf);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const other of cells.get(key(m.x + dx * reach, m.y + dy * reach)) ?? []) if (gap(m, other) < reach) near += 1;
    }
    if (near >= look.crowdMost) continue;
    kept.add(leaf);
    const k = key(m.x, m.y);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(m);
  }
  return leaves.filter((leaf) => kept.has(leaf));
}

function chooseFallers(leaves, count, spacing, random) {
  const pool = leaves.filter((leaf) => leaf.distance < leaf.limb.along.at(-1));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = [];
  for (const leaf of pool) {
    if (chosen.length >= count) break;
    if (chosen.every((other) => gap(other.base, leaf.base) >= spacing)) chosen.push(leaf);
  }
  return new Set(chosen);
}

function leafShape(points, leaves, look) {
  const shape = new EtchPath(points);
  shape.speed = look.leafSpeed;
  shape.layer = 1;
  shape.fillable = true;
  shape.cover = true;
  shape.leaves = leaves; // for anything that later draws them itself (the wind)
  shape.fillFade = look.leafFillFade;
  shape.addWhole = (context) => {
    for (const leaf of leaves) {
      context.moveTo(leaf.points[0].x, leaf.points[0].y);
      for (const point of leaf.points.slice(1)) context.lineTo(point.x, point.y);
      context.closePath();
    }
  };
  return shape;
}


export function treeStrokes(root, look, random) {
  const limbs = limbsOf(root);
  for (const limb of limbs) shapeLimb(limb, look);
  const strokes = limbs.map((limb) => limbStroke(limb, look));

  const leaves = spreadEvenly(limbs.flatMap((limb) => leavesOn(limb, look, random)), look);
  const fallers = chooseFallers(leaves, look.fallers, look.fallerSpacing, random);
  const trunkX = limbs[0].points[0].x;
  const bulletLeaves = new Map();
  for (const side of [-1, 1]) {
    leaves
      .filter((leaf) => !fallers.has(leaf) && Math.sign(leaf.base.x - trunkX) === side)
      .sort((a, b) => b.base.y - a.base.y)
      .slice(0, look.bullets ?? 0)
      .forEach((leaf) => bulletLeaves.set(leaf, side));
  }
  const bullets = [];
  const falling = [];
  for (const limb of limbs) {
    const mine = leaves.filter((leaf) => leaf.limb === limb);
    if (!mine.length) continue;
    const after = placeOn(limb, limb.points.length - 1);
    const staying = mine.filter((leaf) => !fallers.has(leaf) && !bulletLeaves.has(leaf));
    if (staying.length) {
      const run = leafRun(limb, staying);
      const shape = leafShape(run.points, staying, look);
      shape.connectors = run.connectors;
      strokes.push({ shape, limb, kind: "leaves", phase: 1, rank: 9, after, leafCount: staying.length });
    }
    for (const leaf of mine.filter((one) => bulletLeaves.has(one))) {
      const shape = leafShape(leaf.points, [leaf], look);
      shape.lift = { at: Infinity }; // the page says when it comes off the tree
      const stroke = { shape, limb, kind: "bullet", phase: 1, rank: 9, after, leafCount: 1 };
      strokes.push(stroke);
      bullets.push({ leaf, stroke, side: bulletLeaves.get(leaf) });
    }
    for (const leaf of mine.filter((one) => fallers.has(one))) {
      const shape = leafShape(leaf.points, [leaf], look);
      const stroke = { shape, limb, kind: "leaf", phase: 1, rank: 9, after, leafCount: 1 };
      strokes.push(stroke);
      falling.push({ leaf, stroke });
    }
  }
  return { strokes, falling, bullets, leafCount: leaves.length, limbs };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
