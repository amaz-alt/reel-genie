import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * VPS render worker calls this when a job finishes (or fails).
 * Body is signed with RENDER_CALLBACK_SECRET (HMAC-SHA256 over raw body).
 *
 * Headers:
 *   x-render-signature: hex-encoded HMAC of the raw body
 *   x-render-key-id:    "v1"
 *
 * Body:
 *   { jobId: string, status: "done" | "failed", error?: string }
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

        let payload: { jobId?: string; status?: string; error?: string };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!payload.jobId || !payload.status) {
          return new Response("Missing fields", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: job } = await supabaseAdmin
          .from("render_jobs")
          .select("id, reel_id, storage_path")
          .eq("id", payload.jobId)
          .maybeSingle();
        if (!job) return new Response("Job not found", { status: 404 });

        if (payload.status === "done") {
          await supabaseAdmin
            .from("render_jobs")
            .update({ status: "done", completed_at: new Date().toISOString() })
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
        } else {
          await supabaseAdmin
            .from("render_jobs")
            .update({
              status: "failed",
              last_error: payload.error ?? "unknown",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          if (job.reel_id) {
            await supabaseAdmin
              .from("reels")
              .update({ status: "failed", error: payload.error ?? "unknown" })
              .eq("id", job.reel_id);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
