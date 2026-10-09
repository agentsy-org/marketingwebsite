const settings = {
  floatFor: 2000, // ms the loose code floats on screen before the first line is taken
  holdDone: 7500, // ms the finished code is left to be read before it fades out
  fadeOut: 900, // ms the finished code takes to fade out
  fadeIn: 700, // ms a new heap takes to fade in
  pullGap: 170, // ms between one line being taken and the next; less than a trip, so they overlap
  findSpeed: 2.2, // px a millisecond a line averages on its way out of the heap and along the lane
  findTime: [140, 300], // ms that part may take, shortest and longest
  findPower: 3, // how hard it speeds up and brakes on the way: higher is snappier
  corner: 0.7, // the radius of the turns into and out of the lane, in pill heights
  aim: 30, // ms a line waits in the lane, lined up with its row, before it is shot
  shotTime: 150, // ms the shot into place takes
  shotPower: 2.4, // how slowly the shot starts: higher waits longer, then rushes harder
  settle: 0.6, // how far a landing line overshoots before it stops, in pill heights
  settleSpin: 34, // how fast the settle swings back, in radians a second
  settleFade: 0.05, // seconds the settle takes to die away
  stretch: 0.04, // extra width per pixel-a-second of sideways speed, the motion blur
  stretchMost: 1.6, // the most a moving line may stretch, as a share of its width
  stretchEase: 35, // ms the stretch takes to follow the speed, in and out
  drift: [0.5, 1.1], // pill heights a second a loose line drifts
  airGap: 0.7, // the gap kept between loose lines, in pill heights
  shiverEvery: [500, 1500], // ms between one line shivering and the next
  shiverTime: 380,
  shiverSize: 0.18, // in pill heights
  looseShimmer: 2400, // ms for the shimmer to cross the loose code
  bluePulseEvery: 3600, // ms between shimmers through the finished blocks
  bluePulseTime: 1600,
  pillMost: 14, // px, the tallest a pill may be
  words: { short: [1.2, 2], long: [3, 2.2] }, // a word's length, least and spread, before the lines are widened to fill the box
  shownBlocks: { wide: 3, narrow: 2 }, // how many of the blocks are drawn, on a wide screen and on a phone
  symbolSize: 0.9, // a symbol's font size, as a share of the pill height
  gap: 0.34, // between a pill and a symbol, in pill heights
  pillRound: 0.3, // corner radius, as a share of the pill height
  rowStep: 1.6, // one line to the next, in pill heights
  blockGap: 1.2, // extra space between blocks, in pill heights
  indent: 1.8, // one indent level, in pill heights
  leastLane: 0.12, // the least room between the boxes, as a share of the drawing's width
  leastWiden: 1, // words are never squeezed shorter than this share of their own length
  ground: { heap: [18, 4, 38, 0.72], finished: [205, 172, 255, 0.34], soft: 150, bleed: 230 },
  done: { colour: "#10b981", shine: "#a7f3d0" },
  ring: { dash: 1.3, gap: 0.8, width: 0.42, round: 5, speed: 1.4, colours: ["#ffffff"], opacity: 0.15 },
  finish: { openLead: 70, openEase: 25, mergeAfter: 150, merge: 900, joinedOpacity: 0.6 },
};

const looseColours = ["#e08cff", "#fbbf24", "#60a5fa", "#ef4444", "#c084fc", "#fb923c", "#f472b6", "#a5b4fc"];

const blocks = [
  [
    [0, "func _ ( _ : _ ) {"],
    [1, "let _ = _ . _ ( __ )"],
    [1, "if _ == _ {"],
    [2, "return _ [ _ ]"],
    [1, "}"],
    [1, "_ . _ = __ ;"],
    [0, "}"],
  ],
  [
    [0, "const _ = ( _ , _ ) => {"],
    [1, "for ( _ of __ ) {"],
    [2, "_ . _ ( _ , _ ) ;"],
    [1, "}"],
    [1, "return { _ : __ } ;"],
    [0, "} ;"],
  ],
  [
    [0, "struct _ : _ {"],
    [1, "var _ : _"],
    [1, "let _ = [ _ , _ , _ ]"],
    [0, "}"],
  ],
  [
    [0, "class _ {"],
    [1, "_ ( _ ) {"],
    [2, "this . _ = _ ;"],
    [1, "}"],
    [1, "async _ ( ) {"],
    [2, "const _ = await _ ( __ ) ;"],
    [2, "return _ . _ ;"],
    [1, "}"],
    [0, "}"],
  ],
  [
    [0, "func __ ( ) -> _ {"],
    [1, "guard _ else { return }"],
    [1, "let _ : [ _ ] = [ ]"],
    [1, "await _ . __ ( _ )"],
    [0, "}"],
  ],
  [
    [0, "if ( _ && ! _ ) {"],
    [1, "_ . _ ( { _ : _ } ) ;"],
    [0, "} else {"],
    [1, "throw _ ( __ ) ;"],
    [0, "}"],
  ],
];

const art = document.querySelector("[data-vibe-code]");
const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
if (art) Promise.all([document.fonts.load(`800 16px "JetBrains Mono"`), document.fonts.ready]).finally(() => start(art));

function start(art) {
  const canvas = art.querySelector("canvas");
  const glowCanvas = document.createElement("canvas");
  art.prepend(glowCanvas);
  const paint = canvas.getContext("2d");
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  const halves = [...art.parentElement.querySelectorAll(".vibe-title-part")];
  let scene = null;
  let width = 0;
  let pullAt = null;
  let pulled = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let nextShiver = 0;
  let cycle = 0;
  let height = 0;
  let ratio = 1;
  let bleed = 0;

  const resize = () => {
    const box = art.getBoundingClientRect();
    if (Math.round(box.width) === width) return;
    width = Math.round(box.width);
    height = Math.round(box.height);
    bleed = settings.ground.bleed;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    Object.assign(glowCanvas.style, { left: `${-bleed}px`, top: `${-bleed}px`, width: `${width + bleed * 2}px`, height: `${height + bleed * 2}px` });
    glowCanvas.width = Math.round((width + bleed * 2) * ratio);
    glowCanvas.height = Math.round((height + bleed * 2) * ratio);
    place(performance.now());
    if (pulled || !moving) land(scene);
    draw(performance.now());
  };

  function place(now) {
    scene = lay(width, height, titleWidth(), 11 + cycle);
    drawGlows(scene);
    scene.bornAt = moving ? now : -1e9;
    art.parentElement.style.setProperty("--vibe-box", `${scene.box}px`);
    art.parentElement.style.setProperty("--vibe-round", `${scene.radius}px`);
    fitTheChecks(scene.box);
  }

  function fitTheChecks(boxWidth) {
    const list = document.querySelector(".build-after .checks");
    if (!list) return;
    if (!window.matchMedia("(min-width: 64rem)").matches) {
      list.style.removeProperty("--checks-size");
      list.style.removeProperty("width");
      return;
    }
    list.style.width = `${boxWidth}px`;
    const firstRow = [...list.children].slice(0, 3);
    for (let pass = 0; pass < 2; pass++) {
      const size = parseFloat(getComputedStyle(list).fontSize);
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const row = firstRow.reduce((sum, item) => sum + item.getBoundingClientRect().width, 0) + gap * (firstRow.length - 1);
      list.style.setProperty("--checks-size", `${(size * boxWidth * 0.998) / row}px`);
    }
  }

  function titleWidth() {
    if (!halves.length) return width * 0.4;
    return Math.max(...halves.map((half) => {
      half.style.whiteSpace = "nowrap";
      const words = document.createRange();
      words.selectNodeContents(half);
      const across = words.getBoundingClientRect().width;
      half.style.whiteSpace = "";
      return across;
    }));
  }

  function drawGlows(scene) {
    const pen = glowCanvas.getContext("2d");
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    pen.setTransform(ratio, 0, 0, ratio, bleed * ratio, bleed * ratio);
    const { soft } = settings.ground;
    const inset = Math.max(0, soft * 1.5 - bleed);
    const away = 100000;
    const glow = (box, [r, g, b, a]) => {
      pen.save();
      pen.shadowColor = `rgba(${r},${g},${b},${a})`;
      pen.shadowBlur = soft * ratio;
      pen.shadowOffsetX = away * ratio;
      pen.fillStyle = "#000000";
      pen.beginPath();
      pen.roundRect(box.x + inset - away, box.y + inset, box.w - inset * 2, box.h - inset * 2, scene.radius);
      pen.fill();
      pen.restore();
    };
    glow(scene.ringBox, settings.ground.heap);
    glow(scene.finish.box, settings.ground.finished);
  }

  function lay(width, height, boxWidth, seed) {
    const random = seeded(seed);
    const narrow = width < 640;
    const shown = blocks.slice(0, narrow ? settings.shownBlocks.narrow : settings.shownBlocks.wide);
    const { ring, words } = settings;
    paint.font = `800 100px ${font}`;
    const symbolUnits = (text) => (paint.measureText(text).width / 100) * settings.symbolSize;
    const lines = [];
    shown.forEach((block, blockIndex) => block.forEach(([indent, source]) => {
      const items = source.split(" ").map((token) => {
        if (token === "_") return { pill: true, base: words.short[0] + random() * words.short[1] };
        if (token === "__") return { pill: true, base: words.long[0] + random() * words.long[1] };
        return { pill: false, text: token, base: symbolUnits(token) };
      });
      lines.push({ indent, items, block: blockIndex, colour: looseColours[lines.length % looseColours.length] });
    }));
    const unitsAt = (line, widen) => line.items.reduce((sum, item) => sum + item.base * (item.pill ? widen : 1), 0) + settings.gap * (line.items.length - 1);

    const box = Math.min(boxWidth, (width * (1 - settings.leastLane)) / 2);
    const rows = lines.length * settings.rowStep - (settings.rowStep - 1) + (shown.length - 1) * settings.blockGap;
    const rims = ring.width + ring.round * 2;
    const roomFor = (pill) => box - rims * pill;
    const widestAt = (widen) => Math.max(...lines.map((line) => unitsAt(line, widen) + line.indent * settings.indent));
    let pill = Math.min(settings.pillMost, (height - 2) / (rows + rims));
    let widen = 1;
    for (let pass = 0; pass < 4; pass++) {
      let low = 0.1;
      let high = 8;
      for (let i = 0; i < 30; i++) {
        const middle = (low + high) / 2;
        if (widestAt(middle) * pill > roomFor(pill)) high = middle; else low = middle;
      }
      widen = low;
      if (widen >= settings.leastWiden) break;
      pill = roomFor(pill) / widestAt(settings.leastWiden);
    }
    const air = settings.airGap * pill;
    for (const line of lines) {
      for (const item of line.items) item.units = item.base * (item.pill ? widen : 1);
      line.units = unitsAt(line, widen);
      line.w = line.units * pill;
    }

    const stroke = ring.width * pill;
    const ringBox = { x: stroke / 2, y: 1 + stroke / 2, w: box - stroke, h: height - 2 - stroke };
    const finishBox = { ...ringBox, x: width - box + stroke / 2 };
    const inset = ring.round * pill;
    const heap = { x: ringBox.x + inset, y: ringBox.y + inset, w: ringBox.w - inset * 2, h: ringBox.h - inset * 2 };
    const asm = { x: finishBox.x + inset, w: finishBox.w - inset * 2, h: rows * pill };
    asm.y = (height - asm.h) / 2;
    const finish = { box: finishBox, left: width - box, stroke, radius: pill * ring.round };

    let y = asm.y;
    lines.forEach((line, index) => {
      if (index > 0 && line.block !== lines[index - 1].block) y += settings.blockGap * pill;
      line.home = { x: asm.x + line.indent * settings.indent * pill, y };
      y += settings.rowStep * pill;
    });

    const placed = [];
    let crowded = 0;
    for (const line of [...lines].sort((a, b) => b.w - a.w)) {
      let spot = null;
      for (let tries = 0; tries < 1200 && !spot; tries++) {
        const x = heap.x + random() * Math.max(0, heap.w - line.w);
        const y = heap.y + random() * Math.max(0, heap.h - pill);
        const tooClose = placed.some((other) => x < other.x + other.w + air && other.x < x + line.w + air && y < other.y + pill + air && other.y < y + pill + air);
        if (!tooClose) spot = { x, y };
      }
      if (!spot) crowded += 1;
      spot ??= { x: heap.x + random() * Math.max(0, heap.w - line.w), y: heap.y + random() * Math.max(0, heap.h - pill) };
      const angle = random() * Math.PI * 2;
      const speed = (settings.drift[0] + random() * (settings.drift[1] - settings.drift[0])) * pill;
      Object.assign(line, { x: spot.x, y: spot.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed });
      Object.assign(line, { state: "loose", pullStart: null, landAt: null, trip: null, stretch: 0, lastX: null, open: 0, shiverAt: -1e9 });
      placed.push({ x: spot.x, y: spot.y, w: line.w });
    }
    art.dataset.crowded = crowded;
    art.dataset.pill = pill.toFixed(1);
    return { lines, pill, air, box, heap, ringBox, laneRight: finish.left - air, asm, finish, radius: pill * ring.round };
  }

  function land(scene) {
    for (const line of scene.lines) Object.assign(line, { state: "landed", landAt: -1e9, stretch: 0, open: 0 });
  }

  function reset() {
    pullAt = null;
    pulled = false;
    width = 0;
    resize();
  }

  function tripFor(line, now) {
    const { pill } = scene;
    const laneX = scene.laneRight - line.w;
    const from = { x: line.x, y: line.y };
    const rowY = line.home.y;
    const dy = rowY - from.y;
    const down = Math.sign(dy) || 1;
    const r = Math.max(0, Math.min(settings.corner * pill, Math.abs(dy) / 2, laneX - from.x));
    const parts = [];
    const straight = (a, b) => parts.push({ a, b, length: Math.hypot(b.x - a.x, b.y - a.y) });
    const turn = (cx, cy, from, to) => parts.push({ cx, cy, from, to, length: Math.abs(to - from) * r });
    let end;
    if (Math.abs(dy) < 0.5) {
      end = { x: laneX, y: rowY };
      straight(from, end);
    } else {
      straight(from, { x: laneX - r, y: from.y });
      turn(laneX - r, from.y + down * r, down > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      straight({ x: laneX, y: from.y + down * r }, { x: laneX, y: rowY - down * r });
      turn(laneX + r, rowY - down * r, Math.PI, down > 0 ? Math.PI / 2 : Math.PI * 1.5);
      end = { x: laneX + r, y: rowY };
    }
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const findTime = Math.min(settings.findTime[1], Math.max(settings.findTime[0], length / settings.findSpeed));
    return { start: now, parts, length, end, findTime, shotStart: now + findTime + settings.aim, r };
  }

  function along(trip, distance) {
    for (const part of trip.parts) {
      if (distance > part.length && part !== trip.parts[trip.parts.length - 1]) { distance -= part.length; continue; }
      const t = part.length ? Math.min(1, distance / part.length) : 1;
      if (part.a) return { x: part.a.x + (part.b.x - part.a.x) * t, y: part.a.y + (part.b.y - part.a.y) * t };
      const angle = part.from + (part.to - part.from) * t;
      return { x: part.cx + Math.cos(angle) * trip.r, y: part.cy + Math.sin(angle) * trip.r };
    }
    return trip.end;
  }

  function drift(dt, now) {
    const loose = scene.lines.filter((line) => line.state === "loose");
    const { heap, pill, air } = scene;
    for (const line of loose) {
      line.x += line.vx * dt;
      line.y += line.vy * dt;
      if (line.x < heap.x) { line.x = heap.x; line.vx = Math.abs(line.vx); }
      if (line.x + line.w > heap.x + heap.w) { line.x = heap.x + heap.w - line.w; line.vx = -Math.abs(line.vx); }
      if (line.y < heap.y) { line.y = heap.y; line.vy = Math.abs(line.vy); }
      if (line.y + pill > heap.y + heap.h) { line.y = heap.y + heap.h - pill; line.vy = -Math.abs(line.vy); }
    }
    for (let i = 0; i < loose.length; i++) {
      for (let j = i + 1; j < loose.length; j++) {
        const a = loose[i];
        const b = loose[j];
        const overX = Math.min(a.x + a.w + air - b.x, b.x + b.w + air - a.x);
        const overY = Math.min(a.y + pill + air - b.y, b.y + pill + air - a.y);
        if (overX <= 0 || overY <= 0) continue;
        if (overX < overY) {
          const push = (overX / 2) * Math.sign(a.x + a.w / 2 - (b.x + b.w / 2) || 1);
          a.x += push; b.x -= push;
          if ((a.vx - b.vx) * Math.sign(push) < 0) [a.vx, b.vx] = [b.vx, a.vx];
        } else {
          const push = (overY / 2) * Math.sign(a.y - b.y || 1);
          a.y += push; b.y -= push;
          if ((a.vy - b.vy) * Math.sign(push) < 0) [a.vy, b.vy] = [b.vy, a.vy];
        }
      }
    }
    for (const line of loose) {
      const current = Math.hypot(line.vx, line.vy) || 1;
      const toward = 1 + (line.speed / current - 1) * Math.min(1, dt * 0.8);
      line.vx *= toward; line.vy *= toward;
    }
    if (now >= nextShiver && loose.length) {
      loose[Math.floor(Math.random() * loose.length)].shiverAt = now;
      nextShiver = now + settings.shiverEvery[0] + Math.random() * (settings.shiverEvery[1] - settings.shiverEvery[0]);
    }
  }

  function pose(line, now) {
    const { pill } = scene;
    if (line.state === "loose") {
      const t = (now - line.shiverAt) / settings.shiverTime;
      const shake = t >= 0 && t < 1 ? settings.shiverSize * pill * (1 - t) ** 2 : 0;
      return { x: line.x + shake * Math.sin(now * 0.19), y: line.y + shake * 0.5 * Math.sin(now * 0.23 + 1) };
    }
    if (line.state === "pulling") {
      const { trip } = line;
      const t = now - trip.start;
      if (t < trip.findTime) return along(trip, trip.length * easeInOut(t / trip.findTime, settings.findPower));
      if (now < trip.shotStart) return { ...trip.end };
      const p = Math.min(1, (now - trip.shotStart) / settings.shotTime);
      return { x: trip.end.x + (line.home.x - trip.end.x) * p ** settings.shotPower, y: line.home.y };
    }
    const since = (now - line.landAt) / 1000;
    const swing = since < 0.6 ? settings.settle * pill * Math.sin(settings.settleSpin * since) * Math.exp(-since / settings.settleFade) : 0;
    return { x: line.home.x + swing, y: line.home.y };
  }

  function step(now) {
    const dt = Math.min(50, now - (last || now)) / 1000;
    last = now;
    if (pullAt !== null && now >= pullAt && !pulled) {
      pulled = true;
      scene.lines.forEach((line, index) => { line.pullStart = now + index * settings.pullGap; });
    }
    drift(dt, now);
    for (const line of scene.lines) {
      if (line.state === "loose" && line.pullStart !== null && now >= line.pullStart) {
        line.state = "pulling";
        line.trip = tripFor(line, now);
      }
      if (line.state === "pulling" && now >= line.trip.shotStart + settings.shotTime) {
        line.state = "landed";
        line.landAt = line.trip.shotStart + settings.shotTime;
      }
    }
    if (pulled && scene.fadeAt === undefined && scene.lines.every((line) => line.state === "landed")) {
      scene.doneAt = Math.max(...scene.lines.map((line) => line.landAt));
      scene.fadeAt = scene.doneAt + settings.holdDone;
    }
    if (scene.fadeAt !== undefined && now >= scene.fadeAt + settings.fadeOut) {
      cycle += 1;
      place(now);
      pulled = false;
      pullAt = now + settings.fadeIn + settings.floatFor;
    }
    draw(now, dt);
    frame = visible ? requestAnimationFrame(step) : 0;
  }

  function draw(now, dt = 0) {
    if (!scene) return;
    const { pill, finish } = scene;
    const ease = (ms) => (dt ? 1 - Math.exp((-dt * 1000) / ms) : 1);
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.restore();

    const poses = new Map();
    for (const line of scene.lines) {
      const at = pose(line, now);
      const sideways = line.state === "pulling" && dt && line.lastX !== null ? (at.x - line.lastX) / dt : 0;
      line.lastX = line.state === "pulling" ? at.x : null;
      const target = Math.min(Math.abs(sideways) * settings.stretch, line.w * settings.stretchMost);
      line.stretch += (target - line.stretch) * ease(settings.stretchEase);
      at.dirX = sideways < 0 ? -1 : 1;
      at.from = at.x - (at.dirX > 0 ? line.stretch : 0);
      at.to = at.x + line.w + (at.dirX > 0 ? 0 : line.stretch);
      const crossing = line.state === "pulling" && now >= line.trip.start + line.trip.findTime - settings.finish.openLead;
      const wantsOpen = crossing && at.from < finish.left + finish.stroke + scene.air ? 1 : 0;
      line.open += (wantsOpen - line.open) * (dt ? ease(settings.finish.openEase) : 0);
      poses.set(line, at);
    }

    drawRing(now);
    drawFinish(now);

    const shimmerAt = (now % settings.looseShimmer) / settings.looseShimmer;
    const pulseAt = (now % settings.bluePulseEvery) / settings.bluePulseTime;
    const shimmer = { colour: "#ffffff", at: scene.heap.x - pill * 6 + shimmerAt * (scene.heap.w + pill * 12), width: pill * 5, strength: 0.34 };
    const pulse = (y) => (pulseAt < 1 ? { colour: settings.done.shine, at: scene.asm.x - pill * 8 + pulseAt * (scene.asm.w + pill * 16) - (y - scene.asm.y) * 0.5, width: pill * 7, strength: 0.85 } : null);
    const crossAt = finish.box.x;
    const fade = Math.min(1, (now - scene.bornAt) / settings.fadeIn)
      * (scene.fadeAt === undefined ? 1 : 1 - Math.min(1, Math.max(0, (now - scene.fadeAt) / settings.fadeOut)));
    const rank = { loose: 0, landed: 1, pulling: 2 };
    for (const line of [...scene.lines].sort((a, b) => rank[a.state] - rank[b.state])) {
      const at = poses.get(line);
      if (line.state === "landed" || at.from >= crossAt) drawLine(line, at, settings.done.colour, pulse(at.y), pill, fade);
      else if (at.to <= crossAt) drawLine(line, at, line.colour, line.state === "loose" ? shimmer : null, pill, fade);
      else {
        clipped(crossAt - 1e5, crossAt, () => drawLine(line, at, line.colour, null, pill, fade));
        clipped(crossAt, crossAt + 1e5, () => drawLine(line, at, settings.done.colour, null, pill, fade));
      }
    }
  }

  function clipped(from, to, drawing) {
    paint.save();
    paint.beginPath();
    paint.rect(from, -1e5, to - from, 2e5);
    paint.clip();
    drawing();
    paint.restore();
  }

  function pillsFor(loop) {
    const { ring } = settings;
    const { pill } = scene;
    const stroke = ring.width * pill;
    const step = (ring.dash + ring.gap) * pill + stroke;
    const count = Math.max(2, Math.round(loop / (step * 2)) * 2);
    const scale = loop / count / step;
    return { dash: ring.dash * pill * scale, step: step * scale, march: (ring.speed * pill) / 1000 };
  }

  function loopLength(box, r) {
    return 2 * (box.w + box.h) - 8 * r + 2 * Math.PI * r;
  }

  function drawRing(now) {
    const { ring } = settings;
    const { ringBox, pill, radius } = scene;
    const pills = pillsFor(loopLength(ringBox, radius));
    const path = new Path2D();
    path.roundRect(ringBox.x, ringBox.y, ringBox.w, ringBox.h, radius);
    paint.save();
    paint.globalAlpha = ring.opacity;
    paint.lineWidth = ring.width * pill;
    paint.lineCap = "round";
    paint.setLineDash([pills.dash, pills.step * ring.colours.length - pills.dash]);
    ring.colours.forEach((colour, turn) => {
      paint.strokeStyle = colour;
      paint.lineDashOffset = -now * pills.march + turn * pills.step;
      paint.stroke(path);
    });
    paint.restore();
  }

  function drawFinish(now) {
    const { finish, pill, air, lines } = scene;
    const { box, radius: r } = finish;
    const x = box.x;
    const top = box.y;
    const bottom = box.y + box.h;
    const right = box.x + box.w;
    const pills = pillsFor(loopLength(box, r));
    const cuts = lines
      .filter((line) => line.open > 0.01)
      .map((line) => {
        const middle = line.home.y + pill / 2;
        const reach = (pill / 2 + air * 0.6 + finish.stroke / 2) * line.open;
        return [Math.max(top + r, middle - reach), Math.min(bottom - r, middle + reach)];
      })
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const cut of cuts) {
      const last = merged[merged.length - 1];
      if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
      else merged.push([...cut]);
    }
    const along = (y) => y - (top + r);
    const roundTheBack = (path, from, to) => {
      path.moveTo(x, from);
      path.lineTo(x, bottom - r);
      path.arcTo(x, bottom, x + r, bottom, r);
      path.lineTo(right - r, bottom);
      path.arcTo(right, bottom, right, bottom - r, r);
      path.lineTo(right, top + r);
      path.arcTo(right, top, right - r, top, r);
      path.lineTo(x + r, top);
      path.arcTo(x, top, x, top + r, r);
      path.lineTo(x, to);
    };
    const pieces = [];
    if (!merged.length) pieces.push({ start: 0, build: (path) => roundTheBack(path, top + r, top + r) });
    else {
      const first = merged[0];
      const last = merged[merged.length - 1];
      pieces.push({ start: along(last[1]), build: (path) => roundTheBack(path, last[1], first[0]) });
      for (let i = 0; i < merged.length - 1; i++) {
        const [a, b] = [merged[i][1], merged[i + 1][0]];
        pieces.push({ start: along(a), build: (path) => { path.moveTo(x, a); path.lineTo(x, b); } });
      }
    }
    paint.save();
    paint.lineWidth = finish.stroke;
    paint.lineCap = "round";
    paint.lineJoin = "round";
    const { colours } = settings.ring;
    const { merge, mergeAfter } = settings.finish;
    const joining = scene.doneAt === undefined ? 0 : easeInOut(clamp((now - scene.doneAt - mergeAfter) / merge), 3);
    const parting = scene.fadeAt === undefined ? 0 : easeInOut(clamp((now - scene.fadeAt) / settings.fadeOut), 3);
    const whole = joining * (1 - parting);
    paint.globalAlpha = settings.ring.opacity + (settings.finish.joinedOpacity - settings.ring.opacity) * whole;
    const length = pills.dash + (pills.step * colours.length - pills.dash) * whole;
    if (whole >= 0.999) paint.setLineDash([]);
    else paint.setLineDash([length, pills.step * colours.length - length]);
    const march = now * pills.march;
    for (const piece of pieces) {
      const path = new Path2D();
      piece.build(path);
      colours.forEach((colour, turn) => {
        paint.strokeStyle = mix(colour, settings.done.colour, whole);
        paint.lineDashOffset = piece.start + march + turn * pills.step + (length - pills.dash) / 2;
        paint.stroke(path);
      });
    }
    paint.restore();
  }

  function drawLine(line, at, colour, band, pill, fade = 1) {
    const { w } = line;
    paint.save();
    paint.globalAlpha = fade;
    paint.translate(at.x, at.y);
    if (line.stretch > 0.5) {
      const scale = (w + line.stretch) / w;
      const anchor = at.dirX > 0 ? w : 0;
      paint.translate(anchor, 0);
      paint.scale(scale, 1);
      paint.translate(-anchor, 0);
      paint.globalAlpha = fade * (1 - 0.35 * Math.min(1, line.stretch / w));
    }
    const pills = new Path2D();
    const radius = pill * settings.pillRound;
    paint.font = `800 ${pill * settings.symbolSize}px ${font}`;
    paint.textBaseline = "middle";
    paint.fillStyle = colour;
    let x = 0;
    for (const item of line.items) {
      const size = item.units * pill;
      if (item.pill) pills.roundRect(x, 0, size, pill, radius);
      else paint.fillText(item.text, x, pill * 0.54);
      x += size + settings.gap * pill;
    }
    paint.fill(pills);
    if (band && band.strength > 0) {
      const left = band.at - at.x - band.width / 2;
      const glow = paint.createLinearGradient(left, 0, left + band.width, 0);
      const [r, g, b] = rgb(band.colour);
      glow.addColorStop(0, `rgba(${r},${g},${b},0)`);
      glow.addColorStop(0.5, `rgba(${r},${g},${b},${band.strength})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      paint.fillStyle = glow;
      paint.fill(pills);
    }
    paint.restore();
  }

  new ResizeObserver(() => requestAnimationFrame(resize)).observe(art);

  const stage = art.parentElement;
  const hold = stage.parentElement;
  const holdDrift = 0.045; // share of a screen it drifts up across the whole hold, the tree's
  let holdTop = 0;
  const holdAt = () => {
    const header = document.querySelector(".site-header")?.offsetHeight ?? 72;
    const tall = stage.offsetHeight;
    const screen = window.innerHeight;
    holdTop = tall + header + 32 <= screen ? Math.max(header + 16, (screen - tall) / 2) : screen - tall - 16;
    drifting();
  };
  let driftFrame = 0;
  function drifting() {
    driftFrame = 0;
    const box = hold.getBoundingClientRect();
    const span = box.height - stage.offsetHeight;
    const through = moving && span > 0 ? Math.min(1, Math.max(0, (holdTop - box.top) / span)) : 0;
    const top = `${(holdTop - holdDrift * through * window.innerHeight).toFixed(1)}px`;
    if (stage.style.getPropertyValue("--vibe-top") !== top) stage.style.setProperty("--vibe-top", top);
  }
  holdAt();
  new ResizeObserver(() => requestAnimationFrame(holdAt)).observe(stage);
  window.addEventListener("resize", holdAt);
  window.addEventListener("scroll", () => { if (!driftFrame) driftFrame = requestAnimationFrame(drifting); }, { passive: true });
  if (!moving) return;

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      if (pulled || pullAt !== null) reset();
      return;
    }
    if (entry.intersectionRatio >= 0.45 && pullAt === null && !pulled) pullAt = performance.now() + settings.floatFor;
    if (!frame) { last = 0; frame = requestAnimationFrame(step); }
  }, { threshold: [0, 0.45] }).observe(art);
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(t, power) {
  return t < 0.5 ? 2 ** (power - 1) * t ** power : 1 - (2 - 2 * t) ** power / 2;
}

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(from, to, amount) {
  if (amount <= 0) return from;
  const a = rgb(from);
  const b = rgb(to);
  return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * amount)).join(",")})`;
}

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
