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
 * Generate hook + caption + hashtags via Lovable AI using the brand's
 * knowledge base as the voice guide. Falls back to a sane default if the
 * gateway is unreachable so a render is never blocked on copy.
 */
async function generateCopy(input: {
  brandName: string;
  knowledgeBase: string | null;
  product?: Record<string, unknown> | null;
}): Promise<{ hook: string; caption: string; hashtags: string[] }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return {
      hook: `${input.brandName}: small change, big result.`,
      caption: `Discover what makes ${input.brandName} different.`,
      hashtags: ["#reels", "#brand", "#daily"],
    };
  }
  const sys = [
    "You are a world-class direct-response copywriter trained in the Copy Posse / Alex Cattoni school of conversion copywriting.",
    "Your job: write a scroll-stopping short-form reel HOOK + caption + hashtags.",
    "",
    "HOOK RULES (this is 90% of the job):",
    "• 8–12 words. Every word earns its place. Cut adjectives, hedges, brand names.",
    "• Open with a pattern interrupt: a bold claim, a contrarian truth, a callout, a question, or a number.",
    "• Use sensory, specific, punchy language. Concrete > abstract. Verbs > nouns.",
    "• NEVER start with 'Discover', 'Introducing', 'Welcome to', or the brand name.",
    "• Speak TO one person, not AT a crowd. Second person ('you', 'your') beats third person.",
    "• Curiosity gap encouraged — tease the payoff, don't reveal it.",
    "• Avoid clichés: 'game-changer', 'level up', 'unlock', 'elevate', 'unleash', 'in today's world'.",
    "• No emojis in the hook. No hashtags in the hook. No quotation marks around the hook.",
    "",
    "CAPTION RULES:",
    "• 1–2 sentences, max 220 chars. Extends the hook, doesn't repeat it. Ends with a soft CTA or intriguing question.",
    "",
    "HASHTAG RULES:",
    "• 5–8 tags. Mix of niche + broad. Each starts with #. No spaces. Lowercase.",
    "",
    'OUTPUT: STRICT JSON only, no prose, no markdown fences. Schema: {"hook": string, "caption": string, "hashtags": string[]}',
  ].join("\n");

  const user = [
    `Brand: ${input.brandName}`,
    input.knowledgeBase
      ? `Brand voice / positioning / audience:\n${input.knowledgeBase}`
      : "",
    input.product ? `Today's product / topic:\n${JSON.stringify(input.product)}` : "",
    `Random creative seed (use this to pick a fresh angle, don't repeat past hooks): ${Math.floor(Math.random() * 1e9)}`,
    "Write ONE reel now. Ship the JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.95,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return {
      hook: String(parsed.hook ?? "").replace(/^["']|["']$/g, "").slice(0, 200) ||
        `${input.brandName}: try it today.`,
      caption: String(parsed.caption ?? "").slice(0, 1000),
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((t: unknown) => String(t)).slice(0, 12)
        : [],
    };
  } catch {
    return {
      hook: `${input.brandName}: small change, big result.`,
      caption: `Discover what makes ${input.brandName} different.`,
      hashtags: ["#reels", "#brand", "#daily"],
    };
  }
}

const MOTION_VARIANTS = ["stagger", "cascade", "bounce", "mask", "shuffle", "swing"] as const;

/**
 * Enqueue + dispatch a render for a brand. Copy is AI-generated from the
 * brand's knowledge base — callers no longer supply the hook.
 */
export const renderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        hook: z.string().min(1).max(200).optional(),
        caption: z.string().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, name, template_id, brand_colors, brand_fonts, logo_url, knowledge_base")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    const templateId = brand.template_id ?? TEMPLATES[0].id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Auto-generate copy unless caller passed one in.
    const copy = data.hook
      ? { hook: data.hook, caption: data.caption ?? "", hashtags: [] as string[] }
      : await generateCopy({
          brandName: brand.name,
          knowledgeBase: brand.knowledge_base,
          product: null,
        });

    const { data: reel, error: reelErr } = await supabaseAdmin
      .from("reels")
      .insert({
        brand_id: brand.id,
        hook: copy.hook,
        caption: copy.caption || null,
        hashtags: copy.hashtags,
        status: "queued",
      })
      .select("id")
      .single();
    if (reelErr) throw new Error(reelErr.message);

    const storagePath = `${userId}/${brand.id}/reels/${reel.id}.mp4`;

    const props: RenderProps = {
      hook: copy.hook,
      caption: copy.caption,
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
    await appendLog(supabaseAdmin, job.id, {
      level: "info",
      stage: "enqueue",
      message: `job created with AI copy: "${copy.hook}"`,
    });

    await dispatchJob(supabaseAdmin, {
      id: job.id,
      reel_id: reel.id,
      template_id: templateId,
      props,
      storage_path: storagePath,
      attempts: 0,
    });

    return { reel_id: reel.id, job_id: job.id, hook: copy.hook };
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
    supabase: {
      url: process.env.SUPABASE_URL!,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      reelId: job.reel_id,
      storagePath: job.storage_path,
      signedUrlExpiresIn: 60 * 60 * 24 * 7,
    },
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
