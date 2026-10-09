import { runLaserEtch } from "./laser-etch-engine.js?v=8c972897";
import { canvasRatio } from "./canvas-ratio.js?v=8c972897";
import { palette, seeded, withRamp, menuRate, paceFor } from "./hero-graphic.js?v=8c972897";

const settings = {
  gapBelowWords: 0.05, // clear space between the words and the drawing, as a share of the screen
  marginBelow: 0.06, // and between the drawing's ground and the bottom of the screen
  startAt: 0.12, // starts once the chunk's top is this far down the screen (a share of it): its screen all but in place
  inPlace: 0.1, // a drawing that grows up from its foot (the tree) starts only once its screen is in place: its top within this share of the screen of the top
  restartPause: 500, // ms between one cycle ending and the next beginning
  crownLead: 1300, // ms before the last leaf is drawn that the line above starts to fade in
  stackGap: 10, // page pixels between the lines of the stack
  clearPad: [40, 26], // page pixels the tree is cleared beyond each line of the stack: sideways, up and down
  clearSoft: 14, // page pixels of blur on the clearing's edge
  stackAfter: 300, // ms after the lasers stop that the first line starts to rise
  stackStagger: 560, // ms between one line starting to rise and the next: relaxed, one then the next
};

const root = document.documentElement;
for (const chunk of document.querySelectorAll(".chunk[data-scene]")) mount(chunk);

async function mount(chunk) {
  const name = chunk.dataset.scene.replace(/[^a-z-]/g, "");
  const { scene } = await import(`./scene-${name}.js?v=8c972897`);
  const stage = chunk.querySelector(".chunk-stage");
  const words = chunk.querySelector(".chunk-body");
  const title = chunk.querySelector(".chunk-title, [data-crown-line]");
  const crownLine = chunk.querySelector("[data-crown-line]");
  const originWords = chunk.dataset.origin === "foot" ? chunk.querySelector("[data-origin-words]") : null;
  const canvas = document.createElement("canvas");
  canvas.className = "chunk-art";
  canvas.setAttribute("aria-hidden", "true");
  stage.prepend(canvas);
  const moving = root.classList.contains("has-motion");
  const list = chunk.querySelector("[data-stack]");
  const steps = list ? [...list.children] : [];
  const ladder = document.createElement("div");
  ladder.className = "chunk-ladder";
  let reach = [];
  let extent = null;
  let crownAt = 0;
  let shown = [];
  let run = null;
  let restart = 0;
  let started = false;
  let width = 0;

  let prepared = false;
  const prepare = () => {
    run?.stop();
    clearTimeout(restart);
    prepared = false;
    placeList();
    const layout = measure(canvas, stage, words, title, scene, originWords);
    const colours = palette();
    const drawing = layout && scene.build(layout, colours);
    if (!drawing) return;
    run = runLaserEtch({
      canvas, palette: colours, timing: withRamp(scene.timing), watch: stage,
      lasers: drawing.lasers, scenery: drawing.scenery ?? [],
      overlay: drawing.overlay ?? null, overlayLength: drawing.overlayLength ?? Infinity,
      onFinished: () => { restart = setTimeout(() => run.start(), settings.restartPause); },
      onTick: showSteps,
      onLasersStop: placeStack,
      hideLasers: Boolean(scene.hideLasers),
      undraw: scene.undraw ?? null,
    });
    extent = drawing.extent ?? null;
    placeStack();
    const lastDrawn = Math.max(0, ...run.cuts.filter((cut) => cut.shape.length >= 1).map((cut) => cut.end));
    crownAt = lastDrawn - settings.crownLead;
    shown = steps.map(() => null);
    run.setRate(menu?.open ? menuRate() : 1);
    canvas.dataset.lasersStopMs = Math.round(run.lasersStop);
    run.setPace(paceFor(run.lasersStop, scene.desktopLasersStop));
    prepared = true;
  };
  const warmUp = () => {
    if (!run || started) return;
    run.redraw();
    const paint = canvas.getContext("2d");
    paint.getImageData(0, 0, 1, 1);
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.restore();
  };
  const begin = (animate) => {
    if (!prepared || !animate) prepare();
    if (!run) return;
    if (animate) run.start(); else { run.finish({ still: !moving }); showSteps(Infinity); }
  };

  function placeList() {
    if (!list) return;
    if (!ladder.isConnected) stage.append(ladder);
    ladder.append(list);
    list.classList.add("is-stacked");
  }

  let clearing = null;
  function showClearing(hole) {
    if (hole === clearing) return;
    clearing = hole;
    const image = new Image();
    image.src = hole.slice(5, -2); // the data inside url("...")
    image.decode().catch(() => {}).then(() => {
      if (clearing !== hole) return;
      canvas.style.setProperty("--stack-hole", hole);
      canvas.classList.add("has-stack");
    });
  }

  function placeStack() {
    if (!list || !extent || !run) return;
    const places = setStack(extent);
    reach = steps.map((_, k) => run.lasersStop + settings.stackAfter + places[k] * settings.stackStagger);
  }

  function setStack(extent) {
    for (const step of steps) step.style.transition = "none";
    const boxes = steps.map((step) => ({ step, box: step.getBoundingClientRect() }));
    const order = [...boxes].sort((a, b) => a.box.width - b.box.width);
    const total = order.reduce((sum, { box }) => sum + box.height, 0) + settings.stackGap * (order.length - 1);
    const canopy = extent.canopy ?? { left: extent.centerX, right: extent.centerX, top: extent.topY, bottom: extent.groundY };
    const middle = canopy.middle ?? { x: (canopy.left + canopy.right) / 2, y: (canopy.top + canopy.bottom) / 2 };
    const middleX = middle.x;
    let top = middle.y - total / 2;
    const places = new Map();
    const lines = [];
    order.forEach(({ step, box }, place) => {
      step.style.left = `${middleX - box.width / 2}px`;
      step.style.top = `${top}px`;
      step.style.setProperty("--rise", `${Math.max(extent.groundY - box.height - top, 0)}px`);
      places.set(step, place);
      lines.push({ left: middleX - box.width / 2, top, width: box.width, height: box.height });
      top += box.height + settings.stackGap;
    });
    showClearing(clearingBehind(lines, canvas.clientWidth, canvas.clientHeight));
    list.getBoundingClientRect(); // takes the new places now, before transitions come back on
    for (const step of steps) step.style.transition = "";
    return steps.map((step) => places.get(step));
  }

  const foot = chunk.querySelector(".chunk-foot");
  foot?.classList.add("is-shown");
  function showSteps(time) {
    const fading = time !== Infinity && time >= run.outroStart;
    crownLine?.classList.toggle("is-shown", time >= crownAt && !fading);
    canvas.classList.toggle("is-cleared", steps.length > 0 && time >= Math.min(...reach) && !fading);
    steps.forEach((step, k) => {
      const on = time >= (reach[k] ?? 0) && (time === Infinity || time < run.outroStart);
      if (shown[k] === on) return;
      shown[k] = on;
      step.classList.toggle("is-shown", on);
    });
  }

  const menu = document.querySelector(".nav-menu");
  if (menu) {
    new MutationObserver(() => run?.setRate(menu.open ? menuRate() : 1))
      .observe(menu, { attributes: true, attributeFilter: ["open"] });
  }

  await document.fonts.ready;
  width = window.innerWidth;
  if (!moving) {
    started = true;
    begin(false);
  } else {
    const idle = window.requestIdleCallback ?? ((work) => setTimeout(work, 200));
    idle(() => { if (!started) { prepare(); warmUp(); } });
    const check = () => {
      if (started) return;
      const box = chunk.getBoundingClientRect();
      const screen = window.innerHeight;
      const ready = chunk.dataset.place === "below"
        ? Math.abs(stage.getBoundingClientRect().top) <= screen * settings.inPlace
        : box.top <= screen * settings.startAt;
      if (!ready) return;
      started = true;
      window.removeEventListener("scroll", check);
      begin(true);
    };
    const near = new IntersectionObserver(([entry]) => {
      if (started) { near.disconnect(); return; }
      if (entry.isIntersecting) { window.addEventListener("scroll", check, { passive: true }); check(); }
      else window.removeEventListener("scroll", check);
    }, { rootMargin: "50% 0px" });
    near.observe(chunk);
  }

  window.addEventListener("resize", () => {
    if (!started || window.innerWidth === width) return;
    width = window.innerWidth;
    begin(false);
  });
}

function measure(canvas, stage, words, title, scene, originWords) {
  const area = { ...stage.getBoundingClientRect().toJSON() };
  const ratio = canvasRatio(area.width, area.height);
  canvas.width = Math.round(area.width * ratio);
  canvas.height = Math.round(area.height * ratio);
  canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);

  const origin = canvas.getBoundingClientRect();
  area.x = origin.left;
  area.y = origin.top;
  const tips = scene.around ? null : originWords ? topOfTheWords(originWords) : feetOfTheAI(title);
  const titleBox = (originWords ?? title).getBoundingClientRect();
  const wordsBottom = words.getBoundingClientRect().bottom;
  const parts = [...words.children].map((part) => part.getBoundingClientRect()).filter((r) => r.width && r.height);
  const box = {
    left: Math.min(...parts.map((r) => r.left)) - area.x, right: Math.max(...parts.map((r) => r.right)) - area.x,
    top: Math.min(...parts.map((r) => r.top)) - area.y, bottom: Math.max(...parts.map((r) => r.bottom)) - area.y,
  };
  if (!tips && !scene.around) return null;
  const footBox = stage.querySelector(".chunk-foot")?.getBoundingClientRect();
  const footTop = footBox ? footBox.top : Infinity;

  const at = (p) => ({ x: p.x - area.x, y: p.y - area.y });
  const middle = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  return {
    origins: tips ? tips.map(at) : [middle, middle, middle],
    extraOrigins: tips?.extra ? tips.extra.map(at) : undefined,
    words: box,
    text: { left: titleBox.left - area.x, right: titleBox.right - area.x },
    top: wordsBottom - area.y + area.height * settings.gapBelowWords,
    bottom: Math.min(area.height * (1 - settings.marginBelow), footTop - area.y - 18),
    screen: { width: area.width, height: area.height },
    fontSize: parseFloat(getComputedStyle(title).fontSize),
    random: seeded(scene.seed ?? 11),
  };
}

function clearingBehind(lines, width, height) {
  const [padX, padY] = settings.clearPad;
  const n = (value) => Math.round(value * 10) / 10;
  const holes = lines.map((line) => `<rect x="${n(line.left - padX)}" y="${n(line.top - padY)}" width="${n(line.width + padX * 2)}" height="${n(line.height + padY * 2)}" rx="${n(line.height / 2 + padY)}"/>`).join("");
  const all = `x="0" y="0" width="${width}" height="${height}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<filter id="soft" filterUnits="userSpaceOnUse" ${all}><feGaussianBlur stdDeviation="${settings.clearSoft}"/></filter>`
    + `<mask id="holes" maskUnits="userSpaceOnUse" ${all}><rect ${all} fill="#fff"/><g fill="#000" filter="url(#soft)">${holes}</g></mask>`
    + `<rect ${all} mask="url(#holes)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function feetOfTheAI(title) {
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const at = node.data.search(/\bAI\b/);
    if (at < 0) continue;
    const style = getComputedStyle(title);
    const measureText = document.createElement("canvas").getContext("2d");
    measureText.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const letter = (offset, glyph) => {
      const range = document.createRange();
      range.setStart(node, at + offset);
      range.setEnd(node, at + offset + 1);
      const box = range.getBoundingClientRect();
      const ink = measureText.measureText(glyph);
      const baseline = box.top + (ink.fontBoundingBoxAscent ?? box.height * 0.78);
      return { left: box.left - ink.actualBoundingBoxLeft, right: box.left + ink.actualBoundingBoxRight, bottom: baseline + 2 };
    };
    const a = letter(0, "A");
    const i = letter(1, "I");
    const tips = [
      { x: (a.left + a.right) / 2, y: a.bottom },
      { x: i.left, y: i.bottom },
      { x: i.right, y: i.bottom },
    ];
    tips.extra = [{ x: a.left + 3, y: a.bottom }, { x: a.right - 3, y: a.bottom }];
    return tips;
  }
  return null;
}

function topOfTheWords(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const box = range.getBoundingClientRect();
  const fontSize = parseFloat(getComputedStyle(element).fontSize);
  const y = box.top + fontSize * 0.22;
  const at = (share) => ({ x: box.left + box.width * share, y });
  const tips = [at(0.3), at(0.7), at(0.88)];
  tips.extra = [at(0.12), at(0.5)];
  return tips;
}
