import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* -------------------- list render jobs for a brand -------------------- */
export const listRenderJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: jobs, error } = await context.supabase
      .from("render_jobs")
      .select(
        "id, reel_id, template_id, status, attempts, max_attempts, last_error, dispatched_at, completed_at, created_at, updated_at, storage_path, logs",
      )
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return jobs ?? [];
  });

import { getRenderService, type RenderJobPayload, type RenderProps } from "./render/RenderService";
import { TEMPLATES } from "./templates";

const DEFAULT_COLORS = {
  primary: "#111111",
  accent: "#ff3b30",
  background: "#f5f1ea",
  text: "#111111",
};
const DEFAULT_FONTS = { display: "Space Grotesk", body: "Inter" };
const MAX_ATTEMPTS = 3;

type LogEntry = { at: string; level: "info" | "warn" | "error"; stage: string; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendLog(admin: any, jobId: string, entry: Omit<LogEntry, "at">) {
  const line: LogEntry = { at: new Date().toISOString(), ...entry };
  // Best-effort append; Postgres has no jsonb append operator in the client so
  // we read+write. Concurrent writes on the same job are not expected.
  const { data } = await admin.from("render_jobs").select("logs").eq("id", jobId).maybeSingle();
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  logs.push(line);
  await admin.from("render_jobs").update({ logs }).eq("id", jobId);
}

/**
 * Enqueue + dispatch a render for a brand.
 * v1: called from a "Render now" button on the brand detail page.
 */
export const renderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        hook: z.string().min(1).max(200),
        caption: z.string().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, name, template_id, brand_colors, brand_fonts, logo_url")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    const templateId = brand.template_id ?? TEMPLATES[0].id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reel, error: reelErr } = await supabaseAdmin
      .from("reels")
      .insert({ brand_id: brand.id, hook: data.hook, caption: data.caption ?? null, status: "queued" })
      .select("id")
      .single();
    if (reelErr) throw new Error(reelErr.message);

    const storagePath = `${userId}/${brand.id}/reels/${reel.id}.mp4`;

    const props: RenderProps = {
      hook: data.hook,
      caption: data.caption,
      brand: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colors: { ...DEFAULT_COLORS, ...((brand.brand_colors as any) ?? {}) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fonts: { ...DEFAULT_FONTS, ...((brand.brand_fonts as any) ?? {}) },
        logoUrl: brand.logo_url,
      },
    };

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("render_jobs")
      .insert({
        brand_id: brand.id,
        reel_id: reel.id,
        template_id: templateId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: props as any,
        storage_path: storagePath,
        status: "queued",
        max_attempts: MAX_ATTEMPTS,
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(jobErr.message);

    await supabaseAdmin.from("reels").update({ render_job_id: job.id }).eq("id", reel.id);
    await appendLog(supabaseAdmin, job.id, { level: "info", stage: "enqueue", message: "job created" });

    await dispatchJob(supabaseAdmin, {
      id: job.id,
      reel_id: reel.id,
      template_id: templateId,
      props,
      storage_path: storagePath,
      attempts: 0,
    });

    return { reel_id: reel.id, job_id: job.id };
  });

/**
 * Idempotent claim + dispatch. Uses a conditional UPDATE so re-entrant calls
 * for the same job never dispatch twice — only the row currently in "queued"
 * transitions to "rendering", and only that caller submits to the worker.
 */
async function dispatchJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  job: {
    id: string;
    reel_id: string | null;
    template_id: string;
    props: RenderProps;
    storage_path: string;
    attempts: number;
  },
): Promise<boolean> {
  const nextAttempt = (job.attempts ?? 0) + 1;

  // Atomic claim: only the process that flips queued→rendering proceeds.
  const { data: claimed } = await admin
    .from("render_jobs")
    .update({
      status: "rendering",
      attempts: nextAttempt,
      dispatched_at: new Date().toISOString(),
      worker_url: process.env.VPS_RENDER_URL ?? null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    await appendLog(admin, job.id, {
      level: "warn",
      stage: "claim",
      message: "job not in queued state, skipping dispatch (idempotent no-op)",
    });
    return false;
  }

  const origin = process.env.PUBLIC_APP_URL ?? "";
  const callbackUrl = `${origin.replace(/\/$/, "")}/api/public/render/callback`;

  const { data: signed, error: signedErr } = await admin.storage
    .from("brand-assets")
    .createSignedUploadUrl(job.storage_path);
  if (signedErr) {
    await appendLog(admin, job.id, { level: "error", stage: "sign_upload", message: signedErr.message });
    await admin
      .from("render_jobs")
      .update({ status: "queued", last_error: signedErr.message })
      .eq("id", job.id);
    return false;
  }

  const payload: RenderJobPayload = {
    jobId: job.id,
    templateId: job.template_id,
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 180,
    props: job.props,
    upload: { signedUrl: signed.signedUrl, path: job.storage_path },
    callback: { url: callbackUrl, hmacKeyId: "v1" },
  };

  try {
    await getRenderService().submit(payload);
    if (job.reel_id) {
      await admin.from("reels").update({ status: "rendering" }).eq("id", job.reel_id);
    }
    await appendLog(admin, job.id, {
      level: "info",
      stage: "dispatch",
      message: `submitted to worker (attempt ${nextAttempt}/${MAX_ATTEMPTS})`,
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const permanent = nextAttempt >= MAX_ATTEMPTS;
    await appendLog(admin, job.id, {
      level: "error",
      stage: "dispatch",
      message: `submit failed: ${message}`,
    });
    await admin
      .from("render_jobs")
      .update({
        status: permanent ? "failed" : "queued",
        last_error: message,
        completed_at: permanent ? new Date().toISOString() : null,
      })
      .eq("id", job.id);
    if (permanent && job.reel_id) {
      await admin.from("reels").update({ status: "failed", error: message }).eq("id", job.reel_id);
    }
    return false;
  }
}

/**
 * Drain queued jobs — called by cron. Also recovers jobs that failed
 * transiently but still have attempts left.
 */
export const drainRenderQueue = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: jobs } = await supabaseAdmin
    .from("render_jobs")
    .select("id, reel_id, template_id, props, storage_path, attempts, max_attempts")
    .eq("status", "queued")
    .lt("attempts", MAX_ATTEMPTS)
    .limit(20);

  if (!jobs || jobs.length === 0) return { dispatched: 0 };

  let dispatched = 0;
  for (const j of jobs) {
    if (!j.storage_path) continue;
    const ok = await dispatchJob(supabaseAdmin, {
      id: j.id,
      reel_id: j.reel_id,
      template_id: j.template_id,
      props: j.props as unknown as RenderProps,
      storage_path: j.storage_path,
      attempts: j.attempts ?? 0,
    });
    if (ok) dispatched++;
  }
  return { dispatched };
});
