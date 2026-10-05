"use client";
import type { AffectedServiceItem } from "@app/contracts/dto/affected-service-item";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { BranchSetHoursResponse } from "@app/contracts/endpoints/branch.setHours";
import { ClosuresCreateResponse } from "@app/contracts/endpoints/closures.create";
import { type ClosureItem, ClosuresListResponse } from "@app/contracts/endpoints/closures.list";
import type { ClosureScope } from "@app/contracts/enums";
import { ERROR_MESSAGE_TH } from "@app/contracts/errors";
import { toLocalDate } from "@app/domain/time/local-time";
import { useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { EnumSelect, FormField, ThaiDatePicker, TimeSelect } from "../shared/form";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import {
  type ClosureErrors,
  type ClosureForm,
  closureBody,
  emptyClosure,
  type HoursRow,
  holidayDates,
  hoursRows,
  invalidHours,
  STEP_MINUTES,
  setHoursBody,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-31">>;
const DAY_KEY = ["day0", "day1", "day2", "day3", "day4", "day5", "day6"] as const;
const SOURCE_KEY = { manual: "sourceManual", public_holiday: "sourcePublicHoliday" } as const;

/** "5 ต.ค. 2569 09:00 น." in the branch timezone */
export function instantLabel(instant: string, timezone: string): string {
  return `${formatThaiDate({ date: toLocalDate({ instant, timezone }) })} ${formatTime({ instant, timezone })}`;
}

/** 06#scr-C-31 — weekly opening hours (owner) and closures (owner + front desk). */
export function HoursScreen() {
  const t = useTranslations("C-31");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const closures = useApiQuery("closures.list", { response: ClosuresListResponse });
  const isOwner = me.data?.staff.role === "owner";

  const [rows, setRows] = useState<HoursRow[] | null>(null);
  const [hoursTouched, setHoursTouched] = useState(false);
  const [closure, setClosure] = useState<ClosureForm>(emptyClosure);
  const [closureErrors, setClosureErrors] = useState<ClosureErrors>({});
  const [affected, setAffected] = useState<AffectedServiceItem[] | null>(null);
  const [holidayOpen, setHolidayOpen] = useState(false);

  const shownRows = rows ?? (branch.data ? hoursRows(branch.data.hours) : null);

  const setHours = useApiMutation("branch.setHours", { response: BranchSetHoursResponse, invalidate: ["branch.get"] });
  const createClosure = useApiMutation("closures.create", { response: ClosuresCreateResponse, invalidate: ["closures.list"] });
  const deleteClosure = useApiMutation("closures.delete", { invalidate: ["closures.list"] });
  const importHolidays = useApiMutation("closures.importHolidays", { invalidate: ["closures.list"] });

  const saveHours = async () => {
    setHoursTouched(true);
    const body = shownRows ? setHoursBody(shownRows) : null;
    if (!body) return;
    const result = await setHours.mutateAsync({ body });
    setRows(null);
    setHoursTouched(false);
    toast.success(t("hoursSaved"));
    // warnings → dialog of the affected bookings
    const items = result.warnings.flatMap((w) => w.data.items);
    if (items.length) setAffected(items);
  };
  const addClosure = async () => {
    const { body, errors } = closureBody(closure, timezone);
    setClosureErrors(errors);
    if (!body) return;
    const result = await createClosure.mutateAsync({ body });
    setClosure(emptyClosure());
    toast.success(t("closureAdded"));
    // affected → dialog
    setAffected(result.affected);
  };

  if (branch.isPending || closures.isPending || me.isPending)
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (branch.isError || closures.isError || me.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(branch.error ?? closures.error ?? me.error)}</p>
        <Button
          type="button"
          onClick={() => {
            void branch.refetch();
            void closures.refetch();
            void me.refetch();
          }}
        >
          {common("retry")}
        </Button>
      </div>
    );

  return (
    <div data-screen="C-31" className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <HoursSection
        t={t}
        rows={shownRows ?? []}
        onChange={setRows}
        editable={isOwner}
        invalid={hoursTouched && shownRows ? invalidHours(shownRows) : []}
        saving={setHours.isPending}
        onSave={saveHours}
      />
      <ClosuresSection
        t={t}
        deleteLabel={common("delete")}
        items={closures.data ?? []}
        timezone={timezone}
        form={closure}
        onForm={setClosure}
        errors={closureErrors}
        adding={createClosure.isPending}
        onAdd={addClosure}
        deleting={deleteClosure.isPending}
        onDelete={(closureId) => void deleteClosure.mutateAsync({ params: { closureId } }).then(() => toast.success(t("deleted")))}
        canImport={isOwner}
        onImport={() => setHolidayOpen(true)}
      />
      <AffectedDialog t={t} items={affected} timezone={timezone} closeLabel={common("close")} onClose={() => setAffected(null)} />
      <HolidayDialog
        t={t}
        open={holidayOpen}
        defaultYear={Number(toLocalDate({ instant: new Date().toISOString(), timezone }).slice(0, 4))}
        busy={importHolidays.isPending}
        cancelLabel={common("cancel")}
        onCancel={() => setHolidayOpen(false)}
        onSubmit={async (body) => {
          await importHolidays.mutateAsync({ body });
          setHolidayOpen(false);
          toast.success(t("holidaysImported"));
        }}
      />
    </div>
  );
}

export function HoursSection(props: {
  t: T;
  rows: HoursRow[];
  onChange: (rows: HoursRow[]) => void;
  editable: boolean;
  invalid: number[];
  saving: boolean;
  onSave: () => void;
}) {
  const { t, rows, editable } = props;
  const update = (weekday: number, next: Partial<HoursRow>) =>
    props.onChange(rows.map((r) => (r.weekday === weekday ? { ...r, ...next } : r)));
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionHours")}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">{t("weekday")}</th>
            <th className="py-2">{t("closedAllDay")}</th>
            <th className="py-2">{t("opensAt")}</th>
            <th className="py-2">{t("closesAt")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekday} data-weekday={r.weekday} className="border-t">
              <td className="py-2 font-medium">{t(DAY_KEY[r.weekday] ?? "day0")}</td>
              <td className="py-2">
                <Switch
                  aria-label={`${t("closedAllDay")} ${t(DAY_KEY[r.weekday] ?? "day0")}`}
                  checked={r.isClosed}
                  disabled={!editable}
                  onCheckedChange={(isClosed) => update(r.weekday, { isClosed })}
                />
              </td>
              <td className="py-2">
                <TimeSelect
                  aria-label={`${t("opensAt")} ${t(DAY_KEY[r.weekday] ?? "day0")}`}
                  value={r.opensAt}
                  stepMinutes={STEP_MINUTES}
                  disabled={!editable || r.isClosed}
                  onValueChange={(opensAt) => update(r.weekday, { opensAt })}
                />
              </td>
              <td className="py-2">
                <TimeSelect
                  aria-label={`${t("closesAt")} ${t(DAY_KEY[r.weekday] ?? "day0")}`}
                  value={r.closesAt}
                  stepMinutes={STEP_MINUTES}
                  disabled={!editable || r.isClosed}
                  aria-invalid={props.invalid.includes(r.weekday)}
                  onValueChange={(closesAt) => update(r.weekday, { closesAt })}
                />
                {props.invalid.includes(r.weekday) ? (
                  <p role="alert" className="mt-1 text-destructive text-xs">
                    {t("closesAfterOpens")}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <Button type="button" className="h-11 self-end" disabled={props.saving} onClick={props.onSave}>
          {t("saveHours")}
        </Button>
      ) : null}
    </section>
  );
}

export function ClosuresSection(props: {
  t: T;
  deleteLabel: string;
  items: ClosureItem[];
  timezone: string;
  form: ClosureForm;
  onForm: (f: ClosureForm) => void;
  errors: ClosureErrors;
  adding: boolean;
  onAdd: () => void;
  deleting: boolean;
  onDelete: (closureId: string) => void;
  canImport: boolean;
  onImport: () => void;
}) {
  const { t, form, onForm, errors } = props;
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-lg">{t("sectionClosures")}</h2>
        {props.canImport ? (
          <Button type="button" variant="outline" className="h-11" onClick={props.onImport}>
            {t("importHolidays")}
          </Button>
        ) : null}
      </div>
      <div data-field="list">
        <h3 className="mb-2 font-medium text-sm">{t("list")}</h3>
        {props.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noClosures")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">{t("colRange")}</th>
                <th className="py-2">{t("colScope")}</th>
                <th className="py-2">{t("colReason")}</th>
                <th className="py-2">{t("colSource")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {props.items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    {instantLabel(c.startsAt, props.timezone)} – {instantLabel(c.endsAt, props.timezone)}
                  </td>
                  <td className="py-2">{enumLabel("closure_scope", c.scope)}</td>
                  <td className="py-2">{c.reason ?? ""}</td>
                  <td className="py-2">{t(SOURCE_KEY[c.source])}</td>
                  <td className="py-2 text-right">
                    <Button type="button" variant="ghost" className="h-11" disabled={props.deleting} onClick={() => props.onDelete(c.id)}>
                      {props.deleteLabel}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="c31-start" label={t("start")} error={errors.start ? ERROR_MESSAGE_TH.VALIDATION_FAILED : undefined}>
          <div className="flex gap-2">
            <ThaiDatePicker
              id="c31-start"
              value={form.startDate}
              placeholder={t("pickDate")}
              onValueChange={(startDate) => onForm({ ...form, startDate })}
            />
            <TimeSelect
              aria-label={t("start")}
              value={form.startTime}
              stepMinutes={STEP_MINUTES}
              onValueChange={(startTime) => onForm({ ...form, startTime })}
            />
          </div>
        </FormField>
        <FormField id="c31-end" label={t("end")} error={errors.end ? t("endAfterStart") : undefined}>
          <div className="flex gap-2">
            <ThaiDatePicker
              id="c31-end"
              value={form.endDate}
              placeholder={t("pickDate")}
              onValueChange={(endDate) => onForm({ ...form, endDate })}
            />
            <TimeSelect
              aria-label={t("end")}
              value={form.endTime}
              stepMinutes={STEP_MINUTES}
              onValueChange={(endTime) => onForm({ ...form, endTime })}
            />
          </div>
        </FormField>
        <FormField id="c31-scope" label={t("scope")} error={errors.scope ? ERROR_MESSAGE_TH.VALIDATION_FAILED : undefined}>
          <EnumSelect id="c31-scope" enumName="closure_scope" value={form.scope} onValueChange={(scope) => onForm({ ...form, scope })} />
        </FormField>
        <FormField id="c31-reason" label={t("reason")} error={errors.reason ? ERROR_MESSAGE_TH.VALIDATION_FAILED : undefined}>
          <Input
            id="c31-reason"
            className="h-11"
            maxLength={200}
            value={form.reason}
            onChange={(e) => onForm({ ...form, reason: e.target.value })}
          />
        </FormField>
      </div>
      <Button type="button" className="h-11 self-end" disabled={props.adding} onClick={props.onAdd}>
        {t("addClosure")}
      </Button>
    </section>
  );
}

export function AffectedDialog(props: {
  t: T;
  items: AffectedServiceItem[] | null;
  timezone: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const { t, items } = props;
  return (
    <Dialog open={items !== null} onOpenChange={(open) => (open ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("affectedTitle")}</DialogTitle>
        </DialogHeader>
        <AffectedList t={t} items={items ?? []} timezone={props.timezone} />
        <DialogFooter>
          <Button type="button" className="h-11" onClick={props.onClose}>
            {props.closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** the bookings hit by new hours / a closure (AffectedServiceItem) */
export function AffectedList({ t, items, timezone }: { t: T; items: AffectedServiceItem[]; timezone: string }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t("affectedNone")}</p>;
  return (
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
            <td className="py-1">
              {enumLabel("service_scope", a.module)} · {a.startsAt ? instantLabel(a.startsAt, timezone) : formatThaiDate({ date: a.date })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * "เพิ่มวันหยุดราชการ": staff have no endpoint that lists public_holiday (admin.listHolidays is platform-admin only, Q-1010),
 * so the owner picks the dates; closures.importHolidays keeps only those that are public holidays of that year.
 */
export function HolidayDialog(props: {
  t: T;
  open: boolean;
  defaultYear: number;
  busy: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (body: { year: number; dates: string[]; scope: ClosureScope }) => Promise<void>;
}) {
  const { t } = props;
  const [year, setYear] = useState(props.defaultYear);
  const [dates, setDates] = useState<string[]>([]);
  const [scope, setScope] = useState<ClosureScope | null>("all");
  const picked = holidayDates(year, dates);
  return (
    <Dialog open={props.open} onOpenChange={(open) => (open ? null : props.onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("importHolidays")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <FormField id="c31-year" label={t("holidayYear")}>
            <Input
              id="c31-year"
              className="h-11"
              inputMode="numeric"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value.replace(/\D/g, "")) || props.defaultYear)}
            />
          </FormField>
          <FormField id="c31-holiday-dates" label={t("holidayDates")}>
            <ThaiDatePicker
              id="c31-holiday-dates"
              value={null}
              placeholder={t("addDate")}
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              onValueChange={(d) => d && setDates([...dates, d])}
            />
            <ul className="flex flex-wrap gap-2">
              {picked.map((d) => (
                <li key={d} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {formatThaiDate({ date: d })}
                  <button type="button" aria-label={t("removeDate")} onClick={() => setDates(dates.filter((x) => x !== d))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </FormField>
          <FormField id="c31-holiday-scope" label={t("scope")}>
            <EnumSelect id="c31-holiday-scope" enumName="closure_scope" value={scope} onValueChange={setScope} />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onCancel}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy || picked.length === 0 || !scope}
            onClick={() => scope && void props.onSubmit({ year, dates: picked, scope }).then(() => setDates([]))}
          >
            {t("importHolidays")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
