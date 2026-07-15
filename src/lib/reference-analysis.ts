type RGB = [number, number, number];

type FrameMetrics = {
  t: number;
  avg: RGB;
  brightness: number;
  saturation: number;
  edgeDensity: number;
  diff: number;
};

export type ReferenceAnalysisResult = {
  notes: string;
  /** 6 evenly-spaced JPEG frames as data URLs (~540px tall), for vision-model analysis. */
  frames: string[];
  durationSec: number;
};

/**
 * Client-side reference video probe.
 *
 * Produces two things:
 *   1. `notes` — cheap heuristic string (motion rhythm, palette, negative-space)
 *      used to seed the style planner if vision analysis is unavailable.
 *   2. `frames` — 6 JPEG stills sampled across the clip. The server sends
 *      these to a vision model to extract a structured design-language spec.
 *
 * We deliberately downscale to keep base64 payload small (~40KB × 6 frames).
 */
export async function analyzeReferenceVideo(file: File): Promise<ReferenceAnalysisResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await once(video, "loadedmetadata");
    // Force decode a real frame — some browsers seek to 0 without painting until played.
    try {
      video.currentTime = 0.01;
      await once(video, "seeked");
    } catch {
      /* ignore */
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, 30) : 8;
    const w = video.videoWidth || 540;
    const h = video.videoHeight || 960;
    // Heuristic canvas (small, for metrics)
    const metricCanvas = document.createElement("canvas");
    const metricSize = 96;
    metricCanvas.width = metricSize;
    metricCanvas.height = Math.round(metricSize * (h / w));
    const metricCtx = metricCanvas.getContext("2d", { willReadFrequently: true });

    // Frame canvas (larger, for vision model)
    const frameCanvas = document.createElement("canvas");
    const targetH = 720;
    frameCanvas.height = targetH;
    frameCanvas.width = Math.round(targetH * (w / h));
    const frameCtx = frameCanvas.getContext("2d");

    if (!metricCtx || !frameCtx) {
      return {
        notes: `Reference uploaded: ${file.name}. Canvas unsupported; heuristic analysis skipped.`,
        frames: [],
        durationSec: duration,
      };
    }

    const metricSamples = 12;
    const frameSamples = 6;
    const frameStamps = new Set<number>();
    for (let i = 0; i < frameSamples; i++) {
      frameStamps.add(Math.round((i / (frameSamples - 1)) * (metricSamples - 1)));
    }

    const metrics: FrameMetrics[] = [];
    const frames: string[] = [];
    let prev: Uint8ClampedArray | null = null;
    for (let i = 0; i < metricSamples; i++) {
      const t = Math.min(duration - 0.05, Math.max(0.05, (duration * i) / Math.max(1, metricSamples - 1)));
      video.currentTime = t;
      await once(video, "seeked");
      metricCtx.drawImage(video, 0, 0, metricCanvas.width, metricCanvas.height);
      const data = metricCtx.getImageData(0, 0, metricCanvas.width, metricCanvas.height).data;
      const m = measureFrame(data, t, prev);
      metrics.push(m);
      prev = new Uint8ClampedArray(data);
      if (frameStamps.has(i)) {
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        frames.push(frameCanvas.toDataURL("image/jpeg", 0.72));
      }
    }

    const palette = quantizedPalette(metrics.map((f) => f.avg));
    const avgBrightness = average(metrics.map((f) => f.brightness));
    const avgSaturation = average(metrics.map((f) => f.saturation));
    const avgEdges = average(metrics.map((f) => f.edgeDensity));
    const diffs = metrics.slice(1).map((f) => f.diff);
    const avgDiff = average(diffs);
    const cutCount = diffs.filter((d) => d > Math.max(18, avgDiff * 1.75)).length;
    const motionRhythm = avgDiff > 34 || cutCount >= 4 ? "fast beat/cut rhythm" : avgDiff > 18 ? "medium rhythmic motion" : "subtle low-motion rhythm";
    const canvasMood = avgBrightness < 80 ? "dark editorial" : avgBrightness > 185 ? "bright minimal" : "balanced editorial";
    const space = avgEdges < 18 ? "large empty-space fields" : avgEdges < 30 ? "moderate negative space" : "dense visual coverage";

    return {
      notes: [
        `Heuristic probe of ${file.name}:`,
        `duration≈${duration.toFixed(1)}s; rhythm=${motionRhythm} (cuts≈${cutCount}); mood=${canvasMood}; space=${space};`,
        `palette=${palette.join(", ")}; saturation≈${avgSaturation.toFixed(1)}.`,
      ].join(" "),
      frames,
      durationSec: duration,
    };
  } catch {
    return {
      notes: `Reference uploaded: ${file.name}. Probe failed; treat as clean high-hierarchy typography inspiration.`,
      frames: [],
      durationSec: 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function measureFrame(data: Uint8ClampedArray, t: number, prev: Uint8ClampedArray | null): FrameMetrics {
  let r = 0, g = 0, b = 0, sat = 0, edge = 0, diff = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i], gg = data[i + 1], bb = data[i + 2];
    r += rr; g += gg; b += bb;
    sat += Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
    if (prev) diff += Math.abs(rr - prev[i]) + Math.abs(gg - prev[i + 1]) + Math.abs(bb - prev[i + 2]);
    if (i >= 4) edge += Math.abs(rr - data[i - 4]) + Math.abs(gg - data[i - 3]) + Math.abs(bb - data[i - 2]);
  }
  const avg: RGB = [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)];
  return {
    t,
    avg,
    brightness: (avg[0] + avg[1] + avg[2]) / 3,
    saturation: sat / pixels,
    edgeDensity: edge / pixels / 3,
    diff: prev ? diff / pixels / 3 : 0,
  };
}

function quantizedPalette(colors: RGB[]) {
  const buckets = new Map<string, { rgb: RGB; count: number }>();
  for (const color of colors) {
    const q: RGB = color.map((v) => Math.round(v / 32) * 32) as RGB;
    const key = q.join(",");
    const current = buckets.get(key);
    buckets.set(key, { rgb: q, count: (current?.count ?? 0) + 1 });
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(({ rgb }) => `#${rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, next) => sum + next, 0) / values.length;
}

function once(target: HTMLMediaElement, event: keyof HTMLMediaElementEventMap) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Could not read video reference")); };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}
