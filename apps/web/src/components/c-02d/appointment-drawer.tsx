"use client";
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { JobCard } from "@app/contracts/dto/job-card";
import type { SurchargeTypeItem } from "@app/contracts/dto/surcharge-type-item";
import { AuthMeResponse } from "@app/contracts/endpoints/auth.me";
import { GroomAddSurchargeResponse } from "@app/contracts/endpoints/groom.addSurcharge";
import { GroomCancelResponse } from "@app/contracts/endpoints/groom.cancel";
import { GroomFinishResponse } from "@app/contracts/endpoints/groom.finish";
import { GroomJobCardResponse } from "@app/contracts/endpoints/groom.jobCard";
import { GroomRemoveSurchargeResponse } from "@app/contracts/endpoints/groom.removeSurcharge";
import { GroomStartResponse } from "@app/contracts/endpoints/groom.start";
import { SurchargeTypesListResponse } from "@app/contracts/endpoints/surchargeTypes.list";
import type { StaffRole } from "@app/contracts/enums";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useTimeZone, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatTHB, formatThaiDate, formatTime, formatWeight } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField, MoneyInput } from "../shared/form";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import {
  type Action,
  actions,
  CONDITION_KEY,
  canRemoveSurcharge,
  emptySurcharge,
  pickType,
  type SurchargeErrors,
  type SurchargeForm,
  surchargeBody,
} from "./logic";

type T = ReturnType<typeof useTranslations<"C-02D">>;
const INVALIDATE = ["calendar.day", "bookings.get", "groom.jobCard", "dashboard.today"] as const;

export type AppointmentDrawerProps = {
  appointmentId: string | null;
  onClose: () => void;
  /** เช็คอิน opens C-06 (T-0138) on the host screen; without it the button is disabled (Q-1013) */
  onCheckIn?: (appointment: AppointmentCard) => void;
};

/** 06#scr-C-02D — one grooming appointment at a glance, with its state buttons; hosts: C-02 / C-05 / C-01. */
export function AppointmentDrawer({ appointmentId, onClose, onCheckIn }: AppointmentDrawerProps) {
  const t = useTranslations("C-02D");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const open = appointmentId !== null;
  const job = useApiQuery(
    "groom.jobCard",
    { params: { appointmentId: appointmentId ?? "" }, response: GroomJobCardResponse },
    { enabled: open },
  );
  const me = useApiQuery("auth.me", { response: AuthMeResponse });
  const types = useApiQuery("surchargeTypes.list", { response: SurchargeTypesListResponse }, { enabled: open });
  const invalidate = [...INVALIDATE];
  const start = useApiMutation("groom.start", { response: GroomStartResponse, invalidate });
  const finish = useApiMutation("groom.finish", { response: GroomFinishResponse, invalidate });
  const cancel = useApiMutation("groom.cancel", { response: GroomCancelResponse, invalidate });
  const addSurcharge = useApiMutation("groom.addSurcharge", { response: GroomAddSurchargeResponse, invalidate });
  const removeSurcharge = useApiMutation("groom.removeSurcharge", { response: GroomRemoveSurchargeResponse, invalidate });
  const [dialog, setDialog] = useState<"cancel" | "surcharge" | null>(null);

  const role = me.data?.staff.role;
  const today = toLocalDate({ instant: new Date().toISOString(), timezone });
  const busy = start.isPending || finish.isPending || cancel.isPending || addSurcharge.isPending || removeSurcharge.isPending;
  const params = { appointmentId: appointmentId ?? "" };
  const run = async (fn: () => Promise<unknown>) => {
    await fn();
    toast.success(t("done"));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        {job.isPending ? (
          <Skeleton className="m-4 h-96" />
        ) : job.isError ? (
          <div className="flex flex-col items-start gap-3 p-4">
            <p role="alert">{errorMessage(job.error)}</p>
            <Button type="button" onClick={() => void job.refetch()}>
              {common("retry")}
            </Button>
          </div>
        ) : (
          <>
            <JobDetails
              t={t}
              job={job.data}
              timezone={timezone}
              staffRole={role}
              busy={busy}
              onRemoveSurcharge={(surchargeId) => void run(() => removeSurcharge.mutateAsync({ params: { surchargeId } }))}
            />
            <ActionBar
              t={t}
              list={actions(job.data.appointment, role, today, timezone)}
              busy={busy}
              checkInReady={!!onCheckIn}
              on={{
                checkIn: () => onCheckIn?.(job.data.appointment),
                start: () => void run(() => start.mutateAsync({ params })),
                // the server creates the report card draft; the groomer fills it in on S-03
                finish: () => void run(() => finish.mutateAsync({ params, body: {} })),
                cancel: () => setDialog("cancel"),
                surcharge: () => setDialog("surcharge"),
              }}
            />
            <CancelDialog
              t={t}
              open={dialog === "cancel"}
              bookingId={job.data.appointment.bookingId}
              cancelLabel={common("cancel")}
              busy={cancel.isPending}
              onClose={() => setDialog(null)}
              onConfirm={async (reason) => {
                await cancel.mutateAsync({ params, body: { reason } });
                setDialog(null);
                toast.success(t("done"));
                onClose();
              }}
            />
            <SurchargeDialog
              t={t}
              open={dialog === "surcharge"}
              types={(types.data ?? []).filter((x) => x.status === "active")}
              cancelLabel={common("cancel")}
              busy={addSurcharge.isPending}
              onClose={() => setDialog(null)}
              onSubmit={async (body) => {
                await addSurcharge.mutateAsync({ params, body });
                setDialog(null);
                toast.success(t("done"));
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children, field }: { label: string; children: ReactNode; field?: string }) {
  return (
    <div data-field={field} className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export function JobDetails(props: {
  t: T;
  job: JobCard;
  timezone: string;
  staffRole: StaffRole | undefined;
  busy: boolean;
  onRemoveSurcharge: (surchargeId: string) => void;
}) {
  const { t, job, timezone } = props;
  const a = job.appointment;
  const day = formatThaiDate({ date: toLocalDate({ instant: a.startsAt, timezone }) });
  return (
    <div className="flex flex-col gap-4 px-4">
      <section aria-label={t("sectionHead")} className="flex flex-col">
        <Row label={t("time")}>
          {day} {formatTime({ instant: a.startsAt, timezone })}–{formatTime({ instant: a.endsAt, timezone })}
        </Row>
        <Row label={t("status")}>
          <StatusBadge enumName="groom_status" value={a.status} className="text-base" />
        </Row>
        <Row label={t("bookingNo")}>
          <Link href={`/console/bookings/${a.bookingId}`} className="font-mono underline-offset-4 hover:underline">
            {a.bookingNo}
          </Link>
        </Row>
        <Row label={t("groomer")}>
          {a.groomerName}
          {a.groomerPreference === "specific" ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t("customerChose")}</span>
          ) : null}
        </Row>
        <Row label={t("station")}>{a.stationName}</Row>
      </section>

      <section aria-label={t("sectionPet")} className="flex flex-col border-t pt-3">
        <Row label={t("pet")}>
          <Link href={`/console/pets/${a.pet.id}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
            {a.pet.photoUrl ? (
              // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
              <img src={a.pet.photoUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : null}
            <span className="font-medium">{a.pet.name}</span>
            {a.pet.breed ? <span className="text-muted-foreground">{a.pet.breed}</span> : null}
          </Link>
        </Row>
        <Row label={t("flags")} field="flags">
          {job.flags.length ? (
            <span className="flex flex-wrap justify-end gap-1">
              {job.flags.map((f) => (
                <span key={f.flag} className="rounded bg-destructive px-2 py-0.5 text-white text-xs" title={f.note ?? undefined}>
                  {enumLabel("temperament_flag", f.flag)}
                </span>
              ))}
            </span>
          ) : (
            t("none")
          )}
        </Row>
        <Row label={t("allergies")} field="allergies">
          <span className="text-destructive">
            {job.allergies ?? t("none")}
            {job.shampooAvoid ? (
              <span className="block">
                {t("shampooAvoid")}: {job.shampooAvoid}
              </span>
            ) : null}
          </span>
        </Row>
        {/* C-09 needs the customer id, which AppointmentCard does not carry (Q-1013) */}
        <Row label={t("owner")}>{a.customerName}</Row>
        {a.customerPhone ? (
          <Row label={t("phone")} field="phone">
            {formatPhone({ e164: a.customerPhone })}{" "}
            <a href={`tel:${a.customerPhone}`} className="ml-2 underline">
              {t("call")}
            </a>
          </Row>
        ) : null}
        <Row label={t("reliability")}>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("reliabilityLevel", { level: a.reliabilityLevel })}</span>
        </Row>
        <Row label={t("deposit")}>
          <StatusBadge enumName="deposit_status" value={a.depositStatus} />
        </Row>
      </section>

      <section aria-label={t("sectionServices")} className="flex flex-col border-t pt-3">
        <p className="font-medium text-sm">{t("items")}</p>
        <ul className="flex flex-col gap-1 py-1 text-sm">
          {a.items.map((i) => (
            <li key={`${i.serviceId}-${i.name}`} className="flex items-center gap-2">
              <span className="flex-1">
                {i.name}
                {i.isAddon ? <span className="text-muted-foreground"> ({t("addon")})</span> : null}
                {i.customerPackageId ? <span className="ml-1 rounded bg-muted px-1.5 text-xs">{t("package")}</span> : null}
              </span>
              <span className="text-muted-foreground">{t("minutes", { n: i.durationMinutes })}</span>
              <span className="w-20 text-right tabular-nums">{formatTHB({ satang: i.priceSatang })}</span>
            </li>
          ))}
        </ul>
        <p className="font-medium text-sm">{t("surcharges")}</p>
        <ul className="flex flex-col gap-1 py-1 text-sm">
          {a.surcharges.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="flex-1">
                {s.name} <span className="text-muted-foreground">· {s.reason}</span>
              </span>
              <span className="w-20 text-right tabular-nums">{formatTHB({ satang: s.amountSatang })}</span>
              {canRemoveSurcharge(a, props.staffRole) ? (
                <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onRemoveSurcharge(s.id)}>
                  {t("removeSurcharge")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Row label={t("servicesTotal")}>
          <span className="tabular-nums">{formatTHB({ satang: a.servicesTotalSatang })}</span>
        </Row>
        <Row label={t("surchargeTotal")}>
          <span className="tabular-nums">{formatTHB({ satang: a.surchargeTotalSatang })}</span>
        </Row>
      </section>

      <section aria-label={t("sectionWork")} className="flex flex-col border-t pt-3">
        <Row label={t("checkedInAt")}>{a.checkedInAt ? formatTime({ instant: a.checkedInAt, timezone }) : t("none")}</Row>
        <Row label={t("weightToday")}>{job.weightGramsCheckin !== null ? formatWeight({ grams: job.weightGramsCheckin }) : t("none")}</Row>
        <Row label={t("conditions")} field="conditions">
          {job.conditionFlags.length || job.conditionNote ? (
            <span className="flex flex-col items-end gap-1">
              <span className="flex flex-wrap justify-end gap-1">
                {job.conditionFlags.map((c) => (
                  <span key={c} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {CONDITION_KEY[c] ? t(CONDITION_KEY[c] as never) : c}
                  </span>
                ))}
              </span>
              {job.conditionNote ? <span>{job.conditionNote}</span> : null}
            </span>
          ) : (
            t("none")
          )}
        </Row>
        <Row label={t("consent")}>{job.consentSigned ? t("consentSigned") : t("none")}</Row>
        <Row label={t("doneAt")}>{a.doneAt ? formatTime({ instant: a.doneAt, timezone }) : t("none")}</Row>
        <Row label={t("staffNote")}>{a.staffNote ?? t("none")}</Row>
        <Row label={t("customerNote")}>{job.customerNote ? <q className="italic">{job.customerNote}</q> : t("none")}</Row>
      </section>
    </div>
  );
}

const ACTION_LABEL: Record<Action, "checkIn" | "start" | "finish" | "cancel" | "addSurcharge"> = {
  checkIn: "checkIn",
  start: "start",
  finish: "finish",
  cancel: "cancel",
  surcharge: "addSurcharge",
};

export function ActionBar(props: { t: T; list: Action[]; busy: boolean; checkInReady: boolean; on: Record<Action, () => void> }) {
  if (props.list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t p-4">
      {props.list.map((action) => (
        <Button
          key={action}
          type="button"
          className="h-11"
          variant={action === "cancel" ? "outline" : "default"}
          disabled={props.busy || (action === "checkIn" && !props.checkInReady)}
          onClick={props.on[action]}
        >
          {props.t(ACTION_LABEL[action])}
        </Button>
      ))}
    </div>
  );
}

export function CancelDialog(props: {
  t: T;
  open: boolean;
  bookingId: string;
  cancelLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { t } = props;
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancel")}</DialogTitle>
        </DialogHeader>
        <FormField id="c02d-cancel-reason" label={t("cancelReason")}>
          <Textarea id="c02d-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <Link href={`/console/bookings/${props.bookingId}`} className="text-sm underline">
          {t("cancelWholeBooking")}
        </Link>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!ok || props.busy}
            onClick={() => void props.onConfirm(reason.trim()).then(() => setReason(""))}
          >
            {t("confirmCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SurchargeFields(props: {
  t: T;
  form: SurchargeForm;
  onForm: (f: SurchargeForm) => void;
  types: SurchargeTypeItem[];
  errors: SurchargeErrors;
}) {
  const { t, form, onForm, errors } = props;
  const bad = (k: keyof SurchargeForm) => (errors[k] ? t("invalid") : undefined);
  return (
    <div className="flex flex-col gap-3">
      <FormField id="c02d-type" label={t("surchargeType")} error={bad("surchargeTypeId")}>
        <select
          id="c02d-type"
          className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          value={form.surchargeTypeId ?? ""}
          onChange={(e) =>
            onForm(
              pickType(
                form,
                props.types.find((x) => x.id === e.target.value),
              ),
            )
          }
        >
          <option value="">{t("chooseType")}</option>
          {props.types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nameTh}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="c02d-name" label={t("surchargeName")} error={bad("name")}>
        <Input
          id="c02d-name"
          className="h-11"
          maxLength={60}
          value={form.name}
          onChange={(e) => onForm({ ...form, name: e.target.value })}
        />
      </FormField>
      <FormField id="c02d-amount" label={t("surchargeAmount")} error={bad("amountSatang")}>
        <MoneyInput
          id="c02d-amount"
          value={form.amountSatang}
          onValueChange={(v) => onForm({ ...form, amountSatang: v === undefined ? Number.NaN : v })}
        />
      </FormField>
      <FormField id="c02d-reason" label={`${t("surchargeReason")} (${t("surchargeReasonHint")})`} error={bad("reason")}>
        <Input
          id="c02d-reason"
          className="h-11"
          maxLength={200}
          value={form.reason}
          onChange={(e) => onForm({ ...form, reason: e.target.value })}
        />
      </FormField>
    </div>
  );
}

export function SurchargeDialog(props: {
  t: T;
  open: boolean;
  types: SurchargeTypeItem[];
  cancelLabel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: NonNullable<ReturnType<typeof surchargeBody>["body"]>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<SurchargeForm>(emptySurcharge);
  const [errors, setErrors] = useState<SurchargeErrors>({});
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addSurcharge")}</DialogTitle>
        </DialogHeader>
        <SurchargeFields t={t} form={form} onForm={setForm} types={props.types} errors={errors} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={props.busy}
            onClick={() => {
              const { body, errors: found } = surchargeBody(form);
              setErrors(found);
              if (body) void props.onSubmit(body).then(() => setForm(emptySurcharge()));
            }}
          >
            {t("saveSurcharge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
