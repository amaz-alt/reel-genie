import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, ensureBrowser } from "@remotion/renderer";
import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REMOTION_ENTRY = join(__dirname, "..", "remotion", "index.js");

// --- Idempotency: in-memory in-flight set. A process restart clears it,
// which is fine — the server-side status guard (queued→rendering conditional
// update) prevents duplicate dispatches across processes.
const inFlight = new Set();
export const isInFlight = (id) => inFlight.has(id);
export const markInFlight = (id) => inFlight.add(id);
export const clearInFlight = (id) => inFlight.delete(id);

// --- Bundle cache
let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: REMOTION_ENTRY,
      onProgress: (p) => {
        if (p % 25 === 0) console.log(`bundling ${p}%`);
      },
    });
  }
  return bundlePromise;
}

export function warmRenderer() {
  return Promise.all([ensureBrowser(), getBundle()]);
}

function makeLogger(jobId) {
  const entries = [];
  const push = (level, stage, message) => {
    const line = { at: new Date().toISOString(), level, stage, message: String(message) };
    entries.push(line);
    console.log(`[${jobId}] ${level} ${stage}: ${line.message}`);
  };
  return {
    entries,
    info: (stage, msg) => push("info", stage, msg),
    warn: (stage, msg) => push("warn", stage, msg),
    error: (stage, msg) => push("error", stage, msg),
  };
}

function isTransient(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|upload failed: 5\d\d|network|socket hang up/i.test(
    msg,
  );
}

// --- Direct-write helpers: worker updates Supabase via REST using the
// service-role key passed in the job payload. Removes the need for an
// inbound HTTP callback into the Lovable app.
function sb(supabase) {
  const base = supabase.url.replace(/\/$/, "");
  const headers = {
    apikey: supabase.serviceKey,
    Authorization: `Bearer ${supabase.serviceKey}`,
    "Content-Type": "application/json",
  };
  return {
    async getJob(jobId) {
      const r = await fetch(
        `${base}/rest/v1/render_jobs?id=eq.${jobId}&select=logs,attempts,max_attempts,status`,
        { headers },
      );
      if (!r.ok) throw new Error(`getJob ${r.status}: ${await r.text()}`);
      const arr = await r.json();
      return arr[0] ?? null;
    },
    async patchJob(jobId, patch) {
      const r = await fetch(`${base}/rest/v1/render_jobs?id=eq.${jobId}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`patchJob ${r.status}: ${await r.text()}`);
    },
    async patchReel(reelId, patch) {
      if (!reelId) return;
      const r = await fetch(`${base}/rest/v1/reels?id=eq.${reelId}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`patchReel ${r.status}: ${await r.text()}`);
    },
    async patchBrollReel(reelId, patch) {
      if (!reelId) return;
      const r = await fetch(`${base}/rest/v1/broll_reels?id=eq.${reelId}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`patchBrollReel ${r.status}: ${await r.text()}`);
    },
    async signDownload(storagePath, expiresIn) {
      const r = await fetch(
        `${base}/storage/v1/object/sign/brand-assets/${storagePath}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ expiresIn }),
        },
      );
      if (!r.ok) throw new Error(`signDownload ${r.status}: ${await r.text()}`);
      const j = await r.json();
      return `${base}/storage/v1${j.signedURL ?? j.signedUrl}`;
    },
  };
}

async function writeResult(job, logs, result) {
  const client = sb(job.supabase);
  const now = new Date().toISOString();
  const existing = await client.getJob(job.jobId).catch(() => null);
  const priorLogs = Array.isArray(existing?.logs) ? existing.logs : [];
  const mergedLogs = [...priorLogs, ...logs];

  if (result.status === "completed") {
    let videoUrl = null;
    try {
      videoUrl = await client.signDownload(
        job.supabase.storagePath,
        job.supabase.signedUrlExpiresIn ?? 60 * 60 * 24 * 7,
      );
    } catch (e) {
      mergedLogs.push({
        at: now,
        level: "warn",
        stage: "sign_download",
        message: String(e.message ?? e),
      });
    }
    await client.patchJob(job.jobId, {
      status: "completed",
      completed_at: now,
      logs: mergedLogs,
    });
    await client.patchReel(job.supabase.reelId, {
      status: "ready",
      video_url: videoUrl,
    });
    await client.patchBrollReel(job.supabase.brollReelId, {
      status: "ready",
      video_url: videoUrl,
    });
    return;
  }

  // Failure path — retry if transient and attempts remain.
  const attempts = existing?.attempts ?? 0;
  const maxAttempts = existing?.max_attempts ?? 3;
  const canRetry = result.transient !== false && attempts < maxAttempts;
  if (canRetry) {
    await client.patchJob(job.jobId, {
      status: "queued",
      last_error: result.error,
      logs: mergedLogs,
    });
  } else {
    await client.patchJob(job.jobId, {
      status: "failed",
      last_error: result.error,
      completed_at: now,
      logs: mergedLogs,
    });
    await client.patchReel(job.supabase.reelId, {
      status: "failed",
      error: result.error,
    });
    await client.patchBrollReel(job.supabase.brollReelId, {
      status: "failed",
      error: result.error,
    });
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

async function renderBrollFast(job, serveUrl, outPath, log) {
  const width = job.width ?? 1080;
  const height = job.height ?? 1920;
  const fps = job.fps ?? 30;
  const seconds = Math.max(1, (job.durationInFrames ?? 300) / fps);
  const overlayPath = join(tmpdir(), `${job.jobId}-overlay.png`);
  const overlayProps = { hook: job.props.hook, brand: job.props.brand };
  try {
    const comp = await selectComposition({ serveUrl, id: job.overlayTemplateId, inputProps: overlayProps });
    await renderStill({
      composition: { ...comp, width, height },
      serveUrl,
      output: overlayPath,
      imageFormat: "png",
      inputProps: overlayProps,
    });
    log.info("overlay", "hook card rendered");

    const fade = 0.35;
    await runFfmpeg([
      "-y",
      "-stream_loop", "-1", "-i", job.props.video.url,
      "-loop", "1", "-framerate", String(fps), "-i", overlayPath,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=bicubic,crop=${width}:${height},fps=${fps},setsar=1[bg];` +
        `[1:v]format=rgba,fade=t=in:st=0:d=${fade}:alpha=1[ov];` +
        `[bg][ov]overlay=x=0:y='if(lt(t,${fade}),18*(1-t/${fade}),0)':eval=frame,format=yuv420p[v]`,
      "-map", "[v]", "-map", "2:a",
      "-t", seconds.toFixed(3),
      "-c:v", "libx264", "-preset", job.x264Preset ?? "veryfast", "-crf", String(job.crf ?? 23),
      "-c:a", "aac", "-b:a", "64k",
      "-movflags", "+faststart",
      outPath,
    ]);
  } finally {
    unlink(overlayPath).catch(() => {});
  }
}

export async function renderJob(job) {
  const log = makeLogger(job.jobId);
  const outPath = join(tmpdir(), `${job.jobId}.mp4`);
  const startedAt = Date.now();
  try {
    if (!job.supabase?.url || !job.supabase?.serviceKey) {
      throw new Error("job.supabase.{url,serviceKey} required (direct-write mode)");
    }
    log.info("start", `template=${job.templateId} ${job.width ?? 1080}x${job.height ?? 1920}`);
    await ensureBrowser();
    log.info("browser", "chrome headless shell ready");

    const serveUrl = await getBundle();
    log.info("bundle", "remotion bundle ready");

    // B-roll fast path (opt-in per job payload): render the hook card once as a
    // transparent PNG, then let ffmpeg scale the clip + burn the card in one pass.
    // Avoids screenshotting every frame in Chrome. Other formats never set this.
    let fastDone = false;
    if (job.renderer === "ffmpeg-overlay" && job.overlayTemplateId) {
      try {
        await renderBrollFast(job, serveUrl, outPath, log);
        fastDone = true;
        log.info("render", `fast mp4 written in ${Date.now() - startedAt}ms`);
      } catch (e) {
        log.warn("fast_path", `falling back to full render: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (!fastDone) {
    const composition = await selectComposition({
      serveUrl,
      id: job.templateId,
      inputProps: job.props,
    });
    log.info("composition", `selected ${composition.id}`);

    await renderMedia({
      composition: {
        ...composition,
        width: job.width ?? composition.width,
        height: job.height ?? composition.height,
        fps: job.fps ?? composition.fps,
        durationInFrames: job.durationInFrames ?? composition.durationInFrames,
      },
      serveUrl,
      codec: "h264",
      crf: Number(process.env.RENDER_CRF ?? 28),
      ...(job.x264Preset ? { x264Preset: job.x264Preset } : {}),
      concurrency: Number(process.env.RENDER_CONCURRENCY ?? 2),
      muted: false,
      outputLocation: outPath,
      inputProps: job.props,
    });
    log.info("render", `mp4 written in ${Date.now() - startedAt}ms`);
    }

    const buf = await readFile(outPath);
    const put = await fetch(job.upload.signedUrl, {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: buf,
    });
    if (!put.ok) {
      throw new Error(`upload failed: ${put.status} ${await put.text().catch(() => "")}`);
    }
    log.info("upload", `mp4 uploaded (${buf.byteLength} bytes)`);

    await writeResult(job, log.entries, { status: "completed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const transient = isTransient(err);
    log.error("fail", `${transient ? "transient" : "permanent"}: ${message}`);
    if (err instanceof Error && err.stack) log.error("stack", err.stack.split("\n").slice(0, 6).join(" | "));
    await writeResult(job, log.entries, {
      status: "failed",
      error: message,
      transient,
    }).catch((e) => console.error("writeResult failed", e));
  } finally {
    unlink(outPath).catch(() => {});
  }
}
