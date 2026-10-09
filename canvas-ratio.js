const most = 6e6;

export function canvasRatio(width, height) {
  const sharp = Math.min(window.devicePixelRatio || 1, 2);
  const area = Math.max(1, width * height);
  return Math.max(1, Math.min(sharp, Math.sqrt(most / area)));
}
