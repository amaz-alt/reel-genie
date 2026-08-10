/**
 * Reaction + Demo Reels — standalone module server functions.
 *
 * Isolated by design: this file does not import from render.functions.ts,
 * templates.ts, or the typography engine. It owns its own asset library, AI
 * tagging, pairing, hook writing, and render dispatch against the
 * "reaction-demo" Remotion composition.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/lib/app-auth-middleware";
import { z } from "zod";
import {
  buildVariation,
  pickDemo,
  pickReaction,
  type AssetTags,
  type ReactionAsset,
} from "@/lib/reaction/pairing";
import { pickTrackForReel } from "@/lib/music-library";

const BUCKET = "reaction-assets";
const TEMPLATE_ID = "reaction-demo";
const MAX_ATTEMPTS = 3;

const DEFAULT_COLORS = { primary: "#111111", accent: "#F5E63B", background: "#F5E63B", text: "#111111" };
const DEFAULT_FONTS = { display: "Space Grotesk", body: "Inter" };

function twoColorPalette(stored: Record<string, string> | null) {
  const ink = stored?.primary || DEFAULT_COLORS.primary;
  const field = stored?.accent || stored?.background || DEFAULT_COLORS.accent;
  return { primary: ink, accent: field, background: field, text: ink };
}

/* ============================ asset library ============================ */

export const createReactionAssetUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        kind: z.enum(["reaction", "demo"]),
        filename: z.string().min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${data.brand_id}/${data.kind}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}-${safe}`;
    const { data: signed, error } = await context.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/**
 * Vision-tag one clip from a handful of evenly-spaced frames extracted in the
 * browser. Best-effort: a failure still stores the asset, just untagged.
 */
async function visionTagClip(
  kind: "reaction" | "demo",
  frames: string[],
): Promise<AssetTags | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !frames.length) return null;

  const sys =
    kind === "reaction"
      ? [
          "You are tagging a short UGC reaction clip for an automated short-form video engine.",
          "You will see evenly-spaced frames from ONE clip of a person reacting.",
          "Describe the reusable qualities so the engine can pair it with a matching product demo.",
          "Output STRICT JSON only. Schema:",
          '{"summary":"what is visibly happening in one line","emotion":"one word: shocked|impressed|confused|delighted|skeptical|relieved|excited|deadpan","energy":"low|medium|high","topics":["topics this reaction suits"],"pairsWith":["short tags like time-saving,too-good-to-be-true,before-after,price-shock"],"bestUse":"one line on when to use it","suitability":"hook|payoff|either"}',
        ].join("\n")
      : [
          "You are tagging a short product-demo screen recording for an automated short-form video engine.",
          "You will see evenly-spaced frames from ONE demo clip.",
          "Identify what the product is visibly doing so the engine can write a curiosity one-liner for it.",
          "Output STRICT JSON only. Schema:",
          '{"summary":"what is visibly happening in one line","showcases":"the specific feature/outcome being demonstrated","emotion":"the feeling this should trigger: shocked|impressed|relieved|delighted|skeptical","energy":"low|medium|high","topics":["feature/topic tags"],"pairsWith":["short tags like time-saving,automation,one-click,before-after"],"bestUse":"one line on when to use it","suitability":"hook|payoff|either"}',
        ].join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Tag this clip. Return the JSON only." },
              ...frames.slice(0, 6).map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return JSON.parse(j?.choices?.[0]?.message?.content ?? "null");
  } catch {
    return null;
  }
}

export const addReactionAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        kind: z.enum(["reaction", "demo"]),
        storage_path: z.string().min(1),
        label: z.string().max(200).optional(),
        duration_seconds: z.number().positive().max(120).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        frames: z.array(z.string()).max(6).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const tags = data.frames?.length ? await visionTagClip(data.kind, data.frames) : null;
    const { data: row, error } = await context.supabase
      .from("reaction_assets")
      .insert({
        brand_id: data.brand_id,
        owner_id: context.userId,
        kind: data.kind,
        storage_path: data.storage_path,
        label: data.label ?? null,
        duration_seconds: data.duration_seconds ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ai_tags: (tags ?? {}) as any,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, tagged: Boolean(tags) };
  });

export const listReactionAssets = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("reaction_assets")
      .select("id, kind, storage_path, label, duration_seconds, ai_tags, last_used_at, use_count, created_at")
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getReactionAssetUrl = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const retagReactionAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["reaction", "demo"]),
        frames: z.array(z.string()).min(1).max(6),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const tags = await visionTagClip(data.kind, data.frames);
    if (!tags) throw new Error("AI tagging failed — try again in a moment.");
    const { error } = await context.supabase
      .from("reaction_assets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ ai_tags: tags as any })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, ai_tags: tags };
  });

export const updateReactionAssetLabel = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), label: z.string().max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reaction_assets")
      .update({ label: data.label })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteReactionAsset = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("reaction_assets")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) await context.supabase.storage.from(BUCKET).remove([row.storage_path]);
    const { error } = await context.supabase.from("reaction_assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ============================ hook writing ============================ */

const HOOK_ANGLES = [
  "regret you didn't find it sooner",
  "disbelief that this is possible",
  "the amount of time it just saved",
  "quietly admitting you were doing it the hard way",
  "the thing you didn't know software could do",
  "how little effort this took",
] as const;

async function writeOneLiner(opts: {
  brandName: string;
  knowledgeBase: string;
  demoTags: AssetTags;
  reactionTags: AssetTags;
  angle: string;
  recentHooks: string[];
}): Promise<{ hook: string; caption: string; hashtags: string[] }> {
  const fallback = {
    hook: "I wish I found this 3 years ago.",
    caption: `${opts.demoTags.showcases ?? opts.demoTags.summary ?? opts.brandName} — see it in action.`,
    hashtags: ["#ai", "#automation", "#founders"],
  };
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallback;

  const sys = [
    "You write the single on-screen line for a reaction+demo short-form video.",
    "The viewer sees a person reacting, then a 4-10s screen recording of the product.",
    "RULES:",
    "- ONE line. 3 to 9 words. Under 46 characters when possible.",
    "- Spoken, casual, first-person or second-person. No marketing voice, no emojis, no hashtags in the line.",
    "- Curiosity or relief, never a feature list. Reference the outcome, not the UI.",
    "- Examples of the register: \"I wish I found this 3 years ago.\" / \"Didn't know AI could handle my entire marketing.\" / \"This just saved me 4 hours.\"",
    "- Must be readable at a glance on a phone.",
    `- Angle for THIS video: ${opts.angle}.`,
    opts.recentHooks.length ? `- Do NOT reuse or paraphrase: ${opts.recentHooks.join(" | ")}` : "",
    "Return STRICT JSON: {\"hook\":\"the one line\",\"caption\":\"1-2 sentence social caption\",\"hashtags\":[\"#tag\",\"#tag\",\"#tag\"]}",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Brand: ${opts.brandName}`,
    opts.knowledgeBase ? `Brand knowledge: ${opts.knowledgeBase.slice(0, 1500)}` : "",
    `Demo clip shows: ${opts.demoTags.showcases ?? opts.demoTags.summary ?? "the product in use"}`,
    opts.demoTags.topics?.length ? `Demo topics: ${opts.demoTags.topics.join(", ")}` : "",
    `Reaction clip reads as: ${opts.reactionTags.emotion ?? "impressed"} (${opts.reactionTags.summary ?? "person reacting"})`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.95,
      }),
    });
    if (!res.ok) return fallback;
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "null");
    const hook = String(parsed?.hook ?? "").trim();
    if (!hook) return fallback;
    return {
      hook: hook.slice(0, 90),
      caption: String(parsed?.caption ?? fallback.caption).slice(0, 600),
      hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.slice(0, 6).map(String) : fallback.hashtags,
    };
  } catch {
    return fallback;
  }
}

/* ============================ generation ============================ */

export const listReactionReels = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("reaction_reels")
      .select(
        "id, hook, caption, hashtags, arrangement, status, video_url, storage_path, plan, error, created_at, published_at, render_job_id",
      )
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const generateReactionReel = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, name, brand_colors, brand_fonts, knowledge_base")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    const { data: assetRows } = await supabase
      .from("reaction_assets")
      .select("id, kind, storage_path, label, duration_seconds, ai_tags, last_used_at, use_count")
      .eq("brand_id", brand.id);
    const assets = (assetRows ?? []) as unknown as ReactionAsset[];
    const demos = assets.filter((a) => a.kind === "demo");
    const reactions = assets.filter((a) => a.kind === "reaction");
    if (!demos.length) throw new Error("Upload at least one product-demo clip first.");
    if (!reactions.length) throw new Error("Upload at least one reaction clip first.");

    const seed = Math.floor(Math.random() * 1e9);
    const rand = () => Math.random();
    const demo = pickDemo(demos, rand)!;
    const reaction = pickReaction(demo, reactions, rand)!;

    const { data: recent } = await supabase
      .from("reaction_reels")
      .select("arrangement, hook")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(6);
    const recentArrangements = (recent ?? []).map((r) => String(r.arrangement ?? ""));
    const recentHooks = (recent ?? []).map((r) => String(r.hook ?? "")).filter(Boolean).slice(0, 4);

    const plan = buildVariation({ seed, demo, reaction, recentArrangements });
    const angle = HOOK_ANGLES[seed % HOOK_ANGLES.length];
    const copy = await writeOneLiner({
      brandName: brand.name,
      knowledgeBase: brand.knowledge_base ?? "",
      demoTags: demo.ai_tags ?? {},
      reactionTags: reaction.ai_tags ?? {},
      angle,
      recentHooks,
    });

    const { data: reel, error: reelErr } = await supabase
      .from("reaction_reels")
      .insert({
        brand_id: brand.id,
        owner_id: userId,
        hook: copy.hook,
        caption: copy.caption,
        hashtags: copy.hashtags,
        reaction_asset_id: reaction.id,
        demo_asset_id: demo.id,
        arrangement: plan.arrangement,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan: { ...plan, angle, seed } as any,
        status: "queued",
      })
      .select("id")
      .single();
    if (reelErr) throw new Error(reelErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Sign long-lived read URLs for both clips so the worker can fetch them.
    const signClip = async (path: string) => {
      const { data: signed, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 6);
      if (error || !signed?.signedUrl) throw new Error(`Could not sign clip ${path}: ${error?.message ?? "unknown"}`);
      return signed.signedUrl;
    };
    const reactionUrl = await signClip(reaction.storage_path);
    const demoUrl = await signClip(demo.storage_path);

    const music = pickTrackForReel({
      pace: plan.arrangement === "split-stack" ? "reflective" : "punchy",
      seed,
      recentTrackIds: [],
    });
    let musicUrl = "";
    if (music.storagePath) {
      const { data: signedMusic } = await supabaseAdmin.storage
        .from("brand-assets")
        .createSignedUrl(music.storagePath, 60 * 60 * 6);
      musicUrl = signedMusic?.signedUrl ?? "";
    }

    const durationInFrames = Math.round(plan.totalSeconds * 30);
    const storagePath = `${userId}/${brand.id}/reaction-reels/${reel.id}.mp4`;

    const props = {
      hook: copy.hook,
      brand: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colors: twoColorPalette((brand.brand_colors as any) ?? null),
        fonts: { ...DEFAULT_FONTS, ...((brand.brand_fonts as Record<string, string> | null) ?? {}) },
        logoUrl: null,
      },
      handle: brand.name ? `@${brand.name}` : null,
      reaction: { url: reactionUrl, startFrom: plan.reactionStartFrom },
      demo: { url: demoUrl, startFrom: plan.demoStartFrom },
      reactionSeconds: plan.reactionSeconds,
      demoSeconds: plan.demoSeconds,
      arrangement: plan.arrangement,
      textStyle: plan.textStyle,
      hookPlacement: plan.hookPlacement,
      hookTiming: plan.hookTiming,
      music: musicUrl
        ? { id: music.id, title: music.title, artist: music.artist, url: musicUrl, volume: 0.16, startFrom: 0 }
        : undefined,
      seed,
      durationInFrames,
    };

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("render_jobs")
      .insert({
        brand_id: brand.id,
        reel_id: null,
        template_id: TEMPLATE_ID,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: props as any,
        storage_path: storagePath,
        status: "queued",
        max_attempts: MAX_ATTEMPTS,
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(jobErr.message);

    await supabaseAdmin
      .from("reaction_reels")
      .update({ render_job_id: job.id, storage_path: storagePath, status: "rendering" })
      .eq("id", reel.id);

    // Mark both clips as used so rotation advances.
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("reaction_assets")
      .update({ last_used_at: now, use_count: (demo.use_count ?? 0) + 1 })
      .eq("id", demo.id);
    await supabaseAdmin
      .from("reaction_assets")
      .update({ last_used_at: now, use_count: (reaction.use_count ?? 0) + 1 })
      .eq("id", reaction.id);

    // Dispatch to the render worker (direct-write mode; reelId stays null so
    // the worker never touches the typography `reels` table).
    const workerUrl = process.env.VPS_RENDER_URL;
    const workerToken = process.env.RENDER_WORKER_TOKEN;
    if (!workerUrl || !workerToken) {
      await supabaseAdmin
        .from("reaction_reels")
        .update({ status: "failed", error: "Render worker not configured." })
        .eq("id", reel.id);
      throw new Error("Render worker not configured. Set VPS_RENDER_URL and RENDER_WORKER_TOKEN.");
    }

    const { data: upload, error: uploadErr } = await supabaseAdmin.storage
      .from("brand-assets")
      .createSignedUploadUrl(storagePath);
    if (uploadErr) throw new Error(uploadErr.message);

    await supabaseAdmin
      .from("render_jobs")
      .update({ status: "rendering", attempts: 1, dispatched_at: now, worker_url: workerUrl })
      .eq("id", job.id);

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
        body: JSON.stringify({
          jobId: job.id,
          templateId: TEMPLATE_ID,
          width: 1080,
          height: 1920,
          fps: 30,
          durationInFrames,
          props,
          upload: { signedUrl: upload.signedUrl, path: storagePath },
          supabase: {
            url: process.env.SUPABASE_URL!,
            serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            reelId: null,
            storagePath,
            signedUrlExpiresIn: 60 * 60 * 24 * 7,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Worker rejected job (${res.status}): ${body.slice(0, 400)}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("render_jobs").update({ status: "failed", last_error: message }).eq("id", job.id);
      await supabaseAdmin.from("reaction_reels").update({ status: "failed", error: message }).eq("id", reel.id);
      throw new Error(message);
    }

    return { id: reel.id, hook: copy.hook, arrangement: plan.arrangement, duration_seconds: plan.totalSeconds };
  });

/**
 * Reconcile reaction reels against their render jobs and sign a playable URL
 * once the MP4 lands. Called by the UI while any reel is still rendering.
 */
export const syncReactionReels = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: pending } = await context.supabase
      .from("reaction_reels")
      .select("id, render_job_id, storage_path, status")
      .eq("brand_id", data.brand_id)
      .in("status", ["queued", "rendering"]);
    if (!pending?.length) return { updated: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let updated = 0;
    for (const reel of pending) {
      if (!reel.render_job_id) continue;
      const { data: job } = await supabaseAdmin
        .from("render_jobs")
        .select("status, last_error, storage_path")
        .eq("id", reel.render_job_id)
        .maybeSingle();
      if (!job) continue;
      if (job.status === "completed" || job.status === "ready") {
        const path = job.storage_path ?? reel.storage_path;
        if (!path) continue;
        const { data: signed } = await supabaseAdmin.storage
          .from("brand-assets")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        await supabaseAdmin
          .from("reaction_reels")
          .update({ status: "ready", video_url: signed?.signedUrl ?? null })
          .eq("id", reel.id);
        updated++;
      } else if (job.status === "failed") {
        await supabaseAdmin
          .from("reaction_reels")
          .update({ status: "failed", error: job.last_error ?? "Render failed" })
          .eq("id", reel.id);
        updated++;
      }
    }
    return { updated };
  });

export const deleteReactionReel = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reaction_reels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
