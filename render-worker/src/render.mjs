import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { createHmac } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REMOTION_ENTRY = join(__dirname, "..", "remotion", "index.js");

// Cache the bundle across jobs; Remotion bundles are large and slow to build.
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

export async function renderJob(job, callbackSecret) {
  const outPath = join(tmpdir(), `${job.jobId}.mp4`);
  try {
    await ensureBrowser();
    const serveUrl = await getBundle();
    const composition = await selectComposition({
      serveUrl,
      id: job.templateId,
      inputProps: job.props,
    });

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

    // Upload MP4 to the signed URL Lovable gave us.
    const buf = await readFile(outPath);
    const put = await fetch(job.upload.signedUrl, {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: buf,
    });
    if (!put.ok) {
      throw new Error(`upload failed: ${put.status} ${await put.text().catch(() => "")}`);
    }

    await postCallback(job, callbackSecret, { status: "done" });
  } catch (err) {
    console.error("render failed", job.jobId, err);
    await postCallback(job, callbackSecret, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
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
