import { createFileRoute, redirect } from "@tanstack/react-router";
import { verifyState } from "@/lib/outstand.functions";

export const Route = createFileRoute("/api/public/outstand/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state");
        const success = url.searchParams.get("success") === "true";
        const accountId = url.searchParams.get("account_id");
        const username = url.searchParams.get("username");
        const nickname = url.searchParams.get("nickname");
        const networkUniqueId = url.searchParams.get("network_unique_id");
        const errParam = url.searchParams.get("error");

        const appUrl = process.env.PUBLIC_APP_URL ?? url.origin;

        if (!state) {
          return Response.redirect(`${appUrl}/app?outstand=missing_state`, 302);
        }
        const verified = await verifyState(state);
        if (!verified) {
          return Response.redirect(`${appUrl}/app?outstand=invalid_state`, 302);
        }
        const { brandId, network } = verified;
        const brandUrl = `${appUrl}/app/brands/${brandId}`;

        if (!success || !accountId) {
          const q = new URLSearchParams({
            outstand: "failed",
            network,
            reason: errParam ?? "unknown",
          });
          return Response.redirect(`${brandUrl}?${q.toString()}`, 302);
        }

        // Insert / upsert the account via service role (public route — no user session).
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("brand_social_accounts")
          .upsert(
            {
              brand_id: brandId,
              network,
              outstand_account_id: accountId,
              username,
              nickname,
              network_unique_id: networkUniqueId,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "brand_id,network,outstand_account_id" },
          );

        if (error) {
          console.error("outstand callback insert failed", error);
          const q = new URLSearchParams({ outstand: "db_error", network });
          return Response.redirect(`${brandUrl}?${q.toString()}`, 302);
        }

        const q = new URLSearchParams({ outstand: "connected", network });
        return Response.redirect(`${brandUrl}?${q.toString()}`, 302);
      },
    },
  },
});

// Route needs a component reference to satisfy the router registry even for API-only routes.
export default function OutstandCallback() {
  return null;
}
