// QR decoding via jsQR — shared by camera, image and screen scanners.
// Decoding tries both inversion passes so dark-mode QRs still resolve.

import jsQR from "jsqr";

export function decodeImageData(img: ImageData): string | null {
  const direct = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
  if (direct) return direct.data;
  const inverted = jsQR(img.data, img.width, img.height, { inversionAttempts: "invertFirst" });
  return inverted ? inverted.data : null;
}

export function decodeVideoFrame(video: HTMLVideoElement, scratch: HTMLCanvasElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return decodeImageData(ctx.getImageData(0, 0, w, h));
}

/** Decode a cropped region of a video frame; coordinates are in video pixels. */
export function decodeVideoRegion(
  video: HTMLVideoElement,
  scratch: HTMLCanvasElement,
  region: { x: number; y: number; w: number; h: number },
): string | null {
  const { x, y, w, h } = region;
  if (w < 8 || h < 8) return null;
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, x, y, w, h, 0, 0, w, h);
  return decodeImageData(ctx.getImageData(0, 0, w, h));
}

const MAX_DIM = 1600;

export async function decodeFile(file: File | Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const direct = decodeImageData(ctx.getImageData(0, 0, w, h));
    if (direct) return direct;
    // second chance at 2x upscale for small QRs
    if (scale < 1 || Math.max(bitmap.width, bitmap.height) < 400) {
      canvas.width = w * 2;
      canvas.height = h * 2;
      ctx.drawImage(bitmap, 0, 0, w * 2, h * 2);
      return decodeImageData(ctx.getImageData(0, 0, w * 2, h * 2));
    }
    return null;
  } finally {
    bitmap.close();
  }
}
