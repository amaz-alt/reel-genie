import Fastify from "fastify";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderJob, isInFlight, markInFlight, clearInFlight, warmRenderer } from "./render.mjs";

const WORKER_VERSION = "0.7.0";

/**
 * Fingerprint the bundled Remotion templates. /health returns it so we can tell
 * from the app whether the VPS is actually running the latest templates or a
 * stale image (the usual cause of "I already fixed that" bugs reappearing).
 */
function fingerprintTemplates() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "remotion");
  const hash = createHash("sha256");
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name)) hash.update(name).update(readFileSync(p));
    }
  };
  walk(root);
  return hash.digest("hex").slice(0, 12);
}

const TEMPLATE_FINGERPRINT = (() => {
  try {
    return fingerprintTemplates();
  } catch {
    return "unknown";
  }
})();

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.RENDER_WORKER_TOKEN;

if (!TOKEN) {
  console.error("Missing RENDER_WORKER_TOKEN");
  process.exit(1);
}

const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || req.method === "OPTIONS") return;
  const auth = req.headers["authorization"] ?? "";
  if (auth !== `Bearer ${TOKEN}`) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => ({
  ok: true,
  version: WORKER_VERSION,
  templates: TEMPLATE_FINGERPRINT,
  // Feature flags let the app assert the deployed build has the fixes it needs.
  features: ["contiguous-spans", "two-colour-invert", "dynamic-pacing"],
}));

app.post("/render", async (req, reply) => {
  const job = req.body;
  if (!job?.jobId || !job?.templateId || !job?.upload?.signedUrl || !job?.supabase?.url) {
    return reply.code(400).send({ error: "Invalid job payload (needs jobId, templateId, upload.signedUrl, supabase.url)" });
  }

  if (isInFlight(job.jobId)) {
    req.log.warn({ jobId: job.jobId }, "duplicate submission ignored (in-flight)");
    return reply.code(200).send({ jobId: job.jobId, accepted: true, duplicate: true });
  }
  markInFlight(job.jobId);

  reply.code(202).send({ jobId: job.jobId, accepted: true });

  setImmediate(() => {
    renderJob(job)
      .catch((err) => app.log.error({ err, jobId: job.jobId }, "render job crashed"))
      .finally(() => clearInFlight(job.jobId));
  });
});

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`render-worker listening on :${PORT}`);
  warmRenderer()
    .then(() => app.log.info("renderer warmed: browser + bundle ready"))
    .catch((err) => app.log.error({ err }, "renderer warmup failed"));
});
