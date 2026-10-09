import { runLaserEtch } from "./laser-etch-engine.js?v=8c972897";
import { canvasRatio } from "./canvas-ratio.js?v=8c972897";

const defaultScene = "bridge";
const settings = {
  restartPause: 500, // ms between one cycle ending and the next beginning
  menuRate: 0.12, // how fast the drawing runs while the menu is open, against normal
  phoneShape: 1.5, // on a phone the drawing is at most this many times wider than it is deep
  rampFrom: 0.12, // the starting speed, against full
  rampTime: 4000, // ms to reach full speed
  sceneryFade: 1400, // ms for what is there before the lasers (the bridge's land) to fade in
  missionLift: 0.2, // how far the mission line sits above the road, in ems
  afterTyping: 750, // ms, a beat between the headline finishing and the bridge starting
  wordsLeaveFrom: 0.2, // screens of scroll before the hero's words start to fade, so the next screen is well on
  wordsLeave: 0.45, // and the screens of scroll they fade over
  palette: { hot: [255, 255, 255], fillAlpha: 0.22, lineAlpha: 1, lineWidth: 1.1, sweepAlpha: 0.1, coverTint: 0.32 },
};

const root = document.documentElement;
const stage = document.querySelector(".hero-stage");
const title = stage?.querySelector(".hero-title");
if (stage && title) setUp();

async function setUp() {
  const name = new URLSearchParams(location.search).get("scene") || defaultScene;
  const { scene } = await import(`./scene-${name.replace(/[^a-z-]/g, "")}.js?v=8c972897`);
  const canvas = document.createElement("canvas");
  canvas.className = "hero-graphic";
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.scene = name;
  stage.prepend(canvas);
  const mission = stage.querySelector(".hero-mission");
  let run = null;
  let missionAt = Infinity; // when the mission line comes in, on the drawing's clock
  let width = 0;
  let restart = 0;

  const begin = (animate) => {
    run?.stop();
    clearTimeout(restart);
    const colours = palette();
    mission?.classList.toggle("is-on-scene", Boolean(scene.placesMission));
    const layout = measure(canvas, scene);
    const drawing = layout && scene.build(layout, colours);
    if (!drawing) return;
    placeMission(scene.placesMission ? drawing.missionSpot : null);
    run = runLaserEtch({
      canvas, palette: colours, watch: stage,
      timing: withRamp(scene.timing),
      lasers: drawing.lasers, scenery: drawing.scenery ?? [],
      overlay: drawing.overlay ?? null, overlayLength: drawing.overlayLength ?? Infinity,
      onFinished: () => { restart = setTimeout(() => run.start(), settings.restartPause); },
      onTick: (time) => { if (time >= missionAt) showMission(); },
      onLasersStop: showMission,
      originShift: () => ({ x: 0, y: -window.scrollY }),
    });
    canvas.dataset.lasersStopMs = Math.round(run.lasersStop);
    run.setPace(paceFor(run.lasersStop, scene.desktopLasersStop));
    const missionCuts = run.cuts.filter((cut) => cut.shape.phase === scene.missionWith && cut.shape.length >= 1);
    missionAt = missionCuts.length ? Math.min(...missionCuts.map((cut) => cut.start)) : run.lasersStop;
    canvas.dataset.missionAtMs = Math.round(missionAt);
    run.setRate(menuIsOpen() ? settings.menuRate : 1);
    if (animate) run.start(); else run.finish({ still: !root.classList.contains("has-motion") });
    if (!animate) showMission();
  };

  function showMission() {
    mission?.classList.add("is-drawn");
    canvas.classList.add("is-cleared");
  }
  setTimeout(showMission, 12000);

  const menu = document.querySelector(".nav-menu");
  const menuIsOpen = () => Boolean(menu?.open);
  if (menu) {
    new MutationObserver(() => run?.setRate(menuIsOpen() ? settings.menuRate : 1))
      .observe(menu, { attributes: true, attributeFilter: ["open"] });
  }

  await document.fonts.ready;
  width = window.innerWidth;
  if (!root.classList.contains("has-motion")) {
    begin(false);
  } else {
    const fire = () => setTimeout(() => begin(true), settings.afterTyping);
    if (!root.classList.contains("is-typing")) fire();
    else {
      const watch = new MutationObserver(() => {
        if (!root.classList.contains("is-typing")) { watch.disconnect(); fire(); }
      });
      watch.observe(root, { attributes: true, attributeFilter: ["class"] });
    }
  }

  let coverQueued = false;
  let titleSize = null;
  let coverGone = false;
  let wordsFade = "";
  const heroText = stage.querySelector(".hero-text");
  const cover = () => {
    coverQueued = false;
    const box = title.getBoundingClientRect();
    titleSize ??= parseFloat(getComputedStyle(title).fontSize);
    const capTop = box.top + titleSize * 0.12;
    const gone = capTop < 0;
    if (gone !== coverGone) { coverGone = gone; canvas.style.visibility = gone ? "hidden" : ""; }
    if (!gone) canvas.style.setProperty("--cover", `${Math.round(capTop)}px`);
    if (root.classList.contains("has-motion") && heroText) {
      const fade = Math.min(Math.max((window.scrollY / window.innerHeight - settings.wordsLeaveFrom) / settings.wordsLeave, 0), 1);
      const opacity = (1 - fade * fade * (3 - 2 * fade)).toFixed(3);
      if (opacity !== wordsFade) { wordsFade = opacity; heroText.style.opacity = opacity; }
    }
    const words = mission?.classList.contains("is-on-scene") ? mission.getBoundingClientRect() : null;
    canvas.classList.toggle("has-clearing", Boolean(words));
    if (words) {
      canvas.style.setProperty("--clear-x", `${Math.round(words.left + words.width / 2)}px`);
      canvas.style.setProperty("--clear-y", `${Math.round(words.top + words.height / 2)}px`);
      canvas.style.setProperty("--clear-w", `${Math.round(words.width * 0.62)}px`);
      canvas.style.setProperty("--clear-h", `${Math.round(words.height * 0.95)}px`);
    }
  };

  function placeMission(spot) {
    if (!mission) return;
    mission.classList.toggle("is-on-scene", Boolean(spot));
    if (spot) {
      const stageTop = stage.getBoundingClientRect().top + window.scrollY;
      const lift = parseFloat(getComputedStyle(mission).fontSize) * settings.missionLift;
      mission.style.setProperty("--mission-bottom", `${Math.round(spot.y - stageTop - lift)}px`);
      mission.style.setProperty("--mission-x", `${Math.round(spot.x)}px`);
    }
    cover();
  }
  const queueCover = () => { if (!coverQueued) { coverQueued = true; requestAnimationFrame(cover); } };
  window.addEventListener("scroll", queueCover, { passive: true });
  window.addEventListener("resize", () => { titleSize = null; queueCover(); });
  cover();

  window.addEventListener("resize", () => {
    if (!run) return;
    if (window.innerWidth !== width) { width = window.innerWidth; begin(false); }
  });
}

function sizeCanvas(canvas) {
  const tall = largeViewportHeight();
  const ratio = canvasRatio(window.innerWidth, tall);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(tall * ratio);
  canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
}

export function palette() {
  const channels = (name) => {
    const hex = getComputedStyle(root).getPropertyValue(name).trim().replace("#", "");
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  };
  return { ...settings.palette, violet: channels("--color-violet"), ground: channels("--color-ground") };
}

function measure(canvas, scene) {
  sizeCanvas(canvas);
  const area = stage.getBoundingClientRect();
  const letters = findTheAI();
  const text = headlineBounds();
  if (!letters || !text) return null;
  const top = window.scrollY;
  const fontSize = parseFloat(getComputedStyle(title).fontSize);
  const bottom = letters.top + top - (scene.gapAboveLetters ?? 0.22) * fontSize;
  const phone = window.matchMedia("(max-width: 639px)").matches;
  const fullTop = area.top + top + Math.max(area.height * 0.04, 12);
  return {
    origins: letters.tips.map((tip) => ({ x: tip.x, y: tip.y - 2 + top })),
    extraOrigins: letters.extra.map((point) => ({ x: point.x, y: point.y + top })),
    text,
    top: phone ? Math.max(fullTop, bottom - window.innerWidth / settings.phoneShape) : fullTop,
    bottom,
    screen: { width: window.innerWidth, height: window.innerHeight },
    fontSize,
    random: seeded(scene.seed ?? 11),
  };
}

function findTheAI() {
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest(".visually-hidden, .type-rest")) continue;
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
      return {
        left: box.left - ink.actualBoundingBoxLeft,
        right: box.left + ink.actualBoundingBoxRight,
        top: baseline - ink.actualBoundingBoxAscent,
        baseline,
      };
    };
    const a = letter(0, "A");
    const i = letter(1, "I");
    const middle = (a.left + a.right) / 2;
    const halfway = (a.top + a.baseline) / 2;
    return {
      top: Math.min(a.top, i.top),
      extra: [
        { x: (middle + a.left) / 2, y: halfway },
        { x: (middle + a.right) / 2, y: halfway },
      ],
      tips: [
        { x: (a.left + a.right) / 2, y: a.top },
        { x: i.left, y: i.top },
        { x: i.right, y: i.top },
      ],
    };
  }
  return null;
}

function headlineBounds() {
  const boxes = [];
  const chevron = title.querySelector(".prompt-chevron");
  if (chevron) boxes.push(chevron.getBoundingClientRect());
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.data.trim() || node.parentElement.closest(".visually-hidden, .type-rest")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    boxes.push(...range.getClientRects());
  }
  const lines = boxes.filter((r) => r.width > 4 && r.height > 12);
  if (!lines.length) return null;
  return { left: Math.min(...lines.map((r) => r.left)), right: Math.max(...lines.map((r) => r.right)) };
}

export function withRamp(timing) {
  return { rampFrom: settings.rampFrom, rampTime: settings.rampTime, sceneryFade: settings.sceneryFade, ...timing };
}

export const menuRate = () => settings.menuRate;

export const paceFor = (lasersStop, desktopLasersStop) =>
  desktopLasersStop ? Math.min(Math.max(lasersStop / desktopLasersStop, 0.4), 1) : 1;

export function largeViewportHeight() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.max(height || 0, window.innerHeight);
}

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
