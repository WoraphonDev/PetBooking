"use client";
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { CalendarDay } from "@app/contracts/dto/calendar-day";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { CalendarDayResponse } from "@app/contracts/endpoints/calendar.day";
import { GroomRescheduleResponse } from "@app/contracts/endpoints/groom.reschedule";
import { toLocalDate } from "@app/domain/time/local-time";
import { cn } from "cn";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError, errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { ThaiDatePicker } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import {
  addDays,
  box,
  canDrag,
  depositSettled,
  FLAG_ICON,
  PX_PER_MINUTE,
  parseQuery,
  RELIABILITY_DOT,
  STATUS_TONE,
  slotInstant,
  timeRows,
  type View,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-02">>;
type Move = { appointment: AppointmentCard; startsAt: string; groomerId: string };

/** 06#scr-C-02 — the grooming queue by groomer (day) or by day (week); owner / front desk drag to reschedule. */
export function CalendarScreen() {
  const t = useTranslations("C-02");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });
  const { date, view } = parseQuery(new URLSearchParams(params.toString()), today);
  const [groomerId, setGroomerId] = useState<string | null>(null);
  const [move, setMove] = useState<Move | null>(null);

  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const calendar = useApiQuery("calendar.day", {
    query: { date, view, ...(groomerId ? { groomerId } : {}) },
    response: CalendarDayResponse,
  });
  const reschedule = useApiMutation("groom.reschedule", {
    response: GroomRescheduleResponse,
    invalidate: ["calendar.day", "bookings.get", "dashboard.today"],
    meta: { toast: false },
  });
  const canEdit = me.data?.staff.role === "owner" || me.data?.staff.role === "front_desk";
  const slotStep = branch.data?.policy.slotStepMinutes ?? 30;

  const go = (next: { date?: string; view?: View }) => {
    const q = new URLSearchParams(params.toString());
    q.set("date", next.date ?? date);
    q.set("view", next.view ?? view);
    router.replace(`${pathname}?${q.toString()}`);
  };
  const confirmMove = async (notifyCustomer: boolean) => {
    if (!move) return;
    const { appointment, startsAt, groomerId: toGroomer } = move;
    setMove(null);
    try {
      await reschedule.mutateAsync({
        params: { appointmentId: appointment.id },
        // the station stays; R-04 on the server answers SLOT_TAKEN when it is not free
        body: { startsAt, groomerId: toGroomer, stationId: appointment.stationId, notifyCustomer },
      });
      toast.success(t("moved"));
    } catch (err) {
      // SLOT_TAKEN → the card stays where it was (nothing moved locally) + toast
      toast.error(err instanceof ApiClientError ? err.message : errorMessage(err));
    }
  };

  const days = calendar.data ? (Array.isArray(calendar.data) ? calendar.data : [calendar.data]) : [];
  const first = days[0];
  return (
    <div data-screen="C-02" className="flex flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <Toolbar
        t={t}
        date={date}
        view={view}
        today={today}
        onDate={(d) => go({ date: d })}
        onView={(v) => go({ view: v })}
        groomers={first?.groomers ?? []}
        groomerId={groomerId}
        onGroomer={setGroomerId}
      />
      {calendar.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : calendar.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert">{errorMessage(calendar.error)}</p>
          <Button type="button" onClick={() => void calendar.refetch()}>
            {common("retry")}
          </Button>
        </div>
      ) : view === "week" ? (
        <WeekView t={t} days={days} timezone={timezone} onOpenDay={(d) => go({ date: d, view: "day" })} />
      ) : first ? (
        <div className="flex gap-4">
          <DayGrid
            t={t}
            day={first}
            slotStep={slotStep}
            timezone={timezone}
            canEdit={canEdit}
            onDrop={(appointment, startsAt, toGroomer) => setMove({ appointment, startsAt, groomerId: toGroomer })}
            onEmpty={(time, toGroomer) =>
              router.push(`/console/bookings/new?${new URLSearchParams({ date: first.date, time, groomerId: toGroomer }).toString()}`)
            }
          />
          <SidePanel t={t} day={first} timezone={timezone} />
        </div>
      ) : null}
      <Dialog open={move !== null} onOpenChange={(open) => (open ? null : setMove(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {move
                ? t("moveTitle", {
                    pet: move.appointment.pet.name,
                    when: `${formatThaiDate({ date: toLocalDate({ instant: move.startsAt, timezone }) })} ${formatTime({ instant: move.startsAt, timezone })}`,
                  })
                : ""}
            </DialogTitle>
          </DialogHeader>
          <p>{t("notifyCustomer")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setMove(null)}>
              {common("cancel")}
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => void confirmMove(false)}>
              {t("notifyNo")}
            </Button>
            <Button type="button" className="h-11" onClick={() => void confirmMove(true)}>
              {t("notifyYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Toolbar(props: {
  t: T;
  date: string;
  view: View;
  today: string;
  onDate: (d: string) => void;
  onView: (v: View) => void;
  groomers: CalendarDay["groomers"];
  groomerId: string | null;
  onGroomer: (id: string | null) => void;
}) {
  const { t, date, view } = props;
  const step = view === "week" ? 7 : 1;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">{t("date")}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-label={t("prev")}
            onClick={() => props.onDate(addDays(date, -step))}
          >
            ←
          </Button>
          <ThaiDatePicker value={date} placeholder={t("date")} onValueChange={(d) => d && props.onDate(d)} />
          <Button type="button" variant="outline" className="h-11" aria-label={t("next")} onClick={() => props.onDate(addDays(date, step))}>
            →
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => props.onDate(props.today)}>
            {t("today")}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">{t("view")}</span>
        <div role="radiogroup" aria-label={t("view")} className="flex gap-1">
          {(["day", "week"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              variant={view === v ? "default" : "outline"}
              className="h-11"
              onClick={() => props.onView(v)}
            >
              {t(v === "day" ? "viewDay" : "viewWeek")}
            </Button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-sm">{t("groomer")}</span>
        <select
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm"
          value={props.groomerId ?? ""}
          onChange={(e) => props.onGroomer(e.target.value || null)}
        >
          <option value="">{t("allGroomers")}</option>
          {props.groomers.map((g) => (
            <option key={g.id} value={g.id}>
              {g.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function DayGrid(props: {
  t: T;
  day: CalendarDay;
  slotStep: number;
  timezone: string;
  canEdit: boolean;
  onDrop: (appointment: AppointmentCard, startsAt: string, groomerId: string) => void;
  onEmpty: (time: string, groomerId: string) => void;
}) {
  const { t, day, timezone } = props;
  const rows = timeRows(day, props.slotStep);
  const [dragging, setDragging] = useState<AppointmentCard | null>(null);
  if (rows.length === 0)
    return (
      <p className="flex-1 rounded-xl border p-6 text-center text-muted-foreground" data-field="closedDay">
        {t("closedDay")}
      </p>
    );
  if (day.groomers.length === 0) return <p className="flex-1 text-muted-foreground">{t("noGroomers")}</p>;
  const rowHeight = props.slotStep * PX_PER_MINUTE;
  const height = rows.length * rowHeight;
  const closures = day.closures.map((c) => ({ c, b: box(c.startsAt, c.endsAt, day, timezone) })).filter((x) => x.b);
  return (
    <div className="flex flex-1 overflow-x-auto rounded-xl border">
      <div className="w-16 shrink-0 border-r pt-10 text-muted-foreground text-xs">
        {rows.map((time) => (
          <div key={time} style={{ height: rowHeight }} className="-translate-y-2 pr-1 text-right">
            {time}
          </div>
        ))}
      </div>
      {day.groomers.map((g) => (
        <div key={g.id} data-groomer={g.id} className="min-w-48 flex-1 border-r last:border-r-0">
          <div className="sticky top-0 flex h-10 items-center justify-center border-b bg-background font-medium text-sm">
            {g.displayName}
          </div>
          <div className="relative" style={{ height }}>
            {rows.map((time) => (
              <button
                key={time}
                type="button"
                aria-label={t("newBookingAt", { time })}
                disabled={!props.canEdit}
                style={{ height: rowHeight }}
                className="block w-full border-b border-dashed enabled:hover:bg-muted/50"
                onClick={() => props.onEmpty(time, g.id)}
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) props.onDrop(dragging, slotInstant(day.date, time, timezone), g.id);
                  setDragging(null);
                }}
              />
            ))}
            {closures.map(({ c, b }) => (
              <div
                key={c.id}
                data-field="closure"
                title={c.reason ?? t("closure")}
                className="pointer-events-none absolute inset-x-0 bg-slate-300/60 p-1 text-slate-700 text-xs"
                style={b ?? undefined}
              >
                {c.reason ?? t("closure")}
              </div>
            ))}
            {g.timeOff.map((off) => {
              const b = box(off.startsAt, off.endsAt, day, timezone);
              return b ? (
                <div
                  key={off.id}
                  data-field="timeOff"
                  className="pointer-events-none absolute inset-x-0 bg-slate-200/80 p-1 text-slate-600 text-xs"
                  style={b}
                >
                  {off.reason ?? t("timeOff")}
                </div>
              ) : null;
            })}
            {day.appointments
              .filter((a) => a.groomerId === g.id)
              .map((a) => {
                const card = box(a.startsAt, a.endsAt, day, timezone);
                const buffer = box(a.endsAt, a.blockedUntil, day, timezone);
                return card ? (
                  <div key={a.id}>
                    {buffer ? (
                      <div
                        data-field="buffer"
                        title={t("buffer")}
                        className="pointer-events-none absolute inset-x-1 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(0_0_0/0.08)_4px,rgb(0_0_0/0.08)_8px)]"
                        style={buffer}
                      />
                    ) : null}
                    <AppointmentBlock
                      t={t}
                      a={a}
                      timezone={timezone}
                      style={card}
                      draggable={canDrag(a, props.canEdit)}
                      onDragStart={() => setDragging(a)}
                      onDragEnd={() => setDragging(null)}
                    />
                  </div>
                ) : null;
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** การ์ดนัด — every 06 field; click opens the booking (C-02D drawer is wired by T-0135, Q-1012) */
export function AppointmentBlock(props: {
  t: T;
  a: AppointmentCard;
  timezone: string;
  style?: { top: number; height: number };
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { t, a, timezone } = props;
  const dot = RELIABILITY_DOT[a.reliabilityLevel];
  return (
    <Link
      href={`/console/bookings/${a.bookingId}`}
      data-appointment={a.id}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      style={props.style}
      className={cn(
        "flex flex-col gap-0.5 overflow-hidden rounded-md border p-1.5 text-xs",
        props.style && "absolute inset-x-1",
        STATUS_TONE[a.status],
        props.draggable && "cursor-grab",
      )}
      title={enumLabel("groom_status", a.status)}
    >
      <span className="flex items-center gap-1">
        <span className="tabular-nums">
          {formatTime({ instant: a.startsAt, timezone })}–{formatTime({ instant: a.endsAt, timezone })}
        </span>
        <span className="ml-auto" title={t("deposit")}>
          {depositSettled(a.depositStatus) ? "✓" : t("depositPending")}
        </span>
        {dot ? (
          <span role="img" aria-label={t("reliabilityLevel", { level: a.reliabilityLevel })} className={cn("size-2 rounded-full", dot)} />
        ) : null}
      </span>
      <span className="font-bold text-sm">
        {a.pet.name}{" "}
        {a.pet.flags.map((f) => (
          <span key={f} role="img" aria-label={enumLabel("temperament_flag", f)} title={enumLabel("temperament_flag", f)}>
            {FLAG_ICON[f]}
          </span>
        ))}
      </span>
      {a.pet.breed ? <span className="text-muted-foreground">{a.pet.breed}</span> : null}
      <span className="truncate">{a.items.map((i) => i.name).join(", ")}</span>
      <span className="sr-only">
        {t("status")}: {enumLabel("groom_status", a.status)}
      </span>
      {a.customerPhone ? <span>{formatPhone({ e164: a.customerPhone })}</span> : null}
      <span className="mt-auto self-end text-[10px] text-muted-foreground">{a.stationName}</span>
    </Link>
  );
}

export function SidePanel({ t, day, timezone }: { t: T; day: CalendarDay; timezone: string }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 rounded-xl border p-4 text-sm">
      <div data-field="hotel">
        <p className="font-medium">{t("hotelToday")}</p>
        <p>{t("hotelCounts", { arrivals: day.hotel.arrivals, departures: day.hotel.departures, inHouse: day.hotel.inHouse })}</p>
      </div>
      <div data-field="daycare">
        <p className="font-medium">{t("daycare")}</p>
        <p className="tabular-nums">{day.daycare.count}</p>
      </div>
      <div data-field="timeOff">
        <p className="font-medium">{t("timeOff")}</p>
        <ul className="flex flex-col gap-1">
          {day.groomers.flatMap((g) => [
            ...(g.workingHours?.breakStartsAt && g.workingHours.breakEndsAt
              ? [
                  <li key={`${g.id}-break`} className="rounded bg-slate-200 px-2 py-1">
                    {g.displayName} · {t("break")} {g.workingHours.breakStartsAt}–{g.workingHours.breakEndsAt}
                  </li>,
                ]
              : []),
            ...g.timeOff.map((off) => (
              <li key={off.id} className="rounded bg-slate-200 px-2 py-1">
                {g.displayName} · {formatTime({ instant: off.startsAt, timezone })}–{formatTime({ instant: off.endsAt, timezone })}
                {off.reason ? ` · ${off.reason}` : ""}
              </li>
            )),
          ])}
        </ul>
        {day.groomers.every((g) => g.timeOff.length === 0 && !g.workingHours?.breakStartsAt) ? (
          <p className="text-muted-foreground">{t("noTimeOff")}</p>
        ) : null}
      </div>
    </aside>
  );
}

export function WeekView({
  t,
  days,
  timezone,
  onOpenDay,
}: {
  t: T;
  days: CalendarDay[];
  timezone: string;
  onOpenDay: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => (
        <div key={d.date} className="flex min-w-0 flex-col gap-1 rounded-xl border p-2">
          <button
            type="button"
            className="text-left font-medium text-sm underline-offset-4 hover:underline"
            onClick={() => onOpenDay(d.date)}
          >
            {formatThaiDate({ date: d.date })}
          </button>
          {!d.opensAt ? <p className="text-muted-foreground text-xs">{t("closedDay")}</p> : null}
          {d.closures.map((c) => (
            <p key={c.id} data-field="closure" className="rounded bg-slate-300/60 px-1 text-xs">
              {c.reason ?? t("closure")}
            </p>
          ))}
          {d.appointments.length === 0 ? <p className="text-muted-foreground text-xs">{t("noAppointments")}</p> : null}
          {d.appointments.map((a) => (
            <AppointmentBlock key={a.id} t={t} a={a} timezone={timezone} />
          ))}
        </div>
      ))}
    </div>
  );
}
