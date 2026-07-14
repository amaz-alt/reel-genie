import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getRenderService, type RenderJobPayload, type RenderProps } from "./render/RenderService";
import { TEMPLATES } from "./templates";

const DEFAULT_COLORS = {
  primary: "#111111",
  accent: "#ff3b30",
  background: "#f5f1ea",
  text: "#111111",
};
const DEFAULT_FONTS = { display: "Space Grotesk", body: "Inter" };

/**
 * Enqueue + dispatch a render for a brand.
 * v1: called from a "Render now" button on the brand detail page.
 * Cron pipeline will reuse the same server fn after picking a product row.
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

    // 1. Load brand (RLS enforces ownership).
    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, name, template_id, brand_colors, brand_fonts, logo_url")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    const templateId = brand.template_id ?? TEMPLATES[0].id;

    // 2. Create reel + render_job rows via the admin client so status
    //    transitions from the callback (unauth) can also update them.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reel, error: reelErr } = await supabaseAdmin
      .from("reels")
      .insert({
        brand_id: brand.id,
        hook: data.hook,
        caption: data.caption ?? null,
        status: "queued",
      })
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
        props: props as unknown as Record<string, unknown>,
        storage_path: storagePath,
        status: "queued",
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(jobErr.message);

    await supabaseAdmin.from("reels").update({ render_job_id: job.id }).eq("id", reel.id);

    // 3. Signed upload URL for the eventual MP4.
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from("brand-assets")
      .createSignedUploadUrl(storagePath);
    if (signedErr) throw new Error(signedErr.message);

    // 4. Build the payload and hand it to the VPS.
    const origin = process.env.PUBLIC_APP_URL ?? "";
    const callbackUrl = `${origin.replace(/\/$/, "")}/api/public/render/callback`;

    const payload: RenderJobPayload = {
      jobId: job.id,
      templateId,
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 180,
      props,
      upload: { signedUrl: signed.signedUrl, path: storagePath },
      callback: { url: callbackUrl, hmacKeyId: "v1" },
    };

    try {
      const svc = getRenderService();
      await svc.submit(payload);
      await supabaseAdmin
        .from("render_jobs")
        .update({
          status: "dispatched",
          attempts: 1,
          dispatched_at: new Date().toISOString(),
          worker_url: process.env.VPS_RENDER_URL ?? null,
        })
        .eq("id", job.id);
      await supabaseAdmin.from("reels").update({ status: "rendering" }).eq("id", reel.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("render_jobs")
        .update({ status: "failed", last_error: message })
        .eq("id", job.id);
      await supabaseAdmin
        .from("reels")
        .update({ status: "failed", error: message })
        .eq("id", reel.id);
      throw new Error(message);
    }

    return { reel_id: reel.id, job_id: job.id };
  });

/**
 * Drain queued render_jobs — called by cron once the daily pipeline is wired.
 * Idempotent: skips jobs already dispatched/done.
 */
export const drainRenderQueue = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: jobs } = await supabaseAdmin
    .from("render_jobs")
    .select("id, brand_id, reel_id, template_id, props, storage_path, attempts")
    .eq("status", "queued")
    .lt("attempts", 3)
    .limit(20);

  if (!jobs || jobs.length === 0) return { dispatched: 0 };

  const svc = getRenderService();
  const origin = process.env.PUBLIC_APP_URL ?? "";
  const callbackUrl = `${origin.replace(/\/$/, "")}/api/public/render/callback`;

  let dispatched = 0;
  for (const j of jobs) {
    if (!j.storage_path) continue;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("brand-assets")
      .createSignedUploadUrl(j.storage_path);
    if (sErr) continue;

    try {
      await svc.submit({
        jobId: j.id,
        templateId: j.template_id,
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 180,
        props: j.props as unknown as RenderProps,
        upload: { signedUrl: signed.signedUrl, path: j.storage_path },
        callback: { url: callbackUrl, hmacKeyId: "v1" },
      });
      await supabaseAdmin
        .from("render_jobs")
        .update({
          status: "dispatched",
          attempts: (j.attempts ?? 0) + 1,
          dispatched_at: new Date().toISOString(),
        })
        .eq("id", j.id);
      if (j.reel_id) {
        await supabaseAdmin.from("reels").update({ status: "rendering" }).eq("id", j.reel_id);
      }
      dispatched++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("render_jobs")
        .update({
          attempts: (j.attempts ?? 0) + 1,
          last_error: message,
          status: (j.attempts ?? 0) + 1 >= 3 ? "failed" : "queued",
        })
        .eq("id", j.id);
    }
  }
  return { dispatched };
});
