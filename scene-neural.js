import { schedule, EtchCircle } from "./laser-etch-engine.js?v=8c972897";
import { placeCircles, routeNetwork, traceShape } from "./hero-network.js?v=8c972897";
import { networkPulse } from "./network-pulse.js?v=8c972897";

const settings = {
  circleCount: 72,
  network: {
    sizes: [{ radius: 0.07, weight: 5 }, { radius: 0.11, weight: 4 }, { radius: 0.16, weight: 2 }, { radius: 0.23, weight: 1 }],
    evenness: 0.72, // how far apart circles must stay, as a fraction of the average spacing
    neighbours: 6, // how many nearest circles each one may be joined to
    extraTraces: 0.22, // traces beyond the fewest that join everything, as a share of the circles
    mostPerCircle: 3,
    clearance: 0.1, // the least space between a trace and anything else, as a fraction of the spacing
    bow: 0.22, // how far a curve bows out of a straight line, as a fraction of its length
  },
  pulse: {
    count: 3, // pulses per cycle
    speed: 760, // page pixels a second through the network
    sourceBand: 0.06, // dots this close to the bottom-left corner start each one
    glow: 420, // ms a dot stays lit after the pulse reaches it
    tail: 34, // page pixels of fading trail behind each bead
    lead: 0, // ms of quiet before each pulse; the first starts the moment the lasers stop
    rest: 450, // ms of quiet after each one
  },
  fadeOut: {
    groupSize: 4, // circles that fade together
    groupGap: 150, // ms between one group starting to fade and the next
    circleFade: 520, // ms for a circle to fade
    traceLead: 360, // its curves start fading this long before it does
    traceFade: 360, // ms for a curve to fade
  },
};

export const scene = {
  gapAboveLetters: 0.22, // clear space between the cluster and the letters, in ems
  timing: {
    laserStagger: 120, // ms between each laser powering on
    aimBase: 25, // ms for the shortest swing between targets
    aimPerRadian: 70, // and this much more per radian it turns
    cutSpeed: 2000, // page pixels a second along the shape
    cutMin: 70, // ms, so the smallest circles still read as cut
    cool: 420, // ms for a fresh cut to cool from white to violet
    fillFade: 480, // ms for a finished circle's middle to fade in
    beamFade: 220, // ms for a beam to power on and off
    sweepSamples: 8, // the swept area is the beam at this many earlier moments
    sweepStep: 16, // ms between them
  },
  lineMin: 40, // ms, the least time for the shortest connections

  build(layout, palette) {
    const region = { left: layout.text.left, width: layout.text.right - layout.text.left, top: layout.top, bottom: layout.bottom };
    if (region.bottom - region.top < 60) return null;
    const { random } = layout;
    const { circles, spacing } = placeCircles(region, layout.circleCount ?? settings.circleCount, random, { ...settings.network, clear: layout.keepOut ?? [], box: layout.fill === "box" || layout.fill === "lattice", lattice: layout.fill === "lattice" });
    const fuller = layout.fill === "lattice" ? { extraTraces: 0.6, mostPerCircle: 4 } : {};
    const edges = routeNetwork(circles, spacing, { ...settings.network, ...fuller, bow: layout.straight ? 0 : settings.network.bow }, random);
    const fades = fadeOrder(circles, edges, random);
    const pulseEdges = edges.map((edge) => ({ a: edge.a, b: edge.b, route: traceShape(edge, edge.a, circles) }));
    const lasers = assignToLasers(circles, edges, layout.origins, fades, this.timing, this.lineMin);
    const pulse = layout.pulseFrom ? { ...settings.pulse, everywhere: true, from: layout.pulseFrom } : settings.pulse;
    const overlay = networkPulse({ nodes: circles, edges: pulseEdges, palette, timing: pulse });
    return { lasers, overlay, overlayLength: overlay.duration };
  },
};

function assignToLasers(circles, edges, origins, fades, timing, lineMin) {
  const byX = circles.map((circle, index) => ({ circle, index })).sort((a, b) => a.circle.x - b.circle.x);
  const third = Math.ceil(byX.length / 3);
  const orders = origins.map((origin, laser) => {
    const pool = byX.slice(laser * third, (laser + 1) * third);
    const order = [];
    let here = origin;
    while (pool.length) {
      pool.sort((a, b) => Math.hypot(a.circle.x - here.x, a.circle.y - here.y) - Math.hypot(b.circle.x - here.x, b.circle.y - here.y));
      const next = pool.shift();
      order.push(next.index);
      here = next.circle;
    }
    return order;
  });
  const circleShape = (index, origin) => {
    const c = circles[index];
    return new EtchCircle(c.x, c.y, c.radius, Math.atan2(origin.y - c.y, origin.x - c.x));
  };

  const rough = schedule(orders.map((order, laser) => ({
    origin: origins[laser], shapes: order.map((index) => circleShape(index, origins[laser])),
  })), timing);
  const finished = new Map();
  rough.cuts.forEach((cut) => finished.set(cut.shape, cut.end));
  const finishedAt = circles.map(() => 0);
  rough.runs.forEach((run, laser) => run.steps.filter((s) => s.kind === "cut")
    .forEach((step, k) => { finishedAt[orders[laser][k]] = finished.get(step.shape); }));

  const after = circles.map(() => []);
  for (const edge of edges) {
    const later = finishedAt[edge.a] >= finishedAt[edge.b] ? edge.a : edge.b;
    after[later].push(edge);
  }
  return orders.map((order, laser) => {
    const origin = origins[laser];
    const shapes = [];
    for (const index of order) {
      const circle = circleShape(index, origin);
      circle.fade = fades.circle[index];
      shapes.push(circle);
      for (const edge of after[index]) {
        const trace = traceShape(edge, index, circles);
        trace.minTime = lineMin;
        trace.fade = fades.edge.get(edge);
        shapes.push(trace);
      }
    }
    return { origin, shapes };
  });
}

function fadeOrder(circles, edges, random) {
  const { groupSize, groupGap, circleFade, traceLead, traceFade } = settings.fadeOut;
  const left = Math.min(...circles.map((c) => c.x));
  const width = Math.max(...circles.map((c) => c.x)) - left || 1;
  const bottom = Math.max(...circles.map((c) => c.y));
  const height = bottom - Math.min(...circles.map((c) => c.y)) || 1;
  const order = circles
    .map((c, index) => ({ index, along: ((c.x - left) / width + (bottom - c.y) / height) / 2 + random() * 0.15 }))
    .sort((p, q) => p.along - q.along);
  const circle = circles.map(() => null);
  order.forEach(({ index }, rank) => {
    circle[index] = { start: traceLead + Math.floor(rank / groupSize) * groupGap, length: circleFade };
  });
  const edge = new Map(edges.map((e) => [e, {
    start: Math.min(circle[e.a].start, circle[e.b].start) - traceLead,
    length: traceFade,
  }]));
  return { circle, edge };
}
