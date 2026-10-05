"use client";
import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import { BookingsCancelResponse } from "@app/contracts/endpoints/bookings.cancel";
import { BookingsGetResponse } from "@app/contracts/endpoints/bookings.get";
import { DaycareCancelResponse } from "@app/contracts/endpoints/daycare.cancel";
import { StaysCancelResponse } from "@app/contracts/endpoints/stays.cancel";
import { toLocalDate } from "@app/domain/time/local-time";
import Link from "next/link";
import { useTimeZone, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { formatPhone, formatTHB, formatThaiDate, formatTime } from "../../lib/format";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { AppointmentDrawer } from "../c-02d/appointment-drawer";
import { FormField } from "../shared/form";
import { StatusBadge } from "../shared/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { type CancelForm, cancelBody, EVENT_ENUM, isActive, offersChoice, policyLine } from "./logic";

type T = ReturnType<typeof useTranslations<"C-05">>;
const INVALIDATE = ["bookings.get", "bookings.list", "calendar.day", "dashboard.today"] as const;
const ACTOR_KEY = { staff: "actorStaff", customer: "actorCustomer", system: "actorSystem", platform_admin: "actorPlatformAdmin" } as const;

/** 06#scr-C-05 — one booking with its children; cancel the booking / a stay / a daycare visit. */
export function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("C-05");
  const common = useTranslations("common");
  const timezone = useTimeZone() ?? "Asia/Bangkok";
  const booking = useApiQuery("bookings.get", { params: { bookingId }, response: BookingsGetResponse });
  const invalidate = [...INVALIDATE];
  const cancelBooking = useApiMutation("bookings.cancel", { response: BookingsCancelResponse, invalidate });
  const cancelStay = useApiMutation("stays.cancel", { response: StaysCancelResponse, invalidate });
  const cancelDaycare = useApiMutation("daycare.cancel", { response: DaycareCancelResponse, invalidate });
  const [drawer, setDrawer] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "booking" } | { kind: "stay" | "daycare"; id: string } | null>(null);

  if (booking.isPending) return <Skeleton className="m-6 h-96" />;
  if (booking.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(booking.error)}</p>
        <Button type="button" onClick={() => void booking.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  const b = booking.data;
  const done = () => {
    setDialog(null);
    toast.success(t("done"));
  };
  return (
    <>
      <BookingView
        t={t}
        b={b}
        timezone={timezone}
        onOpenAppointment={setDrawer}
        onCancelBooking={() => setDialog({ kind: "booking" })}
        onCancelStay={(id) => setDialog({ kind: "stay", id })}
        onCancelDaycare={(id) => setDialog({ kind: "daycare", id })}
      />
      <AppointmentDrawer appointmentId={drawer} onClose={() => setDrawer(null)} />
      <CancelBookingDialog
        t={t}
        open={dialog?.kind === "booking"}
        withChoice={offersChoice(b.policySnapshot)}
        busy={cancelBooking.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setDialog(null)}
        onConfirm={async (body) => {
          await cancelBooking.mutateAsync({ params: { bookingId }, body });
          done();
        }}
      />
      <ReasonDialog
        title={dialog?.kind === "daycare" ? t("cancelDaycare") : t("cancelStay")}
        t={t}
        open={dialog?.kind === "stay" || dialog?.kind === "daycare"}
        busy={cancelStay.isPending || cancelDaycare.isPending}
        cancelLabel={common("cancel")}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (dialog?.kind === "stay") await cancelStay.mutateAsync({ params: { stayId: dialog.id }, body: { reason } });
          if (dialog?.kind === "daycare") await cancelDaycare.mutateAsync({ params: { visitId: dialog.id }, body: { reason } });
          done();
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{title}</h2>
      {children}
    </section>
  );
}
function Row({ label, children, field }: { label: string; children: ReactNode; field?: string }) {
  return (
    <div data-field={field} className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function BookingView(props: {
  t: T;
  b: BookingDetail;
  timezone: string;
  onOpenAppointment: (appointmentId: string) => void;
  onCancelBooking: () => void;
  onCancelStay: (stayId: string) => void;
  onCancelDaycare: (visitId: string) => void;
}) {
  const { t, b, timezone } = props;
  const when = (instant: string) => `${formatThaiDate({ date: toLocalDate({ instant, timezone }) })} ${formatTime({ instant, timezone })}`;
  const policy = policyLine(b.policySnapshot);
  return (
    <div data-screen="C-05" className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <Section title={t("sectionHead")}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono font-semibold text-2xl" aria-label={t("bookingNo")}>
            {b.bookingNo}
          </h1>
          <StatusBadge enumName="booking_status" value={b.status} className="text-base" />
          {isActive(b.status) ? (
            <Button type="button" variant="outline" className="ml-auto h-11" onClick={props.onCancelBooking}>
              {t("cancelBooking")}
            </Button>
          ) : null}
        </div>
        <Row label={t("channel")}>{enumLabel("booking_channel", b.channel)}</Row>
        <Row label={t("createdAt")}>{when(b.createdAt)}</Row>
        <Row label={t("customer")} field="customer">
          <Link href={`/console/customers/${b.customer.id}`} className="underline-offset-4 hover:underline">
            {b.customer.firstName} {b.customer.lastName ?? ""}
          </Link>
          {b.customer.phone ? <span className="ml-2">{formatPhone({ e164: b.customer.phone })}</span> : null}
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
            {t("reliabilityLevel", { level: b.customer.reliabilityLevel })}
          </span>
        </Row>
      </Section>

      <Section title={t("sectionServices")}>
        <h3 className="font-medium text-sm">{t("groom")}</h3>
        {b.groom.length === 0 ? <p className="text-muted-foreground text-sm">{t("none")}</p> : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {b.groom.map((a) => (
            <li key={a.id}>
              {/* คลิกการ์ดนัดกรูม → C-02D (its buttons: check-in / no-show / cancel / surcharges) */}
              <button
                type="button"
                data-appointment={a.id}
                className="flex w-full flex-col gap-1 rounded-lg border p-3 text-left text-sm hover:bg-muted"
                onClick={() => props.onOpenAppointment(a.id)}
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{a.pet.name}</span>
                  <StatusBadge enumName="groom_status" value={a.status} />
                </span>
                <span>
                  {when(a.startsAt)}–{formatTime({ instant: a.endsAt, timezone })} · {a.groomerName} · {a.stationName}
                </span>
                <span className="text-muted-foreground">{a.items.map((i) => i.name).join(", ")}</span>
                <span className="tabular-nums">{formatTHB({ satang: a.servicesTotalSatang + a.surchargeTotalSatang })}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="font-medium text-sm">{t("stays")}</h3>
        {b.stays.length === 0 ? <p className="text-muted-foreground text-sm">{t("none")}</p> : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {b.stays.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
              <Link href={`/console/stays/${s.id}`} className="flex items-center gap-2 underline-offset-4 hover:underline">
                <span className="font-semibold">{s.pet.name}</span>
                <StatusBadge enumName="stay_status" value={s.status} />
              </Link>
              <span>
                {formatThaiDate({ date: s.checkInDate })} – {formatThaiDate({ date: s.checkOutDate })} · {t("nights", { n: s.nights })}
              </span>
              <span className="text-muted-foreground">
                {s.roomTypeName}
                {s.roomCode ? ` · ${t("room", { code: s.roomCode })}` : ""}
              </span>
              <span className="tabular-nums">{formatTHB({ satang: s.roomTotalSatang })}</span>
              {s.status === "reserved" ? (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => props.onCancelStay(s.id)}>
                  {t("cancelStay")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <h3 className="font-medium text-sm">{t("daycare")}</h3>
        {b.daycare.length === 0 ? <p className="text-muted-foreground text-sm">{t("none")}</p> : null}
        <ul className="flex flex-col divide-y rounded-lg border">
          {b.daycare.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-semibold">{v.pet.name}</span>
              <span>{formatThaiDate({ date: v.visitDate })}</span>
              <span className="text-muted-foreground">{v.sessionName}</span>
              <StatusBadge enumName="daycare_status" value={v.status} />
              <span className="ml-auto tabular-nums">{formatTHB({ satang: v.priceSatang })}</span>
              {v.status === "reserved" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => props.onCancelDaycare(v.id)}>
                  {t("cancelDaycare")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("sectionMoney")}>
        <Row label={t("estimatedTotal")}>
          <span className="tabular-nums">{formatTHB({ satang: b.estimatedTotalSatang })}</span>
        </Row>
        <Row label={t("depositRequired")}>
          <span className="tabular-nums">{formatTHB({ satang: b.depositRequiredSatang })}</span>
        </Row>
        <Row label={t("depositVerified")}>
          <span className="tabular-nums">{formatTHB({ satang: b.depositVerifiedSatang })}</span>
        </Row>
        <Row label={t("depositStatus")}>
          <StatusBadge enumName="deposit_status" value={b.depositStatus} />
        </Row>
        <Row label={t("slips")} field="slips">
          {b.slips.length === 0 ? (
            t("none")
          ) : (
            <span className="flex flex-wrap justify-end gap-2">
              {b.slips.map((s) => (
                // thumbnail → C-07 (slip review)
                <Link key={s.id} href="/console/slips" className="flex flex-col items-center gap-1">
                  {s.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URL, not a Next static asset
                    <img
                      src={s.imageUrl}
                      alt={t("slipAlt", { amount: formatTHB({ satang: s.amountExpectedSatang }) })}
                      className="h-16 w-12 rounded object-cover"
                    />
                  ) : null}
                  <StatusBadge enumName="slip_status" value={s.status} />
                </Link>
              ))}
            </span>
          )}
        </Row>
        <Row label={t("bill")}>
          {b.billId ? (
            <Link href={`/console/bills/${b.billId}`} className="underline">
              {t("openBill")}
            </Link>
          ) : (
            t("none")
          )}
        </Row>
      </Section>

      <Section title={t("sectionPolicy")}>
        <Row label={t("freeCancel")} field="policy">
          {policy ? t("policyLine", policy) : t("none")}
        </Row>
      </Section>

      <Section title={t("sectionHistory")}>
        <h3 className="sr-only">{t("events")}</h3>
        <ol className="flex flex-col gap-2 border-l pl-4 text-sm">
          {b.events.map((e) => {
            const enumName = EVENT_ENUM[e.entityType as keyof typeof EVENT_ENUM];
            const label = (s: string) => (enumName ? enumLabel(enumName, s as never) : s);
            return (
              <li key={`${e.at}-${e.entityType}-${e.fromStatus}-${e.toStatus}`} className="flex flex-col">
                <span className="text-muted-foreground text-xs">{when(e.at)}</span>
                <span>
                  {e.fromStatus ? `${label(e.fromStatus)} → ` : ""}
                  {label(e.toStatus)} · {t(ACTOR_KEY[e.actorType])}
                </span>
                {e.reason ? <span className="text-muted-foreground">{e.reason}</span> : null}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title={t("sectionNotes")}>
        <Row label={t("customerNote")}>{b.customerNote ? <q className="italic">{b.customerNote}</q> : t("none")}</Row>
      </Section>
    </div>
  );
}

export function CancelBookingDialog(props: {
  t: T;
  open: boolean;
  withChoice: boolean;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onConfirm: (body: NonNullable<ReturnType<typeof cancelBody>>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<CancelForm>({ kind: null, reason: "", customerChoice: null });
  const body = cancelBody(form, props.withChoice);
  const radio = <V extends string>(value: V | null, options: [V, string][], onPick: (v: V) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map(([v, text]) => (
        <Button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          variant={value === v ? "default" : "outline"}
          className="h-11"
          onClick={() => onPick(v)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancelBooking")}</DialogTitle>
        </DialogHeader>
        <CancelFields t={t} form={form} onForm={setForm} withChoice={props.withChoice} radio={radio} />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button type="button" className="h-11" disabled={!body || props.busy} onClick={() => body && void props.onConfirm(body)}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RadioFn = <V extends string>(value: V | null, options: [V, string][], onPick: (v: V) => void, label: string) => ReactNode;
/** ใครยกเลิก (ลูกค้าขอ/ร้าน), refund-or-credit when the policy lets the customer choose, เหตุผล */
export function CancelFields(props: { t: T; form: CancelForm; onForm: (f: CancelForm) => void; withChoice: boolean; radio: RadioFn }) {
  const { t, form, onForm, radio } = props;
  return (
    <div className="flex flex-col gap-3">
      <FormField id="c05-kind" label={t("cancelWho")}>
        {radio(
          form.kind,
          [
            ["customer_cancel", t("kindCustomer")],
            ["shop_cancel", t("kindShop")],
          ],
          (kind) => onForm({ ...form, kind }),
          t("cancelWho"),
        )}
      </FormField>
      {props.withChoice && form.kind === "customer_cancel" ? (
        <FormField id="c05-choice" label={t("customerChoice")}>
          {radio(
            form.customerChoice,
            [
              ["refund", t("choiceRefund")],
              ["credit", t("choiceCredit")],
            ],
            (customerChoice) => onForm({ ...form, customerChoice }),
            t("customerChoice"),
          )}
        </FormField>
      ) : null}
      <FormField id="c05-reason" label={t("reason")}>
        <Textarea id="c05-reason" maxLength={500} value={form.reason} onChange={(e) => onForm({ ...form, reason: e.target.value })} />
      </FormField>
    </div>
  );
}

export function ReasonDialog(props: {
  t: T;
  title: string;
  open: boolean;
  busy: boolean;
  cancelLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? null : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <FormField id="c05-child-reason" label={props.t("reason")}>
          <Textarea id="c05-child-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={!reason.trim() || props.busy}
            onClick={() => void props.onConfirm(reason.trim()).then(() => setReason(""))}
          >
            {props.t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
