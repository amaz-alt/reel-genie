/**
 * Reaction + Demo module — asset library UI. Standalone; shares no state with
 * the typography reels screens.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addReactionAsset,
  createReactionAssetUploadUrl,
  deleteReactionAsset,
  getReactionAssetUrl,
  listReactionAssets,
  updateReactionAssetLabel,
} from "@/lib/reaction.functions";
import type { AssetTags } from "@/lib/reaction/pairing";

type Row = {
  id: string;
  kind: string;
  storage_path: string;
  label: string | null;
  duration_seconds: number | null;
  ai_tags: AssetTags | null;
  last_used_at: string | null;
  use_count: number;
};

/** Read duration + evenly spaced frames from a local video file, in-browser. */
async function probeClip(file: File, frameCount = 4) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read video"));
  });
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 640 / (video.videoWidth || 640));
  canvas.width = Math.round((video.videoWidth || 640) * scale);
  canvas.height = Math.round((video.videoHeight || 1136) * scale);
  const ctx = canvas.getContext("2d");
  const frames: string[] = [];
  for (let i = 0; i < frameCount && ctx && duration > 0; i++) {
    const t = (duration * (i + 0.5)) / frameCount;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(duration - 0.05, t);
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  URL.revokeObjectURL(url);
  return {
    duration,
    width: video.videoWidth || undefined,
    height: video.videoHeight || undefined,
    frames,
    poster: frames[0] ?? null,
  };
}

const TagChips: React.FC<{ tags: AssetTags | null }> = ({ tags }) => {
  if (!tags || Object.keys(tags).length === 0) {
    return <Badge variant="outline">Not tagged yet</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.emotion ? <Badge variant="secondary">{tags.emotion}</Badge> : null}
      {tags.energy ? <Badge variant="outline">{tags.energy} energy</Badge> : null}
      {(tags.topics ?? []).slice(0, 3).map((t) => (
        <Badge key={t} variant="outline">
          {t}
        </Badge>
      ))}
      {(tags.pairsWith ?? []).slice(0, 2).map((t) => (
        <Badge key={t} variant="outline" className="opacity-70">
          {t}
        </Badge>
      ))}
    </div>
  );
};

const AssetCard: React.FC<{ row: Row; onDeleted: () => void; onRenamed: () => void }> = ({
  row,
  onDeleted,
  onRenamed,
}) => {
  const signUrl = useServerFn(getReactionAssetUrl);
  const remove = useServerFn(deleteReactionAsset);
  const rename = useServerFn(updateReactionAssetLabel);
  const [url, setUrl] = useState<string | null>(null);
  const [label, setLabel] = useState(row.label ?? "");
  const tags = (row.ai_tags ?? {}) as AssetTags;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {url ? (
        <video src={url} controls className="w-full rounded-md bg-black" />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={async () => {
            const r = await signUrl({ data: { path: row.storage_path } });
            setUrl(r.url);
          }}
        >
          Preview clip
        </Button>
      )}
      <div className="text-sm text-muted-foreground line-clamp-2">
        {tags.summary ?? tags.showcases ?? row.storage_path.split("/").pop()}
      </div>
      <TagChips tags={tags} />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {row.duration_seconds ? <span>{row.duration_seconds.toFixed(1)}s</span> : null}
        <span>used {row.use_count}x</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={label}
          placeholder="Label"
          className="h-8"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={async () => {
            if (label === (row.label ?? "")) return;
            await rename({ data: { id: row.id, label } });
            onRenamed();
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await remove({ data: { id: row.id } });
            toast.success("Clip deleted");
            onDeleted();
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
};

const KindPanel: React.FC<{
  brandId: string;
  kind: "reaction" | "demo";
  rows: Row[];
  refetch: () => void;
}> = ({ brandId, kind, rows, refetch }) => {
  const createUrl = useServerFn(createReactionAssetUploadUrl);
  const addAsset = useServerFn(addReactionAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => {
      const t = (r.ai_tags ?? {}) as AssetTags;
      return [r.label, t.summary, t.showcases, t.emotion, ...(t.topics ?? []), ...(t.pairsWith ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query]);

  async function upload(files: FileList) {
    const list = Array.from(files).filter((f) => f.type.startsWith("video/"));
    if (!list.length) {
      toast.error("Pick video files");
      return;
    }
    let done = 0;
    for (const file of list) {
      setBusy(`Uploading ${file.name} (${done + 1}/${list.length})`);
      try {
        const probe = await probeClip(file);
        const signed = await createUrl({ data: { brand_id: brandId, kind, filename: file.name } });
        const put = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        setBusy(`AI tagging ${file.name}`);
        await addAsset({
          data: {
            brand_id: brandId,
            kind,
            storage_path: signed.path,
            label: file.name.replace(/\.[^.]+$/, ""),
            duration_seconds: probe.duration ? Math.round(probe.duration * 10) / 10 : undefined,
            width: probe.width,
            height: probe.height,
            frames: probe.frames,
          },
        });
        done++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed on ${file.name}`);
      }
    }
    setBusy(null);
    if (done) toast.success(`${done} clip${done > 1 ? "s" : ""} added and tagged`);
    refetch();
  }

  const untagged = rows.filter((r) => !r.ai_tags || Object.keys(r.ai_tags).length === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>
          {busy ?? `Upload ${kind === "reaction" ? "reaction" : "demo"} clips`}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by emotion, topic, tag…"
          className="max-w-xs"
        />
        <span className="text-sm text-muted-foreground">
          {rows.length} clip{rows.length === 1 ? "" : "s"}
          {untagged.length ? ` · ${untagged.length} untagged` : ""}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((row) => (
          <AssetCard
            key={row.id}
            row={row}
            onDeleted={refetch}
            onRenamed={refetch}
          />
        ))}
        {!filtered.length ? (
          <p className="text-sm text-muted-foreground">
            {kind === "reaction"
              ? "No reaction clips yet. Upload UGC reaction clips (shocked, impressed, confused…)."
              : "No demo clips yet. Upload 4-10s screen recordings of one feature each."}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export const ReactionAssetLibrary: React.FC<{ brandId: string }> = ({ brandId }) => {
  const list = useServerFn(listReactionAssets);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["reaction-assets", brandId],
    queryFn: () => list({ data: { brand_id: brandId } }),
  });
  const rows = (data ?? []) as unknown as Row[];
  const refetch = () => void qc.invalidateQueries({ queryKey: ["reaction-assets", brandId] });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Asset library</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="reaction">
          <TabsList>
            <TabsTrigger value="reaction">Reaction clips</TabsTrigger>
            <TabsTrigger value="demo">Product demos</TabsTrigger>
          </TabsList>
          <TabsContent value="reaction" className="pt-4">
            <KindPanel brandId={brandId} kind="reaction" rows={rows.filter((r) => r.kind === "reaction")} refetch={refetch} />
          </TabsContent>
          <TabsContent value="demo" className="pt-4">
            <KindPanel brandId={brandId} kind="demo" rows={rows.filter((r) => r.kind === "demo")} refetch={refetch} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
