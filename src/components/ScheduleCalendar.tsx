import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listScheduleCalendar } from "@/lib/brands.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarClock, Clock } from "lucide-react";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

export function ScheduleCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const { data: rows = [] } = useQuery({
    queryKey: ["schedule-calendar"],
    queryFn: () => listScheduleCalendar(),
  });

  const active = useMemo(() => rows.filter((r) => r.active && r.days_of_week.length > 0), [rows]);

  const cells = useMemo(() => {
    const startPad = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const list: { day: number | null; dow: number }[] = [];
    for (let i = 0; i < startPad; i++) list.push({ day: null, dow: i });
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ day: d, dow: new Date(cursor.y, cursor.m, d).getDay() });
    }
    while (list.length % 7 !== 0) list.push({ day: null, dow: list.length % 7 });
    return list;
  }, [cursor]);

  const isCurrentMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
  const monthPosts = useMemo(
    () =>
      cells.reduce(
        (n, c) =>
          c.day === null ? n : n + active.filter((b) => b.days_of_week.includes(c.dow)).length,
        0,
      ),
    [cells, active],
  );

  function shift(delta: number) {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <Card className="mb-10 overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="gap-4 border-b border-border/70 bg-secondary/40 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <span className="rounded-lg bg-accent/10 p-1.5">
              <CalendarClock className="size-4 text-accent" />
            </span>
            Publishing calendar
          </CardTitle>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {active.length === 0
              ? "No active brand schedules yet — set one inside a brand."
              : `${active.length} active schedule${active.length > 1 ? "s" : ""} · ${monthPosts} posts planned this month`}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">
            {MONTHS[cursor.m]} {cursor.y}
          </span>
          <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          {!isCurrentMonth ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2 text-xs"
              onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
            >
              Today
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5">
        <div className="grid grid-cols-7 text-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          {DOW.map((d, i) => (
            <div key={d} className={`pb-2 ${i === 0 || i === 6 ? "opacity-60" : ""}`}>
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border/70">
          {cells.map((c, i) => {
            const weekend = c.dow === 0 || c.dow === 6;
            if (c.day === null) {
              return (
                <div
                  key={`pad-${i}`}
                  className="min-h-[5.75rem] border-r border-b border-border/50 bg-muted/30 last:border-r-0"
                />
              );
            }
            const isToday = isCurrentMonth && c.day === today.getDate();
            const isPast =
              new Date(cursor.y, cursor.m, c.day).setHours(23, 59, 59) < today.getTime();
            const due = active.filter((b) => b.days_of_week.includes(c.dow));
            return (
              <div
                key={c.day}
                className={`relative min-h-[5.75rem] border-r border-b border-border/50 p-1.5 text-left transition-colors ${
                  isToday
                    ? "bg-accent/5 ring-1 ring-accent ring-inset"
                    : weekend
                      ? "bg-muted/20"
                      : "bg-card"
                } ${isPast && !isToday ? "opacity-55" : ""} hover:bg-secondary/50`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold ${
                      isToday
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.day}
                  </span>
                  {due.length > 0 ? (
                    <span className="text-[9px] font-medium text-muted-foreground">
                      {due.length}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  {due.slice(0, 3).map((b) => (
                    <Link
                      key={b.id}
                      to="/app/brands/$brandId"
                      params={{ brandId: b.id }}
                      className="group flex items-center gap-1.5 truncate rounded-md border-l-2 bg-secondary/70 px-1.5 py-1 text-[10px] leading-tight font-medium hover:bg-secondary"
                      style={{ borderLeftColor: b.color }}
                      title={`${b.name} — ${fmtTime(b.time_of_day)} ${b.timezone}`}
                    >
                      <span className="truncate">{b.name}</span>
                      <span className="ml-auto hidden shrink-0 text-[9px] font-normal text-muted-foreground sm:inline">
                        {fmtTime(b.time_of_day).replace(":00", "")}
                      </span>
                    </Link>
                  ))}
                  {due.length > 3 ? (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{due.length - 3} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {active.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {active.map((b) => (
              <Link
                key={b.id}
                to="/app/brands/$brandId"
                params={{ brandId: b.id }}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] hover:bg-secondary"
              >
                <span className="size-2 rounded-full" style={{ background: b.color }} />
                <span className="font-medium">{b.name}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" />
                  {fmtTime(b.time_of_day)} {b.timezone}
                </span>
                <span className="text-muted-foreground">
                  {b.days_of_week
                    .slice()
                    .sort((x, y) => x - y)
                    .map((d) => DOW[d])
                    .join(" ")}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
