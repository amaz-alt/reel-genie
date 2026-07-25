export const OUTSTAND_API_BASE = "https://api.outstand.so";

export type OutstandAccountResult = {
  id?: string;
  network?: string;
  username?: string | null;
  status?: string;
  error?: string | null;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  publishedAt?: string | null;
};

export type StoredOutstandPost = { network: string; post_id: string; account_ids: string[] };

export type PublishNetworkResult = {
  network: string;
  ok: boolean;
  pending?: boolean;
  postId?: string;
  error?: string;
  accounts?: OutstandAccountResult[];
};

export function pickString(row: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function buildCaption(opts: {
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

export async function listOutstandAccountsFromApi(apiKey: string) {
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
  return rows
    .map((r) => ({
      id: String(r.id ?? r.account_id ?? ""),
      network: String(r.network ?? ""),
      username: (r.username as string | null) ?? null,
      nickname: (r.nickname as string | null) ?? null,
      network_unique_id:
        (r.network_unique_id as string | null) ??
        (r.networkUniqueId as string | null) ??
        null,
    }))
    .filter((r) => r.id && r.network);
}

async function fetchOutstandPost(apiKey: string, postId: string) {
  const res = await fetch(`${OUTSTAND_API_BASE}/v1/posts/${postId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Outstand GET post ${postId} failed: ${res.status}`);
  const json = (await res.json()) as { post?: { socialAccounts?: OutstandAccountResult[] } };
  return json.post?.socialAccounts ?? [];
}

export async function pollOutstandOutcome(
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

export function classifyOutcome(input: {
  network: string;
  postId: string;
  accountIds: string[];
  outcome: OutstandAccountResult[];
  storePostId: (post: StoredOutstandPost) => void;
}): PublishNetworkResult {
  const { network, postId, accountIds, outcome, storePostId } = input;
  const failed = outcome.filter((a) => a.status === "failed");
  const pending = outcome.filter((a) => !a.status || a.status === "pending");
  const published = outcome.filter((a) => a.status === "published");

  if (failed.length === 0 && pending.length === 0 && published.length > 0) {
    storePostId({ network, post_id: postId, account_ids: accountIds });
    return { network, ok: true, postId, accounts: outcome };
  }

  if (published.length > 0 && failed.length > 0) {
    storePostId({ network, post_id: postId, account_ids: accountIds });
    return {
      network,
      ok: false,
      postId,
      error: `Partial fail: ${failed.map((a) => `${a.username ?? a.id}: ${a.error}`).join(" | ")}`,
      accounts: outcome,
    };
  }

  if (failed.length > 0 && pending.length === 0) {
    return {
      network,
      ok: false,
      postId,
      error: failed.map((a) => `${a.username ?? a.id}: ${a.error}`).join(" | "),
      accounts: outcome,
    };
  }

  storePostId({ network, post_id: postId, account_ids: accountIds });
  return {
    network,
    ok: false,
    pending: true,
    postId,
    error: "Outstand accepted the video and is still processing it. Check again in a few minutes.",
    accounts: outcome,
  };
}

export async function checkStoredOutstandPosts(
  apiKey: string,
  posts: StoredOutstandPost[],
): Promise<PublishNetworkResult[]> {
  const results: PublishNetworkResult[] = [];
  const storePostId = () => undefined;

  for (const post of posts) {
    let outcome: OutstandAccountResult[] = [];
    try {
      outcome = await pollOutstandOutcome(apiKey, post.post_id, { tries: 6, intervalMs: 10000 });
      results.push(
        classifyOutcome({
          network: post.network,
          postId: post.post_id,
          accountIds: post.account_ids,
          outcome,
          storePostId,
        }),
      );
    } catch (e) {
      results.push({
        network: post.network,
        ok: false,
        pending: true,
        postId: post.post_id,
        error: e instanceof Error ? e.message : String(e),
        accounts: outcome,
      });
    }
  }

  return results;
}