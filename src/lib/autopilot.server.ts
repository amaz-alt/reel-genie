/**
 * Autopilot orchestrator — runs from the public cron hook every 15 minutes.
 *
 * Three independent passes, each safe to re-run:
 *   1. generate  — brands whose schedule slot is due get a fresh reel queued
 *   2. archive   — rendered mp4s are copied into the brand's Google Drive folder
 *   3. publish   — ready reels are pushed to the brand's connected accounts
 *
 * Nothing here touches the typography/reaction render engines — it only calls
 * the same cores the manual buttons already use.
 */

import { generateReelCore } from "@/lib/render.functions";
import { publishReelCore } from "@/lib/outstand.functions";
import { ensureFolder, uploadMp4 } from "@/lib/google-drive.server";

type Sb = ReturnType<typeof unusedTypeHelper>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unusedTypeHelper(): any {
  throw new Error("type-only helper");
}

type RunLog = { stage: string; status: string; message: string; brand?: string | null };

async function log(
  sb: Sb,
  entry: { owner_id: string; brand_id?: string | null; reel_id?: string | null; stage: string; status: string; message: string },
) {
  await sb.from("autopilot_runs").insert(entry);
}

/** Local weekday (0=Sun) + minutes-since-midnight for a timezone. */
const TZ_ALIASES: Record<string, string> = {
  IST: "Asia/Kolkata",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  GMT: "Etc/GMT",
  BST: "Europe/London",
  CET: "Europe/Berlin",
  AEST: "Australia/Sydney",
};

function localSlot(rawTimezone: string, at: Date) {
  const timezone = TZ_ALIASES[(rawTimezone || "UTC").toUpperCase()] ?? rawTimezone;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  return { dow: dowMap[get("weekday")] ?? 0, minutes: hour * 60 + Number(get("minute")) };
}

/* ------------------------------- 1. generate ------------------------------ */

export async function runGeneratePass(sb: Sb, now = new Date()): Promise<RunLog[]> {
  const out: RunLog[] = [];
  const { data: schedules } = await sb
    .from("brand_schedules")
    .select("brand_id, days_of_week, time_of_day, timezone, active, autopilot_enabled, posts_per_day, last_run_at")
    .eq("active", true)
    .eq("autopilot_enabled", true);

  for (const s of schedules ?? []) {
    const { data: brand } = await sb
      .from("brands")
      .select("id, name, owner_id")
      .eq("id", s.brand_id)
      .maybeSingle();
    if (!brand) continue;

    const perDay = Math.max(1, Math.min(12, s.posts_per_day ?? 1));
    const { dow, minutes } = localSlot(s.timezone ?? "UTC", now);
    if (!(s.days_of_week ?? []).includes(dow)) continue;

    // Slot grid: the configured time, then evenly spaced across the rest of the
    // day when the brand wants several posts.
    const [h, m] = String(s.time_of_day ?? "09:00").split(":").map(Number);
    const startMinutes = (h || 0) * 60 + (m || 0);
    const step = Math.floor((24 * 60) / perDay);
    const slots = Array.from({ length: perDay }, (_, i) => (startMinutes + i * step) % (24 * 60));
    // Fire if we're within 20 min after a slot (cron ticks every 15 min).
    const dueSlot = slots.find((slot) => minutes >= slot && minutes - slot <= 20);
    if (dueSlot === undefined) continue;

    // Idempotency: never fire twice inside the same slot window.
    const minGapMs = Math.max(30, step - 10) * 60 * 1000;
    if (s.last_run_at && now.getTime() - new Date(s.last_run_at).getTime() < minGapMs) continue;

    await sb.from("brand_schedules").update({ last_run_at: now.toISOString() }).eq("brand_id", brand.id);

    try {
      const res = await generateReelCore(sb, brand.owner_id, { brand_id: brand.id });
      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        reel_id: res.reel_id,
        stage: "generate",
        status: "ok",
        message: `queued "${res.hook}" (${res.template_id}, ${res.duration_seconds}s)`,
      });
      out.push({ stage: "generate", status: "ok", message: res.hook, brand: brand.name });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        stage: "generate",
        status: "error",
        message,
      });
      out.push({ stage: "generate", status: "error", message, brand: brand.name });
    }
  }
  return out;
}

/* -------------------------------- 2. archive ------------------------------ */

export async function runDrivePass(sb: Sb, limit = 4): Promise<RunLog[]> {
  const out: RunLog[] = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return out;

  const { data: reels } = await sb
    .from("reels")
    .select("id, brand_id, hook, created_at, video_url, status, drive_file_id")
    .in("status", ["ready", "publishing", "published"])
    .is("drive_file_id", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const reel of reels ?? []) {
    const { data: brand } = await sb
      .from("brands")
      .select("id, name, owner_id, drive_folder_id")
      .eq("id", reel.brand_id)
      .maybeSingle();
    if (!brand) continue;

    try {
      const { data: settings } = await sb
        .from("autopilot_settings")
        .select("drive_parent_folder_id, drive_enabled")
        .eq("owner_id", brand.owner_id)
        .maybeSingle();
      if (!settings?.drive_enabled || !settings.drive_parent_folder_id) continue;

      let folderId: string | null = brand.drive_folder_id ?? null;
      if (!folderId) {
        folderId = await ensureFolder(
          settings.drive_parent_folder_id,
          brand.name || `Brand ${brand.id.slice(0, 8)}`,
        );
        await sb.from("brands").update({ drive_folder_id: folderId }).eq("id", brand.id);
      }

      const { data: job } = await sb
        .from("render_jobs")
        .select("storage_path")
        .eq("reel_id", reel.id)
        .not("storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!job?.storage_path) continue;

      const dl = await sb.storage.from("brand-assets").download(job.storage_path);
      if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "download failed");
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      const slug = (reel.hook ?? "reel")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      const date = new Date(reel.created_at).toISOString().slice(0, 10);
      const uploaded = await uploadMp4(folderId, `${date}-${slug || "reel"}.mp4`, bytes);

      await sb
        .from("reels")
        .update({
          drive_file_id: uploaded.id,
          drive_url: uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
          drive_synced_at: new Date().toISOString(),
        })
        .eq("id", reel.id);

      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        reel_id: reel.id,
        stage: "drive",
        status: "ok",
        message: `archived to Drive (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`,
      });
      out.push({ stage: "drive", status: "ok", message: "archived", brand: brand.name });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        reel_id: reel.id,
        stage: "drive",
        status: "error",
        message,
      });
      out.push({ stage: "drive", status: "error", message, brand: brand.name });
    }
  }
  return out;
}

/* -------------------------------- 3. publish ------------------------------ */

export async function runPublishPass(sb: Sb, limit = 1): Promise<RunLog[]> {
  const out: RunLog[] = [];
  if (!process.env.OUTSTAND_API_KEY) return out;

  const { data: reels } = await sb
    .from("reels")
    .select("id, brand_id, video_url, status")
    .eq("status", "ready")
    .not("video_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const reel of reels ?? []) {
    const { data: brand } = await sb
      .from("brands")
      .select("id, name, owner_id")
      .eq("id", reel.brand_id)
      .maybeSingle();
    if (!brand) continue;

    const { data: schedule } = await sb
      .from("brand_schedules")
      .select("autopilot_enabled, auto_publish")
      .eq("brand_id", brand.id)
      .maybeSingle();
    if (!schedule?.autopilot_enabled || !schedule.auto_publish) continue;

    const { count } = await sb
      .from("brand_social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand.id);
    if (!count) continue;

    try {
      const res = await publishReelCore(sb, reel.id);
      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        reel_id: reel.id,
        stage: "publish",
        status: res.allOk ? "ok" : res.pending ? "pending" : "error",
        message: res.results
          .map((r: { network: string; ok: boolean; error?: string | null }) =>
            `${r.network}: ${r.ok ? "ok" : r.error ?? "failed"}`,
          )
          .join(" | "),
      });
      out.push({ stage: "publish", status: res.allOk ? "ok" : "pending", message: "dispatched", brand: brand.name });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(sb, {
        owner_id: brand.owner_id,
        brand_id: brand.id,
        reel_id: reel.id,
        stage: "publish",
        status: "error",
        message,
      });
      out.push({ stage: "publish", status: "error", message, brand: brand.name });
    }
  }
  return out;
}

export async function runAutopilotTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb = supabaseAdmin as unknown as Sb;
  const generated = await runGeneratePass(sb);
  const archived = await runDrivePass(sb);
  const published = await runPublishPass(sb);
  return { generated, archived, published, at: new Date().toISOString() };
}
