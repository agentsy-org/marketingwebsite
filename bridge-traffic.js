
export function bridgeTraffic({ roadY, from, to, fadeLength, random, timing }) {
  const length = to - from;
  const speedBase = length / (timing.crossing / 1000); // page pixels a second
  const lanes = [
    { direction: 1, lift: timing.laneLift }, // left to right
    { direction: -1, lift: timing.laneLift * 2.6 }, // right to left, the far lane
  ];
  const lights = [];
  for (const lane of lanes) {
    let start = random() * timing.gapMost * 0.6;
    while (start < timing.window) {
      const speed = speedBase * (1 + (random() - 0.5) * timing.speedSpread);
      lights.push({ ...lane, start, speed, size: timing.size * (0.8 + random() * 0.5) });
      start += timing.gapLeast + random() * (timing.gapMost - timing.gapLeast);
    }
  }
  const duration = Math.max(...lights.map((l) => l.start + (length / l.speed) * 1000)) + 120;

  const drawTraffic = (context, clock, options = {}) => {
    if (options.still || clock >= duration) return;
    context.save();
    context.globalCompositeOperation = "lighter";
    for (const light of lights) {
      const travelled = ((clock - light.start) / 1000) * light.speed;
      if (travelled < 0 || travelled > length) continue;
      const x = light.direction > 0 ? from + travelled : to - travelled;
      const strength = Math.min(1, travelled / fadeLength, (length - travelled) / fadeLength);
      const y = roadY(x) - light.lift;
      const angle = Math.atan2(roadY(x + 2) - roadY(x - 2), 4);
      const long = light.size;
      const tall = Math.max(1.4, long * 0.16);
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      if (light.direction < 0) context.scale(-1, 1);
      const streak = context.createLinearGradient(-long * 3.2, 0, -long / 2, 0);
      streak.addColorStop(0, "rgb(255 255 255 / 0)");
      streak.addColorStop(1, `rgb(255 255 255 / ${0.32 * strength})`);
      context.fillStyle = streak;
      context.fillRect(-long * 3.2, -tall / 2, long * 2.7, tall);
      context.fillStyle = `rgb(255 255 255 / ${0.16 * strength})`;
      context.fillRect(-long / 2 - 3, -tall / 2 - 2.5, long + 6, tall + 5);
      context.fillStyle = `rgb(255 255 255 / ${0.95 * strength})`;
      context.fillRect(-long / 2, -tall / 2, long, tall);
      context.restore();
    }
    context.restore();
  };
  drawTraffic.duration = duration;
  return drawTraffic;
}
