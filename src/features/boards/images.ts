// Getting an image ready for a board, in the browser: decode it, scale it
// down so a board of photos does not fill the device, and read its colors.

import { extractPalette } from "@/lib/logic/boards";

/** Longest side of a stored board image. Enough for a phone at full width, small enough to keep dozens. */
export const BOARD_IMAGE_MAX = 1280;
const BOARD_IMAGE_QUALITY = 0.8;
/** The palette is read from a copy this size. More pixels do not change the answer. */
const SAMPLE = 72;

export interface PreparedImage {
  blob: Blob;
  /** Width over height. */
  aspect: number;
  palette: string[];
}

export class ImageReadError extends Error {
  constructor() {
    super("Could not read that image. Try a JPEG or PNG.");
  }
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to an <img>, which decodes a few formats createImageBitmap does not.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new ImageReadError();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageReadError();
  }
}

function canvasOf(source: CanvasImageSource, width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ImageReadError();
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Scale an image down, turn it into a JPEG and pull its palette. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const img = await decode(file);
  try {
    const scale = Math.min(1, BOARD_IMAGE_MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const sampleScale = Math.min(1, SAMPLE / Math.max(img.width, img.height));
    const sample = canvasOf(img.source, img.width * sampleScale, img.height * sampleScale);
    const palette = extractPalette(sample.ctx.getImageData(0, 0, sample.canvas.width, sample.canvas.height).data);

    // Small JPEGs and WebPs are kept as they are. Everything else is drawn again at the smaller size.
    const keep = scale === 1 && file.size < 450_000 && /^image\/(jpeg|webp)$/.test(file.type);
    let blob: Blob = file;
    if (!keep) {
      const full = document.createElement("canvas");
      full.width = w;
      full.height = h;
      const ctx = full.getContext("2d");
      if (!ctx) throw new ImageReadError();
      // JPEG has no transparency. Paper white behind a cut out, the way it would sit on a page.
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img.source, 0, 0, w, h);
      const out = await new Promise<Blob | null>((resolve) => full.toBlob(resolve, "image/jpeg", BOARD_IMAGE_QUALITY));
      if (!out) throw new ImageReadError();
      blob = out;
    }
    return { blob, aspect: w / h, palette };
  } finally {
    img.close();
  }
}

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The pixels of a stored image, for picking a color off it. Null when the browser will not let the page read them. */
export async function loadPixels(url: string, max = 640): Promise<Pixels | null> {
  try {
    const img = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const { canvas, ctx } = canvasOf(img, img.naturalWidth * scale, img.naturalHeight * scale);
    return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}
