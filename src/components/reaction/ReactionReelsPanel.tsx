/**
 * Reaction + Demo module — generation panel. Standalone from the typography
 * reels list; talks only to reaction.functions.ts.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteReactionReel,
  generateReactionReel,
  listReactionReels,
  syncReactionReels,
} from "@/lib/reaction.functions";
import { ARRANGEMENT_LABELS, type Arrangement } from "@/lib/reaction/pairing";

type Reel = {
  id: string;
  hook: string | null;
  caption: string | null;
  hashtags: string[];
  arrangement: string | null;
  status: string;
  video_url: string | null;
  plan: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
};

export const ReactionReelsPanel: React.FC<{ brandId: string }> = ({ brandId }) => {
  const list = useServerFn(listReactionReels);
  const generate = useServerFn(generateReactionReel);
  const sync = useServerFn(syncReactionReels);
  const remove = useServerFn(deleteReactionReel);
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["reaction-reels", brandId],
    queryFn: () => list({ data: { brand_id: brandId } }),
  });
  const reels = (data ?? []) as unknown as Reel[];
  const pending = reels.some((r) => r.status === "queued" || r.status === "rendering");

  // Poll while anything is rendering so the MP4 appears without a reload.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const r = await sync({ data: { brand_id: brandId } });
      if (r.updated) void qc.invalidateQueries({ queryKey: ["reaction-reels", brandId] });
    }, 10_000);
    return () => clearInterval(t);
  }, [pending, brandId, sync, qc]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-display text-lg">Generated reaction reels</CardTitle>
        <Button
          onClick={async () => {
            try {
              const r = await generate({ data: { brand_id: brandId } });
              toast.success(`Rendering "${r.hook}" — ${ARRANGEMENT_LABELS[r.arrangement as Arrangement] ?? r.arrangement}`);
              void qc.invalidateQueries({ queryKey: ["reaction-reels", brandId] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Generation failed");
            }
          }}
        >
          Generate reaction reel
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!reels.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing generated yet. Upload reaction clips and product demos above, then hit Generate — each run picks a
            different pairing, hook, arrangement and timing.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {reels.map((reel) => (
            <div key={reel.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug">{reel.hook}</p>
                <Badge variant={reel.status === "ready" ? "secondary" : reel.status === "failed" ? "destructive" : "outline"}>
                  {reel.status}
                </Badge>
              </div>
              {reel.video_url ? (
                <video src={reel.video_url} controls className="w-full rounded-md bg-black" />
              ) : reel.status === "failed" ? (
                <p className="text-sm text-destructive">{reel.error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Rendering on the worker…</p>
              )}
              <p className="text-xs text-muted-foreground">
                {ARRANGEMENT_LABELS[reel.arrangement as Arrangement] ?? reel.arrangement}
                {typeof reel.plan?.totalSeconds === "number" ? ` · ${reel.plan.totalSeconds}s` : ""}
                {typeof reel.plan?.textStyle === "string" ? ` · ${reel.plan.textStyle}` : ""}
                {typeof reel.plan?.hookTiming === "string" ? ` · ${reel.plan.hookTiming}` : ""}
              </p>
              {reel.caption ? <p className="text-sm text-muted-foreground line-clamp-3">{reel.caption}</p> : null}
              <div className="flex gap-2">
                {reel.video_url ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={reel.video_url} download>
                      Download
                    </a>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await remove({ data: { id: reel.id } });
                    void qc.invalidateQueries({ queryKey: ["reaction-reels", brandId] });
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        {isFetching ? <p className="text-xs text-muted-foreground">Refreshing…</p> : null}
      </CardContent>
    </Card>
  );
};
