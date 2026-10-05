"use client";
// 06#scr-C-36 ext-M2 — weekly hours editor (workingHours.set) and time off (timeOff.list / create / delete).
import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import type { StaffUserItem } from "@app/contracts/dto/staff-user-item";
import type { TimeOffItem } from "@app/contracts/endpoints/timeOff.list";
import { toLocalDate } from "@app/domain/time/local-time";
import type { useTranslations } from "next-intl";
import { useState } from "react";
import { formatThaiDate, formatTime } from "../../lib/format";
import { FormField, ThaiDatePicker, TimeSelect } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { type DayRow, dayRows, invalidDays, STEP_MINUTES, type TimeOffErrors, type TimeOffForm, workingHoursBody } from "./logic";

type T = ReturnType<typeof useTranslations<"C-36">>;
const DAY_KEY = ["day0", "day1", "day2", "day3", "day4", "day5", "day6"] as const;

/** "5 ต.ค. 2569 09:00 น." in the branch timezone */
export const instantLabel = (instant: string, timezone: string) =>
  `${formatThaiDate({ date: toLocalDate({ instant, timezone }) })} ${formatTime({ instant, timezone })}`;

/** ตารางงานรายสัปดาห์ of one person: แถว จ.–อา. toggle + เริ่ม / เลิก / พัก → บันทึกตารางงาน */
export function HoursDialog(props: {
  t: T;
  staff: StaffUserItem | null;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSave: (staff: StaffUserItem, body: NonNullable<ReturnType<typeof workingHoursBody>>) => Promise<void>;
}) {
  const { t, staff } = props;
  return (
    <Dialog open={staff !== null} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("hoursTitle", { name: staff?.displayName ?? "" })}</DialogTitle>
        </DialogHeader>
        {staff ? <HoursEditor key={staff.id} {...props} staff={staff} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function HoursEditor(props: {
  t: T;
  staff: StaffUserItem;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onSave: (staff: StaffUserItem, body: NonNullable<ReturnType<typeof workingHoursBody>>) => Promise<void>;
}) {
  const { t } = props;
  const [rows, setRows] = useState<DayRow[]>(() => dayRows(props.staff.workingHours));
  const [touched, setTouched] = useState(false);
  const invalid = touched ? invalidDays(rows) : [];
  const update = (weekday: number, next: Partial<DayRow>) => setRows(rows.map((r) => (r.weekday === weekday ? { ...r, ...next } : r)));
  const time = (r: DayRow, field: "startsAt" | "endsAt" | "breakStartsAt" | "breakEndsAt", label: string) => (
    <TimeSelect
      aria-label={`${label} ${t(DAY_KEY[r.weekday] ?? "day0")}`}
      value={r[field]}
      stepMinutes={STEP_MINUTES}
      placeholder={field.startsWith("break") ? "–" : undefined}
      disabled={!r.on}
      onValueChange={(v) => update(r.weekday, { [field]: v })}
    />
  );
  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("workday")}</th>
            <th className="py-2">{t("startsAt")}</th>
            <th className="py-2">{t("endsAt")}</th>
            <th className="py-2">{t("break")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekday} data-weekday={r.weekday} className="border-t align-top">
              <td className="py-2">
                <span className="flex min-h-11 items-center gap-2 font-medium">
                  <Switch
                    aria-label={`${t("workday")} ${t(DAY_KEY[r.weekday] ?? "day0")}`}
                    checked={r.on}
                    onCheckedChange={(on) => update(r.weekday, { on })}
                  />
                  {t(DAY_KEY[r.weekday] ?? "day0")}
                </span>
              </td>
              <td className="py-2">{time(r, "startsAt", t("startsAt"))}</td>
              <td className="py-2">{time(r, "endsAt", t("endsAt"))}</td>
              <td className="py-2">
                <span className="flex items-center gap-1">
                  {time(r, "breakStartsAt", t("breakStartsAt"))}–{time(r, "breakEndsAt", t("breakEndsAt"))}
                </span>
                {invalid.includes(r.weekday) ? (
                  <p role="alert" className="mt-1 text-destructive text-xs">
                    {t("dayInvalid")}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
          {props.cancelLabel}
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={props.busy}
          onClick={() => {
            setTouched(true);
            const body = workingHoursBody(rows);
            if (body) void props.onSave(props.staff, body).catch(() => {});
          }}
        >
          {t("saveHours")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** วันลา: รายการ (ช่วงเวลา + เหตุผล) with ลบวันลา, and the add form (ช่วงลา date-time range + เหตุผล) */
export function TimeOffSection(props: {
  t: T;
  staff: StaffUserItem[];
  items: TimeOffItem[];
  timezone: string;
  form: TimeOffForm;
  onForm: (f: TimeOffForm) => void;
  errors: TimeOffErrors;
  adding: boolean;
  deleting: boolean;
  onAdd: () => void;
  onDelete: (timeOffId: string) => void;
}) {
  const { t, form, onForm, errors } = props;
  const name = (id: string) => props.staff.find((s) => s.id === id)?.displayName ?? "";
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionTimeOff")}</h2>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{t("timeOffList")}</span>
        {props.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noTimeOff")}</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {props.items.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{name(x.staffUserId)}</span>
                  <span>
                    {instantLabel(x.startsAt, props.timezone)} – {instantLabel(x.endsAt, props.timezone)}
                  </span>
                  {x.reason ? <span className="text-muted-foreground">{x.reason}</span> : null}
                </span>
                <Button type="button" variant="ghost" className="h-11" disabled={props.deleting} onClick={() => props.onDelete(x.id)}>
                  {t("deleteTimeOff")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="c36-off-staff" label={t("timeOffStaff")} error={errors.staffUserId ? t("invalid") : undefined}>
          <select
            id="c36-off-staff"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            value={form.staffUserId ?? ""}
            onChange={(e) => onForm({ ...form, staffUserId: e.target.value || null })}
          >
            <option value="">{t("pickStaff")}</option>
            {props.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="c36-off-reason" label={t("reason")}>
          <Input
            id="c36-off-reason"
            className="h-11"
            maxLength={200}
            value={form.reason}
            onChange={(e) => onForm({ ...form, reason: e.target.value })}
          />
        </FormField>
        <FormField id="c36-off-start" label={`${t("timeOffRange")} · ${t("timeOffFrom")}`} error={errors.start ? t("invalid") : undefined}>
          <div className="flex gap-2">
            <ThaiDatePicker
              id="c36-off-start"
              value={form.startDate}
              placeholder={t("pickDate")}
              onValueChange={(startDate) => onForm({ ...form, startDate, endDate: form.endDate ?? startDate })}
            />
            <TimeSelect
              aria-label={t("timeOffFrom")}
              value={form.startTime}
              stepMinutes={STEP_MINUTES}
              onValueChange={(startTime) => onForm({ ...form, startTime })}
            />
          </div>
        </FormField>
        <FormField id="c36-off-end" label={`${t("timeOffRange")} · ${t("timeOffTo")}`} error={errors.end ? t("endAfterStart") : undefined}>
          <div className="flex gap-2">
            <ThaiDatePicker
              id="c36-off-end"
              value={form.endDate}
              placeholder={t("pickDate")}
              onValueChange={(endDate) => onForm({ ...form, endDate })}
            />
            <TimeSelect
              aria-label={t("timeOffTo")}
              value={form.endTime}
              stepMinutes={STEP_MINUTES}
              onValueChange={(endTime) => onForm({ ...form, endTime })}
            />
          </div>
        </FormField>
      </div>
      <Button type="button" className="h-11 self-end" disabled={props.adding} onClick={props.onAdd}>
        {t("addTimeOff")}
      </Button>
    </section>
  );
}

/** timeOff.create → affected: the appointments of that groomer inside the time off (nothing is moved, Q-0028) */
export function AffectedDialog(props: {
  t: T;
  items: AffectedServiceItem[] | null;
  timezone: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const { t } = props;
  return (
    <Dialog open={props.items !== null} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("affectedTitle")}</DialogTitle>
        </DialogHeader>
        <AffectedList t={t} items={props.items ?? []} timezone={props.timezone} />
        <DialogFooter>
          <Button type="button" className="h-11" onClick={props.onClose}>
            {props.closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AffectedList({ t, items, timezone }: { t: T; items: AffectedServiceItem[]; timezone: string }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t("affectedNone")}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{t("affectedHint")}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1">{t("affectedBooking")}</th>
            <th className="py-1">{t("affectedPet")}</th>
            <th className="py-1">{t("affectedCustomer")}</th>
            <th className="py-1">{t("affectedWhen")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={`${a.module}-${a.itemId}`}>
              <td className="py-1 font-mono">{a.bookingNo}</td>
              <td className="py-1">{a.petName}</td>
              <td className="py-1">{a.customerName}</td>
              <td className="py-1">{a.startsAt ? instantLabel(a.startsAt, timezone) : formatThaiDate({ date: a.date })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
