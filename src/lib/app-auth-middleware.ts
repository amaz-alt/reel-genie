import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

function createBackendFetch(publishableKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (headers.get("Authorization") === `Bearer ${publishableKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", publishableKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Auth middleware that works on Lovable hosting and self-hosted Vercel builds.
 * The backend URL and publishable key are public configuration, so a Vercel
 * runtime can safely fall back to the VITE_* values embedded at build time.
 */
export const requireAppAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const backendUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const publishableKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!backendUrl || !publishableKey) {
      throw new Error(
        "Backend configuration is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the deployment.",
      );
    }

    const request = getRequest();
    const authHeader = request?.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length);
    if (!token || token.split(".").length !== 3) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const backend = createClient<Database>(backendUrl, publishableKey, {
      global: {
        fetch: createBackendFetch(publishableKey),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await backend.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase: backend,
        userId,
        claims: data.claims,
      },
    });
  },
);