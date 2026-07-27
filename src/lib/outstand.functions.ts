import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  OUTSTAND_API_BASE,
  buildCaption,
  checkStoredOutstandPosts,
  classifyOutcome,
  listOutstandAccountsFromApi,
  pickString,
  pollOutstandOutcome,
  type OutstandAccountResult,
  type PublishNetworkResult,
  type StoredOutstandPost,
} from "./outstand.server";

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
    return listOutstandAccountsFromApi(apiKey);
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

export const publishReel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reel_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OUTSTAND_API_KEY;
    if (!apiKey) throw new Error("OUTSTAND_API_KEY is not configured");

    const { data: reel, error: reelErr } = await context.supabase
      .from("reels")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, brand_id, hook, caption, hashtags, video_url, status, product_snapshot, outstand_post_ids" as any)
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
      outstand_post_ids: StoredOutstandPost[] | null;
    };
    if (!r.video_url) throw new Error("Reel has no rendered video yet");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existingPosts = Array.isArray(r.outstand_post_ids) ? r.outstand_post_ids : [];
    if (r.status === "publishing" && existingPosts.length > 0) {
      const refreshResults = await checkStoredOutstandPosts(apiKey, existingPosts);
      const anyOk = refreshResults.some((x) => x.ok);
      const anyPending = refreshResults.some((x) => x.pending);
      const allOk = refreshResults.length > 0 && refreshResults.every((x) => x.ok);
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("reels")
        .update({
          status: allOk ? "published" : anyPending ? "publishing" : "failed",
          published_at: allOk ? now : null,
          outstand_post_ids: existingPosts,
          error: allOk || anyPending
            ? null
            : refreshResults
                .filter((x) => !x.ok)
                .map((x) => `${x.network}: ${x.error}`)
                .join(" | "),
        })
        .eq("id", r.id);
      return { ok: anyOk, allOk, pending: anyPending, results: refreshResults };
    }

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

    await supabaseAdmin.from("reels").update({ status: "publishing", error: null }).eq("id", r.id);

    const filename = `${r.id}.mp4`;
    const hook = r.hook ?? "";
    const hashtags = Array.isArray(r.hashtags) ? r.hashtags : [];
    const product = r.product_snapshot ?? null;
    const link = pickString(product, ["url", "link", "product_url", "landing_page", "landing_page_url"]);
    const title = pickString(product, ["title", "name", "product", "topic"]);

    // Upload the mp4 to Outstand's media store so it's tagged with
    // content_type=video/mp4. Passing a raw Supabase signed URL made Instagram
    // treat the post as an image (first frame only) because their ingester
    // couldn't reliably determine the mime type. This also unblocks Pinterest
    // video Pins which require a real video media object.
    let outstandMediaUrl = r.video_url;
    try {
      const step1 = await fetch(`${OUTSTAND_API_BASE}/v1/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content_type: "video/mp4" }),
      });
      if (!step1.ok) throw new Error(`media/upload ${step1.status}: ${await step1.text()}`);
      const s1 = (await step1.json()) as { data?: { id?: string; upload_url?: string } };
      const mediaId = s1.data?.id;
      const uploadUrl = s1.data?.upload_url;
      if (!mediaId || !uploadUrl) throw new Error("media/upload missing id/upload_url");

      const videoRes = await fetch(r.video_url);
      if (!videoRes.ok) throw new Error(`fetch video ${videoRes.status}`);
      const videoBuf = await videoRes.arrayBuffer();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: videoBuf,
      });
      if (!putRes.ok) throw new Error(`PUT upload ${putRes.status}: ${await putRes.text()}`);

      const confirm = await fetch(`${OUTSTAND_API_BASE}/v1/media/${mediaId}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ size: videoBuf.byteLength }),
      });
      if (!confirm.ok) throw new Error(`media/confirm ${confirm.status}: ${await confirm.text()}`);
      const cj = (await confirm.json()) as { url?: string; data?: { url?: string } };
      const finalUrl = cj.url ?? cj.data?.url;
      if (!finalUrl) throw new Error("confirm missing url");
      outstandMediaUrl = finalUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("reels")
        .update({ status: "failed", error: `Video upload to Outstand failed: ${msg}` })
        .eq("id", r.id);
      throw new Error(`Video upload to Outstand failed: ${msg}`);
    }

    // Group accounts by network (each network gets its own POST so we can tune
    // content + per-network config, e.g. Pinterest board).
    const byNetwork = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const list = byNetwork.get(a.network) ?? [];
      list.push(a);
      byNetwork.set(a.network, list);
    }

    const results: PublishNetworkResult[] = [];
    const postIdsByKey = new Map<string, StoredOutstandPost>();
    const storePostId = (post: StoredOutstandPost) => postIdsByKey.set(`${post.network}:${post.post_id}`, post);

    for (const [network, accs] of byNetwork.entries()) {
      const accountIds = accs.map((a) => a.outstand_account_id);
      const content = buildCaption({ network, hook, caption: r.caption, hashtags, product });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        accounts: accountIds,
        containers: [
          {
            content,
            media: [{ url: outstandMediaUrl, filename }],
          },
        ],
      };

      if (network === "instagram") {
        // Force Instagram to treat 9:16 mp4 as a Reel, not a static feed post.
        body.instagram = { media_type: "REELS" };
      }

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
        // Pinterest ranks on title + description + alt text + destination link,
        // so fill every field the API accepts instead of just the board.
        const pinLink =
          link ??
          pickString(product, ["website", "page_url", "shop_url", "buy_url", "affiliate_link"]) ??
          null;
        const pinTitle = (title ?? hook ?? "").trim().slice(0, 95) || "New reel";
        const productDesc = pickString(product, ["description", "summary", "details", "benefit", "notes"]);
        const pinDescription = (productDesc ? `${content}\n\n${productDesc}` : content).slice(0, 800);
        const altText = `${pinTitle} — ${(hook || "").trim()}`.replace(/\s+/g, " ").slice(0, 500);
        const keywords = hashtags.map((t) => String(t).replace(/^#/, "")).filter(Boolean).slice(0, 10);

        // Per Outstand docs: platform config is a TOP-LEVEL key named after the
        // network — NOT nested inside `pinterestConfiguration` or
        // `networkOverrideConfiguration`. Wrappers get ignored → board_id
        // missing → Pinterest rejects with "board_id required".
        body.pinterest = {
          board_id: boardIds[0],
          title: pinTitle,
          description: pinDescription,
          alt_text: altText,
          ...(pinLink ? { link: pinLink } : {}),
          ...(keywords.length ? { keywords } : {}),
        };
        // Alt text on the media object too — some ingesters read it there.
        body.containers = [
          {
            content: pinDescription,
            media: [{ url: outstandMediaUrl, filename, alt_text: altText }],
          },
        ];
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
      storePostId({ network, post_id: postId, account_ids: accountIds });
      await supabaseAdmin
        .from("reels")
        .update({ outstand_post_ids: Array.from(postIdsByKey.values()), status: "publishing" })
        .eq("id", r.id);

      // Poll per-account outcome. Outstand fans out asynchronously — a 2xx
      // response only means "queued", not "delivered". Ground truth lives on
      // socialAccounts[].status.
      let outcome: OutstandAccountResult[] = [];
      try {
        outcome = await pollOutstandOutcome(apiKey, postId, { tries: 12, intervalMs: 10000 });
      } catch (e) {
        results.push({
          network,
          ok: false,
          pending: true,
          postId,
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
      results.push(classifyOutcome({ network, postId, accountIds, outcome, storePostId }));
    }

    const anyOk = results.some((x) => x.ok);
    const anyPending = results.some((x) => x.pending);
    const allOk = results.length > 0 && results.every((x) => x.ok);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("reels")
      .update({
        status: allOk ? "published" : anyPending ? "publishing" : "failed",
        published_at: allOk ? now : null,
        outstand_post_ids: Array.from(postIdsByKey.values()),
        error: allOk || anyPending
          ? null
          : results
              .filter((x) => !x.ok)
              .map((x) => `${x.network}: ${x.error}`)
              .join(" | "),
      })
      .eq("id", r.id);

    return { ok: anyOk, allOk, pending: anyPending, results };
  });
