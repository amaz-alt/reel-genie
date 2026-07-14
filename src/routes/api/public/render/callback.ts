import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * VPS render worker calls this when a job finishes (or fails).
 * Body is signed with RENDER_CALLBACK_SECRET (HMAC-SHA256 over raw body).
 *
 * Body shape:
 *   {
 *     jobId: string,
 *     status: "completed" | "failed",
 *     error?: string,
 *     logs?: Array<{ level: "info"|"warn"|"error", stage: string, message: string }>,
 *     transient?: boolean   // if true, allow re-queue when attempts remain
 *   }
 */
export const Route = createFileRoute("/api/public/render/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RENDER_CALLBACK_SECRET;
        if (!secret) return new Response("Not configured", { status: 500 });

        const sigHeader = request.headers.get("x-render-signature") ?? "";
        const raw = await request.text();
        const expected = createHmac("sha256", secret).update(raw).digest("hex");

        const a = Buffer.from(sigHeader, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          jobId?: string;
          status?: string;
          error?: string;
          transient?: boolean;
          logs?: Array<{ level?: string; stage?: string; message?: string }>;
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!payload.jobId || !payload.status) {
          return new Response("Missing fields", { status: 400 });
        }
        // Legacy status aliases from earlier worker builds.
        const status = payload.status === "done" ? "completed" : payload.status;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: job } = await supabaseAdmin
          .from("render_jobs")
          .select("id, reel_id, storage_path, status, attempts, max_attempts, logs")
          .eq("id", payload.jobId)
          .maybeSingle();
        if (!job) return new Response("Job not found", { status: 404 });

        // Idempotent: a terminal state stays terminal. A duplicate "completed"
        // callback for an already-completed job returns 200 without side effects.
        if (job.status === "completed" || job.status === "failed") {
          return Response.json({ ok: true, idempotent: true, status: job.status });
        }

        const now = new Date().toISOString();
        const priorLogs = Array.isArray(job.logs) ? job.logs : [];
        const workerLogs = Array.isArray(payload.logs)
          ? payload.logs.map((l) => ({
              at: now,
              level: (l.level as "info" | "warn" | "error") ?? "info",
              stage: l.stage ?? "worker",
              message: String(l.message ?? ""),
            }))
          : [];

        if (status === "completed") {
          const logs = [
            ...priorLogs,
            ...workerLogs,
            { at: now, level: "info", stage: "callback", message: "worker reported completed" },
          ];
          await supabaseAdmin
            .from("render_jobs")
            .update({ status: "completed", completed_at: now, logs })
            .eq("id", job.id);
          if (job.reel_id && job.storage_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from("brand-assets")
              .createSignedUrl(job.storage_path, 60 * 60 * 24 * 7);
            await supabaseAdmin
              .from("reels")
              .update({ status: "ready", video_url: signed?.signedUrl ?? null })
              .eq("id", job.reel_id);
          }
          return Response.json({ ok: true });
        }

        // Failure path — retry if attempts remain and worker flagged it transient.
        const attempts = job.attempts ?? 0;
        const maxAttempts = job.max_attempts ?? 3;
        const canRetry = payload.transient !== false && attempts < maxAttempts;
        const errMsg = payload.error ?? "unknown";
        const logs = [
          ...priorLogs,
          ...workerLogs,
          {
            at: now,
            level: "error",
            stage: "callback",
            message: canRetry
              ? `worker failed (attempt ${attempts}/${maxAttempts}) — re-queueing: ${errMsg}`
              : `worker failed permanently (attempt ${attempts}/${maxAttempts}): ${errMsg}`,
          },
        ];

        if (canRetry) {
          await supabaseAdmin
            .from("render_jobs")
            .update({ status: "queued", last_error: errMsg, logs })
            .eq("id", job.id);
        } else {
          await supabaseAdmin
            .from("render_jobs")
            .update({ status: "failed", last_error: errMsg, completed_at: now, logs })
            .eq("id", job.id);
          if (job.reel_id) {
            await supabaseAdmin
              .from("reels")
              .update({ status: "failed", error: errMsg })
              .eq("id", job.reel_id);
          }
        }

        return Response.json({ ok: true, retried: canRetry });
      },
    },
  },
});
