import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* -------------------- list brands -------------------- */
export const listBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brands")
      .select("id, name, template_id, brand_colors, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* -------------------- get one brand + schedule + recent reels -------------------- */
export const getBrand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: brand, error } = await context.supabase
      .from("brands")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!brand) throw new Error("Brand not found");

    const { data: schedule } = await context.supabase
      .from("brand_schedules")
      .select("*")
      .eq("brand_id", data.id)
      .maybeSingle();

    const { data: reels } = await context.supabase
      .from("reels")
      .select("id, hook, caption, status, video_url, scheduled_for, published_at, created_at, error")
      .eq("brand_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { brand, schedule, reels: reels ?? [] };
  });

/* -------------------- create brand -------------------- */
const brandInput = z.object({
  name: z.string().min(1).max(120),
  google_sheet_url: z.string().url().optional().or(z.literal("")),
  sheet_tab: z.string().default("Sheet1"),
  sheet_range: z.string().default("A1:Z1000"),
  knowledge_base: z.string().default(""),
  template_id: z.string().optional(),
  brand_colors: z
    .object({
      primary: z.string(),
      accent: z.string(),
      background: z.string(),
      text: z.string(),
    })
    .optional(),
  brand_fonts: z
    .object({
      display: z.string(),
      body: z.string(),
    })
    .optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
  reference_reel_url: z.string().url().optional().or(z.literal("")),
  reference_reel_path: z.string().optional(),
  reference_reel_notes: z.string().max(2000).optional(),
});

function parseSheetId(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export const createBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => brandInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("brands")
      .insert({
        owner_id: context.userId,
        name: data.name,
        google_sheet_url: data.google_sheet_url || null,
        google_sheet_id: parseSheetId(data.google_sheet_url),
        sheet_tab: data.sheet_tab,
        sheet_range: data.sheet_range,
        knowledge_base: data.knowledge_base,
        template_id: data.template_id || null,
        brand_colors: data.brand_colors,
        brand_fonts: data.brand_fonts,
        logo_url: data.logo_url || null,
        reference_reel_url: data.reference_reel_url || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.reference_reel_path) {
      await context.supabase.from("brand_references").insert({
        brand_id: created.id,
        owner_id: context.userId,
        storage_path: data.reference_reel_path,
        label: "Primary reference reel",
        notes: data.reference_reel_notes ?? null,
      });
    }

    // Default schedule: weekdays at 09:00 UTC
    await context.supabase.from("brand_schedules").insert({
      brand_id: created.id,
      days_of_week: [1, 2, 3, 4, 5],
      time_of_day: "09:00",
      timezone: "UTC",
      active: true,
    });

    return { id: created.id };
  });

/* -------------------- update brand -------------------- */
export const updateBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    brandInput.extend({ id: z.string().uuid() }).partial({ name: true }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch = { ...rest } as Record<string, unknown>;
    if (typeof rest.google_sheet_url === "string") {
      patch.google_sheet_id = parseSheetId(rest.google_sheet_url);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("brands").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- update schedule -------------------- */
const scheduleInput = z.object({
  brand_id: z.string().uuid(),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default("UTC"),
  active: z.boolean().default(true),
});

export const updateSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => scheduleInput.parse(data))
  .handler(async ({ data, context }) => {
    // ensure owner
    const { data: brand } = await context.supabase
      .from("brands")
      .select("id")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (!brand) throw new Error("Brand not found");

    const { data: existing } = await context.supabase
      .from("brand_schedules")
      .select("id")
      .eq("brand_id", data.brand_id)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("brand_schedules")
        .update({
          days_of_week: data.days_of_week,
          time_of_day: data.time_of_day,
          timezone: data.timezone,
          active: data.active,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("brand_schedules").insert({
        brand_id: data.brand_id,
        days_of_week: data.days_of_week,
        time_of_day: data.time_of_day,
        timezone: data.timezone,
        active: data.active,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* -------------------- delete brand -------------------- */
export const deleteBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("brands").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- signed upload URL for brand assets -------------------- */
export const createBrandAssetUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid().optional(),
        filename: z.string().min(1).max(200),
        kind: z.enum(["logo", "reference_reel"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${context.userId}/${data.brand_id ?? "shared"}/${data.kind}-${Date.now()}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("brand-assets")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const getBrandAssetSignedReadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("brand-assets")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/* -------------------- reference vault -------------------- */
const MAX_REFERENCES = 15;

export const listBrandReferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("brand_references")
      .select("id, storage_path, label, notes, analysis, created_at")
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await context.supabase.storage
          .from("brand-assets")
          .createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

/**
 * Vision-analyze frames from a reference reel with Gemini and return a
 * structured design-language spec. Best-effort: returns null on any failure
 * so callers can fall back to heuristic notes.
 */
async function visionAnalyzeReferenceFrames(frames: string[]): Promise<Record<string, unknown> | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !frames.length) return null;
  const sys = [
    "You are a senior motion-design director reverse-engineering a short-form reel.",
    "You will see 6 evenly-spaced frames from ONE reference reel.",
    "Extract the reusable DESIGN LANGUAGE — not a description of contents.",
    "Focus on: typography hierarchy, layout intention, empty-space usage, casing, emphasis pattern, motion restraint, transition style, pacing rhythm, palette usage.",
    "Never suggest chaotic motion (spin/shake/blur). Prioritize readability.",
    "Output STRICT JSON only, no prose. Schema:",
    '{"canvasMood":"editorial|bold-poster|minimal|saas-clean|creator-caption","backgroundMode":"solid|split-field|framed-negative-space|accent-band|soft-panel","casing":"as-written|uppercase|title","displayWeight":700-950,"typographyHierarchy":"single-hero|dual-line|full-phrase|mixed","layoutPreference":"centered|left-weighted|split|mixed","emphasisPattern":"size-contrast|color-inversion|weight-shift|underline-accent","motionRestraint":"minimal|moderate|energetic","transitionStyle":"settle|pop|wipe|cut|slide","paletteUsage":"monochrome|dual-tone|accent-pop","avgWordsPerBeat":1-6,"pacingFeel":"slow|medium|fast","notes":"1-2 sentence human-readable summary of the reel\'s visual language"}',
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
              { type: "text", text: "Analyze these 6 frames as one reel. Return the JSON spec." },
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
    const text = j?.choices?.[0]?.message?.content ?? "";
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const addBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        storage_path: z.string().min(1),
        label: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        /** Optional base64 data-URL frames from client for vision analysis. */
        frames: z.array(z.string()).max(8).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("brand_references")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", data.brand_id);
    if ((count ?? 0) >= MAX_REFERENCES) {
      throw new Error(`Reference vault is full (max ${MAX_REFERENCES}). Delete one first.`);
    }
    const analysis = data.frames?.length ? await visionAnalyzeReferenceFrames(data.frames) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("brand_references").insert({
      brand_id: data.brand_id,
      owner_id: context.userId,
      storage_path: data.storage_path,
      label: data.label ?? null,
      notes: data.notes ?? null,
      analysis: analysis as any,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true, analyzed: Boolean(analysis) };
  });

/**
 * Re-analyze an existing reference from client-side frames. Used to backfill
 * analysis for references uploaded before vision support existed.
 */
export const analyzeBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), frames: z.array(z.string()).min(1).max(8) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const analysis = await visionAnalyzeReferenceFrames(data.frames);
    if (!analysis) throw new Error("Vision analysis failed");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase
      .from("brand_references")
      .update({ analysis: analysis as any } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, analysis: analysis as unknown as Record<string, string | number | boolean | null> };
  });



export const deleteBrandReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("brand_references")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await context.supabase.storage.from("brand-assets").remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("brand_references").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
