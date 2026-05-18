"use client";

export interface WatermarkOptions {
  widthRatio?: number;
  opacity?: number;
  minImageWidth?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp" | "preserve";
  quality?: number;
}

const DEFAULTS = {
  widthRatio: 0.13,
  opacity: 0.65,
  minImageWidth: 200,
  outputType: "preserve" as const,
  quality: 0.85,
};

let watermarkPromise: Promise<HTMLImageElement | null> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function loadWatermark(): Promise<HTMLImageElement | null> {
  if (watermarkPromise) return watermarkPromise;
  watermarkPromise = (async () => {
    const tryLoad = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    // Prefer pre-rendered PNG (consistent), fall back to SVG.
    const png = await tryLoad("/watermark.png");
    if (png) return png;
    return tryLoad("/watermark.svg");
  })();
  return watermarkPromise;
}

function resolveMime(
  input: string,
  requested: WatermarkOptions["outputType"],
): string {
  const target = !requested || requested === "preserve" ? input : requested;
  if (
    target === "image/png" ||
    target === "image/webp" ||
    target === "image/jpeg"
  ) {
    return target;
  }
  return "image/jpeg";
}

function mimeToExt(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function swapExt(name: string, newExt: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${newExt}`;
}

export function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

async function compose(
  source: CanvasImageSource,
  width: number,
  height: number,
  outputMime: string,
  opts: Required<Omit<WatermarkOptions, "outputType">>,
): Promise<Blob | null> {
  if (width < opts.minImageWidth) return null;

  const wm = await loadWatermark();

  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = (canvas as HTMLCanvasElement).getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, width, height);

  if (wm) {
    const wmW = Math.max(60, Math.round(width * opts.widthRatio));
    const ratio = wm.naturalHeight / wm.naturalWidth || 0.2;
    const wmH = Math.round(wmW * ratio);
    const pad = Math.max(12, Math.round(width * 0.025));
    const x = width - wmW - pad;
    const y = height - wmH - pad;
    ctx.globalAlpha = opts.opacity;
    ctx.drawImage(wm, x, y, wmW, wmH);
    ctx.globalAlpha = 1;
  }

  if ("convertToBlob" in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({
      type: outputMime,
      quality: opts.quality,
    });
  }
  return await new Promise<Blob | null>((res) => {
    (canvas as HTMLCanvasElement).toBlob(res, outputMime, opts.quality);
  });
}

export async function watermarkFile(
  file: File,
  options: WatermarkOptions = {},
): Promise<File> {
  try {
    const opts = { ...DEFAULTS, ...options };
    const outputMime = resolveMime(file.type, opts.outputType);
    const ext = mimeToExt(outputMime);

    let blob: Blob | null = null;
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      blob = await compose(
        bitmap,
        bitmap.width,
        bitmap.height,
        outputMime,
        opts,
      );
      bitmap.close();
    } catch {
      const dataUrl = await fileToDataUrl(file);
      const img = await loadImage(dataUrl);
      blob = await compose(
        img,
        img.naturalWidth,
        img.naturalHeight,
        outputMime,
        opts,
      );
    }

    if (!blob) return file;
    return new File([blob], swapExt(file.name, ext), { type: outputMime });
  } catch (err) {
    console.warn("[watermark] returning original file:", err);
    return file;
  }
}

export async function watermarkDataUrl(
  dataUrl: string,
  options: WatermarkOptions = {},
): Promise<string> {
  try {
    const match = /^data:([^;]+);/.exec(dataUrl);
    const inputMime = match?.[1] || "image/jpeg";
    const opts = { ...DEFAULTS, ...options };
    const outputMime = resolveMime(inputMime, opts.outputType);

    const img = await loadImage(dataUrl);
    const blob = await compose(
      img,
      img.naturalWidth,
      img.naturalHeight,
      outputMime,
      opts,
    );
    if (!blob) return dataUrl;
    return await fileToDataUrl(blob);
  } catch (err) {
    console.warn("[watermark] returning original data URL:", err);
    return dataUrl;
  }
}
