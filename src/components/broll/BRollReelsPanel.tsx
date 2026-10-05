import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBrollHooks, listBrollReels, generateBrollReels } from "@/lib/broll.functions";

type Reel = {
  id: string;
  hook_text: string;
  status: string;
  video_url: string | null;
  error: string | null;
  created_at: string;
};
type Hook = { id: string; hook_text: string; used_at: string | null };

export const BRollReelsPanel: React.FC<{ brandId: string }> = ({ brandId }) => {
  const [starting, setStarting] = useState(false);
  const list = useServerFn(listBrollReels);
  const getHooks = useServerFn(listBrollHooks);
  const generate = useServerFn(generateBrollReels);
  const qc = useQueryClient();
  const { data: reels = [], isFetching } = useQuery({
    queryKey: ["broll-reels", brandId],
    queryFn: () => list({ data: { brand_id: brandId } }),
  });
  const { data: hooks = [] } = useQuery({
    queryKey: ["broll-hooks", brandId],
    queryFn: () => getHooks({ data: { brand_id: brandId } }),
  });
  const reelRows = reels as Reel[];
  const renderingCount = reelRows.filter((reel) => reel.status === "rendering").length;
  const queuedCount = reelRows.filter((reel) => reel.status === "queued").length;
  const pendingCount = renderingCount + queuedCount;
  const readyCount = reelRows.filter((reel) => reel.status === "ready").length;
  const failedCount = reelRows.filter((reel) => reel.status === "failed").length;
  const pending = pendingCount > 0;
  const unusedCount = (hooks as Hook[]).filter((hook) => !hook.used_at).length;

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["broll-reels", brandId] });
    }, 4_000);
    return () => clearInterval(interval);
  }, [pending, brandId, qc]);

  async function makeBatch() {
    const batchSize = Math.min(30, unusedCount);
    setStarting(true);
    try {
      const result = await generate({ data: { brand_id: brandId, count: batchSize } });
      if (result.generated > 0) {
        toast.success(`${result.generated} reel${result.generated === 1 ? "" : "s"} queued for rendering`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} reel${result.failed === 1 ? "" : "s"} could not be started. Their hook lines are available again.`);
      }
      if (result.generated === 0 && result.failed === 0) {
        toast.error("No reels were started. Refresh the page and try again.");
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["broll-reels", brandId] }),
        qc.invalidateQueries({ queryKey: ["broll-hooks", brandId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start reel generation.");
    } finally {
      setStarting(false);
    }
  }

  const statusLabel = (status: string) => ({
    queued: "Queued",
    rendering: "Rendering",
    ready: "Ready",
    failed: "Failed",
  }[status] ?? status);

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Generated B-roll reels</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unusedCount} hook lines ready · {readyCount} finished · {pendingCount} in progress · {failedCount} failed
          </p>
        </div>
        <Button onClick={() => void makeBatch()} disabled={!unusedCount || pending || starting}>
          {starting || pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
          {starting
            ? `Starting ${Math.min(30, unusedCount)} reels…`
            : pending
              ? `${pendingCount} rendering…`
              : `Generate next ${Math.min(30, unusedCount) || "batch"}`}
        </Button>
      </div>

      {pending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {renderingCount > 0 ? `${renderingCount} ${renderingCount === 1 ? "reel is" : "reels are"} rendering` : "Reels are queued"}.
          Finished videos will appear below automatically.
        </p>
      ) : null}

      {!reelRows.length ? <p className="text-sm text-muted-foreground">Your generated videos will appear here.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reelRows.map((reel) => (
          <article key={reel.id} className="space-y-2 border-b border-border pb-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug">{reel.hook_text}</p>
              <Badge variant={reel.status === "ready" ? "secondary" : reel.status === "failed" ? "destructive" : "outline"}>
                {statusLabel(reel.status)}
              </Badge>
            </div>
            {reel.video_url ? (
              <video src={reel.video_url} controls playsInline className="aspect-[9/16] w-full max-h-[480px] bg-muted object-contain" />
            ) : reel.status === "failed" ? (
              <p className="text-sm text-destructive">{reel.error || "Render failed."}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {reel.status === "queued" ? "Waiting for the render slot…" : "Your video is being created…"}
              </p>
            )}
            {reel.video_url ? <Button asChild size="sm" variant="secondary"><a href={reel.video_url} download>Download MP4</a></Button> : null}
          </article>
        ))}
      </div>
      {isFetching ? <p className="text-xs text-muted-foreground">Updating…</p> : null}
    </section>
  );
};