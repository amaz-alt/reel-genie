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

import {
  getRenderService,
  type RenderJobPayload,
  type RenderProps,
  type TypographyStylePlan,
} from "./render/RenderService";
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

type ReferenceBrief = { label: string | null; notes: string | null; analysis?: Record<string, unknown> | null };

/**
 * Compute reel duration from copy length. Never force a short cram — every
 * beat gets enough screen time to read comfortably.
 *  <8 words   -> 8s
 *  8-14       -> 11s
 *  15-22      -> 15s
 *  23-34      -> 20s
 *  35-50      -> 25s
 *  >50        -> 30s
 */
export function computeDurationSeconds(hook: string): number {
  const words = String(hook ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (words <= 7) return 8;
  if (words <= 14) return 11;
  if (words <= 22) return 15;
  if (words <= 34) return 20;
  if (words <= 50) return 25;
  return 30;
}

function fallbackStylePlan(hook: string, seed: number): TypographyStylePlan {
  const phrases = hook
    .replace(/[“”"]/g, "")
    .split(/[,;:.!?—–]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const source = phrases.length ? phrases : [hook];
  const layouts = ["center-stack", "upper-left", "poster-block", "lower-left", "split-left"] as const;
  return {
    version: "primitive-typography-v1",
    composition: {
      canvasMood: seed % 3 === 0 ? "minimal" : seed % 3 === 1 ? "editorial" : "bold-poster",
      backgroundMode: seed % 4 === 0 ? "framed-negative-space" : seed % 4 === 1 ? "accent-band" : "solid",
      safeMargin: 90,
    },
    typography: { casing: "as-written", displayWeight: 900, supportWeight: 650, tracking: 0, lineHeight: 0.94 },
    beats: source.slice(0, 6).map((text, index) => {
      const words = text.split(/\s+/).filter(Boolean);
      const hero = chooseSemanticHero(words);
      const start = words.findIndex((w) => cleanWord(w) === cleanWord(hero[0]));
      return {
        text,
        hero,
        supportBefore: start > 0 ? words.slice(0, start).join(" ") : "",
        supportAfter: start >= 0 ? words.slice(start + hero.length).join(" ") : "",
        emphasis: index === 0 ? "strong" : hero.length > 1 ? "hero" : "normal",
        layout: layouts[(seed + index) % layouts.length],
        align: layouts[(seed + index) % layouts.length].includes("left") ? "left" : "center",
        holdWeight: 1 + Math.min(words.length, 8) * 0.06,
        colorRole: index % 3 === 1 ? "invert" : index % 3 === 2 ? "accent-bg" : "base",
        emptySpace: index % 2 ? "wide" : "balanced",
        transition: index % 4 === 0 ? "pop" : index % 4 === 1 ? "settle" : index % 4 === 2 ? "wipe" : "slide",
      } satisfies TypographyStylePlan["beats"][number];
    }),
  };
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "you",
  "your",
  "this",
  "that",
]);

function cleanWord(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function chooseSemanticHero(words: string[]) {
  if (words.length <= 2) return words;
  let best = 0;
  let score = -Infinity;
  words.forEach((word, index) => {
    const bare = cleanWord(word);
    const next = cleanWord(words[index + 1] ?? "");
    const s = (STOP_WORDS.has(bare) ? -4 : bare.length) + (/\d/.test(bare) ? 3 : 0) + index * 0.18 + (next.length >= 5 ? 1 : 0);
    if (s > score) {
      score = s;
      best = index;
    }
  });
  const next = words[best + 1];
  if (next && !STOP_WORDS.has(cleanWord(next)) && cleanWord(next).length >= 5 && words.length > 4) {
    return [words[best], next];
  }
  return [words[best]];
}

async function generateStylePlan(input: {
  hook: string;
  brandName: string;
  knowledgeBase: string | null;
  references: ReferenceBrief[];
  seed: number;
}): Promise<TypographyStylePlan> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return fallbackStylePlan(input.hook, input.seed);

  // Build a compact, high-priority summary from the vision-analyzed references.
  // The planner is instructed to MATCH this design language, not invent one.
  const visionAnalyses = input.references
    .map((r) => r.analysis)
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"));

  const referenceLanguage = visionAnalyses.length
    ? [
        `You have ${visionAnalyses.length} vision-analyzed reference reel(s). MATCH their design language.`,
        "Aggregate visual language across references (majority vote on each dimension):",
        ...visionAnalyses.map((a, i) => `Ref ${i + 1}: ${JSON.stringify(a)}`),
      ].join("\n")
    : input.references.length
      ? `Reference vault heuristic notes:\n${input.references.map((r, i) => `${i + 1}. ${r.label ?? "ref"}${r.notes ? ` — ${r.notes}` : ""}`).join("\n")}`
      : "No references. Default to clean editorial hierarchy with intentional empty space.";

  const sys = [
    "You are a senior motion-design director. Your job is to reverse-engineer the DESIGN LANGUAGE of the user's reference reels and generate a fresh, non-templated beat plan that feels like it belongs in the same visual universe.",
    "You are NOT copying frames or captions. You are extracting reusable design intelligence: hierarchy, pacing, empty space, emphasis, casing, motion restraint, palette usage.",
    "Return a design primitive plan for a 1080x1920 short-form reel.",
    "HARD RULES:",
    "- Hero can be 1 word, 2 words, or a full phrase — choose based on the sentence's meaning, not a fixed rule.",
    "- Layout is intentional: centered, upper-left, lower-left, split-left, right-rail, full-phrase, or poster-block. Vary across beats to create rhythm.",
    "- Motion transitions: settle/pop/wipe/slide/cut ONLY. Never chaotic (no spin/shake/blur).",
    "- Empty space is a design element. Do not fill the frame by default.",
    "- Pacing: important beats hold longer (holdWeight up to 1.8). Setup beats can be quicker (0.7-0.9).",
    "- Match the reference language above: casing, weight, typography hierarchy, motion restraint, layout preference, palette usage.",
    "- Never emit social captions or hashtags into the plan. Only the hook is on screen.",
    "Output STRICT JSON matching this shape:",
    '{"version":"primitive-typography-v1","composition":{"canvasMood":"editorial|bold-poster|minimal|saas-clean|creator-caption","backgroundMode":"solid|split-field|framed-negative-space|accent-band|soft-panel","safeMargin":90},"typography":{"casing":"as-written|uppercase|title","displayWeight":900,"supportWeight":650,"tracking":0,"lineHeight":0.94},"beats":[{"text":"phrase","hero":["word or phrase parts"],"supportBefore":"","supportAfter":"","emphasis":"quiet|normal|strong|hero","layout":"center-stack|upper-left|lower-left|split-left|right-rail|full-phrase|poster-block","align":"center|left|right","holdWeight":1,"colorRole":"base|invert|accent-bg|primary-bg","emptySpace":"balanced|top-heavy|bottom-heavy|wide","transition":"settle|pop|wipe|cut|slide"}]}',
  ].join("\n");

  const user = [
    `Brand: ${input.brandName}`,
    input.knowledgeBase ? `Brand voice / instructions:\n${input.knowledgeBase}` : "",
    `Hook to design:\n${input.hook}`,
    `REFERENCE VISUAL LANGUAGE (obey this):\n${referenceLanguage}`,
    `Creative seed: ${input.seed}`,
    "Split the hook by MEANING into 3-7 beats. Vary layout across beats. Give powerful lines more hold weight. Return the JSON now.",
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
        temperature: 0.82,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}`);
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    return z
      .object({
        version: z.literal("primitive-typography-v1"),
        composition: z
          .object({
            canvasMood: z.enum(["editorial", "bold-poster", "minimal", "saas-clean", "creator-caption"]).optional(),
            backgroundMode: z.enum(["solid", "split-field", "framed-negative-space", "accent-band", "soft-panel"]).optional(),
            safeMargin: z.number().optional(),
          })
          .optional(),
        typography: z
          .object({
            casing: z.enum(["as-written", "uppercase", "title"]).optional(),
            displayWeight: z.number().optional(),
            supportWeight: z.number().optional(),
            tracking: z.number().optional(),
            lineHeight: z.number().optional(),
          })
          .optional(),
        beats: z
          .array(
            z.object({
              text: z.string().min(1),
              hero: z.array(z.string().min(1)).min(1).max(5),
              supportBefore: z.string().optional(),
              supportAfter: z.string().optional(),
              emphasis: z.enum(["quiet", "normal", "strong", "hero"]).optional(),
              layout: z.enum(["center-stack", "upper-left", "lower-left", "split-left", "right-rail", "full-phrase", "poster-block"]).optional(),
              align: z.enum(["center", "left", "right"]).optional(),
              holdWeight: z.number().optional(),
              colorRole: z.enum(["base", "invert", "accent-bg", "primary-bg"]).optional(),
              emptySpace: z.enum(["balanced", "top-heavy", "bottom-heavy", "wide"]).optional(),
              transition: z.enum(["settle", "pop", "wipe", "cut", "slide"]).optional(),
            }),
          )
          .min(1)
          .max(7),
      })
      .parse(parsed);
  } catch {
    return fallbackStylePlan(input.hook, input.seed);
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
      .select("id, name, template_id, brand_colors, brand_fonts, logo_url, knowledge_base, reference_reel_url")
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

    const seed = Math.floor(Math.random() * 1e9);
    const variant = MOTION_VARIANTS[Math.floor(Math.random() * MOTION_VARIANTS.length)];
    const { data: refs } = await supabase
      .from("brand_references")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("label, notes, analysis" as any)
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(15);
    const referenceBriefs: ReferenceBrief[] = [
      ...(brand.reference_reel_url ? [{ label: "original reference reel", notes: "Primary visual direction reference", analysis: null }] : []),
      ...((refs ?? []) as unknown as ReferenceBrief[]),
    ];
    const stylePlan = await generateStylePlan({
      hook: copy.hook,
      brandName: brand.name,
      knowledgeBase: brand.knowledge_base,
      references: referenceBriefs,
      seed,
    });

    // Dynamic duration: sentence length drives screen time. Never cram.
    const durationSeconds = computeDurationSeconds(copy.hook);
    const durationInFrames = durationSeconds * 30;

    const props: RenderProps = {
      hook: copy.hook,
      // Caption is for the social post copy, NOT drawn inside the video.
      seed,
      variant,
      stylePlan,
      brand: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colors: { ...DEFAULT_COLORS, ...((brand.brand_colors as any) ?? {}) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fonts: { ...DEFAULT_FONTS, ...((brand.brand_fonts as any) ?? {}) },
        logoUrl: brand.logo_url,
      },
    };

    // Persist duration on props so dispatch (which reads from DB for retries)
    // knows how long to render. Worker reads job.durationInFrames from top of payload.
    const propsWithDuration = { ...props, durationInFrames };

    const { data: job, error: jobErr } = await supabaseAdmin
      .from("render_jobs")
      .insert({
        brand_id: brand.id,
        reel_id: reel.id,
        template_id: templateId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: propsWithDuration as any,
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
      message: `job created: "${copy.hook}" — ${durationSeconds}s (${referenceBriefs.filter(r=>r.analysis).length} analyzed refs)`,
    });

    await dispatchJob(supabaseAdmin, {
      id: job.id,
      reel_id: reel.id,
      template_id: templateId,
      props: propsWithDuration,
      storage_path: storagePath,
      attempts: 0,
    });

    return { reel_id: reel.id, job_id: job.id, hook: copy.hook, duration_seconds: durationSeconds };
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
