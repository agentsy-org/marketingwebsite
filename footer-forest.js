import { runLaserEtch } from "./laser-etch-engine.js?v=8c972897";
import { palette, seeded, withRamp } from "./hero-graphic.js?v=8c972897";
import { scene as tree } from "./scene-tree.js?v=8c972897";

const settings = {
  left: [{ at: 0.1, tall: 1.12 }, { at: 0.5, tall: 1.28 }, { at: 0.9, tall: 1.04 }],
  under: [{ at: 0.28, tall: 0.86 }, { at: 0.74, tall: 0.96 }],
  phone: [{ at: 0.08, tall: 1 }, { at: 0.3, tall: 0.86 }, { at: 0.52, tall: 1 }, { at: 0.74, tall: 0.78 }, { at: 0.93, tall: 0.9 }],
  onPill: [{ at: -0.6, tall: 0.86 }, { at: 0, tall: 1 }, { at: 0.6, tall: 0.92 }],
  above: 28, // page pixels the canvas reaches above the tallest tree's top, for its leaves
  crownWidth: 0.62, // how far a crown may reach either side of its trunk, as a share of its tree's height
  scale: 0.56, // how much smaller than the tree scene's own size the trees are drawn
  phoneScale: 0.46,
  startAt: 0.5, // how much of the canvas must be on screen before they grow
  pace: 2.4, // how much faster than the home page's tree they grow: they are small, and come last
  rampTime: 700, // ms to reach full speed from a slow start (the big tree takes 4000)
};

const canvas = document.querySelector("[data-forest]");
if (canvas) start(canvas);

function start(canvas) {
  const section = canvas.closest("section");
  const pill = section.querySelector(".final-pill");
  const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
  let run = null;
  let grown = false; // they have been seen and set growing; from then on they stay grown
  let width = 0;

  function build() {
    const box = section.getBoundingClientRect();
    const line = box.bottom; // the footer's line, on screen
    const resting = (element) => {
      let y = 0;
      for (let node = element; node && node !== section; node = node.offsetParent) y += node.offsetTop;
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, height: element.offsetHeight, top: box.top + y, bottom: box.top + y + element.offsetHeight };
    };
    const pillBox = resting(pill);
    const content = section.querySelector(".container").getBoundingClientRect();
    const wide = !window.matchMedia("(max-width: 639px)").matches;
    const upToPill = line - pillBox.top;
    const underPill = line - pillBox.bottom;
    const prompts = section.querySelector(".prompts");
    const words = prompts ? resting(prompts) : null;
    const abovePill = words ? pillBox.top - words.bottom : 0;
    const spots = wide
      ? [
        ...settings.left.map(({ at, tall }) => {
          const height = upToPill * tall;
          const reach = height * settings.crownWidth;
          return { x: lerp(content.left + reach, pillBox.left - reach, at), height, ground: line };
        }),
        ...settings.under.map(({ at, tall }) => ({ x: pillBox.left + pillBox.width * at, height: underPill * tall, ground: line })),
      ]
      : [
        ...settings.phone.map(({ at, tall }) => {
          const height = (underPill - 24) * 0.82 * tall;
          const reach = height * settings.crownWidth * 0.8;
          return { x: lerp(content.left + reach, content.right - reach, at), height, ground: line };
        }),
        ...settings.onPill.map(({ at, tall }) => ({
          x: pillBox.left + pillBox.width / 2 + (at * (pillBox.width - pillBox.height)) / 2,
          height: abovePill * 0.92 * tall, ground: pillBox.top,
        })),
      ];
    const scale = Math.min(wide ? settings.scale : settings.phoneScale, Math.min(...spots.map((spot) => spot.height)) / 170);
    const high = line - Math.min(...spots.map((spot) => spot.ground - spot.height)) + settings.above;
    canvas.style.height = `${high}px`;
    width = Math.round(box.width);
    const ratio = Math.max(Math.min(window.devicePixelRatio || 1, 2), 1 / scale);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(high * ratio);
    canvas.getContext("2d").setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);

    const top = line - high;
    const across = box.width / scale;
    const drawings = spots.map((spot, k) => {
      const height = spot.height / scale;
      const ground = (spot.ground - top) / scale;
      const x = (spot.x - box.left) / scale;
      const foot = { x, y: ground + 8 };
      return tree.build({
        origins: [foot, foot, foot], words: {}, text: { left: x - 1, right: x + 1 },
        top: ground - height, bottom: ground, screen: { width: across, height: ground + 40 },
        crownRoom: height * settings.crownWidth, fontSize: 16, random: seeded(31 + k * 17), forever: true,
      }, palette());
    }).filter(Boolean);
    canvas.dataset.trees = `${drawings.length} of ${spots.length}: ${spots.map((spot) => Math.round(spot.height)).join(" ")}`; // for checks
    canvas.dataset.pillFromLine = Math.round(line - pillBox.top); // for checks: where the pill was, built
    const overlays = drawings.map((drawing) => drawing.overlay).filter(Boolean);
    const overlay = (context, clock, options) => { for (const each of overlays) each(context, clock, options); };
    const colours = { ...palette(), lineWidth: palette().lineWidth / scale };
    run?.stop();
    run = runLaserEtch({
      canvas, palette: colours, timing: { ...withRamp(tree.timing), rampTime: settings.rampTime }, hideLasers: true,
      lasers: drawings.flatMap((drawing) => drawing.lasers),
      overlay: moving ? overlay : null, overlayLength: Infinity,
      onLasersStop: () => setTimeout(tellGrown, 400), // once the last leaves have cooled
    });
    run.setPace(settings.pace);
    if (grown || !moving) { run.finish({ still: !moving }); tellGrown(); }
    else if (seen) grow();
  }

  let told = false;
  function tellGrown() {
    if (told) return;
    told = true;
    window.dispatchEvent(new Event("forest-grown"));
  }

  let seen = false;
  function grow() {
    if (grown || !run) return;
    grown = true;
    run.start();
  }
  new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio < settings.startAt) return;
    seen = true;
    grow();
  }, { threshold: [0, settings.startAt] }).observe(canvas);

  document.fonts.ready.then(build);
  new ResizeObserver(() => requestAnimationFrame(() => {
    if (Math.round(section.getBoundingClientRect().width) !== width) build();
  })).observe(section);
}

const lerp = (a, b, t) => a + (b - a) * t;
