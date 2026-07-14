import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listRenderJobs } from "@/lib/render.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2, XCircle, ChevronDown, ChevronUp } from "lucide-react";

type LogEntry = { at: string; level: string; stage: string; message: string };
type Job = {
  id: string;
  reel_id: string | null;
  template_id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  storage_path: string | null;
  logs: LogEntry[] | null;
};

function StatusBadge({ status }: { status: Job["status"] }) {
  const map = {
    queued: { icon: Clock, label: "Queued", variant: "secondary" as const },
    rendering: { icon: Loader2, label: "Rendering", variant: "default" as const, spin: true },
    completed: { icon: CheckCircle2, label: "Ready", variant: "default" as const },
    failed: { icon: XCircle, label: "Failed", variant: "destructive" as const },
  };
  const c = map[status];
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className={`size-3 ${"spin" in c && c.spin ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
  );
}

function elapsed(from: string, to: string | null) {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function RenderJobsPanel({ brandId }: { brandId: string }) {
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["render_jobs", brandId],
    queryFn: () => listRenderJobs({ data: { brand_id: brandId } }),
    // Poll every 3s while any job is still active, otherwise every 20s.
    refetchInterval: (q) => {
      const jobs = (q.state.data ?? []) as Job[];
      const active = jobs.some((j) => j.status === "queued" || j.status === "rendering");
      return active ? 3000 : 20000;
    },
  });

  const jobs = (data ?? []) as Job[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Render jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No render jobs yet. Click <strong>Render test reel</strong> above to start one.
            Renders typically take <strong>60–120 seconds</strong>. The row flips to
            <em> Ready</em> automatically when the MP4 lands in storage — no refresh needed.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => {
              const isOpen = openLogs === j.id;
              const start = j.dispatched_at ?? j.created_at;
              const done = j.completed_at;
              return (
                <div key={j.id} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={j.status} />
                        <span className="truncate text-xs text-muted-foreground">
                          {j.template_id}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {j.status === "completed"
                          ? `Rendered in ${elapsed(start, done)}`
                          : j.status === "rendering"
                            ? `Running for ${elapsed(start, null)}`
                            : j.status === "failed"
                              ? `Failed after ${j.attempts}/${j.max_attempts} attempts`
                              : `Queued ${elapsed(j.created_at, null)} ago`}
                        {" · "}
                        {new Date(j.created_at).toLocaleString()}
                      </div>
                      {j.last_error && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-destructive">
                          {j.last_error}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenLogs(isOpen ? null : j.id)}
                    >
                      Logs {isOpen ? <ChevronUp className="ml-1 size-3" /> : <ChevronDown className="ml-1 size-3" />}
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="max-h-64 overflow-auto border-t border-border bg-muted/40 p-3 font-mono text-[11px]">
                      {(j.logs ?? []).length === 0 ? (
                        <div className="text-muted-foreground">No log entries yet.</div>
                      ) : (
                        (j.logs ?? []).map((l, i) => (
                          <div
                            key={i}
                            className={
                              l.level === "error"
                                ? "text-destructive"
                                : l.level === "warn"
                                  ? "text-amber-600"
                                  : "text-foreground"
                            }
                          >
                            <span className="text-muted-foreground">
                              {new Date(l.at).toLocaleTimeString()}
                            </span>{" "}
                            [{l.stage}] {l.message}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
