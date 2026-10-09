import { leafInWind, leafMotion } from "./scene-tree.js?v=8c972897";
import { canvasRatio } from "./canvas-ratio.js?v=8c972897";

const TAU = 2 * Math.PI;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const between = ([low, high]) => lerp(low, high, Math.random());

const settings = {
  wavelength: 900, // page pixels, one wave of the wind across the bullets
  onTitle: [0.07, 0.22, 0.38, 0.55, 0.71, 0.88], // where leaves land along the title, as shares of its letters
  onBox: [[0.12, 0.34, 0.6, 0.84], [0.18, 0.42, 0.66, 0.9]], // and along the tops of the first two boxes, as shares of their width
  length: 26, // page pixels, a fallen leaf's length
  restSquash: [0.58, 0.78], // how flat one looks lying on a ledge: fuller than the tree's on the ground, so it reads
  firstAfter: 500, // ms after the title is reached that the first leaf may set off
  spacing: [380, 760], // ms between one leaf setting off and the next: twice as many fall at once as at first
  above: 24, // page pixels above the top of the screen, beyond its own length, a leaf sets off from
  speed: [100, 140], // page pixels a second, falling
  longest: 5200, // ms a fall takes at most: a longer drop falls faster
};

const section = document.querySelector("#services");
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (section && moving) document.fonts.ready.then(() => start(section));

function start(section) {
  const title = section.querySelector(".h2");
  const boxes = [...section.querySelectorAll(".area")].slice(0, 2);
  const treeFoot = document.querySelector('.chunk[data-scene="tree"] .idea-from');
  const bullets = [...section.querySelectorAll(".leaf-bullet svg")].map((svg) => ({
    svg, path: svg.querySelector("path"), phase: Math.random() * TAU,
  }));
  for (const { svg } of bullets) svg.style.transformOrigin = "6% 50%"; // the stalk end of the leaf
  const colours = leafColours();

  const canvas = document.createElement("canvas");
  canvas.className = "falling-leaves";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const paint = canvas.getContext("2d");
  const outline = leafOutline(settings.length);
  let ratio = 1;
  let skyline = [];
  const resize = () => {
    ratio = canvasRatio(canvas.clientWidth, canvas.clientHeight);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    skyline = skylineOf(title);
  };
  resize();
  window.addEventListener("resize", resize);

  const plans = [
    ...settings.onTitle.map((share) => ({ on: "title", share })),
    ...boxes.flatMap((box, k) => settings.onBox[k].map((share) => ({ on: box, share: share + (Math.random() - 0.5) * 0.08 }))),
  ].sort(() => Math.random() - 0.5).map((plan) => {
    const fall = leafMotion.fall;
    const restSquash = between(settings.restSquash);
    const restAngle = (Math.random() - 0.5) * 0.24 + (Math.random() < 0.5 ? 0 : Math.PI);
    const lowest = Math.max(...outline.map(({ u, v }) => u * Math.sin(restAngle) + v * restSquash * Math.cos(restAngle)));
    return {
      ...plan, restSquash, restAngle, lowest, launched: null,
      spin: (Math.random() < 0.5 ? -1 : 1) * between(fall.spin),
      sway: { width: between(fall.sway), period: between(fall.swayPeriod), phase: Math.random() * TAU },
      flipPeriod: between(fall.flipPeriod),
      startAngle: Math.random() * TAU,
    };
  });

  function restingPlace(plan) {
    const half = (settings.length / 2) * Math.abs(Math.cos(plan.restAngle)) * 0.9;
    let x;
    let surface;
    let host;
    if (plan.on === "title") {
      host = title;
      const box = title.getBoundingClientRect();
      if (!skyline.length) return null;
      const glyph = skyline[Math.min(skyline.length - 1, Math.floor(plan.share * skyline.length))];
      x = box.left + (glyph.left + glyph.right) / 2;
      const under = skyline.filter((g) => box.left + g.right > x - half && box.left + g.left < x + half);
      surface = box.top + Math.min(...under.map((g) => g.top));
    } else {
      host = plan.on;
      const box = host.getBoundingClientRect();
      x = box.left + box.width * plan.share;
      surface = box.top;
    }
    return { x: x + window.scrollX, y: surface - plan.lowest - 0.5 + window.scrollY, opacity: parseFloat(getComputedStyle(host).opacity) || 0 };
  }

  let reachedAt = null;
  let nextAt = 0;
  let next = 0;
  function letGo(now) {
    if (reachedAt === null || next >= plans.length || now < nextAt) return;
    const setOff = settings.above + settings.length;
    if (treeFoot && treeFoot.getBoundingClientRect().bottom > 0) return;
    const plan = plans[next];
    const rest = restingPlace(plan);
    if (!rest) return;
    const from = { y: window.scrollY - setOff };
    const drop = rest.y - from.y;
    const fall = leafMotion.fall;
    plan.length = drop < settings.length ? 0 : Math.min(settings.longest, (drop / between(settings.speed)) * 1000);
    const drift = (fall.breeze * plan.length) / 1000 + (Math.random() - 0.5) * fall.wander;
    from.x = Math.min(Math.max(rest.x - drift, window.scrollX + settings.length), window.scrollX + window.innerWidth - settings.length);
    plan.from = from;
    plan.launched = now;
    next += 1;
    canvas.dataset.setOff = next; // for checks: how many have let go
    nextAt = now + between(settings.spacing);
  }

  function pose(plan, now) {
    const rest = restingPlace(plan);
    if (!rest) return null;
    const time = now - plan.launched;
    const p = plan.length ? clamp01(time / plan.length) : 1;
    if (p >= 1) return { x: rest.x, y: rest.y, angle: plan.restAngle, squash: plan.restSquash, opacity: rest.opacity };
    const fall = leafMotion.fall;
    const swayIn = smoothstep(clamp01(p / 0.15)) * (1 - smoothstep(clamp01((p - 0.78) / 0.22)));
    const settle = smoothstep(clamp01((p - 0.72) / 0.28));
    const along = lerp(p, 1 - (1 - p) ** 2, 0.55);
    const swing = TAU * (time / plan.sway.period) + plan.sway.phase;
    const x = lerp(plan.from.x, rest.x, along) + plan.sway.width * (Math.sin(swing) - Math.sin(plan.sway.phase)) * swayIn;
    const y = lerp(plan.from.y, rest.y, along) - 3 * Math.abs(Math.sin(swing)) * swayIn;
    const turning = plan.startAngle + plan.spin * (time / 1000) + fall.rock * Math.cos(swing) * swayIn;
    const restAngle = plan.restAngle + TAU * Math.round((turning - plan.restAngle) / TAU);
    const angle = lerp(turning, restAngle, settle);
    const flip = Math.cos(TAU * (time / plan.flipPeriod));
    const squash = lerp(lerp(1, flip, smoothstep(clamp01(p / 0.3))), plan.restSquash, settle);
    return { x, y, angle, squash, opacity: 1 };
  }

  function drawLeaves(now) {
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint.lineWidth = 1.3;
    paint.lineJoin = "round";
    for (const plan of plans) {
      if (plan.launched === null) continue;
      const at = pose(plan, now);
      if (!at || at.opacity <= 0) continue;
      const x = at.x - window.scrollX;
      const y = at.y - window.scrollY;
      if (y < -settings.length * 2 || y > canvas.clientHeight + settings.length * 2) continue;
      const cos = Math.cos(at.angle);
      const sin = Math.sin(at.angle);
      paint.beginPath();
      outline.forEach(({ u, v }, k) => {
        const w = v * at.squash;
        const px = x + u * cos - w * sin;
        const py = y + u * sin + w * cos;
        if (k) paint.lineTo(px, py); else paint.moveTo(px, py);
      });
      paint.closePath();
      paint.globalAlpha = at.opacity;
      paint.fillStyle = colours.fill;
      paint.fill();
      paint.strokeStyle = colours.line;
      paint.stroke();
    }
    paint.globalAlpha = 1;
  }

  let windFrom = null;
  function swayBullets(now) {
    if (windFrom === null) windFrom = now;
    const since = now - windFrom;
    for (const bullet of bullets) {
      const box = bullet.svg.getBoundingClientRect();
      const moved = leafInWind(since, box.left + window.scrollX, bullet.phase, settings.wavelength);
      bullet.svg.style.transform = `rotate(${moved.swing.toFixed(4)}rad) scaleY(${moved.narrow.toFixed(4)})`;
      bullet.path.style.stroke = colours.lineAt(leafMotion.shine * moved.crest);
    }
  }

  let visible = false;
  let frame = 0;
  function tick(now) {
    letGo(now);
    drawLeaves(now);
    swayBullets(now);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) frame = requestAnimationFrame(tick);
    if (!visible && !frame) drawLeaves(performance.now());
  }, { rootMargin: "40% 0px" }).observe(section);
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && reachedAt === null) {
      reachedAt = performance.now();
      nextAt = reachedAt + settings.firstAfter;
    }
  }).observe(title);
}

function skylineOf(heading) {
  const box = heading.getBoundingClientRect();
  const pen = document.createElement("canvas").getContext("2d");
  const glyphs = [];
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const style = getComputedStyle(node.parentElement);
    pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = node.textContent;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      const ink = pen.measureText(text[i]);
      const baseline = r.top + (ink.fontBoundingBoxAscent ?? r.height * 0.8);
      glyphs.push({ left: r.left - box.left, right: r.right - box.left, top: baseline - ink.actualBoundingBoxAscent - box.top });
    }
  }
  return glyphs;
}

function leafOutline(length) {
  const curves = [
    [[1.5, 6.5], [4, 1.4], [13, 0.6], [24.5, 6.5]],
    [[24.5, 6.5], [13, 12.4], [4, 11.6], [1.5, 6.5]],
  ];
  const scale = length / 23;
  const points = [];
  for (const [a, b, c, d] of curves) {
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const s = 1 - t;
      const at = (n) => s * s * s * a[n] + 3 * s * s * t * b[n] + 3 * s * t * t * c[n] + t * t * t * d[n];
      points.push({ u: (at(0) - 13) * scale, v: (at(1) - 6.5) * scale });
    }
  }
  return points;
}

function leafColours() {
  const channels = (name) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "");
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  };
  const violet = channels("--color-violet");
  const ground = channels("--color-ground");
  const fill = ground.map((g, k) => Math.round(lerp(g, violet[k], 0.34)));
  const lineAt = (lift) => `rgb(${violet.map((c) => Math.round(lerp(c, 255, lift))).join(" ")})`;
  return { fill: `rgb(${fill.join(" ")})`, line: lineAt(0), lineAt };
}
