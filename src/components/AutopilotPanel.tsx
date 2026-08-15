import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAutopilotSettings,
  saveAutopilotSettings,
  updateBrandAutopilot,
  runAutopilotNow,
} from "@/lib/autopilot.functions";
import { listBrands } from "@/lib/brands.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, FolderOpen, Loader2, PlayCircle, RefreshCw } from "lucide-react";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const stageLabel: Record<string, string> = {
  generate: "Generated",
  drive: "Drive",
  publish: "Published",
};

export function AutopilotPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["autopilot"],
    queryFn: () => getAutopilotSettings(),
  });
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: () => listBrands() });
  const [link, setLink] = useState<string | null>(null);

  const folderValue = link ?? data?.settings.drive_parent_url ?? "";

  const scheduleByBrand = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["schedules"][number]>();
    for (const s of data?.schedules ?? []) map.set(s.brand_id, s);
    return map;
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["autopilot"] });
  };

  const save = useMutation({
    mutationFn: (input: { drive_folder_link?: string; drive_enabled?: boolean }) =>
      saveAutopilotSettings({ data: input }),
    onSuccess: () => {
      toast.success("Autopilot settings saved");
      setLink(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBrand = useMutation({
    mutationFn: (input: {
      brand_id: string;
      autopilot_enabled?: boolean;
      auto_publish?: boolean;
      posts_per_day?: number;
      days_of_week?: number[];
      time_of_day?: string;
    }) => updateBrandAutopilot({ data: input }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const runNow = useMutation({
    mutationFn: () => runAutopilotNow(),
    onSuccess: (res) => {
      const n = res.generated.length + res.archived.length + res.published.length;
      toast.success(n ? `Autopilot ran ${n} action(s)` : "Nothing due right now");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mb-8 overflow-hidden border-border/70">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-accent/[0.08] to-transparent py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-accent" />
          Autopilot
          <span className="text-xs font-normal text-muted-foreground">
            generates, archives to Drive and publishes on schedule
          </span>
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending}
        >
          {runNow.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run now
        </Button>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading autopilot status…
          </div>
        ) : (
          <>
            {/* Drive archive */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" /> Google Drive parent folder
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={folderValue}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                />
                <Button
                  onClick={() => save.mutate({ drive_folder_link: folderValue })}
                  disabled={save.isPending}
                >
                  {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save folder
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {data?.driveConfigured ? (
                  <>
                    Share this folder (Editor access) with{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      {data?.serviceAccountEmail ?? "the service account"}
                    </code>
                    . A subfolder is created per brand and every rendered MP4 lands there
                    automatically.
                  </>
                ) : (
                  "Google Drive archiving is inactive — the service account key is not configured yet."
                )}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={data?.settings.drive_enabled ?? true}
                  onCheckedChange={(v) => save.mutate({ drive_enabled: v })}
                />
                <span className="text-sm">Archive rendered reels to Drive</span>
              </div>
            </div>

            {/* Per-brand controls */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Per-brand autopilot
              </Label>
              <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                {brands.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Add a brand first.</p>
                )}
                {brands.map((b) => {
                  const s = scheduleByBrand.get(b.id);
                  const days: number[] = (s?.days_of_week as number[] | undefined) ?? [];
                  const toggleDay = (d: number) => {
                    if (!s) return;
                    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
                    toggleBrand.mutate({ brand_id: b.id, days_of_week: next });
                  };
                  return (
                    <div key={b.id} className="space-y-2.5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{b.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s
                              ? `${s.active ? "Schedule active" : "Schedule paused"} · ${s.time_of_day?.slice(0, 5) ?? "--:--"} ${s.timezone ?? ""}`
                              : "No schedule set"}
                            {s?.last_run_at
                              ? ` · last run ${new Date(s.last_run_at).toLocaleString()}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={s?.auto_publish ?? true}
                              disabled={!s}
                              onCheckedChange={(v) =>
                                toggleBrand.mutate({ brand_id: b.id, auto_publish: v })
                              }
                            />
                            <span className="text-xs">Auto-publish</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={s?.autopilot_enabled ?? false}
                              disabled={!s}
                              onCheckedChange={(v) =>
                                toggleBrand.mutate({ brand_id: b.id, autopilot_enabled: v })
                              }
                            />
                            <span className="text-xs font-medium">Autopilot</span>
                          </div>
                        </div>
                      </div>

                      {/* Frequency: which days, what time, how many per day */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          {DAY_LABELS.map((label, d) => (
                            <button
                              key={d}
                              type="button"
                              disabled={!s}
                              onClick={() => toggleDay(d)}
                              className={`h-7 w-7 rounded-md border text-[11px] font-medium transition-colors ${
                                days.includes(d)
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border/60 text-muted-foreground hover:bg-muted"
                              } disabled:opacity-50`}
                              title={FULL_DAYS[d]}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Time</span>
                          <Input
                            type="time"
                            className="h-8 w-[7.5rem]"
                            disabled={!s}
                            defaultValue={s?.time_of_day?.slice(0, 5) ?? "09:00"}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (s && /^\d{2}:\d{2}$/.test(v) && v !== s.time_of_day?.slice(0, 5)) {
                                toggleBrand.mutate({ brand_id: b.id, time_of_day: v });
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Posts on those days</span>
                          <Input
                            type="number"
                            min={1}
                            max={12}
                            className="h-8 w-16"
                            defaultValue={s?.posts_per_day ?? 1}
                            disabled={!s}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (s && v >= 1 && v <= 12 && v !== s.posts_per_day) {
                                toggleBrand.mutate({ brand_id: b.id, posts_per_day: v });
                              }
                            }}
                          />
                        </div>
                        {days.length === 0 && s && (
                          <span className="text-xs text-destructive">
                            No days selected — nothing will post.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>

            {/* Activity */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" /> Recent autopilot activity
              </Label>
              {(data?.runs ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing yet — activity appears here after the first scheduled run.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(data?.runs ?? []).map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs"
                    >
                      <Badge
                        variant={
                          r.status === "ok"
                            ? "secondary"
                            : r.status === "error"
                              ? "destructive"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {stageLabel[r.stage] ?? r.stage}
                      </Badge>
                      <span className="min-w-0 flex-1 break-words text-muted-foreground">
                        {r.message}
                      </span>
                      <span className="shrink-0 text-muted-foreground/70">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
