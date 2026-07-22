import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getBrand,
  updateBrand,
  updateSchedule,
  deleteBrand,
  createBrandAssetUploadUrl,
  listBrandReferences,
  addBrandReference,
  deleteBrandReference,
} from "@/lib/brands.functions";
import { renderNow } from "@/lib/render.functions";
import { publishReel } from "@/lib/outstand.functions";

import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Save, Trash2, Upload, Wand2, X } from "lucide-react";
import { RenderJobsPanel } from "@/components/RenderJobsPanel";
import { BrandSocialAccounts } from "@/components/BrandSocialAccounts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { analyzeReferenceVideo } from "@/lib/reference-analysis";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FONT_CHOICES = [
  "Space Grotesk",
  "Inter",
  "Anton",
  "Bebas Neue",
  "Archivo Black",
  "Playfair Display",
  "DM Serif Display",
  "Poppins",
  "Montserrat",
  "Oswald",
];

const brandQuery = (id: string) =>
  queryOptions({
    queryKey: ["brand", id],
    queryFn: () => getBrand({ data: { id } }),
  });

const referencesQuery = (id: string) =>
  queryOptions({
    queryKey: ["brand-references", id],
    queryFn: () => listBrandReferences({ data: { brand_id: id } }),
  });

export const Route = createFileRoute("/_authenticated/app/brands/$brandId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(brandQuery(params.brandId)),
  component: BrandDetail,
});

function BrandDetail() {
  const { brandId } = Route.useParams();
  const { data } = useQuery(brandQuery(brandId));
  const { data: references } = useQuery(referencesQuery(brandId));
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTab, setSheetTab] = useState("");
  const [kb, setKb] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [tz, setTz] = useState("UTC");
  const [active, setActive] = useState(true);
  const [colors, setColors] = useState({
    primary: "#111111",
    accent: "#ff3b30",
    background: "#ffffff",
    text: "#111111",
  });
  const [fonts, setFonts] = useState({ display: "Space Grotesk", body: "Inter" });
  const [uploadingRef, setUploadingRef] = useState(false);
  const refFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.brand.name);
    setSheetUrl(data.brand.google_sheet_url ?? "");
    setSheetTab(data.brand.sheet_tab ?? "Sheet1");
    setKb(data.brand.knowledge_base ?? "");
    setTemplateId(data.brand.template_id ?? "alternate");
    if (data.brand.brand_colors) {
      setColors({ ...colors, ...(data.brand.brand_colors as typeof colors) });
    }
    if (data.brand.brand_fonts) {
      setFonts({ ...fonts, ...(data.brand.brand_fonts as typeof fonts) });
    }
    if (data.schedule) {
      setDays(data.schedule.days_of_week ?? []);
      setTimeOfDay((data.schedule.time_of_day ?? "09:00").slice(0, 5));
      setTz(data.schedule.timezone ?? "UTC");
      setActive(data.schedule.active ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await updateBrand({
        data: {
          id: brandId,
          name,
          google_sheet_url: sheetUrl || "",
          sheet_tab: sheetTab || "Sheet1",
          sheet_range: "A1:Z1000",
          knowledge_base: kb,
          template_id: templateId || undefined,
          brand_colors: colors,
          brand_fonts: fonts,
        },
      });
      await updateSchedule({
        data: {
          brand_id: brandId,
          days_of_week: days,
          time_of_day: timeOfDay,
          timezone: tz,
          active,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["brand", brandId] });
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteBrand({ data: { id: brandId } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["brands"] });
      navigate({ to: "/app" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const render = useMutation({
    mutationFn: () =>
      renderNow({
        data: {
          brand_id: brandId,
          template_id:
            templateId === "motion-poster" || templateId === "bold-editorial" || templateId === "alternate"
              ? templateId
              : "alternate",
        },
      }),
    onSuccess: (r) => {
      toast.success(`Rendering ${r.template_id}: "${r.hook}"`);
      qc.invalidateQueries({ queryKey: ["brand", brandId] });
      qc.invalidateQueries({ queryKey: ["render_jobs", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const publish = useMutation({
    mutationFn: (reelId: string) => publishReel({ data: { reel_id: reelId } }),
    onSuccess: (r) => {
      const okList = r.results.filter((x) => x.ok).map((x) => x.network);
      const failList = r.results.filter((x) => !x.ok);
      if (r.allOk) toast.success(`Published to ${okList.join(", ")}`);
      else if (r.ok) toast.warning(`Published to ${okList.join(", ")}. Failed: ${failList.map((f) => f.network).join(", ")}`);
      else toast.error(`Publish failed: ${failList.map((f) => `${f.network}: ${f.error}`).join(" | ")}`);
      qc.invalidateQueries({ queryKey: ["brand", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const removeRef = useMutation({
    mutationFn: (id: string) => deleteBrandReference({ data: { id } }),
    onSuccess: () => {
      toast.success("Reference removed");
      qc.invalidateQueries({ queryKey: ["brand-references", brandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleReferenceUpload(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file");
      return;
    }
    if ((references?.length ?? 0) >= 15) {
      toast.error("Reference vault is full (max 15). Delete one first.");
      return;
    }
    setUploadingRef(true);
    try {
      const { path, signedUrl, token } = await createBrandAssetUploadUrl({
        data: { brand_id: brandId, filename: file.name, kind: "reference_reel" },
      });
      const { error } = await supabase.storage
        .from("brand-assets")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type,
        });
      if (error && !signedUrl) throw error;
      const { notes, frames } = await analyzeReferenceVideo(file);
      await addBrandReference({
        data: { brand_id: brandId, storage_path: path, label: file.name, notes, frames },
      });
      toast.success("Reference added to vault");
      qc.invalidateQueries({ queryKey: ["brand-references", brandId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingRef(false);
      if (refFileInput.current) refFileInput.current.value = "";
    }
  }

  if (!data) return null;

  const refCount = references?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to="/app"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to brands
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{data.brand.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.reels.length} reel{data.reels.length === 1 ? "" : "s"} generated · {refCount}/15
            references
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm(`Delete "${data.brand.name}"? This can't be undone.`)) del.mutate();
            }}
          >
            <Trash2 className="mr-1.5 size-3.5" /> Delete
          </Button>
          <Button
            variant="outline"
            onClick={() => render.mutate()}
            disabled={render.isPending}
          >
            {render.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 size-3.5" />
            )}
            Render test reel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="sheet">Google Sheet URL</Label>
                <Input
                  id="sheet"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
              </div>
              <div>
                <Label htmlFor="tab">Sheet tab</Label>
                <Input id="tab" value={sheetTab} onChange={(e) => setSheetTab(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Brand colours & fonts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {(["primary", "accent", "background", "text"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs capitalize">{k}</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={colors[k]}
                        onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                        className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                      />
                      <Input
                        value={colors[k]}
                        onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Display font</Label>
                  <select
                    value={fonts.display}
                    onChange={(e) => setFonts({ ...fonts, display: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {FONT_CHOICES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Body font</Label>
                  <select
                    value={fonts.body}
                    onChange={(e) => setFonts({ ...fonts, body: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {FONT_CHOICES.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Click <b>Save changes</b> to apply. New reels will use these tokens.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Knowledge base</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                value={kb}
                onChange={(e) => setKb(e.target.value)}
                placeholder="Brand voice, positioning, audience, do's & don'ts, tone. Fed to the copywriter."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Reference vault ({refCount}/15)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                  Upload up to 15 reference reels. New renders use them as the brand's visual-language vault
                  for layout, hierarchy, timing, typography, and readable motion choices.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={refFileInput}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleReferenceUpload(f);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingRef || refCount >= 15}
                  onClick={() => refFileInput.current?.click()}
                >
                  {uploadingRef ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 size-3.5" />
                  )}
                  Add reference
                </Button>
              </div>
              {references && references.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {references.map((r) => (
                    <div
                      key={r.id}
                      className="relative rounded-md border border-border overflow-hidden bg-black"
                    >
                      {r.url ? (
                        <video
                          src={r.url}
                          className="w-full aspect-[9/16] object-cover"
                          muted
                          playsInline
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                          onMouseLeave={(e) => {
                            const v = e.currentTarget as HTMLVideoElement;
                            v.pause();
                            v.currentTime = 0;
                          }}
                        />
                      ) : (
                        <div className="aspect-[9/16] flex items-center justify-center text-xs text-muted-foreground">
                          Loading…
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRef.mutate(r.id)}
                        className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                        aria-label="Remove"
                      >
                        <X className="size-3" />
                      </button>
                      <div className="p-2 text-[10px] text-white/80 bg-black/60 truncate absolute bottom-0 left-0 right-0">
                        {r.label ?? "reference"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No references yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Render engine</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      "flex overflow-hidden rounded-lg border text-left transition",
                      templateId === t.id
                        ? "border-accent ring-2 ring-accent"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div className="w-24 shrink-0" style={{ background: t.swatch }} />
                    <div className="p-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <RenderJobsPanel brandId={brandId} />

          <BrandSocialAccounts brandId={brandId} />

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Recent reels</CardTitle>
            </CardHeader>
            <CardContent>
              {data.reels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reels yet. The next scheduled run will create the first one.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.reels.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-border p-3 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.hook ?? "—"}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {r.caption ?? ""}
                          </div>
                          {r.template_id ? (
                            <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Template: {r.template_id}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <Badge
                            variant={
                              r.status === "published"
                                ? "default"
                                : r.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {r.video_url ? (
                        <div className="space-y-2">
                          <video
                            src={r.video_url}
                            controls
                            playsInline
                            className="w-full max-w-[280px] rounded-md border border-border bg-black aspect-[9/16]"
                          />
                          <div className="flex gap-3 text-xs">
                            <a
                              href={r.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              Open in new tab
                            </a>
                            <a
                              href={r.video_url}
                              download
                              className="text-primary underline"
                            >
                              Download MP4
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
              <div>
                <Label>Days</Label>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {DAY_LABELS.map((d, i) => {
                    const on = days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={cn(
                          "rounded-md border py-1.5 text-xs",
                          on
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border hover:bg-muted",
                        )}
                        onClick={() =>
                          setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())
                        }
                      >
                        {d[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tz">Timezone</Label>
                <Input
                  id="tz"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="UTC or Europe/London"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                One post per active day at this time. For multiple posts per day, we can add
                additional schedule slots — ask and I'll wire it in.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Brand assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Logo: {data.brand.logo_url ? "✓" : "—"}</div>
              <div>Primary reference: {data.brand.reference_reel_url ? "✓" : "—"}</div>
              <div>Vault references: {refCount}/15</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
