import { runLaserEtch } from "./laser-etch-engine.js?v=8c972897";
import { canvasRatio } from "./canvas-ratio.js?v=8c972897";
import { palette, seeded, withRamp } from "./hero-graphic.js?v=8c972897";
import { scene } from "./scene-neural.js?v=8c972897";

const settings = {
  circles: 46, // fewer than the home page's 72: it fills a smaller space
  clearOfWords: 34, // page pixels kept clear round the words
  clearAbove: 1.35, // and above them, as a share of that: a line's box starts well above its letters'
  restartPause: 700, // ms between one cycle ending and the next starting
  word: "implementation", // the lasers fire from the dot of this word's last i
};

const hero = document.querySelector("[data-network-hero]");
if (hero) document.fonts.ready.then(() => start(hero));

function start(hero) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-network-art";
  canvas.setAttribute("aria-hidden", "true");
  hero.prepend(canvas);
  const title = hero.querySelector(".subpage-title");
  const words = hero.querySelector(".subpage-hero-body");
  const moving = window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.classList.contains("has-motion");
  let run = null;
  let restart = 0;
  let width = 0;

  function build() {
    const box = hero.getBoundingClientRect();
    width = Math.round(box.width);
    const ratio = canvasRatio(box.width, box.height);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
    const at = (r) => ({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top });

    const range = document.createRange();
    range.selectNodeContents(words);
    const lines = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map(at);
    const text = {
      left: Math.min(...lines.map((r) => r.left)), right: Math.max(...lines.map((r) => r.right)),
      top: Math.min(...lines.map((r) => r.top)), bottom: Math.max(...lines.map((r) => r.bottom)),
    };
    const container = at(words.getBoundingClientRect());
    const header = document.querySelector(".site-header")?.offsetHeight ?? 72;
    const gap = settings.clearOfWords;
    const region = { left: container.left, right: container.right, top: header + gap, bottom: text.bottom };
    const keepOut = lines.map((r) => ({ left: Math.min(r.left, container.left) - gap, right: r.right + gap, top: r.top - gap * settings.clearAbove, bottom: r.bottom + gap }));

    const dot = dotOfTheI();
    const from = { x: dot.x - box.left, y: dot.y - box.top };
    const layout = {
      origins: [from, from, from], pulseFrom: from, straight: true,
      text: { left: region.left, right: region.right }, top: region.top, bottom: region.bottom,
      keepOut, fill: "lattice", circleCount: settings.circles, random: seeded(17),
    };
    const drawing = scene.build(layout, palette());
    run?.stop();
    clearTimeout(restart);
    if (!drawing) return;
    run = runLaserEtch({
      canvas, palette: palette(), timing: withRamp(scene.timing), lasers: drawing.lasers,
      overlay: drawing.overlay, overlayLength: drawing.overlayLength, watch: hero,
      onFinished: () => { restart = setTimeout(() => run.start(), settings.restartPause); },
    });
    if (moving) run.start(); else run.finish({ still: true });
  }

  function dotOfTheI() {
    const pen = document.createElement("canvas").getContext("2d");
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(settings.word);
      if (at < 0) continue;
      const k = at + settings.word.lastIndexOf("i");
      const letter = document.createRange();
      letter.setStart(node, k);
      letter.setEnd(node, k + 1);
      const r = letter.getBoundingClientRect();
      const style = getComputedStyle(node.parentElement);
      pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = pen.measureText("i");
      const size = parseFloat(style.fontSize);
      const baseline = r.top + (ink.fontBoundingBoxAscent ?? r.height * 0.8);
      const middle = r.left + (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2 + (r.width - ink.width) / 2;
      return { x: middle, y: baseline - ink.actualBoundingBoxAscent + size * 0.06 };
    }
    const r = title.getBoundingClientRect();
    return { x: r.right, y: r.top };
  }

  build();
  new ResizeObserver(() => requestAnimationFrame(() => {
    if (Math.round(hero.getBoundingClientRect().width) !== width) build();
  })).observe(hero);
}
