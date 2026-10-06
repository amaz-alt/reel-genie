import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/lib/app-auth-middleware";
import { z } from "zod";

const BUCKET = "broll-assets";
const OUTPUT_BUCKET = "brand-assets";
const TEMPLATE_ID = "broll-hook";

const STUCK_AFTER_MS = 20 * 60 * 1000;

type ReelRow = {
  id: string;
  hook_id: string | null;
  render_job_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
  [key: string]: unknown;
};

/**
 * Reels can get stuck in "rendering" when the render server fails without
 * reporting back (e.g. an outdated server build). Sync them with the render job
 * and give up after STUCK_AFTER_MS, returning the hook line to the queue.
 */
async function reconcileStuckReels<T extends ReelRow>(supabase: any, rows: T[]): Promise<T[]> {
  const pending = rows.filter((row) => row.status === "rendering" || row.status === "queued");
  if (!pending.length) return rows;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const jobIds = pending.map((row) => row.render_job_id).filter((id): id is string => Boolean(id));
  const { data: jobs } = jobIds.length
    ? await supabaseAdmin.from("render_jobs").select("id, status, last_error").in("id", jobIds)
    : { data: [] as { id: string; status: string; last_error: string | null }[] };
  const jobMap = new Map((jobs ?? []).map((job) => [job.id, job]));
  const now = Date.now();
  const updates = new Map<string, { status: string; error: string | null }>();

  for (const row of pending) {
    const job = row.render_job_id ? jobMap.get(row.render_job_id) : undefined;
    let error: string | null = null;
    if (job?.status === "failed") {
      error = /Could not find composition/i.test(job.last_error ?? "")
        ? "The render server is outdated and can't make B-roll reels yet. Update it, then generate again."
        : job.last_error || "Render failed.";
    } else if (job?.status !== "completed" && now - new Date(row.created_at).getTime() > STUCK_AFTER_MS) {
      error = "This reel took too long and was stopped. Its hook line is back in the queue.";
      if (job) await supabaseAdmin.from("render_jobs").update({ status: "failed", last_error: error }).eq("id", job.id);
    }
    if (!error) continue;
    await supabaseAdmin.from("broll_reels").update({ status: "failed", error }).eq("id", row.id);
    if (row.hook_id) await supabase.from("broll_hooks").update({ used_at: null }).eq("id", row.hook_id);
    updates.set(row.id, { status: "failed", error });
  }
  return rows.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id)! } : row));
}

async function assertRendererSupportsBroll(workerUrl: string) {
  let health: { version?: string; features?: string[] } | null = null;
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(8_000) });
    if (response.ok) health = await response.json();
  } catch {
    throw new Error("The render server isn't responding. Check that it's running on your server, then try again.");
  }
  if (!health) throw new Error("The render server isn't responding. Check that it's running on your server, then try again.");
  if (!health.features?.includes("broll-hook")) {
    throw new Error(`Your render server is an older version (${health.version ?? "unknown"}) that can't make B-roll reels. Update it on your server, then generate again.`);
  }
}

export const createBrollUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid(), filename: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { count, error: countError } = await context.supabase
      .from("broll_assets")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brand_id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= 15) throw new Error("This brand already has 15 B-roll clips. Delete one before adding another.");
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${data.brand_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, signedUrl: signed.signedUrl };
  });

export const addBrollAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid(), storage_path: z.string().min(1), label: z.string().max(200), duration_seconds: z.number().positive().max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.storage_path.startsWith(`${context.userId}/${data.brand_id}/`)) {
      throw new Error("The uploaded clip does not belong to this brand.");
    }
    const { count, error: countError } = await context.supabase
      .from("broll_assets")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brand_id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= 15) throw new Error("This brand already has 15 B-roll clips.");
    const { data: row, error } = await context.supabase
      .from("broll_assets")
      .insert({
        brand_id: data.brand_id,
        owner_id: context.userId,
        storage_path: data.storage_path,
        label: data.label,
        duration_seconds: data.duration_seconds,
        sort_order: count ?? 0,
      })
      .select("id")
      .single();
    if (error) {
      await context.supabase.storage.from(BUCKET).remove([data.storage_path]);
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const listBrollAssets = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("broll_assets")
      .select("id, storage_path, label, duration_seconds, sort_order, created_at")
      .eq("brand_id", data.brand_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return Promise.all((rows ?? []).map(async (row) => {
      const { data: signed } = await context.supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 60);
      return { ...row, preview_url: signed?.signedUrl ?? null };
    }));
  });

export const deleteBrollAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: readError } = await context.supabase
      .from("broll_assets")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) return { ok: true as const };
    const { error: storageError } = await context.supabase.storage.from(BUCKET).remove([row.storage_path]);
    if (storageError) throw new Error(storageError.message);
    const { error } = await context.supabase.from("broll_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const addBrollHooks = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid(), hooks: z.array(z.string().trim().min(1).max(240)).min(1).max(1000) }).parse(input))
  .handler(async ({ data, context }) => {
    const uniqueHooks = [...new Set(data.hooks.map((hook) => hook.trim()).filter(Boolean))];
    if (!uniqueHooks.length) throw new Error("Paste at least one hook line.");
    const { data: existing, error: existingError } = await context.supabase
      .from("broll_hooks")
      .select("hook_text")
      .eq("brand_id", data.brand_id);
    if (existingError) throw new Error(existingError.message);
    const existingSet = new Set((existing ?? []).map((row) => row.hook_text.trim().toLocaleLowerCase()));
    const newHooks = uniqueHooks.filter((hook) => !existingSet.has(hook.toLocaleLowerCase()));
    if (!newHooks.length) return { added: 0, ignored: uniqueHooks.length };
    const { error } = await context.supabase.from("broll_hooks").insert(
      newHooks.map((hook_text) => ({ brand_id: data.brand_id, owner_id: context.userId, hook_text })),
    );
    if (error) throw new Error(error.message);
    return { added: newHooks.length, ignored: uniqueHooks.length - newHooks.length };
  });

export const listBrollHooks = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("broll_hooks")
      .select("id, hook_text, used_at, created_at")
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listBrollReels = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("broll_reels")
      .select("id, hook_id, render_job_id, hook_text, status, storage_path, video_url, error, created_at")
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const reconciled = await reconcileStuckReels(context.supabase, rows ?? []);
    return Promise.all(reconciled.map(async (row) => {
      if (row.status !== "ready" || !row.storage_path) return row;
      const { data: signed } = await context.supabase.storage.from(OUTPUT_BUCKET).createSignedUrl(row.storage_path, 60 * 60);
      return { ...row, video_url: signed?.signedUrl ?? row.video_url };
    }));
  });

export const generateBrollReels = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((input: unknown) => z.object({ brand_id: z.string().uuid(), count: z.number().int().min(1).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, name, brand_colors, brand_fonts")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandError) throw new Error(brandError.message);
    if (!brand) throw new Error("Brand not found.");

    const [{ data: clips, error: clipError }, { data: hooks, error: hookError }, { count: priorCount, error: reelError }] = await Promise.all([
      supabase.from("broll_assets").select("id, storage_path, duration_seconds, sort_order").eq("brand_id", brand.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("broll_hooks").select("id, hook_text").eq("brand_id", brand.id).is("used_at", null).order("created_at", { ascending: true }).limit(data.count),
      supabase.from("broll_reels").select("id", { count: "exact", head: true }).eq("brand_id", brand.id),
    ]);
    if (clipError) throw new Error(clipError.message);
    if (hookError) throw new Error(hookError.message);
    if (reelError) throw new Error(reelError.message);
    if (!clips?.length) throw new Error("Upload at least one B-roll clip first.");
    if (!hooks?.length) throw new Error("Add hook lines before generating.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const workerUrl = process.env.VPS_RENDER_URL;
    const workerToken = process.env.RENDER_WORKER_TOKEN;
    if (!workerUrl || !workerToken) throw new Error("The render service is not configured.");
    await assertRendererSupportsBroll(workerUrl);
    const dispatchOne = async (hook: (typeof hooks)[number], index: number) => {
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("broll_hooks")
        .update({ used_at: now })
        .eq("id", hook.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!claimed) return { ok: false as const, skipped: true as const };

      let reelId: string | null = null;
      let renderJobId: string | null = null;
      try {
        const clip = clips[((priorCount ?? 0) + index) % clips.length];
        const { data: reel, error: reelInsertError } = await supabase
          .from("broll_reels")
          .insert({ brand_id: brand.id, owner_id: userId, asset_id: clip.id, hook_id: hook.id, hook_text: hook.hook_text, status: "queued" })
          .select("id")
          .single();
        if (reelInsertError) throw new Error(reelInsertError.message);
        reelId = reel.id;

        const { data: signedClip, error: signError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(clip.storage_path, 60 * 60 * 6);
        if (signError || !signedClip?.signedUrl) throw new Error(signError?.message ?? "Could not prepare source clip.");
        const storagePath = `${userId}/${brand.id}/broll-reels/${reel.id}.mp4`;
        const { data: outputUpload, error: outputError } = await supabaseAdmin.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(storagePath);
        if (outputError) throw new Error(outputError.message);

        const durationInFrames = Math.max(30, Math.min(30 * 60, Math.round((clip.duration_seconds ?? 10) * 30)));
        const colors = (brand.brand_colors ?? {}) as Record<string, string>;
        const fonts = (brand.brand_fonts ?? {}) as Record<string, string>;
        const props = {
          hook: hook.hook_text,
          video: { url: signedClip.signedUrl, durationSeconds: clip.duration_seconds ?? 10 },
          brand: {
            colors: {
              primary: colors.primary || "#111111",
              accent: colors.accent || colors.background || "#F5E63B",
              background: colors.accent || colors.background || "#F5E63B",
              text: colors.primary || "#111111",
            },
            fonts: { display: fonts.display || "Space Grotesk", body: fonts.body || "Inter" },
          },
        };
        const { data: job, error: jobError } = await supabaseAdmin.from("render_jobs").insert({
          brand_id: brand.id,
          reel_id: null,
          template_id: TEMPLATE_ID,
          props,
          storage_path: storagePath,
          status: "queued",
          max_attempts: 3,
        }).select("id").single();
        if (jobError) throw new Error(jobError.message);
        renderJobId = job.id;

        await supabaseAdmin.from("broll_reels").update({ render_job_id: job.id, storage_path: storagePath, status: "rendering" }).eq("id", reel.id);
        await supabaseAdmin.from("render_jobs").update({ status: "rendering", attempts: 1, dispatched_at: now, worker_url: workerUrl }).eq("id", job.id);
        const response = await fetch(`${workerUrl.replace(/\/$/, "")}/render`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
          body: JSON.stringify({
            jobId: job.id,
            templateId: TEMPLATE_ID,
            width: 1080,
            height: 1920,
            fps: 30,
            durationInFrames,
            x264Preset: "veryfast",
            lane: "broll",
            props,
            upload: { signedUrl: outputUpload.signedUrl, path: storagePath },
            supabase: {
              url: process.env.SUPABASE_URL,
              serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              reelId: null,
              brollReelId: reel.id,
              storagePath,
              signedUrlExpiresIn: 60 * 60 * 24 * 7,
            },
          }),
        });
        if (!response.ok) throw new Error(`Render service rejected this video (${response.status}).`);
        return { ok: true as const, result: { id: reel.id, hook_text: hook.hook_text } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (reelId) await supabaseAdmin.from("broll_reels").update({ status: "failed", error: message }).eq("id", reelId);
        if (renderJobId) await supabaseAdmin.from("render_jobs").update({ status: "failed", last_error: message }).eq("id", renderJobId);
        await supabase.from("broll_hooks").update({ used_at: null }).eq("id", hook.id).eq("used_at", now);
        return { ok: false as const, skipped: false as const, message };
      }
    };

    const outcomes: Awaited<ReturnType<typeof dispatchOne>>[] = [];
    for (let index = 0; index < hooks.length; index += 3) {
      const batch = hooks.slice(index, index + 3);
      outcomes.push(...await Promise.all(batch.map((hook, offset) => dispatchOne(hook, index + offset))));
    }
    const results = outcomes.flatMap((outcome) => outcome.ok ? [outcome.result] : []);
    const failed = outcomes.filter((outcome) => !outcome.ok && !outcome.skipped).length;
    return { generated: results.length, results, failed, availableHooks: Math.max(0, hooks.length - results.length - failed) };
  });