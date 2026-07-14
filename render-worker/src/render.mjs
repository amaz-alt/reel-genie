import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { createHmac } from "node:crypto";
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

// --- Structured logging: collect per-job, ship in callback for DB persistence.
function makeLogger(jobId) {
  const entries = [];
  const push = (level, stage, message) => {
    const line = { level, stage, message: String(message) };
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

// Classify errors: transient ones are worth retrying, permanent ones aren't.
function isTransient(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|upload failed: 5\d\d|network|socket hang up/i.test(
    msg,
  );
}

export async function renderJob(job, callbackSecret) {
  const log = makeLogger(job.jobId);
  const outPath = join(tmpdir(), `${job.jobId}.mp4`);
  const startedAt = Date.now();
  try {
    log.info("start", `template=${job.templateId} ${job.width ?? 1080}x${job.height ?? 1920}`);
    await ensureBrowser();
    log.info("browser", "chrome headless shell ready");

    const serveUrl = await getBundle();
    log.info("bundle", "remotion bundle ready");

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
      outputLocation: outPath,
      inputProps: job.props,
    });
    log.info("render", `mp4 written in ${Date.now() - startedAt}ms`);

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

    await postCallback(job, callbackSecret, { status: "completed", logs: log.entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const transient = isTransient(err);
    log.error("fail", `${transient ? "transient" : "permanent"}: ${message}`);
    if (err instanceof Error && err.stack) log.error("stack", err.stack.split("\n").slice(0, 6).join(" | "));
    await postCallback(job, callbackSecret, {
      status: "failed",
      error: message,
      transient,
      logs: log.entries,
    }).catch((e) => console.error("callback failed", e));
  } finally {
    unlink(outPath).catch(() => {});
  }
}

async function postCallback(job, secret, result) {
  const body = JSON.stringify({ jobId: job.jobId, ...result });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(job.callback.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-render-signature": signature,
      "x-render-key-id": job.callback.hmacKeyId ?? "v1",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`callback ${job.callback.url} responded ${res.status}`);
  }
}
