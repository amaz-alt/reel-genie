import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/lib/app-auth-middleware";
import { z } from "zod";

/* -------------------- read autopilot settings + status -------------------- */
export const getAutopilotSettings = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { data: settings } = await context.supabase
      .from("autopilot_settings")
      .select("drive_parent_folder_id, drive_parent_url, drive_enabled")
      .eq("owner_id", context.userId)
      .maybeSingle();

    const { getServiceAccountEmail } = await import("@/lib/google-drive.server");

    const { data: runs } = await context.supabase
      .from("autopilot_runs")
      .select("id, brand_id, reel_id, stage, status, message, created_at")
      .order("created_at", { ascending: false })
      .limit(25);

    const { data: schedules } = await context.supabase
      .from("brand_schedules")
      .select("brand_id, autopilot_enabled, auto_publish, posts_per_day, last_run_at, active, time_of_day, timezone, days_of_week");

    return {
      settings: settings ?? { drive_parent_folder_id: null, drive_parent_url: null, drive_enabled: true },
      serviceAccountEmail: getServiceAccountEmail(),
      driveConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      runs: runs ?? [],
      schedules: schedules ?? [],
    };
  });

/* -------------------- save Drive parent folder -------------------- */
export const saveAutopilotSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        drive_folder_link: z.string().trim().max(500).optional(),
        drive_enabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { extractDriveFolderId } = await import("@/lib/google-drive.server");
    const patch: {
      owner_id: string;
      updated_at: string;
      drive_parent_folder_id?: string | null;
      drive_parent_url?: string | null;
      drive_enabled?: boolean;
    } = { owner_id: context.userId, updated_at: new Date().toISOString() };

    if (data.drive_folder_link !== undefined) {
      const link = data.drive_folder_link.trim();
      if (link === "") {
        patch.drive_parent_folder_id = null;
        patch.drive_parent_url = null;
      } else {
        const id = extractDriveFolderId(link);
        if (!id) throw new Error("That doesn't look like a Google Drive folder link or id");
        patch.drive_parent_folder_id = id;
        patch.drive_parent_url = link;
      }
    }
    if (data.drive_enabled !== undefined) patch.drive_enabled = data.drive_enabled;

    const { error } = await context.supabase
      .from("autopilot_settings")
      .upsert(patch, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- per-brand autopilot toggles -------------------- */
export const updateBrandAutopilot = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        autopilot_enabled: z.boolean().optional(),
        auto_publish: z.boolean().optional(),
        posts_per_day: z.number().int().min(1).max(12).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { brand_id, ...patch } = data;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("brand_schedules")
      .update(patch)
      .eq("brand_id", brand_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- manual "run now" for testing -------------------- */
export const runAutopilotNow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { runAutopilotTick } = await import("@/lib/autopilot.server");
    return runAutopilotTick();
  });
