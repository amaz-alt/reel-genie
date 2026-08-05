import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listScheduleCalendar } from "@/lib/brands.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";

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
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = first.getDay();
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

  function shift(delta: number) {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <CalendarClock className="size-4 text-accent" /> Publishing calendar
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {active.length === 0
              ? "No active brand schedules yet — set one inside a brand."
              : `${active.length} active schedule${active.length > 1 ? "s" : ""} across your brands.`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">
            {MONTHS[cursor.m]} {cursor.y}
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
          {DOW.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {cells.map((c, i) => {
            if (c.day === null) return <div key={`pad-${i}`} className="min-h-[5.5rem] rounded-lg" />;
            const isToday = isCurrentMonth && c.day === today.getDate();
            const due = active.filter((b) => b.days_of_week.includes(c.dow));
            return (
              <div
                key={c.day}
                className={`min-h-[5.5rem] rounded-lg border p-1.5 text-left ${
                  isToday ? "border-accent bg-accent/5" : "border-border bg-card"
                }`}
              >
                <div
                  className={`mb-1 text-[11px] font-semibold ${
                    isToday ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  {c.day}
                </div>
                <div className="flex flex-col gap-1">
                  {due.slice(0, 3).map((b) => (
                    <Link
                      key={b.id}
                      to="/app/brands/$brandId"
                      params={{ brandId: b.id }}
                      className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight hover:bg-secondary"
                      title={`${b.name} — ${fmtTime(b.time_of_day)} ${b.timezone}`}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: b.color }}
                      />
                      <span className="truncate">{b.name}</span>
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
          <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
            {active.map((b) => (
              <span key={b.id} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: b.color }} />
                {b.name} · {fmtTime(b.time_of_day)} {b.timezone}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
