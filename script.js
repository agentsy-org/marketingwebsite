(() => {
  const root = document.documentElement;
  if (!root.classList.contains("has-motion")) return;

  typeTheHeadline();
  strikeTheOldWays();
  fadeTheVibeDrawingForItsSumUp();

  async function typeTheHeadline() {
    const words = document.querySelector("[data-type]");
    const cursor = document.querySelector(".hero-title > .cursor");
    const title = document.querySelector(".hero-title");
    if (!words || !cursor) { root.classList.remove("is-typing"); return; }
    const face = `${getComputedStyle(words).fontSize} ${getComputedStyle(words).fontFamily}`;
    await Promise.race([document.fonts.load(face), new Promise((done) => setTimeout(done, 2500))]);
    const finishedWidth = words.getBoundingClientRect().width;
    const oneLine = words.getClientRects().length === 1;

    const text = words.textContent;
    const spoken = document.createElement("span");
    spoken.className = "visually-hidden";
    spoken.textContent = text;
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");

    const wordParts = text.split(" ").map((word, index) => {
      if (index > 0) shown.append(" ");
      const wordSpan = document.createElement("span");
      wordSpan.className = "word";
      const typed = document.createTextNode("");
      const rest = document.createElement("span");
      rest.className = "type-rest";
      rest.textContent = word;
      wordSpan.append(typed, rest);
      shown.append(wordSpan);
      return { word, wordSpan, typed, rest };
    });

    words.replaceChildren(spoken, shown);
    if (oneLine) Object.assign(shown.style, { display: "inline-block", width: `${finishedWidth}px`, textAlign: "left", whiteSpace: "nowrap" });
    const first = wordParts[0];
    first.wordSpan.insertBefore(cursor, first.rest);
    words.classList.add("is-ready");
    title.classList.add("is-ready");

    const step = parseFloat(getComputedStyle(root).getPropertyValue("--type-char")) || 70;
    let wordIndex = 0;
    let charIndex = 0;

    const typeNext = () => {
      const part = wordParts[wordIndex];
      charIndex += 1;
      part.typed.data = part.word.slice(0, charIndex);
      part.rest.textContent = part.word.slice(charIndex);
      part.wordSpan.insertBefore(cursor, part.rest);

      if (charIndex < part.word.length) {
        setTimeout(typeNext, step * (0.7 + Math.random() * 0.6));
        return;
      }
      wordIndex += 1;
      charIndex = 0;
      if (wordIndex === wordParts.length) {
        shown.removeAttribute("style");
        root.classList.remove("is-typing");
        return;
      }
      setTimeout(() => {
        const next = wordParts[wordIndex];
        next.wordSpan.insertBefore(cursor, next.rest);
        setTimeout(typeNext, step);
      }, step * 1.4);
    };
    setTimeout(typeNext, step * 5);
  }

  function fadeTheVibeDrawingForItsSumUp() {
    const stage = document.querySelector(".vibe-stage");
    const pill = document.querySelector(".vibe-close-body");
    if (!stage || !pill || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const faintest = 0.45;
    let queued = 0;
    const fade = () => {
      queued = 0;
      const box = pill.getBoundingClientRect();
      const screen = window.innerHeight;
      const t = Math.min(Math.max((screen * 1.25 - (box.top + box.bottom) / 2) / (screen * 0.55), 0), 1);
      stage.style.opacity = (1 - (1 - faintest) * t * t * (3 - 2 * t)).toFixed(3);
    };
    window.addEventListener("scroll", () => { if (!queued) queued = requestAnimationFrame(fade); }, { passive: true });
    window.addEventListener("resize", fade);
    fade();
  }

  function strikeTheOldWays() {
    const list = document.querySelector("[data-strikes]");
    if (!list) return;
    const lines = [...list.querySelectorAll(".is-removed")];
    const fitStairs = () => {
      list.style.removeProperty("--stair");
      const widest = Math.max(...lines.map((line) => parseFloat(line.style.getPropertyValue("--step")) || 0));
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;width:var(--stair);height:0";
      list.append(probe);
      const stair = probe.getBoundingClientRect().width;
      probe.remove();
      const room = list.getBoundingClientRect().left - 8;
      if (widest > 0 && Number.isFinite(stair) && stair * widest > room) list.style.setProperty("--stair", `${Math.max(0, room / widest)}px`);
    };
    fitStairs();
    document.fonts.ready.then(fitStairs); // the type moves the list once it loads
    window.addEventListener("load", fitStairs);
    window.addEventListener("resize", fitStairs);
    const style = getComputedStyle(root);
    const duration = parseFloat(style.getPropertyValue("--dur-strike")) || 620;
    const gap = parseFloat(style.getPropertyValue("--strike-gap")) || 110;
    const settleFor = 250; // ms after the lines are all in view
    let waiting = 0;
    const split = (text) => {
      const words = text.dataset.words ?? text.textContent;
      text.dataset.words = words;
      text.classList.add("is-split");
      text.textContent = "";
      const measured = words.split(" ").map((word, k) => {
        if (k) text.append(" ");
        const span = document.createElement("span");
        span.textContent = word;
        text.append(span);
        return span;
      });
      const rows = [];
      for (const span of measured) {
        if (!rows.length || Math.abs(rows.at(-1).top - span.offsetTop) > 2) rows.push({ top: span.offsetTop, words: [] });
        rows.at(-1).words.push(span.textContent);
      }
      text.textContent = "";
      const spans = rows.map((row, k) => {
        if (k) text.append(" ");
        const span = document.createElement("span");
        span.className = "strike-line";
        span.textContent = row.words.join(" ");
        text.append(span);
        return span;
      });
      const widths = spans.map((span) => span.getBoundingClientRect().width);
      const total = widths.reduce((sum, width) => sum + width, 0) || 1;
      let before = 0;
      spans.forEach((span, k) => {
        span.style.transitionDuration = `${(duration * widths[k]) / total}ms`;
        span.style.transitionDelay = `${(duration * before) / total}ms`;
        if (spans.length > 1) {
          span.style.transitionTimingFunction = k === 0 ? "cubic-bezier(0.55, 0.05, 1, 1)"
            : k === spans.length - 1 ? "cubic-bezier(0, 0, 0.3, 1)" : "linear";
        }
        before += widths[k];
      });
    };
    const splitAll = () => lines.forEach((line) => split(line.querySelector(".diff-text")));
    document.fonts.ready.then(splitAll);
    let width = window.innerWidth;
    window.addEventListener("resize", () => { if (window.innerWidth !== width) { width = window.innerWidth; splitAll(); } });
    const strike = () => {
      lines.forEach((line, k) => setTimeout(() => line.classList.add("is-struck"), k * (duration + gap)));
      setTimeout(pushTheValue, lines.length * (duration + gap));
    };
    const added = list.querySelector("[data-push]");
    const holder = added?.querySelector(".value-word");
    const grower = holder?.cloneNode(true);
    if (grower) {
      grower.classList.replace("value-word", "value-grow");
      grower.setAttribute("aria-hidden", "true");
      holder.classList.add("is-held");
      holder.after(grower);
    }
    const pinTheValue = () => {
      if (!grower) return;
      const push = added.querySelector(".value-push");
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      holder.append(probe);
      const baseline = probe.getBoundingClientRect().top - push.getBoundingClientRect().top;
      probe.remove();
      const size = 400;
      const { transition, fontSize } = grower.style;
      grower.style.transition = "none";
      grower.style.fontSize = `${size}px`;
      const sample = document.createElement("span");
      sample.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      grower.append(sample);
      const fromTop = sample.getBoundingClientRect().top - grower.getBoundingClientRect().top;
      sample.remove();
      grower.style.fontSize = fontSize;
      grower.getBoundingClientRect();
      grower.style.transition = transition;
      push.style.setProperty("--grow-x", `${holder.offsetLeft}px`);
      push.style.setProperty("--grow-base", `${baseline}px`);
      push.style.setProperty("--grow-drop", `${fromTop / size}`);
    };
    const closing = list.parentElement.querySelector("[data-after-push]");
    const pushTheValue = () => {
      if (!added) return;
      placeTheValue();
      added.classList.add("is-pushed");
      const after = parseFloat(getComputedStyle(root).getPropertyValue("--dur-push")) || 800;
      setTimeout(() => closing?.classList.add("is-shown"), after + 400);
    };
    const placeTheValue = () => {
      const push = added.querySelector(".value-push");
      const creates = added.querySelector(".creates-word");
      const value = added.querySelector(".value-word");
      const moved = parseFloat(getComputedStyle(push).getPropertyValue("--push")) || 0;
      const createsBox = creates.getBoundingClientRect();
      const valueBox = value.getBoundingClientRect();
      const italic = added.querySelector(".diff-text > .italic");
      const word = document.createRange();
      word.setStart(italic.firstChild, 0);
      word.setEnd(italic.firstChild, italic.firstChild.textContent.trimEnd().length);
      const actually = [...word.getClientRects()].at(-1);
      const margin = 8;
      const room = window.innerWidth - margin;
      const tokens = getComputedStyle(root);
      const most = parseFloat(tokens.getPropertyValue("--swell-most")) || 2.4;
      const valueLeft = valueBox.left - moved;
      const createsMiddle = (createsBox.left + createsBox.right) / 2 - moved;
      const underActually = actually ? actually.right - createsMiddle : 0;
      value.style.fontWeight = "var(--weight-semibold)";
      const swollenWidth = value.offsetWidth;
      value.style.fontWeight = "";
      const before = document.createRange();
      before.setStart(added.querySelector(".diff-text"), 0);
      before.setEndBefore(push);
      const pushTop = createsBox.top;
      const above = [...before.getClientRects()].filter((r) => r.width > 0 && r.bottom <= pushTop + 2);
      const lastTop = Math.max(-Infinity, ...above.map((r) => r.top));
      const aboveRight = Math.max(-Infinity, ...above.filter((r) => Math.abs(r.top - lastTop) < 2).map((r) => r.right));
      const clearOf = Number.isFinite(aboveRight) ? aboveRight + parseFloat(getComputedStyle(value).fontSize) * 0.25 - valueLeft : 0;
      const fits = room - (valueLeft + swollenWidth * most);
      const shift = Math.max(0, Math.min(Math.max(underActually, clearOf), fits));
      added.style.setProperty("--push-to", `${shift}px`);
      const left = valueLeft + shift;
      added.style.setProperty("--swell", `${Math.max(1, Math.min(most, (room - left) / swollenWidth)).toFixed(3)}`);
      pinTheValue();
    };
    document.fonts.ready.then(pinTheValue);
    window.addEventListener("resize", () => { if (added?.classList.contains("is-pushed")) placeTheValue(); else pinTheValue(); });
    const seen = new IntersectionObserver(([entry]) => {
      clearTimeout(waiting);
      if (!entry.isIntersecting) return;
      waiting = setTimeout(() => { seen.disconnect(); strike(); }, settleFor);
    }, { threshold: 1 });
    seen.observe(list);
  }
})();

(() => {
  const menu = document.querySelector(".nav-menu");
  const summary = menu?.querySelector("summary");
  const panel = menu?.querySelector(".menu-panel");
  const dim = menu?.querySelector(".menu-dim");
  if (!menu || !summary || !panel || !dim) return;
  const items = [...menu.querySelectorAll(".menu-links li")];
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const token = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name));
  const tokenPx = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name));

  const easeOut = (() => {
    const [x1, y1, x2, y2] = [0.22, 0.8, 0.24, 1];
    const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    return (x) => {
      let low = 0, high = 1, t = x;
      for (let i = 0; i < 24; i++) { t = (low + high) / 2; if (at(x1, x2, t) < x) low = t; else high = t; }
      return at(y1, y2, t);
    };
  })();
  const local = (time, start, length) => Math.min(Math.max((time - start) / length, 0), 1);

  let time = 0; // where on the timeline the menu is now
  let heading = 0; // +1 opening, -1 closing, 0 still
  let frame = 0;
  let last = 0;

  function timings() {
    const itemLead = token("--menu-item-lead");
    const itemStagger = token("--menu-item-stagger");
    const itemLength = token("--dur-menu-item");
    return {
      panel: token("--dur-menu"),
      spots: token("--dur-spots-spread"),
      itemLead, itemStagger, itemLength,
      total: Math.max(token("--dur-menu"), token("--dur-spots-spread"),
        itemLead + (items.length - 1) * itemStagger + itemLength),
    };
  }

  function render(t) {
    const at = timings();
    const panelIn = easeOut(local(t, 0, at.panel));
    panel.style.transform = `translateX(${((1 - panelIn) * 100).toFixed(3)}%)`;

    const spots = local(t, 0, at.spots);
    dim.style.setProperty("--spot-spread", (0.5 + 1.5 * easeOut(spots)).toFixed(4));
    dim.style.opacity = Math.min(spots / 0.3, 1).toFixed(4);

    const travel = tokenPx("--menu-item-travel");
    const startScale = token("--menu-item-start-scale");
    items.forEach((item, index) => {
      const p = easeOut(local(t, at.itemLead + index * at.itemStagger, at.itemLength));
      item.style.opacity = p.toFixed(4);
      item.style.transform = `translateX(${((1 - p) * travel).toFixed(2)}px) scale(${(startScale + (1 - startScale) * p).toFixed(4)})`;
    });

  }

  function run(now) {
    const step = Math.max(Math.min(now - last, 64), 0);
    last = now;
    const at = timings();
    time += heading * step * (heading < 0 ? token("--menu-close-speed") : 1);
    let finishedClosing = false;
    if (heading > 0 && time >= at.total) { time = at.total; heading = 0; }
    if (heading < 0 && time <= 0) { time = 0; heading = 0; finishedClosing = true; }
    render(time);
    if (heading !== 0) { frame = requestAnimationFrame(run); return; }
    if (finishedClosing) menu.open = false;
  }

  function go(direction) {
    if (direction > 0 && !menu.open) {
      menu.open = true;
    }
    if (reduceMotion.matches) {
      time = direction > 0 ? timings().total : 0;
      render(time);
      if (direction < 0) menu.open = false;
      return;
    }
    heading = direction;
    render(time); // paint the starting frame before the browser shows the open menu
    cancelAnimationFrame(frame);
    last = performance.now();
    frame = requestAnimationFrame(run);
  }

  const isOpening = () => heading > 0 || (heading === 0 && menu.open);
  summary.addEventListener("click", (event) => { event.preventDefault(); go(isOpening() ? -1 : 1); });
  dim.addEventListener("click", () => go(-1));
  menu.querySelectorAll(".menu-links a").forEach((link) => link.addEventListener("click", () => go(-1)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpening()) { go(-1); summary.focus(); }
  });

})();

(() => {
  const root = document.documentElement;
  const canvas = document.createElement("canvas");
  canvas.className = "ground-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  root.classList.add("has-moving-ground");
  const context = canvas.getContext("2d");
  const scale = 3; // page pixels per canvas pixel
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const patches = [
    { x: 0.18, y: 0.24, roamX: 0.30, roamY: 0.22, periodX: [23, 37], periodY: [29, 47], phase: 0.0, size: 0.62, stretch: 1.25, peak: 0.97 },
    { x: 0.84, y: 0.76, roamX: 0.26, roamY: 0.28, periodX: [31, 19], periodY: [41, 27], phase: 1.7, size: 0.58, stretch: 0.85, peak: 0.94 },
    { x: 0.76, y: 0.16, roamX: 0.28, roamY: 0.20, periodX: [27, 43], periodY: [21, 35], phase: 3.4, size: 0.52, stretch: 1.3, peak: 0.9 },
    { x: 0.26, y: 0.86, roamX: 0.32, roamY: 0.18, periodX: [35, 25], periodY: [33, 53], phase: 5.1, size: 0.6, stretch: 1.4, peak: 0.94 },
  ];
  const falloff = [[0, 1], [0.2, 0.78], [0.42, 0.46], [0.68, 0.17], [1, 0]];
  let shade = "20 5 40";

  const tallest = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none";
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return Math.max(height || 0, window.innerHeight);
  };
  function resize() {
    const width = Math.ceil(window.innerWidth / scale);
    const height = Math.ceil(tallest() / scale);
    if (width === canvas.width && height === canvas.height) return false;
    canvas.width = width;
    canvas.height = height;
    shade = getComputedStyle(root).getPropertyValue("--shade").trim();
    return true;
  }

  function draw(seconds) {
    const { width, height } = canvas;
    const reach = Math.hypot(width, height) / 2;
    context.clearRect(0, 0, width, height);
    for (const patch of patches) {
      const wave = (periods, amount) =>
        amount * (0.62 * Math.sin((2 * Math.PI * seconds) / periods[0] + patch.phase)
          + 0.38 * Math.sin((2 * Math.PI * seconds) / periods[1] + patch.phase * 1.9));
      const x = (patch.x + wave(patch.periodX, patch.roamX)) * width;
      const y = (patch.y + wave(patch.periodY, patch.roamY)) * height;
      const breathe = 1 + 0.12 * Math.sin((2 * Math.PI * seconds) / 17 + patch.phase);
      const radius = patch.size * reach * breathe;
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      for (const [at, strength] of falloff) {
        gradient.addColorStop(at, `rgb(${shade} / ${(patch.peak * strength).toFixed(3)})`);
      }
      context.save();
      context.translate(x, y);
      context.scale(patch.stretch, 1 / patch.stretch);
      context.fillStyle = gradient;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
  }

  resize();
  const start = performance.now();
  const seconds = () => (reduceMotion.matches ? 0 : (performance.now() - start) / 1000);
  window.addEventListener("resize", () => { if (resize()) draw(seconds()); });
  if (reduceMotion.matches) { draw(0); return; }
  let drawn = 0;
  const tick = (now) => {
    if (now - drawn >= 32) { drawn = now; draw((now - start) / 1000); }
    requestAnimationFrame(tick);
  };
  draw(0);
  requestAnimationFrame(tick);
})();

(() => {
  const root = document.documentElement;
  if (!root.classList.contains("has-motion")) return;
  const chunks = [...document.querySelectorAll(".chunk")];
  if (!chunks.length) return;
  const riseBy = 0.06; // share of a screen they rise through as they arrive
  const enterFrom = 0.95; // where the chunk's top is, as a share of the screen, when they start to show
  const enterTo = 0.5; // and when they are fully in
  const leaveFrom = 0.35; // where the chunk's bottom is when they start to fade on the way out
  const smooth = (v) => v * v * (3 - 2 * v);
  const clamp = (v) => Math.min(Math.max(v, 0), 1);

  const holdDrift = 0.045; // share of a screen it drifts through across the whole hold
  const pose = (top, bottom, hold = 0) => {
    const arriving = smooth(clamp((enterFrom - top) / (enterFrom - enterTo)));
    const leaving = smooth(clamp((leaveFrom - bottom) / leaveFrom));
    const drift = hold > 0 ? holdDrift * clamp(-top / hold) : 0;
    return { offset: (1 - arriving) * riseBy - drift, opacity: arriving * (1 - leaving) };
  };
  if (CSS.supports("animation-timeline: view()") && CSS.supports("view-timeline-name: --chunk")) {
    const keyframes = (name, hold) => {
      const travel = 2 + hold; // screens, from the chunk's top entering to its bottom leaving
      const frames = [];
      const steps = 120;
      for (let k = 0; k <= steps; k++) {
        const scrolled = (travel * k) / steps;
        const top = 1 - scrolled;
        const { offset, opacity } = pose(top, top + 1 + hold, hold);
        frames.push(`${((100 * k) / steps).toFixed(2)}% { transform: translateY(${(offset * 100).toFixed(3)}svh); opacity: ${opacity.toFixed(3)}; }`);
      }
      return `@keyframes ${name} {\n${frames.join("\n")}\n}`;
    };
    const rules = new Map();
    for (const chunk of chunks) {
      const held = parseFloat(getComputedStyle(chunk).getPropertyValue("--chunk-hold"));
      const hold = Number.isFinite(held) ? held / 100 : 0;
      const name = hold ? `chunk-scroll-${Math.round(hold * 100)}` : "chunk-scroll";
      if (!rules.has(name)) rules.set(name, keyframes(name, hold));
      chunk.style.setProperty("--chunk-motion", name);
    }
    const style = document.createElement("style");
    style.textContent = [...rules.values()].join("\n");
    document.head.append(style);
    root.classList.add("has-scroll-timeline");
    return;
  }

  let queued = false;
  const place = () => {
    queued = false;
    const screen = window.innerHeight;
    for (const chunk of chunks) {
      const box = chunk.getBoundingClientRect();
      const hold = (chunk.offsetHeight - chunk.querySelector(".chunk-stage").offsetHeight) / screen;
      const { offset, opacity } = pose(box.top / screen, box.bottom / screen, hold);
      for (const part of chunk.querySelectorAll(".chunk-body, .chunk-art, .chunk-ladder, .chunk-foot")) {
        part.style.opacity = opacity.toFixed(3);
        part.style.transform = `translateY(${(offset * screen).toFixed(1)}px)`;
      }
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  place();
})();

(() => {
  for (const list of document.querySelectorAll(".service-list")) {
    const stacks = [...list.querySelectorAll(".service:nth-child(odd) .service-body")];
    if (stacks.length < 2) continue;
    const line = () => {
      list.style.removeProperty("--stack-width");
      const widest = Math.max(...stacks.map((stack) => stack.getBoundingClientRect().width));
      list.style.setProperty("--stack-width", `${Math.ceil(widest)}px`);
    };
    document.fonts.ready.then(line);
    window.addEventListener("resize", line);
  }
})();
