
const mix = (a, b, t) => a + (b - a) * t;

export function networkPulse({ nodes, edges, palette, timing }) {
  if (!nodes.length) return () => {};
  const left = Math.min(...nodes.map((n) => n.x));
  const right = Math.max(...nodes.map((n) => n.x));
  const top = Math.min(...nodes.map((n) => n.y));
  const bottom = Math.max(...nodes.map((n) => n.y));
  const along = nodes.map((n) => ((n.x - left) / (right - left || 1) + (bottom - n.y) / (bottom - top || 1)) / 2);

  const onward = nodes.map(() => []);
  const paths = edges.flatMap(({ a, b, route }) => {
    const ways = timing.everywhere ? [true, false] : [along[a] <= along[b]];
    return ways.map((forwards) => {
      const path = {
        from: forwards ? a : b,
        to: forwards ? b : a,
        length: route.length,
        at: (distance) => route.pointAt(forwards ? distance : route.length - distance),
      };
      onward[path.from].push(path);
      return path;
    });
  });

  const speed = timing.speed / 1000; // page pixels a millisecond
  const arrival = nodes.map(() => Infinity);
  const lowest = Math.min(...along);
  if (timing.from) {
    const nearest = nodes.reduce((best, n, index) => (Math.hypot(n.x - timing.from.x, n.y - timing.from.y) < Math.hypot(nodes[best].x - timing.from.x, nodes[best].y - timing.from.y) ? index : best), 0);
    arrival[nearest] = 0;
  } else {
    along.forEach((value, index) => { if (value <= lowest + timing.sourceBand) arrival[index] = 0; });
  }
  const waiting = new Set(nodes.keys());
  while (waiting.size) {
    let next = -1;
    for (const index of waiting) if (next < 0 || arrival[index] < arrival[next]) next = index;
    waiting.delete(next);
    if (arrival[next] === Infinity) break;
    for (const path of onward[next]) {
      const reached = arrival[next] + (nodes[next].radius + path.length + nodes[path.to].radius) / speed;
      if (reached < arrival[path.to]) arrival[path.to] = reached;
    }
  }
  const finite = arrival.filter(Number.isFinite);
  const period = Math.max(...finite) + timing.glow + timing.rest;

  const [hr, hg, hb] = palette.hot;
  const [vr, vg, vb] = palette.violet;
  const colour = (heat, alpha) =>
    `rgb(${Math.round(mix(vr, hr, heat))} ${Math.round(mix(vg, hg, heat))} ${Math.round(mix(vb, hb, heat))} / ${alpha})`;

  const duration = period * timing.count;
  const drawPulse = (context, clock, options = {}) => {
    if (options.still || clock >= duration) return;
    const time = (clock % period) - timing.lead;
    context.globalCompositeOperation = "lighter";

    nodes.forEach((node, index) => {
      const since = time - arrival[index];
      if (!(since >= 0 && since < timing.glow)) return;
      const heat = (1 - since / timing.glow) ** 2;
      const halo = context.createRadialGradient(node.x, node.y, node.radius * 0.6, node.x, node.y, node.radius + 12);
      halo.addColorStop(0, colour(0.85, 0.55 * heat));
      halo.addColorStop(1, colour(0, 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(node.x, node.y, node.radius + 12, 0, 2 * Math.PI);
      context.fill();
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      context.fillStyle = colour(heat, 0.35 * heat);
      context.fill();
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      context.lineWidth = palette.lineWidth * 1.8;
      context.strokeStyle = colour(heat, heat);
      context.stroke();
    });

    for (const path of paths) {
      if (!Number.isFinite(arrival[path.from]) || path.length <= 0) continue;
      if (timing.everywhere && !(arrival[path.to] > arrival[path.from])) continue;
      const leaves = arrival[path.from] + nodes[path.from].radius / speed;
      const travelled = (time - leaves) * speed;
      if (travelled < 0 || travelled > path.length + timing.tail) continue;
      const head = Math.min(travelled, path.length);
      const tail = Math.max(travelled - timing.tail, 0);
      if (head <= tail) continue;
      const steps = 6;
      context.lineCap = "round";
      let previous = path.at(tail);
      for (let k = 1; k <= steps; k++) {
        const point = path.at(tail + ((head - tail) * k) / steps);
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.lineWidth = palette.lineWidth * 5;
        context.strokeStyle = colour(k / steps, 0.22 * (k / steps) ** 1.5);
        context.stroke();
        context.lineWidth = palette.lineWidth * 2;
        context.strokeStyle = colour(k / steps, (k / steps) ** 1.5);
        context.stroke();
        previous = point;
      }
      if (travelled <= path.length) {
        const spark = context.createRadialGradient(previous.x, previous.y, 0, previous.x, previous.y, 10);
        spark.addColorStop(0, colour(1, 1));
        spark.addColorStop(1, colour(0, 0));
        context.fillStyle = spark;
        context.fillRect(previous.x - 10, previous.y - 10, 20, 20);
      }
    }
    context.lineCap = "butt";
    context.globalCompositeOperation = "source-over";
  };
  drawPulse.duration = duration;
  return drawPulse;
}
