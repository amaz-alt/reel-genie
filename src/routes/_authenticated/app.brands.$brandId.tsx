import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getBrand,
  updateBrand,
  updateSchedule,
  deleteBrand,
} from "@/lib/brands.functions";
import { renderNow } from "@/lib/render.functions";
import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Save, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const brandQuery = (id: string) =>
  queryOptions({
    queryKey: ["brand", id],
    queryFn: () => getBrand({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/brands/$brandId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(brandQuery(params.brandId)),
  component: BrandDetail,
});

function BrandDetail() {
  const { brandId } = Route.useParams();
  const { data } = useQuery(brandQuery(brandId));
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

  useEffect(() => {
    if (!data) return;
    setName(data.brand.name);
    setSheetUrl(data.brand.google_sheet_url ?? "");
    setSheetTab(data.brand.sheet_tab ?? "Sheet1");
    setKb(data.brand.knowledge_base ?? "");
    setTemplateId(data.brand.template_id ?? "");
    if (data.schedule) {
      setDays(data.schedule.days_of_week ?? []);
      setTimeOfDay((data.schedule.time_of_day ?? "09:00").slice(0, 5));
      setTz(data.schedule.timezone ?? "UTC");
      setActive(data.schedule.active ?? true);
    }
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
    mutationFn: async () => {
      const hook = window.prompt(
        "Hook for this test reel (10–12 words max):",
        "Small change. Big result. Try it today.",
      );
      if (!hook) throw new Error("cancelled");
      return renderNow({ data: { brand_id: brandId, hook } });
    },
    onSuccess: () => {
      toast.success("Render dispatched to worker");
      qc.invalidateQueries({ queryKey: ["brand", brandId] });
    },
    onError: (e: Error) => {
      if (e.message !== "cancelled") toast.error(e.message);
    },
  });

  if (!data) return null;

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
            {data.reels.length} reel{data.reels.length === 1 ? "" : "s"} generated
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
              <CardTitle className="font-display text-lg">Knowledge base</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={8} value={kb} onChange={(e) => setKb(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Template</CardTitle>
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
                      className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.hook ?? "—"}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {r.caption ?? ""}
                        </div>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Brand assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Logo: {data.brand.logo_url ? "✓" : "—"}</div>
              <div>Reference reel: {data.brand.reference_reel_url ? "✓" : "—"}</div>
              <p className="text-xs text-muted-foreground">
                (Managed at brand creation for now — an edit UI is coming.)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
