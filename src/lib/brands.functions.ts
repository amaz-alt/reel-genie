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
    const patch: Record<string, unknown> = { ...rest };
    if (rest.google_sheet_url !== undefined) {
      patch.google_sheet_id = parseSheetId(rest.google_sheet_url as string);
    }
    const { error } = await context.supabase.from("brands").update(patch).eq("id", id);
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
