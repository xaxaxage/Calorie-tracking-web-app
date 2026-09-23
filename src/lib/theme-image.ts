import { normalizeHex, saturation } from './theme';

/**
 * The main colors of a picture, most prominent first. Pixels are grouped into
 * coarse buckets; vivid buckets get a boost so a small bright detail can beat a
 * big dull wall, and near-duplicates are skipped.
 */
export async function extractColors(file: Blob, count = 6): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const size = 72;
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot read images.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return dominantColors(ctx.getImageData(0, 0, w, h).data, count);
}

export function dominantColors(pixels: Uint8ClampedArray, count = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // transparent
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()].map((c) => {
    const rgb = [c.r / c.n, c.g / c.n, c.b / c.n];
    const hex = normalizeHex(rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
    return { rgb, hex, score: c.n * (0.4 + saturation(hex)) };
  });
  colors.sort((a, b) => b.score - a.score);

  const picked: typeof colors = [];
  for (const c of colors) {
    const distinct = picked.every((p) => Math.hypot(p.rgb[0] - c.rgb[0], p.rgb[1] - c.rgb[1], p.rgb[2] - c.rgb[2]) > 48);
    if (distinct) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => c.hex);
}
