import Fastify from "fastify";
import { renderJob } from "./render.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.RENDER_WORKER_TOKEN;
const CALLBACK_SECRET = process.env.RENDER_CALLBACK_SECRET;

if (!TOKEN || !CALLBACK_SECRET) {
  console.error("Missing RENDER_WORKER_TOKEN or RENDER_CALLBACK_SECRET");
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

app.get("/health", async () => ({ ok: true, version: "0.1.0" }));

app.post("/render", async (req, reply) => {
  const job = req.body;
  if (!job?.jobId || !job?.templateId || !job?.upload?.signedUrl || !job?.callback?.url) {
    return reply.code(400).send({ error: "Invalid job payload" });
  }

  // Ack immediately, render in background.
  reply.code(202).send({ jobId: job.jobId, accepted: true });

  setImmediate(() => {
    renderJob(job, CALLBACK_SECRET).catch((err) => {
      app.log.error({ err, jobId: job.jobId }, "render job crashed");
    });
  });
});

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`render-worker listening on :${PORT}`);
});
