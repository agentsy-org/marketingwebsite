const settings = {
  layers: 44,
  readFirst: 1600, // ms the filled word is left to be read once it is on screen
  layerGap: 30, // ms between one layer starting to blow away and the next
  drift: 2300, // ms each layer takes to blow away
  travel: [60, 260], // page pixels a layer travels to the right
  fall: [-28, 140], // and down; a few lift a little first, so it billows
  spin: 24, // degrees a layer may turn, either way
  spread: [1.15, 1.75], // how much a layer grows as it goes, so its specks spread apart into a cloud
  blur: 3.5, // page pixels a layer is blurred by the time it has gone
  leftAlone: 1200, // ms the faint white word is left on its own before the red one comes back
  comeBack: 900, // ms for the filled word to fade back in
  holdFilled: 1600, // ms the filled word holds before it goes again
};

const word = document.querySelector("[data-dust]");
const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
if (word && motion.matches && document.documentElement.classList.contains("has-motion")) start(word);

function measureWord(word, fill) {
  const style = getComputedStyle(fill);
  const box = fill.getBoundingClientRect();
  const home = word.getBoundingClientRect();
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  fill.append(probe);
  const baseline = probe.getBoundingClientRect().top - box.top;
  probe.remove();
  const fontSize = parseFloat(style.fontSize);
  const pad = Math.ceil(fontSize * 0.3); // room for letters that reach past their box
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.ceil(box.width + pad * 2);
  const height = Math.ceil(box.height + pad * 2);
  return { style, pad, ratio, width, height, baseline: pad + baseline, left: box.left - home.left - pad, top: box.top - home.top - pad };
}

function wordCanvas(frame) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(frame.width * frame.ratio);
  canvas.height = Math.round(frame.height * frame.ratio);
  canvas.style.width = `${frame.width}px`;
  canvas.style.height = `${frame.height}px`;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  paint.scale(frame.ratio, frame.ratio);
  const { style } = frame;
  paint.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if ("letterSpacing" in paint) paint.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  return { canvas, paint };
}

async function start(word) {
  const fill = word.querySelector(".dust-fill");
  const holder = word.querySelector(".dust-layers");
  await document.fonts.ready;
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const between = ([low, high]) => low + Math.random() * (high - low);
  let visible = false;
  let running = false;

  function buildLayers() {
    const frame = measureWord(word, fill);
    const { canvas: source, paint } = wordCanvas(frame);
    const { pad, width, height } = frame;
    paint.fillStyle = frame.style.color;
    paint.fillText(fill.textContent, pad, frame.baseline);
    const pixels = paint.getImageData(0, 0, source.width, source.height);
    const count = settings.layers;
    const layers = Array.from({ length: count }, () => new ImageData(source.width, source.height));
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      const x = (i / 4) % source.width;
      const k = Math.min(count - 1, Math.floor((count * (Math.random() + (2 * x) / source.width)) / 3));
      layers[k].data.set(pixels.data.subarray(i, i + 4), i);
    }
    holder.style.left = `${frame.left}px`;
    holder.style.top = `${frame.top}px`;
    holder.replaceChildren(...layers.map((data) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext("2d").putImageData(data, 0, 0);
      return canvas;
    }));
  }

  async function turn() {
    await wait(settings.readFirst);
    if (!visible) return;
    buildLayers();
    holder.hidden = false;
    fill.style.transition = "none";
    fill.style.opacity = "0";
    const flights = [...holder.children].map((layer, k) => {
      const angle = (Math.random() * 2 - 1) * settings.spin;
      return layer.animate([
        { transform: "none", opacity: 1, filter: "blur(0px)" },
        { offset: 0.45, opacity: 0.8 },
        { transform: `translate(${between(settings.travel)}px, ${between(settings.fall)}px) rotate(${angle}deg) scale(${between(settings.spread)})`, opacity: 0, filter: `blur(${settings.blur}px)` },
      ], { duration: settings.drift, delay: k * settings.layerGap, easing: "cubic-bezier(0.4, 0, 0.7, 1)", fill: "both" });
    });
    await Promise.all(flights.map((flight) => flight.finished));
    holder.hidden = true;
    holder.replaceChildren();
    await wait(settings.leftAlone);
    fill.style.transition = `opacity ${settings.comeBack}ms ease-in-out`;
    fill.style.opacity = "1";
    await wait(settings.comeBack + settings.holdFilled);
  }

  async function loop() {
    if (running) return;
    running = true;
    while (visible) await turn();
    running = false;
    fill.style.transition = "none";
    fill.style.opacity = "1";
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) loop();
  }, { threshold: 0.6 }).observe(word);
}
