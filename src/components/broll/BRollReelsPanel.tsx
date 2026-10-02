import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  const pending = (reels as Reel[]).some((reel) => reel.status === "queued" || reel.status === "rendering");
  const unusedCount = (hooks as Hook[]).filter((hook) => !hook.used_at).length;

  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["broll-reels", brandId] });
    }, 10_000);
    return () => clearInterval(interval);
  }, [pending, brandId, qc]);

  async function makeBatch() {
    try {
      const result = await generate({ data: { brand_id: brandId, count: Math.min(30, unusedCount) } });
      toast.success(`${result.generated} reel${result.generated === 1 ? "" : "s"} sent to render`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["broll-reels", brandId] }),
        qc.invalidateQueries({ queryKey: ["broll-hooks", brandId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start reel generation.");
    }
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Generated B-roll reels</h2>
          <p className="mt-1 text-sm text-muted-foreground">{unusedCount} hook lines ready · clips rotate automatically</p>
        </div>
        <Button onClick={() => void makeBatch()} disabled={!unusedCount || pending}>
          {pending ? "Rendering…" : `Generate next ${Math.min(30, unusedCount) || "batch"}`}
        </Button>
      </div>

      {!reels.length ? <p className="text-sm text-muted-foreground">Rendered videos will appear here.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(reels as Reel[]).map((reel) => (
          <article key={reel.id} className="space-y-2 border-b border-border pb-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug">{reel.hook_text}</p>
              <Badge variant={reel.status === "ready" ? "secondary" : reel.status === "failed" ? "destructive" : "outline"}>
                {reel.status}
              </Badge>
            </div>
            {reel.video_url ? (
              <video src={reel.video_url} controls playsInline className="aspect-[9/16] w-full max-h-[480px] bg-muted object-contain" />
            ) : reel.status === "failed" ? (
              <p className="text-sm text-destructive">{reel.error || "Render failed."}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Preparing this video…</p>
            )}
            {reel.video_url ? <Button asChild size="sm" variant="secondary"><a href={reel.video_url} download>Download MP4</a></Button> : null}
          </article>
        ))}
      </div>
      {isFetching ? <p className="text-xs text-muted-foreground">Updating…</p> : null}
    </section>
  );
};