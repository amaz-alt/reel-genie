import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Networks we currently expose in the UI. */
export const SUPPORTED_NETWORKS = [
  "instagram",
  "tiktok",
  "pinterest",
  "youtube",
  "facebook",
  "linkedin",
  "x",
  "threads",
] as const;
export type OutstandNetwork = (typeof SUPPORTED_NETWORKS)[number];

const OUTSTAND_API_BASE = "https://api.outstand.so";

export type OutstandAccount = {
  id: string;
  network: string;
  username: string | null;
  nickname: string | null;
  network_unique_id: string | null;
};

/* -------------------- list accounts already connected in Outstand -------------------- */
export const listOutstandAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<OutstandAccount[]> => {
    const apiKey = process.env.OUTSTAND_API_KEY;
    if (!apiKey) throw new Error("OUTSTAND_API_KEY is not configured");

    const res = await fetch(`${OUTSTAND_API_BASE}/v1/social-accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Outstand list failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
      accounts?: Array<Record<string, unknown>>;
    };
    const rows = json.data ?? json.accounts ?? [];
    return rows.map((r) => ({
      id: String(r.id ?? r.account_id ?? ""),
      network: String(r.network ?? ""),
      username: (r.username as string | null) ?? null,
      nickname: (r.nickname as string | null) ?? null,
      network_unique_id:
        (r.network_unique_id as string | null) ??
        (r.networkUniqueId as string | null) ??
        null,
    })).filter((r) => r.id && r.network);
  });

/* -------------------- list accounts linked to this brand -------------------- */
export const listBrandSocialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ brand_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("brand_social_accounts")
      .select("id, network, outstand_account_id, username, nickname, connected_at")
      .eq("brand_id", data.brand_id)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* -------------------- save selected accounts for a brand (replace set) -------------------- */
export const setBrandOutstandAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        accounts: z.array(
          z.object({
            outstand_account_id: z.string().min(1),
            network: z.string().min(1),
            username: z.string().nullable().optional(),
            nickname: z.string().nullable().optional(),
            network_unique_id: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Verify ownership via RLS-scoped query.
    const { data: brand, error: brandErr } = await context.supabase
      .from("brands")
      .select("id")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

    // Replace strategy: delete rows for this brand, insert selected.
    const { error: delErr } = await context.supabase
      .from("brand_social_accounts")
      .delete()
      .eq("brand_id", data.brand_id);
    if (delErr) throw new Error(delErr.message);

    if (data.accounts.length === 0) return { ok: true, count: 0 };

    const now = new Date().toISOString();
    const rows = data.accounts.map((a) => ({
      brand_id: data.brand_id,
      network: a.network,
      outstand_account_id: a.outstand_account_id,
      username: a.username ?? null,
      nickname: a.nickname ?? null,
      network_unique_id: a.network_unique_id ?? null,
      connected_at: now,
      updated_at: now,
    }));
    const { error: insErr } = await context.supabase
      .from("brand_social_accounts")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, count: rows.length };
  });
