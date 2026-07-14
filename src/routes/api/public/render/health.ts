import { createFileRoute } from "@tanstack/react-router";
import { getRenderService } from "@/lib/render/RenderService";

export const Route = createFileRoute("/api/public/render/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token || token !== process.env.RENDER_WORKER_TOKEN) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const svc = getRenderService();
          const h = await svc.health();
          return new Response(
            JSON.stringify({ lovable_to_vps: "ok", worker: h, vps_url: process.env.VPS_RENDER_URL }),
            { headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ lovable_to_vps: "fail", error: msg }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
