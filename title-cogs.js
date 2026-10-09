const settings = {
  lean: 11, // degrees the italic leans
  sides: 0.2, // the stroke's thickness at the sides, as a share of the o's width
  ends: 0.085, // and at top and bottom, as a share of its height
  teeth: 11,
  tooth: 0.13, // how far a tooth stands out, as a share of the o's height
  turn: 0.45, // radians a second the teeth slide round
  boldGrow: 0.02, // how much wider all round a bold o is, as a share of its size: the display face
};

const letters = [...document.querySelectorAll("[data-cog-o]")];
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (letters.length) document.fonts.ready.then(() => letters.forEach((letter, index) => mount(letter, index)));

function mount(letter, index) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  letter.append(canvas);
  const paint = canvas.getContext("2d");
  const colour = getComputedStyle(letter).getPropertyValue("--cog-colour").trim() || getComputedStyle(letter).color;
  let shape = null;
  let frame = 0;
  let visible = false;

  const measure = () => {
    const style = getComputedStyle(letter);
    const size = parseFloat(style.fontSize);
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    letter.prepend(probe);
    const box = letter.getBoundingClientRect();
    const baseline = probe.getBoundingClientRect().top - box.top;
    const left = probe.getBoundingClientRect().left - box.left;
    probe.remove();
    paint.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ink = paint.measureText("o");
    const pad = Math.ceil(size * 0.1);
    const inkLeft = left - ink.actualBoundingBoxLeft;
    const inkRight = left + ink.actualBoundingBoxRight;
    const inkTop = baseline - ink.actualBoundingBoxAscent;
    const inkBottom = baseline + ink.actualBoundingBoxDescent;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = inkRight - inkLeft + pad * 2;
    const height = inkBottom - inkTop + pad * 2;
    Object.assign(canvas.style, { left: `${inkLeft - pad}px`, top: `${inkTop - pad}px`, width: `${width}px`, height: `${height}px` });
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    const lean = Math.tan((settings.lean * Math.PI) / 180);
    const grow = parseInt(style.fontWeight, 10) >= 600 ? settings.boldGrow * size : 0;
    const ry = (inkBottom - inkTop) / 2 + grow;
    const rx = Math.sqrt(Math.max(1, ((inkRight - inkLeft) / 2 + grow) ** 2 - (lean * ry) ** 2));
    shape = { cx: pad + (inkRight - inkLeft) / 2, cy: pad + ry, rx, ry, lean };
    draw(performance.now());
  };

  function draw(now) {
    if (!shape) return;
    const { cx, cy, rx, ry, lean } = shape;
    const tooth = settings.tooth * ry * 2 * 0.5;
    const outerX = rx - tooth;
    const outerY = ry - tooth;
    const turn = moving ? (now / 1000) * settings.turn : 0;
    const points = [];
    const step = (Math.PI * 2) / settings.teeth;
    for (let k = 0; k < settings.teeth; k++) {
      const a = turn + k * step;
      for (const [share, out] of [[-0.3, 0], [-0.14, 1], [0.14, 1], [0.3, 0]]) {
        const t = a + share * step;
        points.push({ x: Math.cos(t) * (outerX + out * tooth), y: Math.sin(t) * (outerY + out * tooth) });
      }
    }
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.restore();
    paint.save();
    paint.translate(cx, cy);
    paint.transform(1, 0, -lean, 1, 0, 0);
    const path = new Path2D();
    rounded(path, points, tooth * 0.45);
    const holeX = outerX - settings.sides * rx * 2 * 0.5;
    const holeY = outerY - settings.ends * ry * 2 * 0.5;
    path.moveTo(holeX, 0);
    path.ellipse(0, 0, holeX, holeY, 0, 0, Math.PI * 2, true);
    paint.fillStyle = colour;
    paint.fill(path, "evenodd");
    paint.restore();
  }

  function tick(now) {
    draw(now);
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  measure();
  window.addEventListener("resize", measure);
  if (!moving) return;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) frame = requestAnimationFrame(tick);
  }).observe(letter);
}

function rounded(path, points, radius) {
  const n = points.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[n - 1], points[0]);
  path.moveTo(start.x, start.y);
  for (let k = 0; k < n; k++) {
    const next = mid(points[k], points[(k + 1) % n]);
    path.arcTo(points[k].x, points[k].y, next.x, next.y, radius);
  }
  path.closePath();
}
