import { createFileRoute } from "@tanstack/react-router";

/**
 * Autopilot cron hook. Called by pg_cron every 15 minutes with the project
 * publishable key in the `apikey` header. Generates due reels, archives
 * finished mp4s to Google Drive and publishes them.
 */
async function handle(request: Request) {
  const key =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!expected || key !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { runAutopilotTick } = await import("@/lib/autopilot.server");
    const result = await runAutopilotTick();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("autopilot tick failed", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/autopilot/tick")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
