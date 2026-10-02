import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  addBrollAsset,
  addBrollHooks,
  createBrollUploadUrl,
  deleteBrollAsset,
  listBrollAssets,
  listBrollHooks,
} from "@/lib/broll.functions";

type Clip = {
  id: string;
  storage_path: string;
  label: string | null;
  duration_seconds: number | null;
  preview_url: string | null;
};
type Hook = { id: string; hook_text: string; used_at: string | null };

async function readDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    return await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error(`Could not read ${file.name}`));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const BRollAssetLibrary: React.FC<{ brandId: string }> = ({ brandId }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pastedHooks, setPastedHooks] = useState("");
  const createUrl = useServerFn(createBrollUploadUrl);
  const addAsset = useServerFn(addBrollAsset);
  const remove = useServerFn(deleteBrollAsset);
  const listAssets = useServerFn(listBrollAssets);
  const saveHooks = useServerFn(addBrollHooks);
  const listHookLines = useServerFn(listBrollHooks);
  const qc = useQueryClient();
  const { data: clips = [] } = useQuery({
    queryKey: ["broll-assets", brandId],
    queryFn: () => listAssets({ data: { brand_id: brandId } }),
  });
  const { data: hooks = [] } = useQuery({
    queryKey: ["broll-hooks", brandId],
    queryFn: () => listHookLines({ data: { brand_id: brandId } }),
  });

  async function uploadFiles(files: FileList | null) {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith("video/"));
    if (!selected.length) return;
    if (selected.length + clips.length > 15) {
      toast.error(`A brand can have up to 15 clips. You can add ${Math.max(0, 15 - clips.length)} more.`);
      return;
    }
    setBusy(true);
    let added = 0;
    for (const file of selected) {
      try {
        const duration = await readDuration(file);
        if (duration > 60) throw new Error(`${file.name} is longer than 60 seconds.`);
        const target = await createUrl({ data: { brand_id: brandId, filename: file.name } });
        const response = await fetch(target.signedUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Could not upload ${file.name} (${response.status}).`);
        await addAsset({
          data: {
            brand_id: brandId,
            storage_path: target.path,
            label: file.name.replace(/\.[^.]+$/, ""),
            duration_seconds: Math.round(duration * 10) / 10,
          },
        });
        added++;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Upload failed for ${file.name}.`);
      }
    }
    setBusy(false);
    if (added) toast.success(`${added} clip${added === 1 ? "" : "s"} added`);
    await qc.invalidateQueries({ queryKey: ["broll-assets", brandId] });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function saveHookLines() {
    const lines = pastedHooks.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      toast.error("Add one hook line per row first.");
      return;
    }
    try {
      const result = await saveHooks({ data: { brand_id: brandId, hooks: lines } });
      setPastedHooks("");
      toast.success(`${result.added} new line${result.added === 1 ? "" : "s"} added${result.ignored ? ` · ${result.ignored} duplicate${result.ignored === 1 ? "" : "s"} skipped` : ""}`);
      await qc.invalidateQueries({ queryKey: ["broll-hooks", brandId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save hook lines.");
    }
  }

  const unusedCount = (hooks as Hook[]).filter((hook) => !hook.used_at).length;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Clip library</h2>
            <p className="mt-1 text-sm text-muted-foreground">{clips.length} of 15 clips</p>
          </div>
          <Button onClick={() => inputRef.current?.click()} disabled={busy || clips.length >= 15}>
            {busy ? "Uploading clips…" : "Add video clips"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(clips as Clip[]).map((clip) => (
            <article key={clip.id} className="space-y-2 border-b border-border pb-4">
              {clip.preview_url ? <video src={clip.preview_url} controls playsInline className="aspect-[9/16] w-full max-h-[420px] bg-muted object-contain" /> : null}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{clip.label || "B-roll clip"}</p>
                  <p className="text-xs text-muted-foreground">{clip.duration_seconds?.toFixed(1) ?? "—"} sec</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${clip.label || "B-roll clip"}`}
                  onClick={async () => {
                    try {
                      await remove({ data: { id: clip.id } });
                      await qc.invalidateQueries({ queryKey: ["broll-assets", brandId] });
                      toast.success("Clip removed");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not delete clip.");
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
          {!clips.length ? <p className="text-sm text-muted-foreground">Add 10–15 short vertical clips for this brand.</p> : null}
        </div>
      </section>

      <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Hook lines</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each line is used once, in order, matched to clips in rotation.</p>
          </div>
          <Textarea
            value={pastedHooks}
            onChange={(event) => setPastedHooks(event.target.value)}
            placeholder={"I wish I found this sooner.\nThis made my mornings easier.\nA tiny change with a big payoff."}
            className="min-h-44 resize-y"
            aria-label="Paste hook lines, one per line"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void saveHookLines()}>Save hook lines</Button>
            <span className="text-sm text-muted-foreground">{unusedCount} unused · {(hooks as Hook[]).length - unusedCount} used</span>
          </div>
        </div>
        <Card className="h-fit rounded-md shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rotation queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(hooks as Hook[]).length ? (hooks as Hook[]).slice(-8).reverse().map((hook) => (
              <div key={hook.id} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                <p className="text-sm leading-snug">{hook.hook_text}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{hook.used_at ? "Used" : "Next"}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Your saved lines will appear here.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};