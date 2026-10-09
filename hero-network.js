import { EtchPath } from "./laser-etch-engine.js?v=8c972897";

export function placeCircles(region, count, random, { sizes, evenness, clear = [], box = false, lattice = false }) {
  const rx = region.width / 2;
  const ry = (region.bottom - region.top) / 2;
  const cx = region.left + rx;
  const cy = region.top + ry;
  const cleared = (x, y, pad = 0) => clear.some((r) => x + pad > r.left && x - pad < r.right && y + pad > r.top && y - pad < r.bottom);
  let room = Math.PI * rx * ry;
  if (box) {
    let free = 0;
    for (let k = 0; k < 4000; k++) if (!cleared(region.left + random() * region.width, region.top + random() * 2 * ry)) free += 1;
    room = region.width * 2 * ry * (free / 4000);
  }
  const spacing = Math.sqrt(room / count);
  const total = sizes.reduce((sum, size) => sum + size.weight, 0);
  const pickSize = () => {
    let roll = random() * total;
    for (const size of sizes) {
      roll -= size.weight;
      if (roll <= 0) return size.radius;
    }
    return sizes[0].radius;
  };
  const circles = [];
  if (box && lattice) {
    const step = Math.sqrt((2 * room) / (count * Math.sqrt(3)));
    const rise = (step * Math.sqrt(3)) / 2;
    const columns = Math.floor(region.width / step);
    const rows = Math.floor((ry * 2) / rise);
    const left = region.left + (region.width - columns * step) / 2 + step / 4;
    const top = region.top + (ry * 2 - rows * rise) / 2 + rise / 2;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const x = left + column * step + (row % 2 ? step / 2 : 0);
        const y = top + row * rise;
        const radius = Math.min(pickSize() * step, step * 0.24);
        if (x - radius < region.left || x + radius > region.left + region.width || y - radius < region.top || y + radius > region.top + ry * 2) continue;
        if (!cleared(x, y, radius)) circles.push({ x, y, radius });
      }
    }
    return { circles, spacing: step };
  }
  let apart = spacing * evenness;
  for (let attempt = 0; circles.length < count && attempt < count * 4000; attempt++) {
    if (attempt % (count * 400) === count * 400 - 1) apart *= 0.92; // too tight a fit: relax a little
    const radius = pickSize() * spacing;
    let x;
    let y;
    if (box) {
      x = region.left + radius + random() * (region.width - radius * 2);
      y = region.top + radius + random() * (ry * 2 - radius * 2);
    } else {
      const angle = random() * 2 * Math.PI;
      const reach = Math.sqrt(random());
      x = cx + (rx - radius) * reach * Math.cos(angle);
      y = cy + (ry - radius) * reach * Math.sin(angle);
    }
    const onWords = cleared(x, y, radius);
    if (!onWords && circles.every((c) => Math.hypot(c.x - x, c.y - y) >= apart)) circles.push({ x, y, radius });
  }
  return { circles, spacing };
}

export function routeNetwork(circles, spacing, { neighbours, extraTraces, mostPerCircle, clearance, bow }, random) {
  const gap = clearance * spacing;
  const candidates = [];
  const paired = new Set();
  circles.forEach((a, i) => {
    const near = circles
      .map((b, j) => ({ j, distance: Math.hypot(b.x - a.x, b.y - a.y) }))
      .filter(({ j }) => j !== i)
      .sort((p, q) => p.distance - q.distance)
      .slice(0, neighbours);
    for (const { j, distance } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (paired.has(key)) continue;
      paired.add(key);
      const lean = random() < 0.5 ? 1 : -1;
      const shapes = [{ first: lean, second: lean }, { first: -lean, second: -lean }, { first: lean, second: -lean }];
      shapes.forEach((shape, k) => {
        const curve = bezier(a, circles[j], bow * distance, shape);
        candidates.push({ a: i, b: j, curve, cost: distance * (1 + k * 0.04) });
      });
    }
  });
  candidates.sort((p, q) => p.cost - q.cost);

  const edges = [];
  const degree = circles.map(() => 0);
  const outlines = new Map();
  const outline = (candidate) => {
    if (!outlines.has(candidate)) {
      const line = trimmed(sample(candidate.curve, 14), circles[candidate.a], circles[candidate.b]);
      outlines.set(candidate, { line, box: boxOf(line, gap) });
    }
    return outlines.get(candidate);
  };
  const shaved = (line, atStart, atEnd) => {
    let kept = line;
    if (atStart) kept = kept.filter((p) => Math.hypot(p.x - line[0].x, p.y - line[0].y) > gap * 2);
    if (atEnd) kept = kept.filter((p) => Math.hypot(p.x - line.at(-1).x, p.y - line.at(-1).y) > gap * 2);
    return kept.length >= 2 ? kept : [];
  };
  const fits = (candidate) => {
    const { line, box } = outline(candidate);
    for (let k = 0; k < circles.length; k++) {
      if (k === candidate.a || k === candidate.b) continue;
      const c = circles[k];
      if (c.x < box.left - c.radius || c.x > box.right + c.radius || c.y < box.top - c.radius || c.y > box.bottom + c.radius) continue;
      if (distanceToLine(c, line) < c.radius + gap) return false;
    }
    for (const edge of edges) {
      const other = outline(edge);
      if (other.box.left > box.right || other.box.right < box.left || other.box.top > box.bottom || other.box.bottom < box.top) continue;
      const mine = shaved(line, edge.a === candidate.a || edge.b === candidate.a, edge.a === candidate.b || edge.b === candidate.b);
      const theirs = shaved(other.line, candidate.a === edge.a || candidate.b === edge.a, candidate.a === edge.b || candidate.b === edge.b);
      if (mine.length && theirs.length && lineGap(mine, theirs) < gap) return false;
    }
    return true;
  };
  const take = (candidate) => {
    edges.push(candidate);
    degree[candidate.a] += 1;
    degree[candidate.b] += 1;
  };

  const piece = circles.map((_, i) => i);
  const find = (i) => (piece[i] === i ? i : (piece[i] = find(piece[i])));
  for (const candidate of candidates) {
    if (find(candidate.a) === find(candidate.b) || !fits(candidate)) continue;
    take(candidate);
    piece[find(candidate.a)] = find(candidate.b);
  }
  let extra = Math.round(circles.length * extraTraces);
  for (const candidate of candidates) {
    if (extra <= 0) break;
    if (degree[candidate.a] >= mostPerCircle || degree[candidate.b] >= mostPerCircle) continue;
    if (edges.some((e) => (e.a === candidate.a && e.b === candidate.b) || (e.a === candidate.b && e.b === candidate.a))) continue;
    if (!fits(candidate)) continue;
    take(candidate);
    extra -= 1;
  }
  return edges.map(({ a, b, curve }) => ({ a, b, curve }));
}

function bezier(a, b, bow, { first, second }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return [
    { x: a.x, y: a.y },
    { x: a.x + dx / 3 + nx * bow * first, y: a.y + dy / 3 + ny * bow * first },
    { x: a.x + (2 * dx) / 3 + nx * bow * second, y: a.y + (2 * dy) / 3 + ny * bow * second },
    { x: b.x, y: b.y },
  ];
}

function sample([p0, p1, p2, p3], count) {
  const points = [];
  for (let k = 0; k <= count; k++) {
    const t = k / count;
    const u = 1 - t;
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return points;
}

export function traceShape(edge, from, circles) {
  const line = trimmed(sample(edge.curve, 40), circles[edge.a], circles[edge.b]);
  return new EtchPath(from === edge.a ? line : line.reverse());
}

function trimmed(points, start, end) {
  const outside = (p, c) => Math.hypot(p.x - c.x, p.y - c.y) >= c.radius;
  let first = points.findIndex((p) => outside(p, start));
  let last = points.length - 1 - [...points].reverse().findIndex((p) => outside(p, end));
  if (first < 1) first = 1;
  if (last > points.length - 2) last = points.length - 2;
  const kept = points.slice(first, last + 1);
  const rim = (inside, out, c) => {
    let [p, q] = [inside, out];
    for (let k = 0; k < 12; k++) {
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (outside(m, c)) q = m; else p = m;
    }
    return q;
  };
  return [rim(points[first - 1], points[first], start), ...kept, rim(points[last + 1], points[last], end)];
}

function boxOf(line, pad) {
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  return { left: Math.min(...xs) - pad, right: Math.max(...xs) + pad, top: Math.min(...ys) - pad, bottom: Math.max(...ys) + pad };
}

function distanceToSegment(c, p, q) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const t = Math.min(Math.max(((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1), 0), 1);
  return Math.hypot(c.x - (p.x + t * dx), c.y - (p.y + t * dy));
}

function distanceToLine(c, line) {
  let nearest = Infinity;
  for (let k = 1; k < line.length; k++) nearest = Math.min(nearest, distanceToSegment(c, line[k - 1], line[k]));
  return nearest;
}

function segmentsCross(p, q, r, s) {
  const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
}

function lineGap(first, second) {
  let nearest = Infinity;
  for (let i = 1; i < first.length; i++) {
    for (let k = 1; k < second.length; k++) {
      const [p, q, r, s] = [first[i - 1], first[i], second[k - 1], second[k]];
      if (segmentsCross(p, q, r, s)) return 0;
      nearest = Math.min(nearest, distanceToSegment(p, r, s), distanceToSegment(q, r, s), distanceToSegment(r, p, q), distanceToSegment(s, p, q));
    }
  }
  return nearest;
}
