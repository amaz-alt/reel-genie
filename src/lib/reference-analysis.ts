type RGB = [number, number, number];

type FrameMetrics = {
  t: number;
  avg: RGB;
  brightness: number;
  saturation: number;
  edgeDensity: number;
  diff: number;
};

export async function analyzeReferenceVideo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    await once(video, "loadedmetadata");

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, 20) : 8;
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = size;
    canvas.height = Math.round(size * (16 / 9));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "Reference analysis unavailable: canvas unsupported.";

    const samples = 12;
    const frames: FrameMetrics[] = [];
    let prev: Uint8ClampedArray | null = null;
    for (let i = 0; i < samples; i++) {
      const t = Math.min(duration - 0.05, Math.max(0, (duration * i) / Math.max(1, samples - 1)));
      video.currentTime = t;
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const metrics = measureFrame(data, t, prev);
      frames.push(metrics);
      prev = new Uint8ClampedArray(data);
    }

    const palette = quantizedPalette(frames.map((f) => f.avg));
    const avgBrightness = average(frames.map((f) => f.brightness));
    const avgSaturation = average(frames.map((f) => f.saturation));
    const avgEdges = average(frames.map((f) => f.edgeDensity));
    const diffs = frames.slice(1).map((f) => f.diff);
    const avgDiff = average(diffs);
    const maxDiff = Math.max(...diffs, 0);
    const cutCount = diffs.filter((d) => d > Math.max(18, avgDiff * 1.75)).length;
    const motionRhythm = avgDiff > 34 || cutCount >= 4 ? "fast beat/cut rhythm" : avgDiff > 18 ? "medium rhythmic motion" : "subtle low-motion rhythm";
    const canvasMood = avgBrightness < 80 ? "dark editorial" : avgBrightness > 185 ? "bright minimal" : "balanced editorial";
    const space = avgEdges < 18 ? "large clean empty-space fields" : avgEdges < 30 ? "moderate negative space" : "dense text/visual coverage";

    return [
      `Native reference analysis for ${file.name}:`,
      `duration≈${duration.toFixed(1)}s; rhythm=${motionRhythm}; cuts≈${cutCount}; motionScore=${avgDiff.toFixed(1)}; maxChange=${maxDiff.toFixed(1)}.`,
      `visualField=${canvasMood}; saturation=${avgSaturation.toFixed(1)}; edgeDensity=${avgEdges.toFixed(1)} (${space}).`,
      `dominantColors=${palette.join(", ")}.`,
      "Use these as design primitives: match pacing intensity, negative-space density, palette direction, and transition restraint; do not copy captions or social text.",
    ].join(" ");
  } catch {
    return `Reference video uploaded: ${file.name}. Analyze as clean readable short-form typography inspiration; prioritize clarity, hierarchy, rhythm, and intentional empty space.`;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function measureFrame(data: Uint8ClampedArray, t: number, prev: Uint8ClampedArray | null): FrameMetrics {
  let r = 0;
  let g = 0;
  let b = 0;
  let sat = 0;
  let edge = 0;
  let diff = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i];
    const gg = data[i + 1];
    const bb = data[i + 2];
    r += rr;
    g += gg;
    b += bb;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    sat += max - min;
    if (prev) diff += Math.abs(rr - prev[i]) + Math.abs(gg - prev[i + 1]) + Math.abs(bb - prev[i + 2]);
    if (i >= 4) {
      edge += Math.abs(rr - data[i - 4]) + Math.abs(gg - data[i - 3]) + Math.abs(bb - data[i - 2]);
    }
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
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not read video reference"));
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}