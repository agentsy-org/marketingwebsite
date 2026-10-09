const settings = {
  phones: 10,
  lap: 30, // seconds for the ring to go round once
  draw: 0.22, // how far round, as a share of a lap, a screen takes to draw itself after the top
  fadeFrom: 0.57, // and where it starts to fade, and is gone by fadeTo: round the south-west for the
  fadeTo: 0.66, // phones, the south-east for the Macs going the other way
  bezel: "#0e0618",
  frame: "#9e6bf2",
  screen: "#140a26",
  macs: 3,
  macLap: 44, // seconds for the Macs to go round once, the other way
  fill: { bright: 0.88, card: 0.13, plain: 0.4, knob: 0.92 },
  settle: 1.4,
  hot: 0.12, // how much of a line, as a share of it, is still white-hot behind where it is being drawn
};

function ringFor(size) {
  const radius = size * 0.31;
  const phoneHeight = radius * 0.64;
  const inner = radius - phoneHeight / 2;
  const phoneWidth = Math.min(phoneHeight * 0.49, 2 * inner * Math.sin(Math.PI / settings.phones) * 0.84);
  return { radius, phoneHeight, phoneWidth };
}

const brights = ["#e08cff", "#10b981", "#fbbf24", "#60a5fa", "#fb7185", "#fb923c", "#a78bfa", "#2dd4bf", "#f472b6"];

const themes = [
  { line: "#cbbde0", accent: "#e08cff", accent2: "#9e6bf2" },
  { line: "#a9b2ff", accent: "#10b981", accent2: "#e08cff" },
  { line: "#cbbde0", accent: "#10b981", accent2: "#f3a6ff" },
  { line: "#f3a6ff", accent: "#9e6bf2", accent2: "#a9b2ff" },
  { line: "#a9b2ff", accent: "#f3a6ff", accent2: "#10b981" },
  { line: "#e4d8fb", accent: "#9e6bf2", accent2: "#10b981" },
];

const art = document.querySelector("[data-phone-wheel]");
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (art) start(art);

function start(art) {
  const canvas = art.querySelector("canvas");
  const paint = canvas.getContext("2d");
  let size = 0;
  let ratio = 1;
  let visible = false;
  let frame = 0;
  const started = performance.now();

  const resize = () => {
    const box = art.getBoundingClientRect();
    size = Math.round(Math.min(box.width, box.height));
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const { radius, phoneHeight, phoneWidth } = ringFor(size);
    const reach = Math.hypot(radius + phoneHeight / 2, phoneWidth / 2) + 1;
    art.style.setProperty("--ring-spare", `${Math.max(0, box.width / 2 - reach).toFixed(1)}px`);
    draw(performance.now());
  };

  const screens = new Map();
  const screenFor = (kind, device, lap) => {
    const key = `${kind}:${device}:${lap}`;
    if (!screens.has(key)) {
      if (screens.size > 96) screens.clear();
      const random = seeded(device * 7919 + lap * 104729 + (kind === "mac" ? 50021 : 13));
      const parts = kind === "mac" ? macLayout(random) : layout(random);
      let last = -1;
      for (const piece of parts) {
        let pick = Math.floor(random() * brights.length);
        if (pick === last) pick = (pick + 1) % brights.length;
        piece.bright = brights[pick];
        if (piece.colour === "accent" || piece.colour === "accent2") last = pick;
      }
      screens.set(key, { theme: themes[Math.floor(random() * themes.length)], parts });
    }
    return screens.get(key);
  };

  const progress = (round) => {
    const lap = Math.floor(round);
    const along = round - lap;
    return {
      lap, along,
      drawn: moving ? along / settings.draw : 10,
      shown: moving ? 1 - clamp((along - settings.fadeFrom) / (settings.fadeTo - settings.fadeFrom)) : 1,
    };
  };

  function draw(now) {
    const box = art.getBoundingClientRect();
    const width = box.width;
    const height = box.height;
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { radius, phoneHeight, phoneWidth } = ringFor(size);
    const seconds = (now - started) / 1000;
    const macRadius = radius * 0.38;
    const macWidth = radius * 0.5;
    const macTurns = moving ? -seconds / settings.macLap : -0.05;
    for (let k = 0; k < settings.macs; k++) {
      const { lap, along, drawn, shown } = progress(-macTurns + k / settings.macs);
      const angle = -along * Math.PI * 2;
      const x = width / 2 + Math.sin(angle) * macRadius;
      const y = height / 2 - Math.cos(angle) * macRadius;
      mac(x, y, angle, macWidth, screenFor("mac", k, lap), drawn, shown);
    }
    const turns = moving ? seconds / settings.lap : 0.13;
    for (let k = 0; k < settings.phones; k++) {
      const { lap, along, drawn, shown } = progress(turns + k / settings.phones);
      const angle = along * Math.PI * 2;
      const x = width / 2 + Math.sin(angle) * radius;
      const y = height / 2 - Math.cos(angle) * radius;
      phone(x, y, angle, phoneWidth, phoneHeight, screenFor("phone", k, lap), drawn, shown);
    }
  }

  function mac(cx, cy, angle, w, screen, drawn, shown) {
    const screenHeight = w * 0.64;
    const lip = w * 0.06;
    const h = screenHeight + lip;
    const x = -w / 2;
    const y = -h / 2;
    const bezel = w * 0.03;
    paint.save();
    paint.translate(cx, cy);
    paint.rotate(angle);
    paint.beginPath();
    paint.roundRect(x, y, w, screenHeight, w * 0.04);
    paint.fillStyle = settings.bezel;
    paint.fill();
    paint.lineWidth = 1.2;
    paint.strokeStyle = settings.frame;
    paint.stroke();
    paint.beginPath();
    paint.roundRect(x - w * 0.06, y + screenHeight, w * 1.12, lip, [0, 0, lip, lip]);
    paint.fillStyle = settings.bezel;
    paint.fill();
    paint.stroke();
    const sx = x + bezel;
    const sy = y + bezel;
    const sw = w - bezel * 2;
    const sh = screenHeight - bezel * 2;
    paint.save();
    paint.beginPath();
    paint.roundRect(sx, sy, sw, sh, w * 0.02);
    paint.clip();
    if (shown > 0 && drawn > 0) {
      paint.globalAlpha = shown;
      paintScreen(screen, sx, sy, sw, sh, drawn);
      paint.globalAlpha = 1;
    }
    paint.restore();
    paint.restore();
  }

  function phone(cx, cy, angle, w, h, screen, drawn, shown) {
    const x = -w / 2;
    const y = -h / 2;
    const corner = w * 0.2;
    const bezel = w * 0.045;
    paint.save();
    paint.translate(cx, cy);
    paint.rotate(angle);
    paint.beginPath();
    paint.roundRect(x, y, w, h, corner);
    paint.fillStyle = settings.bezel;
    paint.fill();
    paint.lineWidth = 1.2;
    paint.strokeStyle = settings.frame;
    paint.stroke();
    const sx = x + bezel;
    const sy = y + bezel;
    const sw = w - bezel * 2;
    const sh = h - bezel * 2;
    paint.save();
    paint.beginPath();
    paint.roundRect(sx, sy, sw, sh, corner - bezel);
    paint.clip();
    if (shown > 0 && drawn > 0) {
      paint.globalAlpha = shown;
      paintScreen(screen, sx, sy, sw, sh, drawn);
      paint.globalAlpha = 1;
    }
    paint.restore();
    paint.restore();
  }

  function paintScreen({ theme, parts }, x, y, w, h, drawn) {
    const count = parts.length + 1;
    const at = drawn * count * 0.9;
    const part = (k) => clamp(at - k * 0.9);
    const ground = easeOut(part(0));
    const alpha = paint.globalAlpha;
    paint.fillStyle = settings.screen;
    paint.globalAlpha = alpha * ground;
    paint.fillRect(x, y, w, h);
    paint.globalAlpha = alpha;
    paint.lineCap = "round";
    paint.lineJoin = "round";
    parts.forEach((piece, k) => {
      const t = easeOut(part(k + 1));
      if (t <= 0) return;
      const settled = easeOut(clamp((at - (k + 1) * 0.9 - 1) / settings.settle));
      const px = x + piece.x * w;
      const py = y + piece.y * h;
      const pw = piece.w * w;
      const ph = piece.h * h;
      const bright = piece.colour === "accent" || piece.colour === "accent2";
      const colour = bright ? piece.bright : theme.line;
      const faint = piece.colour === "soft" ? 0.45 : piece.colour === "card" ? 0.6 : 1;
      paint.strokeStyle = colour;
      paint.lineWidth = Math.max(0.8, w * 0.012);
      const path = new Path2D();
      let fill = null;
      let length;
      if (piece.round) {
        const r = Math.min(pw, ph) / 2;
        path.arc(px + pw / 2, py + ph / 2, r, -Math.PI / 2, Math.PI * 1.5);
        fill = new Path2D();
        fill.arc(px + pw / 2, py + ph / 2, r, 0, Math.PI * 2);
        length = Math.PI * 2 * r;
      } else if (ph < h * 0.03) {
        path.moveTo(px, py + ph / 2);
        path.lineTo(px + pw, py + ph / 2);
        length = pw;
        paint.lineWidth = Math.max(1, ph * 0.7);
      } else {
        path.roundRect(px, py, pw, ph, Math.min(ph / 2, w * piece.corner));
        fill = new Path2D();
        fill.roundRect(px, py, pw, ph, Math.min(ph / 2, w * piece.corner));
        length = 2 * (pw + ph);
      }
      if (fill) {
        const strength = bright ? settings.fill.bright
          : piece.colour === "card" ? (piece.round ? settings.fill.knob : settings.fill.card)
          : settings.fill.plain * faint;
        paint.fillStyle = colour;
        paint.globalAlpha = alpha * strength * settled;
        paint.fill(fill);
      }
      paint.globalAlpha = alpha * faint * (fill ? 1 - settled : 1);
      if (paint.globalAlpha > 0.003) {
        paint.setLineDash([length * t, length]);
        paint.stroke(path);
        paint.setLineDash([]);
      }
      if (t > 0 && t < 1) burn(path, length, t, tip(piece, px, py, pw, ph, w, h, length * t), alpha);
      paint.globalAlpha = alpha;
    });
  }

  function burn(path, length, t, point, alpha) {
    const drawnTo = length * t;
    const hot = Math.min(drawnTo, settings.hot * length + 6);
    paint.save();
    paint.globalCompositeOperation = "lighter";
    paint.globalAlpha = alpha;
    paint.strokeStyle = "rgba(255, 255, 255, 0.95)";
    paint.lineWidth *= 1.25;
    paint.setLineDash([hot, length * 2]);
    paint.lineDashOffset = -(drawnTo - hot);
    paint.stroke(path);
    paint.setLineDash([]);
    paint.shadowColor = "rgba(255, 255, 255, 0.95)";
    paint.shadowBlur = 9 * ratio;
    paint.fillStyle = "#ffffff";
    paint.beginPath();
    paint.arc(point.x, point.y, Math.max(1.6, paint.lineWidth * 1.1), 0, Math.PI * 2);
    paint.fill();
    paint.fill();
    paint.restore();
  }

  function tick(now) {
    draw(now);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  new ResizeObserver(() => requestAnimationFrame(resize)).observe(art);
  if (!moving) return;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) frame = requestAnimationFrame(tick);
  }).observe(art);
}

function layout(random) {
  const parts = [];
  const add = (x, y, w, h, colour, corner = 0.06, round = false) => parts.push({ x, y, w, h, colour, corner, round });
  const pick = (list) => list[Math.floor(random() * list.length)];
  add(0.08, 0.035, 0.18, 0.018, "ink", 0.05);
  add(0.72, 0.035, 0.2, 0.018, "ink", 0.05);
  const headerTall = random() < 0.5;
  if (headerTall) {
    add(0.08, 0.1, 0.55, 0.035, "ink");
    add(0.08, 0.15, 0.35, 0.02, "soft");
  } else {
    add(0.08, 0.1, 0.12, 0.06, pick(["accent", "accent2"]), 0, true);
    add(0.25, 0.11, 0.45, 0.03, "ink");
  }
  let y = 0.2;
  const kind = Math.floor(random() * 5);
  if (kind === 0) {
    while (y < 0.78) {
      add(0.06, y, 0.88, 0.2, "card", 0.08);
      add(0.1, y + 0.015, 0.8, 0.1, pick(["accent", "accent2", "soft"]), 0.06);
      add(0.1, y + 0.13, 0.6, 0.02, "ink");
      add(0.1, y + 0.165, 0.4, 0.016, "soft");
      y += 0.23;
    }
  } else if (kind === 1) {
    add(0.06, y, 0.88, 0.2, "card", 0.08);
    add(0.1, y + 0.025, 0.25, 0.018, "soft");
    add(0.1, y + 0.06, 0.5, 0.05, "accent");
    for (let b = 0; b < 6; b++) {
      const tall = 0.04 + random() * 0.07;
      add(0.12 + b * 0.13, y + 0.185 - tall, 0.08, tall, b % 2 ? "accent2" : "accent", 0.03);
    }
    y += 0.23;
    for (let r = 0; r < 3; r++) {
      add(0.06, y, 0.88, 0.09, "card", 0.06);
      add(0.1, y + 0.02, 0.1, 0.05, pick(["accent", "accent2"]), 0, true);
      add(0.25, y + 0.025, 0.4, 0.018, "ink");
      add(0.25, y + 0.055, 0.25, 0.014, "soft");
      y += 0.11;
    }
  } else if (kind === 2) {
    let mine = random() < 0.5;
    while (y < 0.72) {
      const long = 0.35 + random() * 0.35;
      const tall = 0.045 + (random() < 0.4 ? 0.04 : 0);
      add(mine ? 0.94 - long : 0.06, y, long, tall, mine ? "accent" : "card", 0.08);
      y += tall + 0.025;
      mine = !mine;
    }
    add(0.06, 0.8, 0.7, 0.055, "card", 0.08);
    add(0.8, 0.8, 0.14, 0.055, "accent2", 0, true);
  } else if (kind === 3) {
    add(0.06, y, 0.88, 0.58, "card", 0.08);
    for (let r = 0; r < 6; r++) {
      const ry = y + 0.025 + r * 0.092;
      add(0.11, ry + 0.02, 0.4 + random() * 0.15, 0.02, "ink");
      const on = random() < 0.55;
      add(0.7, ry + 0.008, 0.18, 0.045, on ? "accent" : "soft", 0.2);
      add(on ? 0.8 : 0.71, ry + 0.012, 0.07, 0.036, "card", 0, true);
    }
    y += 0.6;
  } else {
    add(0.06, y, 0.88, 0.3, pick(["accent", "accent2"]), 0.08);
    add(0.08, y + 0.33, 0.6, 0.03, "ink");
    add(0.08, y + 0.375, 0.3, 0.025, "accent");
    add(0.08, y + 0.42, 0.84, 0.016, "soft");
    add(0.08, y + 0.45, 0.7, 0.016, "soft");
    add(0.06, y + 0.5, 0.88, 0.07, "accent", 0.2);
    add(0.06, y + 0.585, 0.88, 0.06, "soft", 0.2);
  }
  if (random() < 0.75) {
    add(0, 0.9, 1, 0.1, "card", 0);
    for (let t = 0; t < 4; t++) add(0.12 + t * 0.22, 0.925, 0.1, 0.045, t === 0 ? "accent" : "soft", 0, true);
  }
  return parts;
}

function macLayout(random) {
  const parts = [];
  const add = (x, y, w, h, colour, corner = 0.02, round = false) => parts.push({ x, y, w, h, colour, corner, round });
  const pick = (list) => list[Math.floor(random() * list.length)];
  add(0.03, 0.05, 0.05, 0.08, pick(["accent", "accent2"]), 0, true);
  for (let l = 0; l < 3; l++) add(0.12 + l * 0.1, 0.085, 0.07, 0.02, "soft");
  add(0.82, 0.05, 0.14, 0.08, "accent", 0.04);
  const kind = Math.floor(random() * 4);
  if (kind === 0) {
    add(0.03, 0.18, 0.2, 0.76, "card", 0.02);
    for (let r = 0; r < 6; r++) add(0.05, 0.24 + r * 0.1, 0.12 + random() * 0.04, 0.02, r === 1 ? "accent" : "soft");
    add(0.26, 0.18, 0.4, 0.035, "ink");
    for (let c = 0; c < 3; c++) {
      add(0.26 + c * 0.24, 0.27, 0.22, 0.3, "card", 0.03);
      add(0.28 + c * 0.24, 0.3, 0.18, 0.13, pick(["accent", "accent2"]), 0.02);
      add(0.28 + c * 0.24, 0.47, 0.14, 0.02, "ink");
    }
    add(0.26, 0.62, 0.7, 0.32, "card", 0.03);
    for (let r = 0; r < 3; r++) add(0.29, 0.69 + r * 0.08, 0.5 + random() * 0.1, 0.02, "soft");
  } else if (kind === 1) {
    for (let c = 0; c < 4; c++) {
      add(0.03 + c * 0.24, 0.18, 0.22, 0.17, "card", 0.03);
      add(0.05 + c * 0.24, 0.22, 0.08, 0.02, "soft");
      add(0.05 + c * 0.24, 0.27, 0.12, 0.04, c === 0 ? "accent" : "ink");
    }
    add(0.03, 0.39, 0.6, 0.55, "card", 0.03);
    for (let b = 0; b < 9; b++) {
      const tall = 0.1 + random() * 0.3;
      add(0.06 + b * 0.063, 0.89 - tall, 0.04, tall, b % 3 ? "accent" : "accent2", 0.01);
    }
    add(0.66, 0.39, 0.31, 0.55, "card", 0.03);
    for (let r = 0; r < 5; r++) {
      add(0.68, 0.45 + r * 0.09, 0.05, 0.06, pick(["accent", "accent2"]), 0, true);
      add(0.75, 0.47 + r * 0.09, 0.18, 0.02, "soft");
    }
  } else if (kind === 2) {
    for (let c = 0; c < 4; c++) {
      add(0.03 + c * 0.24, 0.18, 0.12, 0.025, "ink");
      let y = 0.24;
      const cards = 2 + Math.floor(random() * 3);
      for (let k = 0; k < cards && y < 0.86; k++) {
        const tall = 0.1 + random() * 0.08;
        add(0.03 + c * 0.24, y, 0.22, tall, "card", 0.03);
        add(0.05 + c * 0.24, y + 0.03, 0.15, 0.02, "soft");
        add(0.05 + c * 0.24, y + tall - 0.05, 0.05, 0.03, pick(["accent", "accent2"]), 0.4);
        y += tall + 0.03;
      }
    }
  } else {
    add(0.08, 0.22, 0.42, 0.05, "ink");
    add(0.08, 0.3, 0.34, 0.05, "ink");
    add(0.08, 0.4, 0.3, 0.02, "soft");
    add(0.08, 0.5, 0.16, 0.08, "accent", 0.4);
    add(0.55, 0.2, 0.4, 0.4, pick(["accent", "accent2"]), 0.03);
    for (let c = 0; c < 3; c++) {
      add(0.05 + c * 0.31, 0.68, 0.28, 0.26, "card", 0.03);
      add(0.08 + c * 0.31, 0.72, 0.06, 0.08, pick(["accent", "accent2"]), 0, true);
      add(0.08 + c * 0.31, 0.85, 0.18, 0.02, "soft");
    }
  }
  return parts;
}

function tip(piece, px, py, pw, ph, w, h, distance) {
  if (piece.round) {
    const r = Math.min(pw, ph) / 2;
    const angle = -Math.PI / 2 + distance / r;
    return { x: px + pw / 2 + Math.cos(angle) * r, y: py + ph / 2 + Math.sin(angle) * r };
  }
  if (ph < h * 0.03) return { x: px + Math.min(distance, pw), y: py + ph / 2 };
  const r = Math.min(ph / 2, w * piece.corner);
  let d = distance;
  const sides = [
    [pw - r, (k) => ({ x: px + r + k, y: py })],
    [ph, (k) => ({ x: px + pw, y: py + k })],
    [pw, (k) => ({ x: px + pw - k, y: py + ph })],
    [ph, (k) => ({ x: px, y: py + ph - k })],
  ];
  for (const [long, at] of sides) {
    if (d <= long) return at(d);
    d -= long;
  }
  return { x: px + r, y: py };
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
