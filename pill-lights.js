import { palette } from "./hero-graphic.js?v=8c972897";

const TAU = 2 * Math.PI;
const settings = {
  lights: 2, // spaced evenly round the pill, so two sit on opposite sides
  speed: 170, // page pixels a second round the pill
  trail: 0.3, // of the way round, the fading light behind each head
  gap: 0, // page pixels outside the pill's edge that the lights run: on it
  bleed: 26, // page pixels the canvas reaches past the pill, for the glow
  arrive: 900, // ms for the lights and their line to fade in
};

const pill = document.querySelector(".final-pill");
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (pill && moving) start(pill);

function start(pill) {
  const canvas = document.createElement("canvas");
  canvas.className = "pill-lights";
  canvas.setAttribute("aria-hidden", "true");
  pill.after(canvas);
  const paint = canvas.getContext("2d");
  const colours = palette();
  const [hr, hg, hb] = colours.hot;
  const [vr, vg, vb] = colours.violet;
  const colour = (heat, alpha) => `rgb(${Math.round(vr + (hr - vr) * heat)} ${Math.round(vg + (hg - vg) * heat)} ${Math.round(vb + (hb - vb) * heat)} / ${alpha})`;
  let track = null;
  let frame = 0;
  let visible = false;
  let cameAt = null; // when the trees had grown and the lights could come in

  const place = () => {
    const box = pill.getBoundingClientRect();
    const holder = pill.parentElement.getBoundingClientRect();
    const { bleed, gap } = settings;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(canvas.style, {
      left: `${box.left - holder.left - bleed}px`, top: `${box.top - holder.top - bleed}px`,
      width: `${box.width + bleed * 2}px`, height: `${box.height + bleed * 2}px`,
    });
    canvas.width = Math.round((box.width + bleed * 2) * ratio);
    canvas.height = Math.round((box.height + bleed * 2) * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    const radius = box.height / 2 + gap;
    const straight = box.width - box.height;
    const middle = { y: bleed + box.height / 2, left: bleed + box.height / 2, right: bleed + box.height / 2 + straight };
    const arc = Math.PI * radius;
    track = { radius, straight, middle, arc, length: 2 * straight + 2 * arc };
  };

  const pointAt = (distance) => {
    const { radius, straight, middle, arc, length } = track;
    let d = ((distance % length) + length) % length;
    if (d < straight) return { x: middle.left + d, y: middle.y - radius };
    d -= straight;
    if (d < arc) { const a = -Math.PI / 2 + d / radius; return { x: middle.right + Math.cos(a) * radius, y: middle.y + Math.sin(a) * radius }; }
    d -= arc;
    if (d < straight) return { x: middle.right - d, y: middle.y + radius };
    d -= straight;
    const a = Math.PI / 2 + d / radius;
    return { x: middle.left + Math.cos(a) * radius, y: middle.y + Math.sin(a) * radius };
  };

  const sprites = new Map();
  const glowSprite = (heat) => {
    const level = Math.round(heat * 8);
    if (!sprites.has(level)) {
      const size = 64;
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = size;
      const pen = sprite.getContext("2d");
      const glow = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      glow.addColorStop(0, colour(level / 8, 1));
      glow.addColorStop(1, colour(level / 8, 0));
      pen.fillStyle = glow;
      pen.fillRect(0, 0, size, size);
      sprites.set(level, sprite);
    }
    return sprites.get(level);
  };

  function draw(now) {
    const { length } = track;
    paint.clearRect(0, 0, canvas.width, canvas.height);
    if (cameAt === null) return;
    const shown = Math.min(1, (now - cameAt) / settings.arrive);
    paint.globalAlpha = shown;
    const head = (settings.speed * now) / 1000;
    const heads = Array.from({ length: settings.lights }, (_, n) => head + (n * length) / settings.lights);
    paint.globalCompositeOperation = "lighter";
    const trail = length * settings.trail;
    for (const lead of heads) {
      const dots = Math.ceil(trail / 2.5);
      for (let k = 0; k <= dots; k++) {
        const share = k / dots;
        const point = pointAt(lead - trail + trail * share);
        const heat = share ** 1.8;
        const size = (1.2 + 2.6 * share) * 2.4;
        paint.globalAlpha = 0.32 * heat * shown;
        paint.drawImage(glowSprite(heat), point.x - size, point.y - size, size * 2, size * 2);
      }
      paint.globalAlpha = shown;
      const tip = pointAt(lead);
      const spark = paint.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 14);
      spark.addColorStop(0, colour(1, 0.95));
      spark.addColorStop(0.35, colour(0.8, 0.35));
      spark.addColorStop(1, colour(0, 0));
      paint.fillStyle = spark;
      paint.beginPath();
      paint.arc(tip.x, tip.y, 14, 0, TAU);
      paint.fill();
    }
    paint.globalCompositeOperation = "source-over";
    paint.globalAlpha = 1;
  }

  function tick(now) {
    draw(now);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  const begin = () => { if (cameAt === null) cameAt = performance.now(); };
  if (document.querySelector("[data-forest]")) window.addEventListener("forest-grown", begin, { once: true });
  else begin();

  document.fonts.ready.then(() => {
    place();
    new ResizeObserver(() => requestAnimationFrame(place)).observe(pill);
    window.addEventListener("resize", place);
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(tick);
    }).observe(pill);
  });
}
