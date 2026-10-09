const settings = {
  font: 13, // px, the names' size on a wide screen; the whole mesh is sized from it
  teethSize: 0.62, // a tooth's size (the module), in name sizes
  band: 2, // the rim's width that the name runs round, in name sizes
  fill: 0.82, // how much of half the rim one name may take
  vary: [0.94, 1.1], // how much bigger or smaller than its name needs a cog may be
  clearance: 0.9, // the gap kept between cogs that do not mesh, in tooth sizes
  turn: 0.32, // radians a second the first cog turns
  flight: 950, // ms a cog takes to fly in
  stagger: 110, // ms between one cog setting off and the next
  pull: 3, // how slowly a flight starts: higher waits longer, then rushes harder
  settle: 6, // px a cog overshoots its place before it stops
  bleedTop: 260, // px above the drawing the canvas reaches at least; a screen's height, if more, so
  roomToLand: 0.8, // how much of the mesh must be on screen before they fly in: most of it (0.96 was a touch late)
  arm: 0.22, // where the mesh curls over the words, how far back over them it may reach, as a share of their width
  colours: { body: ["#6a3cbf", "#8456d8", "#5d33ad", "#9467e2", "#7447c9", "#552ea3", "#7f52d4", "#6237b4"], name: "#f6f0ff" },
};

const stages = [...document.querySelectorAll("[data-cogs]")];
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (stages.length) document.fonts.load(`500 16px "JetBrains Mono"`).finally(() => stages.forEach(start));

function start(stage) {
  const names = [...stage.querySelectorAll("li")].map((li) => li.textContent.trim());
  const sides = (stage.dataset.cogsFrom || "left top right").split(/\s+/);
  const canvas = document.createElement("canvas");
  canvas.className = "cogs-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.append(canvas);
  const paint = canvas.getContext("2d");
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  let cogs = [];
  let width = 0;
  let bleed = { left: 0, right: 0, top: 0 };
  let ratio = 1;
  let startAt = null;
  let visible = false;
  let frame = 0;

  const resize = () => {
    const box = stage.getBoundingClientRect();
    if (Math.round(box.width) === width) return;
    width = Math.round(box.width);
    const height = Math.round(box.height);
    const room = document.documentElement.clientWidth;
    bleed = { left: Math.max(0, box.left), right: Math.max(0, room - box.right), top: Math.max(settings.bleedTop, window.innerHeight) };
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(canvas.style, {
      left: `${-bleed.left}px`, top: `${-bleed.top}px`,
      width: `${width + bleed.left + bleed.right}px`, height: `${height + bleed.top}px`,
    });
    canvas.width = Math.round((width + bleed.left + bleed.right) * ratio);
    canvas.height = Math.round((height + bleed.top) * ratio);
    cogs = lay(width, height);
    draw(performance.now());
  };

  function lay(width, height) {
    paint.font = `500 100px ${font}`;
    const random = seeded(7);
    const narrow = width < 640;
    const m = settings.teethSize;
    const made = names.map((name) => {
      const text = (paint.measureText(name).width / 100) * 1.08; // in name sizes, with a little spacing
      const textRadius = text / (Math.PI * settings.fill);
      const pitch = (textRadius + settings.band / 2 + 1.15 * m) * (settings.vary[0] + random() * (settings.vary[1] - settings.vary[0]));
      const teeth = Math.max(14, Math.round((2 * pitch) / m));
      return { name, teeth, r: (teeth * m) / 2 };
    });
    const order = [...made].sort((a, b) => b.r - a.r);
    const outer = (cog) => cog.r + m;
    const words = !narrow && stage.dataset.cogsAround ? stage.parentElement.querySelector(stage.dataset.cogsAround) : null;
    if (words) {
      const most = parseFloat(stage.dataset.cogsMost) || 1.75;
      for (let scale = settings.font * most; scale > settings.font * 0.8; scale *= 0.92) {
        const placed = wrap(order, words, scale, width, height, m, outer);
        if (placed) return finish(placed, scale, 0, 0, width, height);
      }
    }
    const placed = [];
    const wideness = narrow ? 1 : 1.9; // how much more a cog far up or down costs than one far to the side
    for (const cog of order) {
      if (!placed.length) { Object.assign(cog, { x: 0, y: 0, parent: null, depth: 0 }); placed.push(cog); continue; }
      let best = null;
      for (const parent of placed) {
        for (let step = 0; step < 72; step++) {
          const angle = (step / 72) * Math.PI * 2;
          const x = parent.x + Math.cos(angle) * (parent.r + cog.r);
          const y = parent.y + Math.sin(angle) * (parent.r + cog.r);
          const clear = placed.every((other) => other === parent || Math.hypot(x - other.x, y - other.y) >= outer(cog) + outer(other) + settings.clearance * m);
          if (!clear) continue;
          const score = narrow ? Math.hypot(x, y * 1.15) : Math.hypot(x, y * wideness);
          if (!best || score < best.score) best = { score, x, y, parent, angle };
        }
      }
      Object.assign(cog, { x: best.x, y: best.y, parent: best.parent, depth: best.parent.depth + 1, angle: best.angle });
      placed.push(cog);
    }
    const left = Math.min(...placed.map((c) => c.x - outer(c)));
    const right = Math.max(...placed.map((c) => c.x + outer(c)));
    const top = Math.min(...placed.map((c) => c.y - outer(c)));
    const bottom = Math.max(...placed.map((c) => c.y + outer(c)));
    const most = parseFloat(stage.dataset.cogsMost) || (narrow ? 1 : 1.75);
    const scale = Math.min(settings.font * most, width / (right - left), height / (bottom - top));
    const middleX = width / 2 - ((left + right) / 2) * scale;
    const middleY = height / 2 - ((top + bottom) / 2) * scale;
    return finish(placed, scale, middleX, middleY, width, height);
  }

  function wrap(order, words, scale, width, height, m, outer) {
    const origin = stage.getBoundingClientRect();
    const boxes = [...words.children].map((child) => { const range = document.createRange(); range.selectNodeContents(child); return range.getBoundingClientRect(); }).filter((r) => r.width);
    const pad = 44 / scale; // the clear space kept round the words
    const k = {
      left: (Math.min(...boxes.map((r) => r.left)) - origin.left) / scale - pad,
      right: (Math.max(...boxes.map((r) => r.right)) - origin.left) / scale + pad,
      top: (Math.min(...boxes.map((r) => r.top)) - origin.top) / scale - pad,
      bottom: (Math.max(...boxes.map((r) => r.bottom)) - origin.top) / scale + pad,
    };
    const content = stage.parentElement.querySelector(".container")?.getBoundingClientRect() ?? origin;
    const header = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
    const room = {
      left: (content.left - origin.left) / scale, right: (content.right - origin.left) / scale,
      top: (Math.max(header, origin.top) - origin.top) / scale + 0.6, bottom: height / scale - 0.6,
    };
    const aim = { x: k.right + order[0].r * 0.7, y: (k.top + k.bottom) / 2 - order[0].r * 0.2 };
    const clearOfWords = (x, y, r) => {
      const dx = Math.max(k.left - x, 0, x - k.right);
      const dy = Math.max(k.top - y, 0, y - k.bottom);
      return Math.hypot(dx, dy) >= r;
    };
    const onStage = (x, y, r) => x - r >= room.left && x + r <= room.right && y - r >= room.top && y + r <= room.bottom;
    const placed = [];
    for (const cog of order) {
      let best = null;
      const tryAt = (x, y, parent, angle) => {
        const r = outer(cog);
        if (!onStage(x, y, r) || !clearOfWords(x, y, r)) return;
        if (!placed.every((other) => other === parent || Math.hypot(x - other.x, y - other.y) >= r + outer(other) + settings.clearance * m)) return;
        if (y < k.top + r && x - r < k.right - (k.right - k.left) * settings.arm) return;
        let score = Math.hypot(x - aim.x, (y - aim.y) * 1.1);
        if (y > k.bottom) score += (y - k.bottom) * 4;
        if (!best || score < best.score) best = { score, x, y, parent, angle };
      };
      if (!placed.length) {
        for (let dx = 0; dx < room.right; dx += 0.5) { tryAt(aim.x + dx, aim.y, null, 0); if (best) break; }
        if (!best) return null;
        Object.assign(cog, { x: best.x, y: best.y, parent: null, depth: 0 });
        placed.push(cog);
        continue;
      }
      for (const parent of placed) {
        for (let step = 0; step < 90; step++) {
          const angle = (step / 90) * Math.PI * 2;
          tryAt(parent.x + Math.cos(angle) * (parent.r + cog.r), parent.y + Math.sin(angle) * (parent.r + cog.r), parent, angle);
        }
      }
      if (!best) return null;
      Object.assign(cog, { x: best.x, y: best.y, parent: best.parent, depth: best.parent.depth + 1, angle: best.angle });
      placed.push(cog);
    }
    return placed;
  }

  function finish(placed, scale, middleX, middleY, width, height) {
    const first = placed[0];
    for (const cog of placed) {
      cog.speed = settings.turn * (first.teeth / cog.teeth) * (cog.depth % 2 ? -1 : 1);
      if (!cog.parent) cog.phase = 0;
      else {
        const p = cog.parent;
        const toward = cog.angle; // from the parent's centre to this one's
        const parentTooth = (p.teeth * (toward - p.phase)) / (Math.PI * 2);
        cog.phase = toward + Math.PI - ((Math.PI * 2) / cog.teeth) * (0.5 - parentTooth);
      }
    }
    placed.forEach((cog, index) => {
      cog.home = { x: middleX + cog.x * scale, y: middleY + cog.y * scale };
      cog.size = scale;
      cog.sprite = sprite(cog, scale, index);
      const across = cog.home.x / width;
      const side = across < 0.36 ? "left" : across > 0.64 ? "right" : "top";
      const way = sides.includes(side) ? side : "top";
      cog.from = way === "left" ? { x: -bleed.left - cog.r * scale * 1.3, y: cog.home.y - height * 0.15 }
        : way === "right" ? { x: width + bleed.right + cog.r * scale * 1.3, y: cog.home.y - height * 0.15 }
        : { x: cog.home.x, y: -bleed.top - cog.r * scale * 1.3 };
      cog.order = index;
    });
    [...placed].sort((a, b) => Math.hypot(a.x - first.x, a.y - first.y) - Math.hypot(b.x - first.x, b.y - first.y)).forEach((cog, k) => { cog.delay = k * settings.stagger; });
    return placed;
  }

  function sprite(cog, scale, index) {
    const m = settings.teethSize * scale;
    const pitch = cog.r * scale;
    const tip = pitch + m * 0.85;
    const root = pitch - m * 1.05;
    const inner = root - settings.band * scale;
    const hole = Math.max(inner * 0.34, scale * 1.2);
    const size = Math.ceil(tip * 2 + 6);
    const tile = document.createElement("canvas");
    tile.width = tile.height = Math.round(size * ratio);
    const pen = tile.getContext("2d");
    pen.setTransform(ratio, 0, 0, ratio, (size * ratio) / 2, (size * ratio) / 2);
    const { colours } = settings;
    const body = colours.body[index % colours.body.length];

    const teeth = [];
    const step = (Math.PI * 2) / cog.teeth;
    for (let k = 0; k < cog.teeth; k++) {
      const a = k * step;
      for (const [share, radius] of [[-0.33, root], [-0.17, tip], [0.17, tip], [0.33, root]]) {
        teeth.push({ x: Math.cos(a + share * step) * radius, y: Math.sin(a + share * step) * radius });
      }
    }
    const disc = new Path2D();
    rounded(disc, teeth, m * 0.5);
    disc.moveTo(hole, 0);
    disc.arc(0, 0, hole, 0, Math.PI * 2, true);
    pen.fillStyle = body;
    pen.fill(disc, "evenodd");

    const text = (root + inner) / 2;
    pen.font = `500 ${scale}px ${font}`;
    pen.fillStyle = colours.name;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    const letters = [...cog.name];
    const widths = letters.map((letter) => pen.measureText(letter).width * 1.08);
    const span = widths.reduce((sum, w) => sum + w, 0) / text;
    for (const middleAngle of [-Math.PI / 2, Math.PI / 2]) {
      let a = middleAngle - span / 2;
      letters.forEach((letter, k) => {
        const half = widths[k] / 2 / text;
        a += half;
        pen.save();
        pen.rotate(a + Math.PI / 2);
        pen.fillText(letter, 0, -text);
        pen.restore();
        a += half;
      });
    }
    return { canvas: tile, size };
  }

  function pose(cog, now) {
    const turn = cog.phase + (now / 1000) * cog.speed;
    if (!moving) return { x: cog.home.x, y: cog.home.y, turn };
    if (startAt === null) return null; // still waiting off screen for room to land
    const t = (now - startAt - cog.delay) / settings.flight;
    if (t <= 0) return null;
    const dx = cog.home.x - cog.from.x;
    const dy = cog.home.y - cog.from.y;
    if (t < 1) {
      const along = t ** settings.pull;
      return { x: cog.from.x + dx * along, y: cog.from.y + dy * along, turn };
    }
    const since = ((t - 1) * settings.flight) / 1000;
    const length = Math.hypot(dx, dy) || 1;
    const swing = since < 0.6 ? settings.settle * Math.sin(30 * since) * Math.exp(-since / 0.07) : 0;
    return { x: cog.home.x + (dx / length) * swing, y: cog.home.y + (dy / length) * swing, turn };
  }

  function draw(now) {
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.setTransform(ratio, 0, 0, ratio, bleed.left * ratio, bleed.top * ratio);
    for (const cog of cogs) {
      const at = pose(cog, now);
      if (!at) continue;
      paint.save();
      paint.translate(at.x, at.y);
      paint.rotate(at.turn);
      paint.drawImage(cog.sprite.canvas, -cog.sprite.size / 2, -cog.sprite.size / 2, cog.sprite.size, cog.sprite.size);
      paint.restore();
    }
  }

  function tick(now) {
    draw(now);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  new ResizeObserver(() => requestAnimationFrame(resize)).observe(stage);
  if (!moving) return;
  const roomToLand = () => {
    const box = stage.getBoundingClientRect();
    const seen = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
    return seen >= Math.min(box.height, window.innerHeight) * settings.roomToLand;
  };
  const watchForRoom = () => {
    if (startAt !== null || !visible || !roomToLand()) return;
    startAt = performance.now();
    window.removeEventListener("scroll", watchForRoom);
  };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) return;
    if (startAt === null) {
      window.addEventListener("scroll", watchForRoom, { passive: true });
      watchForRoom();
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }).observe(stage);
}

function rounded(path, points, radius) {
  const n = points.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[n - 1], points[0]);
  path.moveTo(start.x, start.y);
  for (let k = 0; k < n; k++) {
    const corner = points[k];
    const next = mid(corner, points[(k + 1) % n]);
    path.arcTo(corner.x, corner.y, next.x, next.y, radius);
  }
  path.closePath();
}

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
