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

/* -------------------- publish a rendered reel to selected accounts -------------------- */

const NETWORKS_NEEDING_LINK = new Set(["pinterest"]);

function pickString(row: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function buildCaption(opts: {
  network: string;
  hook: string;
  caption: string | null;
  hashtags: string[];
  product: Record<string, unknown> | null;
}): string {
  const { network, hook, caption, hashtags, product } = opts;
  const title = pickString(product, ["title", "name", "product", "topic"]);
  const keywords = pickString(product, ["keywords", "tags"]);
  const link = pickString(product, ["url", "link", "product_url", "landing_page", "landing_page_url"]);
  const tags = hashtags.filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));

  const base = [caption?.trim() || hook.trim()].filter(Boolean).join(" ");

  if (network === "pinterest") {
    // Pinterest algorithm: title-y keyword-rich description + link + hashtags.
    const parts = [
      title ? `${title} — ${base}` : base,
      keywords ? `Keywords: ${keywords}` : "",
      link ? `\n${link}` : "",
      tags.length ? `\n${tags.slice(0, 20).join(" ")}` : "",
    ].filter(Boolean);
    return parts.join("\n").trim();
  }

  // IG/TikTok/YT-shorts style: caption + hashtags on new line.
  return [base, tags.length ? `\n${tags.slice(0, 12).join(" ")}` : ""].filter(Boolean).join("\n").trim();
}

export const publishReel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reel_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OUTSTAND_API_KEY;
    if (!apiKey) throw new Error("OUTSTAND_API_KEY is not configured");

    // Load reel (RLS-scoped) + brand's connected accounts.
    const { data: reel, error: reelErr } = await context.supabase
      .from("reels")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, brand_id, hook, caption, hashtags, video_url, status, product_snapshot" as any)
      .eq("id", data.reel_id)
      .maybeSingle();
    if (reelErr) throw new Error(reelErr.message);
    if (!reel) throw new Error("Reel not found");
    const r = reel as unknown as {
      id: string;
      brand_id: string;
      hook: string | null;
      caption: string | null;
      hashtags: string[] | null;
      video_url: string | null;
      status: string;
      product_snapshot: Record<string, unknown> | null;
    };
    if (!r.video_url) throw new Error("Reel has no rendered video yet");

    const { data: accounts, error: accErr } = await context.supabase
      .from("brand_social_accounts")
      .select("outstand_account_id, network")
      .eq("brand_id", r.brand_id);
    if (accErr) throw new Error(accErr.message);
    if (!accounts || accounts.length === 0) {
      throw new Error("No social accounts linked to this brand. Connect accounts first.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("reels").update({ status: "publishing", error: null }).eq("id", r.id);

    const filename = `${r.id}.mp4`;
    const hook = r.hook ?? "";
    const hashtags = Array.isArray(r.hashtags) ? r.hashtags : [];
    const product = r.product_snapshot ?? null;
    const link = pickString(product, ["url", "link", "product_url", "landing_page", "landing_page_url"]);

    // Group accounts by network so per-network caption can differ (Pinterest needs link + keywords).
    const byNetwork = new Map<string, string[]>();
    for (const a of accounts) {
      const list = byNetwork.get(a.network) ?? [];
      list.push(a.outstand_account_id);
      byNetwork.set(a.network, list);
    }

    const results: Array<{ network: string; ok: boolean; postId?: string; error?: string }> = [];
    const postIds: Array<{ network: string; post_id: string; account_ids: string[] }> = [];

    for (const [network, accountIds] of byNetwork.entries()) {
      const content = buildCaption({
        network,
        hook,
        caption: r.caption,
        hashtags,
        product,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        content,
        accounts: accountIds,
        media: [{ url: r.video_url, filename, type: "video" }],
      };
      if (NETWORKS_NEEDING_LINK.has(network) && link) {
        // Outstand normalises platform-specific fields; include `link` and `title`
        // at the top level so Pinterest gets a landing-page URL and pin title.
        body.link = link;
        const title = pickString(product, ["title", "name", "product", "topic"]);
        if (title) body.title = title;
      }

      try {
        const res = await fetch(`${OUTSTAND_API_BASE}/v1/posts/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          results.push({ network, ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` });
          continue;
        }
        const json = (await res.json()) as { post?: { id?: string } };
        const postId = json.post?.id ?? "";
        results.push({ network, ok: true, postId });
        if (postId) postIds.push({ network, post_id: postId, account_ids: accountIds });
      } catch (e) {
        results.push({ network, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const anyOk = results.some((r) => r.ok);
    const allOk = results.every((r) => r.ok);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("reels")
      .update({
        status: anyOk ? "published" : "failed",
        published_at: anyOk ? now : null,
        outstand_post_ids: postIds,
        error: allOk ? null : results.filter((r) => !r.ok).map((r) => `${r.network}: ${r.error}`).join(" | "),
      })
      .eq("id", r.id);

    return { ok: anyOk, allOk, results };
  });

