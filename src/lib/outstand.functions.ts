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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, network, outstand_account_id, username, nickname, connected_at, pinterest_board_id" as any)
      .eq("brand_id", data.brand_id)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string;
      network: string;
      outstand_account_id: string;
      username: string | null;
      nickname: string | null;
      connected_at: string;
      pinterest_board_id: string | null;
    }>;
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
            pinterest_board_id: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: brand, error: brandErr } = await context.supabase
      .from("brands")
      .select("id")
      .eq("id", data.brand_id)
      .maybeSingle();
    if (brandErr) throw new Error(brandErr.message);
    if (!brand) throw new Error("Brand not found");

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
      pinterest_board_id: a.pinterest_board_id?.trim() || null,
      connected_at: now,
      updated_at: now,
    }));
    const { error: insErr } = await context.supabase
      .from("brand_social_accounts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rows as any);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, count: rows.length };
  });

/* -------------------- publish a rendered reel to selected accounts -------------------- */

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
    const parts = [
      title ? `${title} — ${base}` : base,
      keywords ? `Keywords: ${keywords}` : "",
      link ? `\n${link}` : "",
      tags.length ? `\n${tags.slice(0, 20).join(" ")}` : "",
    ].filter(Boolean);
    return parts.join("\n").trim();
  }

  return [base, tags.length ? `\n${tags.slice(0, 12).join(" ")}` : ""].filter(Boolean).join("\n").trim();
}

type OutstandAccountResult = {
  id?: string;
  network?: string;
  username?: string | null;
  status?: string;
  error?: string | null;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  publishedAt?: string | null;
};

async function fetchOutstandPost(apiKey: string, postId: string) {
  const res = await fetch(`${OUTSTAND_API_BASE}/v1/posts/${postId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Outstand GET post ${postId} failed: ${res.status}`);
  const json = (await res.json()) as { post?: { socialAccounts?: OutstandAccountResult[] } };
  return json.post?.socialAccounts ?? [];
}

async function pollOutstandOutcome(
  apiKey: string,
  postId: string,
  opts: { tries: number; intervalMs: number },
): Promise<OutstandAccountResult[]> {
  let last: OutstandAccountResult[] = [];
  for (let i = 0; i < opts.tries; i++) {
    last = await fetchOutstandPost(apiKey, postId);
    const stillPending = last.some((a) => a.status === "pending" || !a.status);
    if (!stillPending) return last;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return last;
}

export const publishReel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reel_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OUTSTAND_API_KEY;
    if (!apiKey) throw new Error("OUTSTAND_API_KEY is not configured");

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

    const { data: accountsRaw, error: accErr } = await context.supabase
      .from("brand_social_accounts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("outstand_account_id, network, pinterest_board_id" as any)
      .eq("brand_id", r.brand_id);
    if (accErr) throw new Error(accErr.message);
    const accounts = (accountsRaw ?? []) as unknown as Array<{
      outstand_account_id: string;
      network: string;
      pinterest_board_id: string | null;
    }>;
    if (accounts.length === 0) {
      throw new Error("No social accounts linked to this brand. Connect accounts first.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("reels").update({ status: "publishing", error: null }).eq("id", r.id);

    const filename = `${r.id}.mp4`;
    const hook = r.hook ?? "";
    const hashtags = Array.isArray(r.hashtags) ? r.hashtags : [];
    const product = r.product_snapshot ?? null;
    const link = pickString(product, ["url", "link", "product_url", "landing_page", "landing_page_url"]);
    const title = pickString(product, ["title", "name", "product", "topic"]);

    // Group accounts by network (each network gets its own POST so we can tune
    // content + per-network config, e.g. Pinterest board).
    const byNetwork = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const list = byNetwork.get(a.network) ?? [];
      list.push(a);
      byNetwork.set(a.network, list);
    }

    const results: Array<{
      network: string;
      ok: boolean;
      postId?: string;
      error?: string;
      accounts?: OutstandAccountResult[];
    }> = [];
    const postIds: Array<{ network: string; post_id: string; account_ids: string[] }> = [];

    for (const [network, accs] of byNetwork.entries()) {
      const accountIds = accs.map((a) => a.outstand_account_id);
      const content = buildCaption({ network, hook, caption: r.caption, hashtags, product });

      // Media MUST live inside containers[].media — top-level media is silently
      // dropped and Instagram then rejects the post as "no media attached".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        accounts: accountIds,
        containers: [
          {
            content,
            media: [{ url: r.video_url, filename }],
          },
        ],
      };

      if (network === "pinterest") {
        const boardIds = Array.from(
          new Set(accs.map((a) => a.pinterest_board_id).filter((b): b is string => !!b && b.trim().length > 0)),
        );
        if (boardIds.length === 0) {
          results.push({
            network,
            ok: false,
            error:
              "Pinterest board_id missing. Open Social accounts, paste the Pinterest board ID for this account, and save.",
          });
          continue;
        }
        // Outstand rejects Pinterest posts without a board_id in
        // pinterestConfiguration; send both shapes it recognises.
        body.pinterestConfiguration = {
          board_id: boardIds[0],
          ...(title ? { title } : {}),
          ...(link ? { link } : {}),
        };
        body.networkOverrideConfiguration = {
          pinterest: {
            board_id: boardIds[0],
            ...(title ? { title } : {}),
            ...(link ? { link } : {}),
          },
        };
        if (link) body.link = link;
        if (title) body.title = title;
      }

      let postId = "";
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
        postId = json.post?.id ?? "";
      } catch (e) {
        results.push({ network, ok: false, error: e instanceof Error ? e.message : String(e) });
        continue;
      }

      if (!postId) {
        results.push({ network, ok: false, error: "Outstand did not return a post id" });
        continue;
      }

      // Poll per-account outcome. Outstand fans out asynchronously — a 2xx
      // response only means "queued", not "delivered". Ground truth lives on
      // socialAccounts[].status.
      let outcome: OutstandAccountResult[] = [];
      try {
        outcome = await pollOutstandOutcome(apiKey, postId, { tries: 8, intervalMs: 5000 });
      } catch (e) {
        results.push({
          network,
          ok: false,
          postId,
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }

      const failed = outcome.filter((a) => a.status === "failed");
      const pending = outcome.filter((a) => !a.status || a.status === "pending");
      const published = outcome.filter((a) => a.status === "published");

      if (failed.length === 0 && pending.length === 0 && published.length > 0) {
        results.push({ network, ok: true, postId, accounts: outcome });
        postIds.push({ network, post_id: postId, account_ids: accountIds });
      } else if (published.length > 0 && failed.length > 0) {
        results.push({
          network,
          ok: false,
          postId,
          error: `Partial fail: ${failed.map((a) => `${a.username ?? a.id}: ${a.error}`).join(" | ")}`,
          accounts: outcome,
        });
        postIds.push({ network, post_id: postId, account_ids: accountIds });
      } else if (failed.length > 0) {
        results.push({
          network,
          ok: false,
          postId,
          error: failed.map((a) => `${a.username ?? a.id}: ${a.error}`).join(" | "),
          accounts: outcome,
        });
      } else {
        results.push({
          network,
          ok: false,
          postId,
          error: `Still pending after poll window. Check Outstand for post ${postId}.`,
          accounts: outcome,
        });
      }
    }

    const anyOk = results.some((x) => x.ok);
    const allOk = results.every((x) => x.ok);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("reels")
      .update({
        status: allOk ? "published" : "failed",
        published_at: allOk ? now : null,
        outstand_post_ids: postIds,
        error: allOk
          ? null
          : results
              .filter((x) => !x.ok)
              .map((x) => `${x.network}: ${x.error}`)
              .join(" | "),
      })
      .eq("id", r.id);

    return { ok: anyOk, allOk, results };
  });
