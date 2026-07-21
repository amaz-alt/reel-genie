import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Networks we currently expose in the UI. Outstand supports more; we can extend later. */
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

const OUTSTAND_APP_BASE = "https://www.outstand.so";

/** Sign brand+network into a state token so the public callback can't be spoofed. */
async function signState(brandId: string, network: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing signing secret");
  const exp = Math.floor(Date.now() / 1000) + 60 * 30; // 30 min
  const payload = `${brandId}.${network}.${exp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = Buffer.from(new Uint8Array(sigBuf)).toString("base64url");
  return `${payload}.${sig}`;
}

export async function verifyState(state: string): Promise<{ brandId: string; network: string } | null> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [brandId, network, expStr, sig] = parts;
  const payload = `${brandId}.${network}.${expStr}`;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Buffer.from(new Uint8Array(expectedBuf)).toString("base64url");
  if (expected !== sig) return null;
  return { brandId, network };
}

/* -------------------- start connect: returns Outstand authorize URL -------------------- */
export const startOutstandConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        brand_id: z.string().uuid(),
        network: z.enum(SUPPORTED_NETWORKS),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const orgId = process.env.OUTSTAND_ORGANIZATION_ID;
    const appUrl = process.env.PUBLIC_APP_URL;
    if (!orgId) throw new Error("OUTSTAND_ORGANIZATION_ID is not configured");
    if (!appUrl) throw new Error("PUBLIC_APP_URL is not configured");

    // Owner check.
    const { data: brand, error } = await context.supabase
      .from("brands")
      .select("id")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!brand) throw new Error("Brand not found");

    const state = await signState(data.brand_id, data.network);
    // Bake state INTO redirect_uri; Outstand appends success/account_id/username as extra params.
    const callback = new URL("/api/public/outstand/callback", appUrl);
    callback.searchParams.set("state", state);

    const authorize = new URL(
      `/app/api/socials/${data.network}/${orgId}`,
      OUTSTAND_APP_BASE,
    );
    authorize.searchParams.set("redirect_uri", callback.toString());

    return { url: authorize.toString() };
  });

/* -------------------- list connected accounts for a brand -------------------- */
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

/* -------------------- disconnect (local only; Outstand keeps the account) -------------------- */
export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("brand_social_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
