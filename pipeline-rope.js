const settings = {
  every: 5200, // ms from one ripple starting to the next
  flick: 520, // ms the top is moved for: out to one side, over to the other, and back
  reach: 9, // px the top moves at most
  speed: 520, // px a second a ripple runs down the rope
  damping: 1.1, // how fast the whole rope settles, per second
  smoothing: 0.0016, // how much the rope resists sharp bends as it moves: higher is smoother
  spacing: 3, // px between the rope's points
  sway: 26, // px of room drawn on each side of the line
};

const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (moving) {
  const pipeline = document.querySelector(".pipeline");
  if (pipeline) start(pipeline, [...pipeline.querySelectorAll(".step")], (step) => {
    const ball = getComputedStyle(step, "::before");
    const box = step.getBoundingClientRect();
    const size = parseFloat(ball.width);
    return { x: box.left + parseFloat(ball.left) + size / 2, y: box.top + parseFloat(ball.top) + size / 2, size };
  });
  for (const list of document.querySelectorAll("[data-rope]")) {
    const carry = list.dataset.ropeCarry;
    const balls = [...list.querySelectorAll("[data-rope-ball]")];
    const carried = carry ? balls.map((ball) => ball.closest(carry)) : null;
    start(list, balls, (ball) => {
      const box = ball.getBoundingClientRect();
      const moved = carried ? carried[balls.indexOf(ball)].ropeShift ?? 0 : 0;
      return { x: box.left - moved + box.width / 2, y: box.top + box.height / 2, size: box.width };
    }, carried);
  }
}

function start(list, items, where, carried = null) {
  if (items.length < 2) return;
  const canvas = document.createElement("canvas");
  canvas.className = "list-rope";
  canvas.setAttribute("aria-hidden", "true");
  list.append(canvas);
  list.classList.add("has-rope");
  const paint = canvas.getContext("2d");
  const rows = items.map((item) => item.closest("li") ?? item);

  let look = null; // sizes read from the page's styles
  let rope = null; // { u, v } displacement and speed of each point, sideways
  let visible = false;
  let frame = 0;
  let last = 0;
  let nextFlick = 0;
  let flickAt = -Infinity;

  const read = () => {
    const style = getComputedStyle(list);
    const first = where(items[0]);
    const box = list.getBoundingClientRect();
    look = {
      size: first.size,
      pipe: parseFloat(style.getPropertyValue("--pipe")) || 3,
      gap: parseFloat(style.getPropertyValue("--dot-gap")) || 6,
      colour: style.getPropertyValue("--rope-colour").trim() || "#9e6bf2",
      x: first.x - box.left,
    };
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = look.size + settings.sway * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${box.height}px`;
    canvas.style.left = `${look.x - width / 2}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(box.height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    const span = where(items.at(-1)).y - first.y;
    const count = Math.max(8, Math.round(span / settings.spacing) + 1);
    if (!rope || rope.u.length !== count) rope = { u: new Float32Array(count), v: new Float32Array(count) };
  };

  const nodes = () => {
    const origin = canvas.getBoundingClientRect();
    return items.map((item, k) => ({
      y: where(item).y - origin.top,
      alpha: parseFloat(getComputedStyle(rows[k]).opacity) || 0,
    }));
  };

  const flick = (t) => {
    if (t < 0 || t > 1) return 0;
    const window = Math.sin(Math.PI * t) ** 2;
    return settings.reach * Math.sin(2 * Math.PI * t) * window;
  };

  function simulate(dt, now, length) {
    const { u, v } = rope;
    const n = u.length;
    const h = length / (n - 1);
    const c2 = (settings.speed / h) ** 2;
    const rounds = Math.max(1, Math.ceil(dt / (0.5 * h / settings.speed)));
    const sub = dt / rounds;
    for (let round = 0; round < rounds; round++) {
      const t = now - (rounds - round - 1) * sub * 1000;
      u[0] = flick((t - flickAt) / settings.flick);
      v[0] = 0;
      u[n - 1] = 0;
      v[n - 1] = 0;
      for (let i = 1; i < n - 1; i++) {
        const bend = u[i - 1] - 2 * u[i] + u[i + 1];
        const bendSpeed = v[i - 1] - 2 * v[i] + v[i + 1];
        v[i] += (c2 * bend + (settings.smoothing * c2) * bendSpeed - settings.damping * v[i]) * sub;
      }
      for (let i = 1; i < n - 1; i++) u[i] += v[i] * sub;
    }
  }

  const sideways = (y, top, length) => {
    const { u } = rope;
    const at = ((y - top) / length) * (u.length - 1);
    if (at <= 0) return u[0];
    if (at >= u.length - 1) return u[u.length - 1];
    const i = Math.floor(at);
    return u[i] + (u[i + 1] - u[i]) * (at - i);
  };

  function draw(placed) {
    const { size, pipe, gap, colour } = look;
    const top = placed[0].y;
    const length = placed.at(-1).y - top;
    const middle = settings.sway + size / 2;
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.strokeStyle = colour;
    paint.lineWidth = pipe;
    paint.lineCap = "round";
    paint.lineJoin = "round";
    for (let k = 0; k < placed.length - 1; k++) {
      const from = placed[k].y + size / 2 + gap;
      const to = placed[k + 1].y - size / 2 - gap;
      if (to <= from) continue;
      paint.globalAlpha = Math.min(placed[k].alpha, placed[k + 1].alpha);
      paint.beginPath();
      for (let y = from; ; y = Math.min(to, y + settings.spacing)) {
        const x = middle + sideways(y, top, length);
        if (y === from) paint.moveTo(x, y); else paint.lineTo(x, y);
        if (y >= to) break;
      }
      paint.stroke();
    }
    placed.forEach((node, k) => {
      const shift = sideways(node.y, top, length);
      if (carried) {
        const rounded = Math.round(shift * 10) / 10;
        if (carried[k].ropeShift !== rounded) { carried[k].ropeShift = rounded; carried[k].style.translate = `${rounded}px 0`; }
        return;
      }
      paint.globalAlpha = node.alpha;
      paint.beginPath();
      paint.arc(middle + shift, node.y, (size - pipe) / 2, 0, Math.PI * 2);
      paint.stroke();
    });
    paint.globalAlpha = 1;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (now >= nextFlick) {
      flickAt = now;
      nextFlick = now + settings.every;
    }
    const placed = nodes();
    const length = placed.at(-1).y - placed[0].y;
    if (length > 0) {
      simulate(dt, now, length);
      draw(placed);
    }
    frame = visible ? requestAnimationFrame(tick) : 0;
  }

  document.fonts.ready.then(() => { read(); if (!frame) draw(nodes()); });
  read();
  draw(nodes());
  new ResizeObserver(() => requestAnimationFrame(() => { read(); if (!frame) draw(nodes()); })).observe(list);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame) {
      last = 0;
      nextFlick = Math.max(nextFlick, performance.now() + 900);
      frame = requestAnimationFrame(tick);
    }
  }).observe(list);
}
